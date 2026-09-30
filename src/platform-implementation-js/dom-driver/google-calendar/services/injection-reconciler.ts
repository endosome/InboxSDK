import type {
  BadgeDescriptor,
  BadgeHandle,
} from '../../../driver-interfaces/event-view-driver';
import { reportError } from '../../../lib/reporter';
import type CalendarEventViewDriver from '../views/calendar-event-view-driver';
import type { BadgeHost } from './event-registry';
import { badgeStyleText } from './badge-style';

/** Marks every node the SDK injects, so its own mutations can be recognised. */
const OWNED_ATTR = 'data-calsdk-owned';
const STYLE_ID = 'calsdk-badge-style';
/** Chips narrower than this (px) get compact badges. */
const COMPACT_BELOW_PX = 72;

type BadgeEntry = {
  descriptor: BadgeDescriptor;
  node: HTMLElement | null;
  removed: boolean;
};

type ViewEntry = {
  badges: BadgeEntry[];
  container: HTMLElement | null;
};

export type ReconcilerEnv = {
  document: Document;
  /** Which chip element currently belongs to which view (lookup for dirty chips). */
  getDriverForElement(el: Element): CalendarEventViewDriver | undefined;
  appId: string;
};

/**
 * Keeps injected badges alive in Calendar's grid. Calendar re-renders chips
 * with incremental DOM and strips children it does not know — a popover opening
 * removed every injected node while the chip elements themselves persisted
 * (docs/calendar-reverse-engineering.md §4). So badges are *desired state*:
 * views register what they want, and this service re-inserts missing nodes
 * from a MutationObserver callback (a microtask, i.e. before the next paint, so
 * a strip and the re-insertion normally happen in the same frame).
 *
 * Every pass is idempotent, and mutations caused by our own nodes are ignored,
 * so the observer cannot feed itself.
 */
export default class InjectionReconciler implements BadgeHost {
  readonly #env: ReconcilerEnv;
  readonly #views = new Map<CalendarEventViewDriver, ViewEntry>();
  #observer: MutationObserver | null = null;
  #sizeObserver: ResizeObserver | null = null;
  #stopped = false;

  constructor(env: ReconcilerEnv) {
    this.#env = env;
  }

  start(): void {
    const doc = this.#env.document;
    this.#observer = new MutationObserver((records) =>
      this.#onMutations(records),
    );
    this.#observer.observe(doc.body, { childList: true, subtree: true });
  }

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#observer?.disconnect();
    this.#sizeObserver?.disconnect();
    this.#sizeObserver = null;
    for (const entry of this.#views.values()) this.#teardown(entry);
    this.#views.clear();
  }

  addBadge(
    driver: CalendarEventViewDriver,
    descriptor: BadgeDescriptor,
  ): BadgeHandle {
    if (!descriptor || (!descriptor.text && !descriptor.iconUrl)) {
      throw new Error('addBadge: `text` or `iconUrl` is required');
    }
    if (this.#stopped)
      return { update: () => undefined, remove: () => undefined };

    let view = this.#views.get(driver);
    if (!view) {
      view = { badges: [], container: null };
      this.#views.set(driver, view);
      driver.getStopper().onValue(() => {
        const entry = this.#views.get(driver);
        if (entry) this.#teardown(entry);
        this.#views.delete(driver);
      });
    }
    const badge: BadgeEntry = {
      descriptor: { ...descriptor },
      node: null,
      removed: false,
    };
    view.badges.push(badge);
    this.#ensureStyle();
    this.#reconcileView(driver, view);

    return {
      update: (changes) => {
        if (badge.removed) return;
        Object.assign(badge.descriptor, changes);
        // rebuild the node from the new descriptor
        badge.node?.remove();
        badge.node = null;
        this.#reconcileView(driver, view!);
      },
      remove: () => {
        if (badge.removed) return;
        badge.removed = true;
        badge.node?.remove();
        badge.node = null;
        view!.badges = view!.badges.filter((b) => b !== badge);
        if (view!.badges.length === 0) {
          this.#dropContainer(view!.container);
          view!.container = null;
        }
      },
    };
  }

  /** How many injected badge nodes are currently in the document (diagnostics/tests). */
  countInjectedNodes(): number {
    return this.#env.document.querySelectorAll(
      `[${OWNED_ATTR}="${this.#env.appId}"][data-calsdk-badge]`,
    ).length;
  }

  #teardown(entry: ViewEntry) {
    for (const badge of entry.badges) {
      badge.removed = true;
      badge.node?.remove();
      badge.node = null;
    }
    this.#dropContainer(entry.container);
    entry.container = null;
    entry.badges = [];
  }

  #isOwned(node: Node): boolean {
    return (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).getAttribute(OWNED_ATTR) === this.#env.appId
    );
  }

  #onMutations(records: MutationRecord[]) {
    if (this.#stopped || this.#views.size === 0) return;
    const dirty = new Set<CalendarEventViewDriver>();
    for (const record of records) {
      if (record.type !== 'childList') continue;
      // Ignore records that only concern our own nodes: reconciling is idempotent,
      // but reacting to our own insertions would loop needlessly.
      const foreign =
        [...record.addedNodes, ...record.removedNodes].some(
          (n) => !this.#isOwned(n),
        ) || record.removedNodes.length === 0;
      const removedOwned = [...record.removedNodes].some((n) =>
        this.#isOwned(n),
      );
      if (!foreign && !removedOwned) continue;

      const target = record.target as Element;
      const chip = target.closest?.('[data-eventchip]');
      if (!chip) continue;
      const driver = this.#env.getDriverForElement(chip);
      if (driver && this.#views.has(driver)) dirty.add(driver);
    }
    for (const driver of dirty) {
      this.#reconcileView(driver, this.#views.get(driver)!);
    }
  }

  /** Make the DOM match the desired badges of one view. Idempotent. */
  #reconcileView(driver: CalendarEventViewDriver, view: ViewEntry) {
    const chip = driver.element;
    if (!chip.isConnected) return;
    try {
      if (view.badges.length === 0) return;

      let container = view.container;
      if (!container || container.parentElement !== chip) {
        this.#dropContainer(container);
        container = this.#buildContainer(chip);
        view.container = container;
        for (const b of view.badges) b.node = null; // parent changed: rebuild children
        chip.appendChild(container);
      }

      // keep DOM order == registration order, also after an update or a partial strip
      view.badges.forEach((badge, i) => {
        if (!badge.node || badge.node.parentElement !== container) {
          badge.node?.remove();
          badge.node = this.#buildBadge(badge);
        }
        if (container!.children[i] !== badge.node) {
          container!.insertBefore(badge.node, container!.children[i] ?? null);
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
    style.textContent = badgeStyleText();
    (doc.head ?? doc.documentElement).appendChild(style);
  }

  #buildContainer(chip: HTMLElement): HTMLElement {
    const doc = this.#env.document;
    const container = doc.createElement('span');
    container.setAttribute(OWNED_ATTR, this.#env.appId);
    container.setAttribute('data-calsdk-badges', '');
    // Timed/all-day chips are absolutely positioned; agenda rows are static.
    const position = doc.defaultView?.getComputedStyle(chip).position ?? '';
    const positioned = position !== '' && position !== 'static';
    container.className = positioned
      ? 'calsdk-badges calsdk-badges--corner'
      : 'calsdk-badges calsdk-badges--inline';
    if (positioned) this.#watchWidth(chip, container);
    return container;
  }

  /**
   * In a narrow chip a text badge would cover its title, so the badge shrinks
   * to a dot (`data-calsdk-compact`, see badge-style.ts); the tooltip keeps the
   * full text. Chips change width with the window, hence the ResizeObserver.
   */
  #watchWidth(chip: HTMLElement, container: HTMLElement) {
    const Observer = this.#env.document.defaultView?.ResizeObserver;
    if (!Observer) return;
    this.#sizeObserver ??= new Observer((entries) => {
      for (const entry of entries) {
        const chip = entry.target as HTMLElement;
        // border box, like the initial measurement below (contentRect excludes padding)
        const width = chip.getBoundingClientRect().width;
        for (const c of this.#ownContainers(chip)) {
          c.toggleAttribute(
            'data-calsdk-compact',
            width > 0 && width < COMPACT_BELOW_PX,
          );
        }
      }
    });
    this.#sizeObserver.observe(chip); // fires once right away with the current size
    container.toggleAttribute(
      'data-calsdk-compact',
      chip.getBoundingClientRect().width > 0 &&
        chip.getBoundingClientRect().width < COMPACT_BELOW_PX,
    );
  }

  #ownContainers(chip: Element): HTMLElement[] {
    return [
      ...chip.querySelectorAll<HTMLElement>(
        `:scope > [data-calsdk-badges][${OWNED_ATTR}="${this.#env.appId}"]`,
      ),
    ];
  }

  #dropContainer(container: HTMLElement | null) {
    if (!container) return;
    const chip = container.parentElement;
    container.remove();
    if (chip && this.#ownContainers(chip).length === 0) {
      this.#sizeObserver?.unobserve(chip);
    }
  }

  #buildBadge(badge: BadgeEntry): HTMLElement {
    const doc = this.#env.document;
    const { text, iconUrl, title, onClick } = badge.descriptor;
    // clickable badges are native buttons: focusable, Enter/Space work, and Calendar's shortcut
    // handler ignores key events from buttons
    const node = doc.createElement(onClick ? 'button' : 'span');
    if (onClick) (node as HTMLButtonElement).type = 'button';
    node.setAttribute(OWNED_ATTR, this.#env.appId);
    node.setAttribute('data-calsdk-badge', '');
    node.className = 'calsdk-badge';
    if (title) node.title = title;
    if (iconUrl) {
      const img = doc.createElement('img');
      img.className = 'calsdk-badge__icon';
      img.src = iconUrl;
      img.alt = '';
      node.appendChild(img);
    }
    if (text) {
      const label = doc.createElement('span');
      label.textContent = text;
      node.appendChild(label);
    }
    // Calendar's own handlers are delegated from the document: keep our events away
    // from them so a click on the badge neither opens the popover nor starts a drag.
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
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!onClick) return;
      try {
        onClick();
      } catch (err) {
        reportError(err);
      }
    });
    if (onClick) {
      node.classList.add('calsdk-badge--clickable');
      node.setAttribute('aria-label', title || text || 'Badge');
      // Keyboard: Enter/Space activate the native button (its `click`, handled above). Keys must not
      // reach Calendar's document-level shortcuts (`e` opens the editor, `m` the month view), except
      // Escape and Tab.
      for (const type of ['keydown', 'keyup', 'keypress']) {
        node.addEventListener(type, (e) => {
          const key = (e as KeyboardEvent).key;
          if (key !== 'Escape' && key !== 'Tab') e.stopPropagation();
        });
      }
    }
    return node;
  }
}
