import { difference } from 'lodash';
import CalendarSDK, {
  load,
  LOADER_VERSION,
} from '../src/calendarsdk-js/calendarsdk';

const originalWindowProperties = Object.keys(window);

afterEach(() => {
  globalThis.__test_origin = undefined;
});

test('loads on calendar.google.com without adding globals', async () => {
  globalThis.__test_origin = 'https://calendar.google.com';
  const sdk = await load(1, { appId: 'test-app' });

  const newGlobals = difference(Object.keys(window), originalWindowProperties, [
    '__test_origin',
    '__coverage__',
    // https://github.com/zloirock/core-js/issues/726
    '__core-js_shared__',
  ]);
  expect(newGlobals).toEqual([]);

  expect(sdk.LOADER_VERSION).toBe('beep');
  expect(sdk.IMPL_VERSION).toBe('beep');
  expect(LOADER_VERSION).toBe('beep');
  expect(CalendarSDK.load).toBe(load);
  expect(sdk.destroyed).toBe(false);

  const onDestroy = jest.fn();
  sdk.on('destroy', onDestroy);
  sdk.destroy();
  sdk.destroy();
  expect(sdk.destroyed).toBe(true);
  expect(onDestroy).toHaveBeenCalledTimes(1);
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
