import { load } from '../src/calendarsdk-js/calendarsdk';
import { makeChip } from '../src/platform-implementation-js/dom-driver/google-calendar/testing-chip-fixtures';

function renderCalendarShell() {
  document.body.setAttribute('data-viewkey', 'WEEK');
  document.body.setAttribute('data-viewfamily', 'EVENT');
  document.body.innerHTML = `<div id="xUserInfo" style="display:none">
    <div id="xUserEmail">alice@example.com</div><div id="xUserName"></div>
    <div id="xTimezone">Europe/Warsaw</div><div id="xGmtOffset">7200000</div>
    <div id="xUserLocale">en</div></div>
    <div role="main"><div id="grid"></div></div>`;
  document
    .getElementById('grid')!
    .append(makeChip({ decoded: 'evt1 owner@m' }));
  window.history.pushState({}, '', '/calendar/u/0/r/week/2026/9/30');
}
const tick = () => new Promise((r) => setTimeout(r, 20));
const badges = () => document.querySelectorAll('[data-calsdk-badge]').length;

beforeEach(() => {
  renderCalendarShell();
  globalThis.__test_origin = 'https://calendar.google.com';
});
afterEach(() => {
  globalThis.__test_origin = undefined;
});

const addBadges = (sdk: Awaited<ReturnType<typeof load>>) =>
  sdk.Events.registerEventViewHandler((v) => {
    v.addBadge({ text: 'CRM' });
  });

test('a second load() with the same appId replaces the first: one badge, first sdk destroyed', async () => {
  const first = await load(1, { appId: 'same-app' });
  addBadges(first);
  await tick();
  expect(badges()).toBe(1);
  const onDestroy = jest.fn();
  first.on('destroy', onDestroy);

  const second = await load(1, { appId: 'same-app' });
  addBadges(second);
  await tick();

  expect(first.destroyed).toBe(true);
  expect(onDestroy).toHaveBeenCalledTimes(1);
  expect(second.destroyed).toBe(false);
  expect(badges()).toBe(1);
  second.destroy();
  await tick();
  expect(badges()).toBe(0);
});

test('different appIds coexist', async () => {
  const a = await load(1, { appId: 'app-a' });
  const b = await load(1, { appId: 'app-b' });
  addBadges(a);
  addBadges(b);
  await tick();
  expect(a.destroyed).toBe(false);
  expect(b.destroyed).toBe(false);
  expect(badges()).toBe(2);
  a.destroy();
  b.destroy();
});

test('a load() still pending when a newer one starts rejects as superseded; the newer one wins', async () => {
  const older = load(1, { appId: 'racy' });
  const newer = load(1, { appId: 'racy' });
  await expect(older).rejects.toThrow('superseded');
  const sdk = await newer;
  addBadges(sdk);
  await tick();
  expect(badges()).toBe(1);
  sdk.destroy();
});

test('after destroy() the listener is gone: a later load() does not touch anything stale', async () => {
  const first = await load(1, { appId: 'again' });
  first.destroy();
  const second = await load(1, { appId: 'again' });
  expect(second.destroyed).toBe(false);
  second.destroy();
});
