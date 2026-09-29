import type { Stopper } from 'kefir-stopper';
import type { EventRef } from './event-view-driver';

export type PopoverButtonDescriptor = {
  /** Button label. */
  title: string;
  /** Optional icon shown before the label (data:, chrome-extension:// or https URL). */
  iconUrl?: string;
  /** Called when the button is clicked (the popover stays open). */
  onClick: () => void;
};

export type PopoverButtonHandle = {
  update(changes: Partial<PopoverButtonDescriptor>): void;
  remove(): void;
};

/** What the public `EventPopoverView` needs from a site driver. */
export interface EventPopoverViewDriver {
  getEventRef(): EventRef;
  addButton(descriptor: PopoverButtonDescriptor): PopoverButtonHandle;
  /** Ends when the popover closes or shows a different event. */
  getStopper(): Stopper;
}
