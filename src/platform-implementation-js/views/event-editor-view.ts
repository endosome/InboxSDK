import SafeEventEmitter from '../lib/safe-event-emitter';
import type { EventRef } from '../driver-interfaces/event-view-driver';
import type { EventEditorViewDriver } from '../driver-interfaces/event-editor-view-driver';

/**
 * The full-page event editor. It exists for exactly as long as the
 * `EVENT_EDIT` route does: created when the route starts (the editor's fields
 * may not have rendered yet) and destroyed when the route ends. Dialogs opened
 * over the editor do not affect it.
 *
 * Events: `titleChange(title)` when the user types in the title field,
 * `saveClicked` when the Save button is clicked, `destroy`. `saveClicked` does
 * NOT mean the event was saved: Calendar may still ask about guest
 * notifications or the recurring scope, and the user can back out.
 */
export default class EventEditorView extends SafeEventEmitter {
  destroyed = false;
  readonly #driver: EventEditorViewDriver;

  constructor(driver: EventEditorViewDriver) {
    super();
    this.#driver = driver;
    const offTitle = driver.onTitleChange((title) =>
      this.emit('titleChange', title),
    );
    const offSave = driver.onSaveClicked(() => this.emit('saveClicked'));
    driver.getStopper().onValue(() => {
      offTitle();
      offSave();
      this.destroyed = true;
      this.emit('destroy');
      this.removeAllListeners();
    });
  }

  /** The item being edited, or null when creating a new event. Never changes for a view. */
  getEventRef(): EventRef | null {
    return this.#driver.getEventRef();
  }

  isNewEvent(): boolean {
    return this.#driver.getEventRef() === null;
  }

  /** Current text of the title field, or null while the field is not on the page. */
  getTitle(): string | null {
    return this.#driver.getTitle();
  }
}
