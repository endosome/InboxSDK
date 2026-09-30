import SafeEventEmitter from '../lib/safe-event-emitter';
import type {
  BadgeDescriptor,
  BadgeHandle,
  EventRef,
  EventSegment,
  EventViewDriver,
  HoverCardContext,
  HoverCardHandle,
} from '../driver-interfaces/event-view-driver';

/**
 * One chip of a calendar item that is currently rendered. It is created when
 * the chip becomes an event and emits `destroy` when the chip goes away or
 * stops showing that item. A multi-day event has one `EventView` per chip.
 * When Calendar replaces a chip (for example after dragging it to another day)
 * the old view is destroyed and a new one is created, so handlers run again.
 */
export type EventViewBadgeDescriptor = Omit<BadgeDescriptor, 'onClick'> & {
  /** Called with this view when the badge is clicked. */
  onClick?: (eventView: EventView) => void;
};

export type EventViewHoverCardDescriptor = {
  /**
   * Fill `container`; called on every showing with a fresh element. May be async and may return
   * a cleanup function. `signal` aborts when the card hides or the pointer moves to another chip.
   */
  render: (
    container: HTMLElement,
    eventView: EventView,
    context: HoverCardContext,
  ) => void | (() => void) | Promise<void | (() => void)>;
  /** Hover time before showing, ms. Default 350 (0–2000). */
  delayMs?: number;
  /** Let the pointer move onto the card. Default false. */
  interactive?: boolean;
  /** Accessible name of the card. */
  label?: string;
};

export default class EventView extends SafeEventEmitter {
  destroyed = false;
  readonly #driver: EventViewDriver;

  constructor(driver: EventViewDriver) {
    super();
    this.#driver = driver;
    driver.getStopper().onValue(() => {
      this.destroyed = true;
      this.emit('destroy');
      this.removeAllListeners();
    });
  }

  /** The item this view shows. It never changes for the lifetime of a view. */
  getEventRef(): EventRef {
    return this.#driver.getEventRef();
  }

  /**
   * Which chip of a multi-day event this is (document order). Recomputed on
   * every call because chips come and go as the user navigates or drags.
   */
  getSegment(): EventSegment {
    return this.#driver.getSegment();
  }

  /** Recomputed on every call: dragging can turn a timed event into an all-day one. */
  isAllDay(): boolean {
    return this.#driver.isAllDay();
  }

  /**
   * Show a small badge on this chip. Calendar re-renders chips and strips
   * foreign nodes, so the SDK re-inserts the badge whenever it disappears; it
   * is removed when this view is destroyed. Use the returned handle to change
   * or remove it.
   */
  addBadge(descriptor: EventViewBadgeDescriptor): BadgeHandle {
    if (this.destroyed) {
      throw new Error('addBadge: this EventView has been destroyed');
    }
    const { onClick, ...rest } = descriptor;
    return this.#driver.addBadge({
      ...rest,
      ...(onClick && { onClick: () => onClick(this) }),
    });
  }

  /**
   * Show a card next to this chip while it is hovered (or focused). `render` is
   * called for every showing with a new container. The card is removed with
   * this view; use the handle to change or remove it.
   */
  addHoverCard(descriptor: EventViewHoverCardDescriptor): HoverCardHandle {
    if (this.destroyed) {
      throw new Error('addHoverCard: this EventView has been destroyed');
    }
    const { render, ...rest } = descriptor;
    return this.#driver.addHoverCard({
      ...rest,
      render: (container, context) => render(container, this, context),
    });
  }
}
