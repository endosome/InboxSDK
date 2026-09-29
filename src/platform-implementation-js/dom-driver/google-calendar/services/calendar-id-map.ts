import { reportEvent } from '../../../lib/reporter';

/**
 * Learns, at runtime, which full calendar id sits behind an abbreviation that
 * Calendar puts into `data-eventid` (`<owner>@m` ↔ `<owner>@gmail.com`; docs RE
 * §1.1). Pairs come only from plain event chips, whose `jslog` carries the full
 * id — there is NO hard-coded suffix table, because the abbreviation scheme is
 * Calendar's and differs by account type.
 *
 * An abbreviation that is ever seen with two different full ids is ambiguous
 * and never resolves (better `null` than a wrong calendar).
 */
export default class CalendarIdMap {
  readonly #known = new Map<string, string>();
  readonly #ambiguous = new Set<string>();

  learn(hint: string, calendarId: string): void {
    if (!hint || !calendarId || this.#ambiguous.has(hint)) return;
    const existing = this.#known.get(hint);
    if (existing === undefined) {
      this.#known.set(hint, calendarId);
    } else if (existing !== calendarId) {
      this.#known.delete(hint);
      this.#ambiguous.add(hint);
      reportEvent('calendar-id-conflict'); // no ids in the report
    }
  }

  resolve(hint: string): string | null {
    return this.#known.get(hint) ?? null;
  }
}
