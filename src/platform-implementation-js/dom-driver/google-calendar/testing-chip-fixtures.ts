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
  /** Full calendar id as in the chip's `jslog` (plain events only). */
  calendarId?: string;
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
    calendarId,
  } = options;
  const el = document.createElement('div');
  el.setAttribute('data-eventchip', '');
  if (role) el.setAttribute('role', role);
  if (dragClass) el.setAttribute('data-dragsource-type', dragClass);
  if (jsaction) {
    el.setAttribute('jsaction', 'click:cOuCgd');
    el.setAttribute('data-keyboardactiontype', '0;1');
  }
  if (calendarId)
    el.setAttribute('jslog', `39857; 1:["${calendarId}",1]; track:click`);
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

export type PopoverOptions = {
  decoded?: string;
  token?: string;
  /** Present only once the popover has finished rendering. */
  omitId?: boolean;
  wheel?: 'false' | 'true';
  /** Quick-create dialogs are full of form controls. */
  inputs?: boolean;
};

/**
 * Popover markup as observed on live Calendar (RE §4): dialog > span[jsname=bN97Pc]
 * > holder(data-eventid) > [header, body].
 */
export function makePopover(options: PopoverOptions = {}): HTMLElement {
  const {
    decoded = 'evt1 owner@m',
    token,
    omitId = false,
    wheel = 'false',
    inputs = false,
  } = options;
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('data-chips-dialog', 'true');
  dialog.setAttribute('data-allow-wheel-scroll', wheel);
  const content = document.createElement('span');
  content.setAttribute('jsname', 'bN97Pc');
  const holder = document.createElement('div');
  if (!omitId) holder.setAttribute('data-eventid', token ?? tokenFor(decoded));
  holder.innerHTML =
    '<div class="header"><button>Close</button></div><div class="body">details</div>';
  if (inputs)
    holder.querySelector('.body')!.append(document.createElement('input'));
  content.append(holder);
  dialog.append(content);
  return dialog;
}

/** The overlay host Calendar renders dialogs into. */
export function overlayHost(): HTMLElement {
  return document.getElementById('yDmH0d') as HTMLElement;
}
