import type { EventRef } from '../driver-interfaces/event-view-driver';
import type {
  CalendarDataProvider,
  CalendarEvent,
  CalendarInfo,
} from '../driver-interfaces/data-provider';

/**
 * Thin, validating access to the extension's `dataProvider`. The core SDK does
 * no OAuth and no networking of its own; without a provider these reject.
 */
export default class Data {
  readonly #provider: CalendarDataProvider | undefined;

  constructor(provider?: CalendarDataProvider) {
    this.#provider = provider;
  }

  async getEvent(ref: EventRef): Promise<CalendarEvent | null> {
    if (!this.#provider) {
      throw new Error('Data.getEvent: no dataProvider was passed to load()');
    }
    if (!ref || typeof ref.eventId !== 'string' || !ref.eventId) {
      throw new Error('Data.getEvent: an EventRef is required');
    }
    return this.#provider.getEvent(ref);
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    if (!this.#provider) {
      throw new Error(
        'Data.listCalendars: no dataProvider was passed to load()',
      );
    }
    if (!this.#provider.listCalendars) {
      throw new Error(
        'Data.listCalendars: the dataProvider cannot list calendars',
      );
    }
    return this.#provider.listCalendars();
  }
}
