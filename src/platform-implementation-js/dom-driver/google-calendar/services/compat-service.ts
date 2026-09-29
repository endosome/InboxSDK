import { reportError } from '../../../lib/reporter';
import type SelectorRegistry from '../../../lib/dom/selectorRegistry';
import { CALENDAR_SELECTORS, type CalendarSelectorKey } from '../selectors';
import { runCompatChecks, type Candidates } from '../../../compat/checks';
import type { CompatIssue, CompatReport } from '../../../compat/types';
import type RouteService from './route-service';

type Listener = (issue: CompatIssue) => void;

const issueId = (i: CompatIssue) =>
  `${i.check}|${i.selectorKey ?? ''}|${i.rungIndex ?? ''}`;

/**
 * Local self-check of the selector registry against the live page. Nothing
 * leaves the page: issues go to `onIssue` listeners only. Checks run shortly
 * after load and after each route change (once the page has settled) and
 * report an issue when it appears, and again if it disappears and returns.
 */
export default class CompatService {
  readonly #document: Document;
  readonly #selectors: SelectorRegistry<CalendarSelectorKey>;
  readonly #listeners = new Set<Listener>();
  readonly #settleMs: number;
  #known = new Set<string>();
  #timer: ReturnType<typeof setTimeout> | null = null;
  #unsubscribe: (() => void) | null = null;
  #stopped = false;

  constructor(
    document: Document,
    selectors: SelectorRegistry<CalendarSelectorKey>,
    settleMs = 1500,
  ) {
    this.#document = document;
    this.#selectors = selectors;
    this.#settleMs = settleMs;
  }

  start(routes: RouteService): void {
    this.#schedule();
    this.#unsubscribe = routes.subscribe(() => this.#schedule());
  }

  getReport(): CompatReport {
    const candidates = Object.fromEntries(
      (Object.keys(CALENDAR_SELECTORS) as CalendarSelectorKey[]).map((k) => [
        k,
        this.#selectors.getCandidates(k),
      ]),
    ) as Candidates;
    return runCompatChecks(this.#document, candidates);
  }

  onIssue(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  stop(): void {
    this.#stopped = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#unsubscribe?.();
    this.#listeners.clear();
  }

  /** Run a check now (also what the timer does). */
  check(): void {
    if (this.#stopped) return;
    let issues: CompatIssue[];
    try {
      issues = this.getReport().issues;
    } catch (err) {
      reportError(err);
      return;
    }
    const now = new Set(issues.map(issueId));
    for (const issue of issues) {
      if (this.#known.has(issueId(issue))) continue;
      for (const listener of [...this.#listeners]) {
        try {
          listener(issue);
        } catch (err) {
          reportError(err);
        }
      }
    }
    this.#known = now;
  }

  #schedule() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.check();
    }, this.#settleMs);
  }
}
