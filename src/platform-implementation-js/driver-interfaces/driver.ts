import type { Stopper } from 'kefir-stopper';

/**
 * What the platform-independent code (namespaces, public views) needs from a
 * site driver. Site-specific drivers (see `dom-driver/`) implement this; the
 * namespaces must depend on this interface and never on a concrete driver.
 */
export interface Driver {
  getAppId(): string;
  /** Ends when the driver is destroyed. Use with `takeUntilBy` to bound lifetimes. */
  getStopper(): Stopper;
  destroy(): void;
}
