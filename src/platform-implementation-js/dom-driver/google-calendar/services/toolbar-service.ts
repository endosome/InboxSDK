import type {
  ToolbarButtonDescriptor,
  ToolbarButtonHandle,
} from '../../../driver-interfaces/toolbar-driver';
import type SelectorRegistry from '../../../lib/dom/selectorRegistry';
import { reportError, reportEvent } from '../../../lib/reporter';
import type { CalendarSelectorKey } from '../selectors';
import { toolbarStyleText } from './toolbar-style';

const OWNED_ATTR = 'data-calsdk-owned';
const STYLE_ID = 'calsdk-toolbar-style';
/** More repairs than this per second means Calendar and we are fighting: back off. */
const MAX_REPAIRS_PER_SECOND = 40;

type Entry = {
  descriptor: ToolbarButtonDescriptor;
  node: HTMLElement | null;
  removed: boolean;
};

export type ToolbarServiceEnv = {
  document: Document;
  selectors: SelectorRegistry<CalendarSelectorKey>;
  appId: string;
};

/**
 * Buttons in Calendar's top bar, placed just before the Search button. They are
 * desired state: whenever Calendar re-renders the bar and drops them (or the
 * bar is replaced), they are put back from a mutation-observer microtask.
 */
export default class ToolbarService {
  readonly #env: ToolbarServiceEnv;
  readonly #entries: Entry[] = [];
  #container: HTMLElement | null = null;
  #observer: MutationObserver | null = null;
  #scheduled = false;
  #stopped = false;
  #repairs: number[] = [];

  constructor(env: ToolbarServiceEnv) {
    this.#env = env;
  }

  start(): void {
    this.#observer = new MutationObserver(() => this.#schedule());
    this.#observer.observe(this.#env.document.body, {
      childList: true,
      subtree: true,
    });
  }

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#observer?.disconnect();
    this.#container?.remove();
    this.#container = null;
    this.#entries.length = 0;
    this.#env.document.getElementById(STYLE_ID)?.remove();
  }

  addButton(descriptor: ToolbarButtonDescriptor): ToolbarButtonHandle {
    if (!descriptor?.title) throw new Error('addButton: `title` is required');
    if (!descriptor.iconUrl)
      throw new Error('addButton: `iconUrl` is required');
    if (typeof descriptor.onClick !== 'function') {
      throw new Error('addButton: `onClick` is required');
    }
    const noop = { update: () => undefined, remove: () => undefined };
    if (this.#stopped) return noop;
    const entry: Entry = {
      descriptor: { ...descriptor },
      node: null,
      removed: false,
    };
    this.#entries.push(entry);
    this.#ensureStyle();
    this.reconcile();
    return {
      update: (changes) => {
        if (entry.removed) return;
        Object.assign(entry.descriptor, changes);
        entry.node?.remove();
        entry.node = null;
        this.reconcile();
      },
      remove: () => {
        if (entry.removed) return;
        entry.removed = true;
        entry.node?.remove();
        entry.node = null;
        this.#entries.splice(this.#entries.indexOf(entry), 1);
        if (this.#entries.length === 0) {
          this.#container?.remove();
          this.#container = null;
        }
      },
    };
  }

  #schedule() {
    if (this.#scheduled || this.#stopped || this.#entries.length === 0) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      this.reconcile();
    });
  }

  /** Make the DOM match the desired buttons. Idempotent; touches nothing that is already right. */
  reconcile(): void {
    if (this.#stopped || this.#entries.length === 0) return;
    try {
      const { selectors, document } = this.#env;
      const anchor = selectors.querySelectorByKey(
        document.body,
        'searchButton',
      );
      const slot = anchor?.parentElement; // the wrapper Calendar lays out next to its siblings
      const host = slot?.parentElement;
      if (!anchor || !slot || !host) return; // header not rendered (yet): try again on the next mutation

      let container = this.#container;
      const placed =
        container?.isConnected &&
        container.parentElement === host &&
        container.nextElementSibling === slot;
      if (!placed) {
        if (!this.#allowRepair()) return;
        container?.remove();
        container = document.createElement('div');
        container.className = 'calsdk-toolbar';
        container.setAttribute(OWNED_ATTR, this.#env.appId);
        container.setAttribute('data-calsdk-toolbar', '');
        this.#container = container;
        for (const e of this.#entries) e.node = null;
        host.insertBefore(container, slot);
      }
      const row = container!;
      this.#entries.forEach((entry, i) => {
        if (!entry.node || entry.node.parentElement !== row) {
          entry.node?.remove();
          entry.node = this.#build(entry);
        }
        if (row.children[i] !== entry.node) {
          row.insertBefore(entry.node, row.children[i] ?? null);
        }
      });
    } catch (err) {
      reportError(err);
    }
  }

  #allowRepair(): boolean {
    const now = Date.now();
    this.#repairs = this.#repairs.filter((t) => now - t < 1000);
    if (this.#repairs.length >= MAX_REPAIRS_PER_SECOND) {
      reportEvent('toolbar-repair-backoff');
      return false;
    }
    this.#repairs.push(now);
    return true;
  }

  #ensureStyle() {
    const doc = this.#env.document;
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = toolbarStyleText();
    (doc.head ?? doc.documentElement).appendChild(style);
  }

  #build(entry: Entry): HTMLElement {
    const doc = this.#env.document;
    const { title, iconUrl, onClick } = entry.descriptor;
    const node = doc.createElement('button');
    node.type = 'button';
    node.className = 'calsdk-toolbar-button';
    node.setAttribute(OWNED_ATTR, this.#env.appId);
    node.setAttribute('data-calsdk-toolbar-button', '');
    node.title = title;
    node.setAttribute('aria-label', title);
    const img = doc.createElement('img');
    img.src = iconUrl;
    img.alt = '';
    node.appendChild(img);
    for (const type of [
      'mousedown',
      'mouseup',
      'pointerdown',
      'pointerup',
      'dblclick',
      'contextmenu',
    ]) {
      node.addEventListener(type, (e) => e.stopPropagation());
    }
    for (const type of ['keydown', 'keyup', 'keypress']) {
      node.addEventListener(type, (e) => {
        const key = (e as KeyboardEvent).key;
        if (key !== 'Escape' && key !== 'Tab') e.stopPropagation();
      });
    }
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        onClick();
      } catch (err) {
        reportError(err);
      }
    });
    return node;
  }
}
