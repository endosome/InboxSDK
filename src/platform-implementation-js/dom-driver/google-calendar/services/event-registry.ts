import type { EventSegment } from '../../../driver-interfaces/event-view-driver';
import type SelectorRegistry from '../../../lib/dom/selectorRegistry';
import { reportError, reportEvent } from '../../../lib/reporter';
import type { CalendarSelectorKey } from '../selectors';
import { eventRefFromChip, eventRefKey } from '../identity';
import type {
  BadgeDescriptor,
  BadgeHandle,
} from '../../../driver-interfaces/event-view-driver';
import CalendarEventViewDriver, {
  type ViewHost,
} from '../views/calendar-event-view-driver';

/** The part of badge injection the registry needs (implemented by the reconciler). */
export interface BadgeHost {
  addBadge(
    driver: CalendarEventViewDriver,
    descriptor: BadgeDescriptor,
  ): BadgeHandle;
}

type Subscriber = (driver: CalendarEventViewDriver) => void;

/** Reports at most this many distinct undecodable tokens (a runaway would spam). */
const MAX_REPORTED_TOKENS = 20;

/**
 * Keeps one `CalendarEventViewDriver` per *eligible* chip and reconciles it with
 * the DOM through a single MutationObserver on `document.body`
 * (docs/calendar-sdk-plan.md §7).
 *
 * A chip is eligible when it (docs RE §1.7, §1.18):
 *  - matches the `eventChip` selector and is inside `mainRegion` (the drag ghost
 *    lives outside it);
 *  - has `jsaction` and `data-keyboardactiontype` (quick-create draft chips
 *    have neither);
 *  - has a decodable `data-eventid`, which Calendar sets AFTER inserting the
 *    chip — so eligibility is re-evaluated on attribute changes.
 *
 * Reconciliation is state-based: each touched chip is compared with what the
 * DOM looks like once the batch has settled, so remove+re-add of the same
 * element in one render keeps its view, while a replaced element (cross-day
 * drag) destroys the old view and creates a new one (V1 behaviour, plan §7.3).
 */
export default class EventRegistry implements ViewHost {
  readonly #badges: BadgeHost;
  readonly #doc: Document;
  readonly #selectors: SelectorRegistry<CalendarSelectorKey>;
  readonly #entries = new Map<Element, CalendarEventViewDriver>();
  readonly #subscribers = new Set<Subscriber>();
  readonly #reportedTokens = new Set<string>();
  #observer: MutationObserver | null = null;
  #stopped = false;

  constructor(
    doc: Document,
    selectors: SelectorRegistry<CalendarSelectorKey>,
    badges: BadgeHost,
  ) {
    this.#badges = badges;
    this.#doc = doc;
    this.#selectors = selectors;
  }

  /** Initial scan, then observe. */
  start(): void {
    this.reconcileAll();
    this.#observer = new MutationObserver((records) =>
      this.#onMutations(records),
    );
    this.#observer.observe(this.#doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-eventid', 'jsaction', 'data-keyboardactiontype'],
    });
  }

  getAll(): CalendarEventViewDriver[] {
    return [...this.#entries.values()];
  }

  subscribe(cb: Subscriber): () => void {
    this.#subscribers.add(cb);
    return () => this.#subscribers.delete(cb);
  }

  /**
   * Re-check every known chip and every chip currently in the document. Used
   * for the initial scan and when the route changes.
   */
  reconcileAll(): void {
    const touched = new Set<Element>(this.#entries.keys());
    for (const selector of this.#selectors.getCandidates('eventChip')) {
      this.#doc.querySelectorAll(selector).forEach((el) => touched.add(el));
    }
    for (const el of touched) this.#reconcile(el);
  }

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#observer?.disconnect();
    this.#subscribers.clear();
    for (const driver of this.#entries.values()) driver.destroy();
    this.#entries.clear();
  }

  addBadge(
    driver: CalendarEventViewDriver,
    descriptor: BadgeDescriptor,
  ): BadgeHandle {
    return this.#badges.addBadge(driver, descriptor);
  }

  /** The view of a chip element, if that chip currently has one. */
  getDriverForElement(el: Element): CalendarEventViewDriver | undefined {
    return this.#entries.get(el);
  }

  getSegment(driver: CalendarEventViewDriver): EventSegment {
    const key = eventRefKey(driver.getEventRef());
    const siblings = [...this.#entries.values()]
      .filter((d) => eventRefKey(d.getEventRef()) === key)
      .sort((a, b) =>
        a.element.compareDocumentPosition(b.element) &
        Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
      );
    const index = Math.max(0, siblings.indexOf(driver));
    return { index, count: siblings.length, isPrimary: index === 0 };
  }

  #onMutations(records: MutationRecord[]) {
    if (this.#stopped) return;
    const touched = new Set<Element>();
    for (const record of records) {
      if (record.type === 'attributes') {
        if (this.#isChip(record.target as Element)) {
          touched.add(record.target as Element);
        }
        continue;
      }
      record.addedNodes.forEach((n) => this.#collectChips(n, touched));
      record.removedNodes.forEach((n) => this.#collectChips(n, touched));
    }
    for (const el of touched) this.#reconcile(el);
  }

  #isChip(el: Element): boolean {
    return this.#selectors.matchesByKey(el, 'eventChip');
  }

  #collectChips(node: Node, into: Set<Element>) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (this.#isChip(el)) into.add(el);
    for (const selector of this.#selectors.getCandidates('eventChip')) {
      el.querySelectorAll(selector).forEach((chip) => into.add(chip));
    }
  }

  #eligibleRef(el: Element) {
    if (!el.isConnected) return null;
    if (!this.#selectors.closestByKey(el, 'mainRegion')) return null;
    if (
      !el.hasAttribute('jsaction') ||
      !el.hasAttribute('data-keyboardactiontype')
    ) {
      return null;
    }
    const raw = el.getAttribute('data-eventid');
    if (!raw) return null; // not set yet: it arrives as an attribute mutation
    const ref = eventRefFromChip(el);
    if (!ref) this.#reportUndecodable(raw);
    return ref;
  }

  #reportUndecodable(token: string) {
    if (
      this.#reportedTokens.has(token) ||
      this.#reportedTokens.size >= MAX_REPORTED_TOKENS
    ) {
      return;
    }
    this.#reportedTokens.add(token);
    // token shape only, never the token itself
    reportEvent('identity-decode-failed', { length: token.length });
  }

  #reconcile(el: Element) {
    const existing = this.#entries.get(el);
    const ref = this.#eligibleRef(el);

    if (existing) {
      if (ref && eventRefKey(ref) === eventRefKey(existing.getEventRef())) {
        return; // unchanged
      }
      this.#entries.delete(el);
      existing.destroy();
    }
    if (!ref) return;

    const driver = new CalendarEventViewDriver(el as HTMLElement, ref, this);
    this.#entries.set(el, driver);
    for (const cb of [...this.#subscribers]) {
      try {
        cb(driver);
      } catch (err) {
        reportError(err);
      }
    }
  }
}
