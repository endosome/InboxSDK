import type { Stopper } from 'kefir-stopper';
import type { EventRef } from '../../../driver-interfaces/event-view-driver';
import type { EventEditorViewDriver } from '../../../driver-interfaces/event-editor-view-driver';
import type SelectorRegistry from '../../../lib/dom/selectorRegistry';
import { reportError } from '../../../lib/reporter';
import type { CalendarSelectorKey } from '../selectors';

export type EditorEnv = {
  document: Document;
  selectors: SelectorRegistry<CalendarSelectorKey>;
};

/**
 * The full-page event editor. Its lifetime is the lifetime of the `EVENT_EDIT`
 * route (the stopper is the route's), so dialogs that open over the editor
 * (guest confirmation, recurring scope) can neither create nor end it. The
 * fields are looked up on demand and observed with document-level listeners,
 * so nothing here depends on the editor's DOM having rendered yet.
 */
export default class CalendarEventEditorViewDriver
  implements EventEditorViewDriver
{
  readonly #getRef: () => EventRef | null;
  readonly #stopper: Stopper;
  readonly #env: EditorEnv;
  readonly #cleanups = new Set<() => void>();

  /** `getRef` is called per use: the calendar id of the ref can be learned after the editor opens. */
  constructor(getRef: () => EventRef | null, stopper: Stopper, env: EditorEnv) {
    this.#getRef = getRef;
    this.#stopper = stopper;
    this.#env = env;
    stopper.onValue(() => {
      this.#cleanups.forEach((fn) => fn());
      this.#cleanups.clear();
    });
  }

  getEventRef(): EventRef | null {
    return this.#getRef();
  }

  getTitle(): string | null {
    const input = this.#env.selectors.querySelectorByKey(
      this.#env.document.body,
      'editorTitle',
    );
    return input instanceof HTMLInputElement ? input.value : null;
  }

  onTitleChange(cb: (title: string) => void): () => void {
    return this.#listen('input', 'editorTitle', (target) => {
      if (target instanceof HTMLInputElement) cb(target.value);
    });
  }

  onSaveClicked(cb: () => void): () => void {
    return this.#listen('click', 'editorSave', () => cb());
  }

  getStopper(): Stopper {
    return this.#stopper;
  }

  #listen(
    type: string,
    key: CalendarSelectorKey,
    cb: (target: Element) => void,
  ): () => void {
    const { document, selectors } = this.#env;
    const listener = (e: Event) => {
      if (this.#stopper.stopped) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      const hit = selectors.closestByKey(target, key);
      if (!hit) return;
      try {
        cb(hit);
      } catch (err) {
        reportError(err);
      }
    };
    // capture: still seen if Calendar stops propagation
    document.addEventListener(type, listener, true);
    const off = () => {
      document.removeEventListener(type, listener, true);
      this.#cleanups.delete(off);
    };
    this.#cleanups.add(off);
    return off;
  }
}
