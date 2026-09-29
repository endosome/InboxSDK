import { RouteType } from '../constants/router';
import { classifyRoute } from '../dom-driver/google-calendar/route-classifier';
import { decodeEventId } from '../dom-driver/google-calendar/identity';
import type { CalendarSelectorKey } from '../dom-driver/google-calendar/selectors';
import type { CompatIssue, CompatReport, SelectorResult } from './types';
import { structureHash } from './structure';

export type Candidates = Readonly<
  Record<CalendarSelectorKey, readonly string[]>
>;

type Context = 'page' | 'grid' | 'dated-grid' | 'main' | 'popover' | 'editor';

type Spec = {
  context: Context;
  /**
   * Independent evidence, NOT taken from the registry, that the element is on
   * the page. Without it, a miss in an active context is a hard failure; with
   * it, a miss is only hard when the evidence is there.
   */
  canary?: string;
  /** May legitimately be absent (e.g. no Edit button on a read-only event). */
  optional?: boolean;
};

const POPOVER_CANARY = '[role=dialog][data-chips-dialog] [data-eventid]';

/** Every registry key must have a spec (enforced by a test). */
export const SELECTOR_SPECS: Record<CalendarSelectorKey, Spec> = {
  mainRegion: { context: 'main' },
  eventChip: { context: 'grid', canary: '[role=main] [data-eventid]' },
  dateCell: { context: 'dated-grid', canary: '[role=main] [data-datekey]' },
  overlayHost: { context: 'page' },
  eventPopover: { context: 'popover' },
  chipsDialog: { context: 'popover' },
  popoverEventIdNode: { context: 'popover' },
  popoverEditButton: { context: 'popover', optional: true },
  popoverDeleteButton: { context: 'popover', optional: true },
  editorTitle: { context: 'editor' },
  editorSave: { context: 'editor' },
  editorCancel: { context: 'editor' },
  appHeader: { context: 'grid' },
  searchButton: { context: 'grid' },
};

const GRID_TYPES: ReadonlySet<RouteType> = new Set([
  RouteType.DAY,
  RouteType.WEEK,
  RouteType.MONTH,
  RouteType.YEAR,
  RouteType.AGENDA,
  RouteType.CUSTOM_DAYS,
  RouteType.SEARCH,
]);
const DATED_TYPES: ReadonlySet<RouteType> = new Set([
  RouteType.DAY,
  RouteType.WEEK,
  RouteType.MONTH,
  RouteType.CUSTOM_DAYS,
]);

function activeContexts(doc: Document): {
  active: Set<Context>;
  routeType: RouteType;
} {
  const loc = doc.defaultView?.location;
  const { descriptor } = classifyRoute({
    viewKey: doc.body?.getAttribute('data-viewkey') ?? null,
    viewFamily: doc.body?.getAttribute('data-viewfamily') ?? null,
    pathname: loc?.pathname ?? '',
    search: loc?.search ?? '',
  });
  const t = descriptor.type;
  const active = new Set<Context>(['page']);
  if (GRID_TYPES.has(t)) active.add('grid');
  if (DATED_TYPES.has(t)) active.add('dated-grid');
  if (GRID_TYPES.has(t) || t === RouteType.EVENT_EDIT) active.add('main');
  if (t === RouteType.EVENT_EDIT) active.add('editor');
  // popovers are found by evidence, not by the registry that may be broken
  if (
    [...doc.querySelectorAll(POPOVER_CANARY)].some(
      (n) => !n.closest('[role=dialog]')?.querySelector('input, textarea'),
    )
  ) {
    active.add('popover');
  }
  return { active, routeType: t };
}

function safeQuery(doc: Document, selector: string): Element[] {
  try {
    return [...doc.querySelectorAll(selector)];
  } catch {
    return []; // invalid CSS in this browser: counts as no match
  }
}

function checkSelector(
  doc: Document,
  key: CalendarSelectorKey,
  chain: readonly string[],
  spec: Spec,
  active: Set<Context>,
): SelectorResult {
  if (!active.has(spec.context)) {
    return { key, status: 'inactive', rungIndex: null, count: 0 };
  }
  for (let i = 0; i < chain.length; i++) {
    const count = safeQuery(doc, chain[i]).length;
    if (count > 0) {
      return { key, status: i === 0 ? 'ok' : 'fallback', rungIndex: i, count };
    }
  }
  const evidence = spec.canary ? safeQuery(doc, spec.canary).length : null;
  const mustExist = evidence === null ? !spec.optional : evidence > 0;
  return {
    key,
    status: mustExist ? 'miss' : 'unverified',
    rungIndex: null,
    count: evidence ?? 0,
  };
}

/** Landmarks fingerprinted per report, with how deep to look. */
const LANDMARKS: {
  name: string;
  key: CalendarSelectorKey;
  depth: number;
}[] = [
  { name: 'eventChip', key: 'eventChip', depth: 1 },
  { name: 'popover', key: 'eventPopover', depth: 3 },
  { name: 'appHeader', key: 'appHeader', depth: 2 },
  { name: 'editorMain', key: 'mainRegion', depth: 1 },
];

function firstMatch(doc: Document, chain: readonly string[]): Element | null {
  for (const selector of chain) {
    const el = safeQuery(doc, selector)[0];
    if (el) return el;
  }
  return null;
}

function checkIdentity(doc: Document): CompatIssue[] {
  const chips = safeQuery(doc, '[role=main] [data-eventchip][data-eventid]');
  if (chips.length === 0) return [];
  const bad = chips.filter(
    (c) => decodeEventId(c.getAttribute('data-eventid')) === null,
  ).length;
  if (bad === 0) return [];
  return [
    {
      severity: bad === chips.length ? 'hard' : 'warning',
      check: 'identity-decode-failed',
      count: bad,
    },
  ];
}

/**
 * Check the page against the selector registry. Pure: reads `doc`, changes
 * nothing, sends nothing. Used in the page by `sdk.Compat` and, bundled, by the
 * CDP compat runner — one implementation for both.
 */
export function runCompatChecks(
  doc: Document,
  candidates: Candidates,
  now: Date = new Date(),
): CompatReport {
  const { active, routeType } = activeContexts(doc);
  const selectors: SelectorResult[] = [];
  const issues: CompatIssue[] = [];

  for (const key of Object.keys(SELECTOR_SPECS) as CalendarSelectorKey[]) {
    const result = checkSelector(
      doc,
      key,
      candidates[key] ?? [],
      SELECTOR_SPECS[key],
      active,
    );
    selectors.push(result);
    if (result.status === 'miss') {
      issues.push({
        severity: 'hard',
        check: 'selector-miss',
        selectorKey: key,
        count: result.count || undefined,
      });
    } else if (result.status === 'fallback') {
      issues.push({
        severity: 'warning',
        check: 'selector-fallback',
        selectorKey: key,
        rungIndex: result.rungIndex ?? undefined,
      });
    }
  }
  if (active.has('grid')) issues.push(...checkIdentity(doc));

  const structure: Record<string, string> = {};
  for (const { name, key, depth } of LANDMARKS) {
    if (name === 'editorMain' && routeType !== RouteType.EVENT_EDIT) continue;
    const el = firstMatch(doc, candidates[key] ?? []);
    if (el) structure[name] = structureHash(el, depth);
  }

  const lang = doc.documentElement.getAttribute('lang') ?? '?';
  const uiKind = doc.documentElement.getAttribute('data-ui-kind') ?? '?';
  return {
    variant: `${lang}/${uiKind}/${
      doc.body?.getAttribute('data-viewkey') ?? '?'
    }`,
    checkedAt: now.toISOString(),
    issues,
    selectors,
    structure,
  };
}

/** Warnings for landmarks whose fingerprint differs from a stored baseline. */
export function compareStructure(
  structure: Readonly<Record<string, string>>,
  baseline: Readonly<Record<string, string>>,
): CompatIssue[] {
  const issues: CompatIssue[] = [];
  for (const [name, hash] of Object.entries(structure)) {
    if (baseline[name] !== undefined && baseline[name] !== hash) {
      issues.push({
        severity: 'warning',
        check: `structure-drift:${name}`,
      });
    }
  }
  return issues;
}
