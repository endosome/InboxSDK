import type { Stopper } from 'kefir-stopper';
import type { EventRef } from './event-view-driver';

/** What the public `EventEditorView` needs from a site driver. */
export interface EventEditorViewDriver {
  /** The item being edited; null when the editor creates a new event. */
  getEventRef(): EventRef | null;
  /** Current text of the title field, or null while the field is not on the page. */
  getTitle(): string | null;
  /** Called when the user types in the title field. Returns an unsubscribe function. */
  onTitleChange(cb: (title: string) => void): () => void;
  /** Called when the Save button is clicked. Returns an unsubscribe function. */
  onSaveClicked(cb: () => void): () => void;
  /** Ends when the editor route ends. */
  getStopper(): Stopper;
}
