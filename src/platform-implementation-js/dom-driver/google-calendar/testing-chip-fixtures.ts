/**
 * DOM builders for tests, mirroring the markup verified on live Calendar
 * (docs/calendar-reverse-engineering.md §1). Test-only; never imported by the SDK.
 */

export const b64url = (s: string) => Buffer.from(s).toString('base64url');

export type ChipOptions = {
  /** Decoded `<id>[_<instance>] <calendarAbbrev>`; the token is derived from it. */
  decoded?: string;
  /** Use a literal `data-eventid` token instead (e.g. `ttb_…`). */
  token?: string;
  /** Set `data-eventid` only after the chip is attached (Calendar's real order). */
  omitId?: boolean;
  /** Quick-create draft chips have neither attribute. */
  jsaction?: boolean;
  dragClass?: '2' | '6' | '9' | null;
  role?: string | null;
};

export function tokenFor(decoded: string): string {
  return b64url(decoded);
}

export function makeChip(options: ChipOptions = {}): HTMLElement {
  const {
    decoded = 'evt1 owner@m',
    token,
    omitId = false,
    jsaction = true,
    dragClass = '2',
    role = 'button',
  } = options;
  const el = document.createElement('div');
  el.setAttribute('data-eventchip', '');
  if (role) el.setAttribute('role', role);
  if (dragClass) el.setAttribute('data-dragsource-type', dragClass);
  if (jsaction) {
    el.setAttribute('jsaction', 'click:cOuCgd');
    el.setAttribute('data-keyboardactiontype', '0;1');
  }
  if (!omitId) el.setAttribute('data-eventid', token ?? tokenFor(decoded));
  return el;
}

/** `[role=main]` grid plus the separate overlay host, like Calendar. */
export function renderShell(): { main: HTMLElement; ghostLayer: HTMLElement } {
  document.body.innerHTML = `
    <div id="content"><div role="main"><div class="grid"></div></div></div>
    <div id="ghost-layer"></div>
    <div id="yDmH0d"></div>`;
  return {
    main: document.querySelector('[role=main] .grid') as HTMLElement,
    ghostLayer: document.getElementById('ghost-layer') as HTMLElement,
  };
}

/** Let the MutationObserver callbacks run. */
export const flush = () => new Promise<void>((r) => setTimeout(r, 0));
