import type { UserInfo } from '../../../driver-interfaces/driver';

export type { UserInfo };

/**
 * Read the hidden `#xUserInfo` node Calendar renders at load (children
 * `#xUserEmail`, `#xUserName`, `#xTimezone`, `#xGmtOffset`, `#xUserLocale`).
 * Returns null until the email is present. Works from a content script; no
 * page-world access is needed (docs/calendar-reverse-engineering.md §1.18).
 */
export function readUserInfo(doc: Document): UserInfo | null {
  const root = doc.getElementById('xUserInfo');
  if (!root) return null;
  const text = (id: string) =>
    root.querySelector(`#${id}`)?.textContent?.trim() ?? '';
  const emailAddress = text('xUserEmail');
  if (!emailAddress.includes('@')) return null;
  const offsetMs = Number(text('xGmtOffset'));
  return {
    emailAddress,
    name: text('xUserName'),
    timeZone: text('xTimezone') || null,
    gmtOffsetMinutes:
      text('xGmtOffset') !== '' && Number.isFinite(offsetMs)
        ? Math.round(offsetMs / 60000)
        : null,
    language: text('xUserLocale'),
  };
}
