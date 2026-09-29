import { difference } from 'lodash';
import CalendarSDK, {
  load,
  LOADER_VERSION,
} from '../src/calendarsdk-js/calendarsdk';

const originalWindowProperties = Object.keys(window);

function renderCalendarShell() {
  document.body.setAttribute('data-viewkey', 'WEEK');
  document.body.setAttribute('data-viewfamily', 'EVENT');
  document.body.innerHTML = `<div id="xUserInfo" style="display:none">
    <div id="xUserEmail">alice@example.com</div><div id="xUserName"></div>
    <div id="xTimezone">Europe/Warsaw</div><div id="xGmtOffset">7200000</div>
    <div id="xUserLocale">en</div></div>`;
  window.history.pushState({}, '', '/calendar/u/0/r/week/2026/9/30');
}

beforeEach(() => {
  renderCalendarShell();
});

afterEach(() => {
  globalThis.__test_origin = undefined;
});

test('loads on calendar.google.com, exposes Router and User, adds no globals', async () => {
  globalThis.__test_origin = 'https://calendar.google.com';
  const sdk = await load(1, { appId: 'test-app' });

  const newGlobals = difference(Object.keys(window), originalWindowProperties, [
    '__test_origin',
    '__coverage__',
    // jsdom exposes elements with an id as named window properties
    'xUserInfo',
    'xUserEmail',
    'xUserName',
    'xTimezone',
    'xGmtOffset',
    'xUserLocale',
    // https://github.com/zloirock/core-js/issues/726
    '__core-js_shared__',
  ]);
  expect(newGlobals).toEqual([]);

  expect(sdk.LOADER_VERSION).toBe('beep');
  expect(sdk.IMPL_VERSION).toBe('beep');
  expect(LOADER_VERSION).toBe('beep');
  expect(CalendarSDK.load).toBe(load);

  expect(sdk.User.getEmailAddress()).toBe('alice@example.com');
  expect(sdk.User.getTimeZone()).toBe('Europe/Warsaw');
  expect(sdk.User.getLanguage()).toBe('en');

  const route = sdk.Router.getCurrentRouteView();
  expect(route.getType()).toBe('WEEK');
  expect(route.getAnchorDate()).toBe('2026-09-30');
  expect(sdk.Router.RouteTypes.MONTH).toBe('MONTH');

  const onDestroy = jest.fn();
  sdk.on('destroy', onDestroy);
  sdk.destroy();
  sdk.destroy();
  expect(sdk.destroyed).toBe(true);
  expect(onDestroy).toHaveBeenCalledTimes(1);
  expect(route.destroyed).toBe(true);
});

test('rejects (throws) on any other origin instead of hanging', async () => {
  globalThis.__test_origin = 'https://mail.example.com';
  await expect(load(1, { appId: 'test-app' })).rejects.toThrow(
    'only runs on https://calendar.google.com',
  );
});

test('rejects unsupported API versions and bad appIds', async () => {
  globalThis.__test_origin = 'https://calendar.google.com';
  await expect(load(2, { appId: 'test-app' })).rejects.toThrow(
    'unsupported API version 2',
  );
  await expect(load(1, { appId: '' })).rejects.toThrow('appId');
});

test('rejects with a clear error when Calendar has not rendered user info', async () => {
  globalThis.__test_origin = 'https://calendar.google.com';
  document.body.innerHTML = '';
  await expect(
    load(1, { appId: 'test-app', readyTimeoutMs: 300 }),
  ).rejects.toThrow('user info');
});
