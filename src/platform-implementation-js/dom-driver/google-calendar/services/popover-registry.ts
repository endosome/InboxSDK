import type { EventRef } from '../../../driver-interfaces/event-view-driver';
import type {
  PopoverButtonDescriptor,
  PopoverButtonHandle,
} from '../../../driver-interfaces/event-popover-view-driver';
import type SelectorRegistry from '../../../lib/dom/selectorRegistry';
import { reportError } from '../../../lib/reporter';
import type { CalendarSelectorKey } from '../selectors';
import { eventRefFromChip, withResolvedCalendarId } from '../identity';
import CalendarEventPopoverViewDriver, {
  type PopoverHost,
} from '../views/calendar-event-popover-view-driver';
import { popoverButtonStyleText } from './popover-style';

const OWNED_ATTR = 'data-calsdk-owned';
const STYLE_ID = 'calsdk-popover-style';

type Subscriber = (driver: CalendarEventPopoverViewDriver) => void;

type ButtonEntry = {
  descriptor: PopoverButtonDescriptor;
  node: HTMLElement | null;
  removed: boolean;
};

type Entry = {
  driver: CalendarEventPopoverViewDriver;
  buttons: ButtonEntry[];
  row: HTMLElement | null;
};

export type PopoverRegistryEnv = {
  document: Document;
  selectors: SelectorRegistry<CalendarSelectorKey>;
  /** Per-instance namespace for injected nodes. */
  appId: string;
  /** Full calendar id of a chip with this `data-eventid`, if one is on the page. */
  lookupCalendarId?: (rawId: string) => string | null;
  /** Full calendar id learned for a calendar abbreviation (result is `derived`). */
  resolveCalendarId?: (calendarIdHint: string) => string | null;
};

/**
 * Discovers event popovers and keeps the buttons apps added to them alive.
 *
 * A popover is a `[role=dialog][data-chips-dialog]` that has
 * `data-allow-wheel-scroll="false"` and no form controls — the quick-create
 * dialog has the same shape but is full of inputs (docs RE §1.7). Its event id
 * is on the outermost element carrying `data-eventid` (which is also the
 * content root buttons are injected into). Popovers can render in stages, so
 * eligibility is re-evaluated on mutations inside them.
 */
export default class PopoverRegistry implements PopoverHost {
  readonly #env: PopoverRegistryEnv;
  readonly #entries = new Map<Element, Entry>();
  readonly #subscribers = new Set<Subscriber>();
  #observer: MutationObserver | null = null;
  #stopped = false;

  constructor(env: PopoverRegistryEnv) {
    this.#env = env;
  }

  start(): void {
    this.reconcileAll();
    this.#observer = new MutationObserver((records) =>
      this.#onMutations(records),
    );
    this.#observer.observe(this.#env.document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-allow-wheel-scroll', 'data-eventid'],
    });
  }

  getAll(): CalendarEventPopoverViewDriver[] {
    return [...this.#entries.values()].map((e) => e.driver);
  }

  subscribe(cb: Subscriber): () => void {
    this.#subscribers.add(cb);
    return () => this.#subscribers.delete(cb);
  }

  reconcileAll(): void {
    const touched = new Set<Element>(this.#entries.keys());
    for (const selector of this.#env.selectors.getCandidates('chipsDialog')) {
      this.#env.document
        .querySelectorAll(selector)
        .forEach((d) => touched.add(d));
    }
    for (const dialog of touched) this.#reconcile(dialog);
  }

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#observer?.disconnect();
    this.#subscribers.clear();
    for (const entry of this.#entries.values()) {
      this.#removeInjected(entry);
      entry.driver.destroy();
    }
    this.#entries.clear();
  }

  addButton(
    driver: CalendarEventPopoverViewDriver,
    descriptor: PopoverButtonDescriptor,
  ): PopoverButtonHandle {
    const noop = { update: () => undefined, remove: () => undefined };
    if (!descriptor?.title) {
      throw new Error('addButton: `title` is required');
    }
    if (typeof descriptor.onClick !== 'function') {
      throw new Error('addButton: `onClick` is required');
    }
    if (this.#stopped) return noop;
    const entry = this.#entries.get(driver.element);
    if (!entry || entry.driver !== driver) return noop; // popover already closed

    const button: ButtonEntry = {
      descriptor: { ...descriptor },
      node: null,
      removed: false,
    };
    entry.buttons.push(button);
    this.#ensureStyle();
    this.#reconcileButtons(entry);

    return {
      update: (changes) => {
        if (button.removed) return;
        Object.assign(button.descriptor, changes);
        button.node?.remove();
        button.node = null;
        this.#reconcileButtons(entry);
      },
      remove: () => {
        if (button.removed) return;
        button.removed = true;
        button.node?.remove();
        button.node = null;
        entry.buttons = entry.buttons.filter((b) => b !== button);
        if (entry.buttons.length === 0) {
          entry.row?.remove();
          entry.row = null;
        }
      },
    };
  }

  #isOwned(node: Node): boolean {
    return (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).getAttribute(OWNED_ATTR) === this.#env.appId
    );
  }

  #dialogOf(el: Element | null): Element | null {
    if (!el) return null;
    for (const selector of this.#env.selectors.getCandidates('chipsDialog')) {
      const found = el.closest(selector);
      if (found) return found;
    }
    return null;
  }

  #onMutations(records: MutationRecord[]) {
    if (this.#stopped) return;
    const touched = new Set<Element>();
    for (const record of records) {
      const changed = [...record.addedNodes, ...record.removedNodes];
      // Our own INSERTIONS cannot change eligibility or need repair; our own
      // REMOVALS (Calendar stripped a node of ours) do.
      if (
        record.type === 'childList' &&
        record.removedNodes.length === 0 &&
        changed.length > 0 &&
        changed.every((n) => this.#isOwned(n))
      ) {
        continue;
      }
      const owner = this.#dialogOf(record.target as Element);
      if (owner) touched.add(owner);
      for (const node of changed) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as Element;
        for (const selector of this.#env.selectors.getCandidates(
          'chipsDialog',
        )) {
          if (el.matches(selector)) touched.add(el);
          el.querySelectorAll(selector).forEach((d) => touched.add(d));
        }
      }
    }
    for (const dialog of touched) this.#reconcile(dialog);
  }

  #eligibleRef(dialog: Element): EventRef | null {
    const { selectors } = this.#env;
    if (!dialog.isConnected) return null;
    if (!selectors.matchesByKey(dialog, 'eventPopover')) return null;
    if (dialog.querySelector('input, textarea')) return null; // quick-create
    const idNode = selectors.querySelectorByKey(
      dialog as HTMLElement,
      'popoverEventIdNode',
    );
    if (!idNode) return null; // renders in stages: arrives as a later mutation
    const ref = eventRefFromChip(idNode);
    if (!ref) return null;
    if (ref.calendarId === null) {
      const calendarId = this.#env.lookupCalendarId?.(ref.rawId) ?? null;
      if (calendarId) return { ...ref, calendarId };
      return withResolvedCalendarId(ref, this.#env.resolveCalendarId);
    }
    return ref;
  }

  #reconcile(dialog: Element) {
    const existing = this.#entries.get(dialog);
    const ref = this.#eligibleRef(dialog);

    if (existing) {
      if (ref && ref.rawId === existing.driver.getEventRef().rawId) {
        this.#reconcileButtons(existing); // same popover: repair its buttons
        return;
      }
      this.#entries.delete(dialog);
      this.#removeInjected(existing);
      existing.driver.destroy();
    }
    if (!ref) return;

    const driver = new CalendarEventPopoverViewDriver(
      dialog as HTMLElement,
      ref,
      this,
    );
    this.#entries.set(dialog, { driver, buttons: [], row: null });
    for (const cb of [...this.#subscribers]) {
      try {
        cb(driver);
      } catch (err) {
        reportError(err);
      }
    }
  }

  #removeInjected(entry: Entry) {
    for (const b of entry.buttons) {
      b.removed = true;
      b.node?.remove();
      b.node = null;
    }
    entry.row?.remove();
    entry.row = null;
    entry.buttons = [];
  }

  /** Make the DOM match the desired buttons of one popover. Idempotent. */
  #reconcileButtons(entry: Entry) {
    if (entry.buttons.length === 0) return;
    const dialog = entry.driver.element;
    if (!dialog.isConnected) return;
    try {
      const holder = this.#env.selectors.querySelectorByKey(
        dialog,
        'popoverEventIdNode',
      );
      if (!holder) return;
      let row = entry.row;
      if (!row || row.parentElement !== holder) {
        row?.remove();
        row = this.#env.document.createElement('div');
        row.setAttribute(OWNED_ATTR, this.#env.appId);
        row.setAttribute('data-calsdk-popover-actions', '');
        row.className = 'calsdk-popover-actions';
        entry.row = row;
        for (const b of entry.buttons) b.node = null;
        holder.appendChild(row);
      }
      // keep DOM order == registration order, also after an update or a partial strip
      entry.buttons.forEach((button, i) => {
        if (!button.node || button.node.parentElement !== row) {
          button.node?.remove();
          button.node = this.#buildButton(button);
        }
        if (row!.children[i] !== button.node) {
          row!.insertBefore(button.node, row!.children[i] ?? null);
        }
      });
    } catch (err) {
      reportError(err);
    }
  }

  #ensureStyle() {
    const doc = this.#env.document;
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = popoverButtonStyleText();
    (doc.head ?? doc.documentElement).appendChild(style);
  }

  #buildButton(button: ButtonEntry): HTMLElement {
    const doc = this.#env.document;
    const { title, iconUrl, onClick } = button.descriptor;
    const node = doc.createElement('button');
    node.type = 'button';
    node.className = 'calsdk-popover-button';
    node.setAttribute(OWNED_ATTR, this.#env.appId);
    node.setAttribute('data-calsdk-popover-button', '');
    if (iconUrl) {
      const img = doc.createElement('img');
      img.className = 'calsdk-popover-button__icon';
      img.src = iconUrl;
      img.alt = '';
      node.appendChild(img);
    }
    const label = doc.createElement('span');
    label.textContent = title;
    node.appendChild(label);
    // Keep pointer events away from Calendar's delegated handlers.
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
    // Keyboard: Calendar's single-key shortcuts (e, c, d, …) must not fire while our
    // button has focus, but Escape (closes the popover) and Tab (dialog focus handling)
    // must still reach Calendar.
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
