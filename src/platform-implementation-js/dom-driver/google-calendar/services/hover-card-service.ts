import type {
  HoverCardDescriptor,
  HoverCardHandle,
} from '../../../driver-interfaces/event-view-driver';
import type SelectorRegistry from '../../../lib/dom/selectorRegistry';
import { reportError } from '../../../lib/reporter';
import type { CalendarSelectorKey } from '../selectors';
import type CalendarEventViewDriver from '../views/calendar-event-view-driver';
import { placeCard } from '../hover-position';
import { hoverCardStyleText } from './hover-card-style';

const OWNED_ATTR = 'data-calsdk-owned';
const STYLE_ID = 'calsdk-hover-style';
const DEFAULT_DELAY_MS = 350;
const MAX_DELAY_MS = 2000;
/** Time the pointer may spend between chip and an interactive card. */
const LEAVE_GRACE_MS = 120;
const MAX_CARD_WIDTH = 360;

type Entry = {
  descriptor: HoverCardDescriptor;
  removed: boolean;
};

type Showing = {
  chip: HTMLElement;
  driver: CalendarEventViewDriver;
  via: 'hover' | 'focus';
  /** Bumped on every hide: async steps of an older showing check it and stop. */
  generation: number;
  timer: ReturnType<typeof setTimeout> | null;
  leaveTimer: ReturnType<typeof setTimeout> | null;
  controllers: AbortController[];
  cleanups: (() => void)[];
  frame: HTMLElement | null;
  interactive: boolean;
  resize: ResizeObserver | null;
};

export type HoverCardServiceEnv = {
  document: Document;
  selectors: SelectorRegistry<CalendarSelectorKey>;
  appId: string;
  getDriverForElement(el: Element): CalendarEventViewDriver | undefined;
};

const clampDelay = (ms: number | undefined) =>
  Math.min(
    MAX_DELAY_MS,
    Math.max(0, Number.isFinite(ms) ? (ms as number) : DEFAULT_DELAY_MS),
  );

/**
 * Hover cards for event chips (docs/hover-card-plan.md). One instance per SDK
 * (`appId`): passive, delegated listeners on `document`, one fixed layer on
 * `body` outside everything Calendar re-renders, and at most one visible card
 * frame at a time. A card is (re)built for every showing.
 */
export default class HoverCardService {
  readonly #env: HoverCardServiceEnv;
  readonly #cards = new Map<CalendarEventViewDriver, Entry[]>();
  readonly #watched = new WeakSet<CalendarEventViewDriver>();
  #layer: HTMLElement | null = null;
  #current: Showing | null = null;
  #generation = 0;
  #pointerDown = false;
  #started = false;
  #stopped = false;
  readonly #listeners: [
    EventTarget,
    string,
    EventListener,
    AddEventListenerOptions | boolean,
  ][] = [];

  constructor(env: HoverCardServiceEnv) {
    this.#env = env;
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    const doc = this.#env.document;
    const win = doc.defaultView;
    const on = (
      target: EventTarget | null | undefined,
      type: string,
      fn: (e: Event) => void,
      options: AddEventListenerOptions | boolean = true,
    ) => {
      if (!target) return;
      const guarded: EventListener = (e) => {
        try {
          fn(e);
        } catch (err) {
          reportError(err);
        }
      };
      target.addEventListener(type, guarded, options);
      this.#listeners.push([target, type, guarded, options]);
    };
    // capture: pointerenter/leave and focus do not bubble; capture on `document` sees them all
    on(doc, 'pointerenter', (e) => this.#onPointerEnter(e as PointerEvent));
    on(doc, 'pointerleave', (e) => this.#onPointerLeave(e as PointerEvent));
    on(doc, 'pointerdown', (e) => {
      if (this.#inFrame(e.target)) return; // pressing a control inside an interactive card
      this.#pointerDown = true;
      this.hide();
    });
    for (const type of ['pointerup', 'pointercancel']) {
      on(doc, type, () => {
        this.#pointerDown = false;
      });
    }
    on(doc, 'click', (e) => {
      if (!this.#inFrame(e.target)) this.hide();
    });
    // scrolling or wheeling INSIDE the card (long content) must not close it
    const hideOutside = (e: Event) => {
      if (this.#current && !this.#inFrame(e.target)) this.hide();
    };
    on(doc, 'scroll', hideOutside, { capture: true, passive: true });
    on(doc, 'wheel', hideOutside, { capture: true, passive: true });
    on(doc, 'keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (!this.#current) return;
      // Enter/Space activate the chip (opening Calendar's popover) — but inside an
      // interactive card they activate the app's own buttons
      if (
        k === 'Escape' ||
        ((k === 'Enter' || k === ' ') && !this.#inFrame(e.target))
      ) {
        this.hide();
      }
    });
    on(doc, 'focusin', (e) => this.#onFocusIn(e as FocusEvent));
    on(doc, 'focusout', (e) => this.#onFocusOut(e as FocusEvent));
    on(win, 'blur', () => this.hide(), false);
    on(win, 'resize', () => this.#reposition(), false);
    on(doc, 'visibilitychange', () => doc.hidden && this.hide(), false);
  }

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.hide();
    for (const [target, type, fn, options] of this.#listeners) {
      target.removeEventListener(type, fn, options);
    }
    this.#listeners.length = 0;
    this.#layer?.remove();
    this.#layer = null;
    this.#env.document.getElementById(STYLE_ID)?.remove();
    this.#cards.clear();
  }

  addHoverCard(
    driver: CalendarEventViewDriver,
    descriptor: HoverCardDescriptor,
  ): HoverCardHandle {
    if (typeof descriptor?.render !== 'function') {
      throw new Error('addHoverCard: `render` is required');
    }
    const noop = { update: () => undefined, remove: () => undefined };
    if (this.#stopped) return noop;
    const entry: Entry = { descriptor: { ...descriptor }, removed: false };
    const list = this.#cards.get(driver) ?? [];
    list.push(entry);
    this.#cards.set(driver, list);
    if (!this.#watched.has(driver)) {
      this.#watched.add(driver);
      driver.getStopper().onValue(() => {
        this.#cards.delete(driver);
        if (this.#current?.driver === driver) this.hide();
      });
    }
    const involved = () => this.#current?.driver === driver;
    return {
      update: (changes) => {
        if (entry.removed) return;
        Object.assign(entry.descriptor, changes);
        if (involved()) this.hide(); // takes effect with the next showing
      },
      remove: () => {
        if (entry.removed) return;
        entry.removed = true;
        const rest = (this.#cards.get(driver) ?? []).filter((e) => e !== entry);
        if (rest.length) this.#cards.set(driver, rest);
        else this.#cards.delete(driver);
        if (involved()) this.hide();
      },
    };
  }

  /** Hide whatever is pending or shown; aborts and cleans up. Safe to call any time. */
  hide(): void {
    this.#generation++;
    const cur = this.#current;
    if (!cur) return;
    this.#current = null;
    cur.generation = -1;
    if (cur.timer) clearTimeout(cur.timer);
    if (cur.leaveTimer) clearTimeout(cur.leaveTimer);
    for (const c of cur.controllers) c.abort();
    for (const fn of cur.cleanups) {
      try {
        fn();
      } catch (err) {
        reportError(err);
      }
    }
    cur.resize?.disconnect();
    cur.frame?.remove();
  }

  isShowing(): boolean {
    return !!this.#current?.frame;
  }

  // ---- triggers

  #inFrame(target: EventTarget | null): boolean {
    const frame = this.#current?.frame;
    return !!frame && target instanceof Node && frame.contains(target);
  }

  #chipOf(target: EventTarget | null): HTMLElement | null {
    const el = target instanceof Element ? target : null;
    if (!el || !this.#env.selectors.matchesByKey(el, 'eventChip')) return null;
    return el as HTMLElement;
  }

  #dialogOpen(): boolean {
    return !!this.#env.document.querySelector(
      '[role=dialog], [role=alertdialog]',
    );
  }

  #onPointerEnter(e: PointerEvent) {
    if (this.#stopped) return;
    const frame = this.#current?.frame;
    if (frame && e.target instanceof Node && frame.contains(e.target)) {
      // the bridge: the pointer reached an interactive card, keep it
      if (this.#current!.leaveTimer) {
        clearTimeout(this.#current!.leaveTimer);
        this.#current!.leaveTimer = null;
      }
      return;
    }
    const chip = this.#chipOf(e.target);
    if (!chip) return;
    if (e.pointerType === 'touch' || this.#pointerDown || e.buttons !== 0)
      return;
    if (this.#current?.chip === chip) {
      if (this.#current.leaveTimer) {
        clearTimeout(this.#current.leaveTimer);
        this.#current.leaveTimer = null;
      }
      return;
    }
    this.hide(); // moving to another chip: the old card goes, the new delay starts fresh
    this.#begin(chip, 'hover');
  }

  #onPointerLeave(e: PointerEvent) {
    const cur = this.#current;
    if (!cur || cur.via !== 'hover') return;
    // `pointerleave` fires for every element the pointer leaves: only the frame itself (not one of
    // its children, which the pointer leaves all the time while moving inside the card) or the chip
    // means "the pointer is gone"
    const leftFrame = !!cur.frame && e.target === cur.frame;
    if (leftFrame || e.target === cur.chip) {
      if (cur.interactive && cur.frame) {
        if (cur.leaveTimer) clearTimeout(cur.leaveTimer);
        cur.leaveTimer = setTimeout(() => {
          if (this.#current === cur) this.hide();
        }, LEAVE_GRACE_MS);
      } else if (e.target === cur.chip) {
        this.hide();
      }
    }
  }

  #onFocusIn(e: FocusEvent) {
    if (this.#stopped) return;
    const el = e.target instanceof Element ? e.target : null;
    const chip = el && this.#chipOf(el.closest('[data-eventchip]') ?? el);
    if (!chip || this.#pointerDown) return;
    if (this.#current?.chip === chip) return;
    this.hide();
    this.#begin(chip, 'focus');
  }

  #onFocusOut(e: FocusEvent) {
    const cur = this.#current;
    if (
      cur &&
      cur.via === 'focus' &&
      e.target instanceof Node &&
      cur.chip.contains(e.target)
    ) {
      this.hide();
    }
  }

  // ---- showing

  #begin(chip: HTMLElement, via: 'hover' | 'focus') {
    const driver = this.#env.getDriverForElement(chip);
    const entries = (driver && this.#cards.get(driver)) ?? [];
    if (!driver || entries.length === 0 || this.#dialogOpen()) return;
    const delay =
      via === 'focus'
        ? 0
        : Math.min(...entries.map((e) => clampDelay(e.descriptor.delayMs)));
    const showing: Showing = {
      chip,
      driver,
      via,
      generation: ++this.#generation,
      timer: null,
      leaveTimer: null,
      controllers: [],
      cleanups: [],
      frame: null,
      interactive: entries.some((e) => !!e.descriptor.interactive),
      resize: null,
    };
    this.#current = showing;
    showing.timer = setTimeout(() => {
      showing.timer = null;
      void this.#show(showing);
    }, delay);
  }

  async #show(showing: Showing) {
    const alive = () => this.#current === showing && !this.#stopped;
    if (!alive() || this.#dialogOpen() || !showing.chip.isConnected) {
      if (alive()) this.hide();
      return;
    }
    const entries = (this.#cards.get(showing.driver) ?? []).filter(
      (e) => !e.removed,
    );
    const parts: HTMLElement[] = [];
    await Promise.all(
      entries.map(async (entry) => {
        const container = this.#env.document.createElement('div');
        container.className = 'calsdk-hover-card__part';
        const controller = new AbortController();
        showing.controllers.push(controller);
        try {
          const cleanup = await entry.descriptor.render(container, {
            signal: controller.signal,
          });
          if (typeof cleanup === 'function') showing.cleanups.push(cleanup);
          if (!controller.signal.aborted)
            parts[entries.indexOf(entry)] = container;
        } catch (err) {
          reportError(err); // a card that fails is simply not shown
        }
      }),
    );
    if (!alive()) return;
    const shown = parts.filter(Boolean);
    if (shown.length === 0) {
      this.hide();
      return;
    }
    const frame = this.#buildFrame(showing, entries, shown);
    showing.frame = frame;
    this.#ensureLayer().appendChild(frame);
    if (!this.#place(showing)) {
      this.hide();
      return;
    }
    const RO = this.#env.document.defaultView?.ResizeObserver;
    if (RO) {
      showing.resize = new RO(() => this.#reposition());
      showing.resize.observe(frame);
    }
  }

  #buildFrame(
    showing: Showing,
    entries: Entry[],
    parts: HTMLElement[],
  ): HTMLElement {
    const doc = this.#env.document;
    const frame = doc.createElement('div');
    frame.className = 'calsdk-hover-card';
    frame.setAttribute(OWNED_ATTR, this.#env.appId);
    frame.setAttribute('data-calsdk-hover-card', '');
    frame.setAttribute('data-calsdk-theme', this.#theme());
    const label = entries.map((e) => e.descriptor.label).find(Boolean);
    if (showing.interactive) {
      frame.setAttribute('data-calsdk-interactive', '');
      frame.setAttribute('role', 'dialog');
      frame.setAttribute('aria-label', label ?? 'Event details');
      this.#contain(frame);
    } else {
      frame.setAttribute('role', 'tooltip');
      if (label) frame.setAttribute('aria-label', label);
    }
    frame.style.visibility = 'hidden';
    for (const p of parts) frame.appendChild(p);
    return frame;
  }

  /** Keep the pointer/keys of an interactive card away from Calendar's delegated handlers. */
  #contain(frame: HTMLElement) {
    for (const type of [
      'pointerdown',
      'mousedown',
      'mouseup',
      'pointerup',
      'click',
      'dblclick',
      'contextmenu',
    ]) {
      frame.addEventListener(type, (e) => e.stopPropagation());
    }
    for (const type of ['keydown', 'keyup', 'keypress']) {
      frame.addEventListener(type, (e) => {
        const key = (e as KeyboardEvent).key;
        if (key !== 'Escape' && key !== 'Tab') e.stopPropagation();
      });
    }
  }

  #place(showing: Showing): boolean {
    const frame = showing.frame;
    const win = this.#env.document.defaultView;
    if (!frame || !win) return false;
    const viewport = { width: win.innerWidth, height: win.innerHeight };
    const rtl =
      win.getComputedStyle(this.#env.document.documentElement).direction ===
      'rtl';
    frame.style.maxWidth = `${Math.min(MAX_CARD_WIDTH, viewport.width - 16)}px`;
    frame.style.maxHeight = `${viewport.height - 16}px`;
    const anchor = showing.chip.getBoundingClientRect();
    const measure = () => {
      const r = frame.getBoundingClientRect();
      return { width: r.width, height: r.height };
    };
    let placed = placeCard(anchor, measure(), viewport, { rtl });
    if (!placed) return false;
    // squeezed into a side that is too small: apply the space as a limit and place again
    frame.style.maxWidth = `${Math.min(MAX_CARD_WIDTH, placed.maxWidth)}px`;
    frame.style.maxHeight = `${placed.maxHeight}px`;
    placed = placeCard(anchor, measure(), viewport, { rtl });
    if (!placed) return false;
    frame.style.left = `${Math.round(placed.left)}px`;
    frame.style.top = `${Math.round(placed.top)}px`;
    frame.style.visibility = 'visible';
    return true;
  }

  #reposition() {
    const cur = this.#current;
    if (!cur?.frame) return;
    if (!cur.chip.isConnected || !this.#place(cur)) this.hide();
  }

  #ensureLayer(): HTMLElement {
    const doc = this.#env.document;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = hoverCardStyleText();
      (doc.head ?? doc.documentElement).appendChild(style);
    }
    if (!this.#layer || !this.#layer.isConnected) {
      const layer = doc.createElement('div');
      layer.className = 'calsdk-hover-layer';
      layer.setAttribute(OWNED_ATTR, this.#env.appId);
      layer.setAttribute('data-calsdk-hover-layer', '');
      doc.body.appendChild(layer);
      this.#layer = layer;
    }
    return this.#layer;
  }

  /** Calendar's dark theme is its own setting: read the actual background behind the grid. */
  #theme(): 'light' | 'dark' {
    const doc = this.#env.document;
    const win = doc.defaultView;
    const main =
      this.#env.selectors.querySelectorByKey(doc.body, 'mainRegion') ??
      doc.body;
    for (let el: Element | null = main; el && win; el = el.parentElement) {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(
        win.getComputedStyle(el).backgroundColor,
      );
      if (m && (m[4] === undefined || +m[4] > 0.5)) {
        const lum = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
        return lum < 0.5 ? 'dark' : 'light';
      }
    }
    return 'light';
  }
}
