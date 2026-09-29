import kefirStopper from 'kefir-stopper';
import Membrane from '../lib/Membrane';
import Router from './router';
import RouteView from '../views/route-view/route-view';
import CalendarRouteViewDriver from '../dom-driver/google-calendar/views/calendar-route-view-driver';
import { RouteType } from '../constants/router';
import type { Driver } from '../driver-interfaces/driver';
import type { RouteViewDriver } from '../driver-interfaces/route-view-driver';

function fakeDriver(type: RouteType = RouteType.WEEK) {
  let current = new CalendarRouteViewDriver({
    type,
    anchorDate: null,
    searchQuery: null,
    eventRawId: null,
  });
  const subs = new Set<(d: RouteViewDriver) => void>();
  const stopper = kefirStopper();
  const driver = {
    getStopper: () => stopper,
    getCurrentRouteViewDriver: () => current,
    onRouteViewDriver: (cb: (d: RouteViewDriver) => void) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  } as unknown as Driver;
  return {
    driver,
    stopper,
    go(next: RouteType) {
      current.destroy();
      current = new CalendarRouteViewDriver({
        type: next,
        anchorDate: null,
        searchQuery: null,
        eventRawId: null,
      });
      subs.forEach((cb) => cb(current));
    },
  };
}

const membrane = () =>
  new Membrane([[CalendarRouteViewDriver, (d) => new RouteView(d)]]);

test('getCurrentRouteView returns the same object every time', () => {
  const { driver } = fakeDriver();
  const router = new Router(driver, membrane());
  expect(router.getCurrentRouteView()).toBe(router.getCurrentRouteView());
  expect(router.getCurrentRouteView().getType()).toBe('WEEK');
});

test('a handler sees the current route (async) and every later one', async () => {
  const { driver, go } = fakeDriver();
  const router = new Router(driver, membrane());
  const seen: string[] = [];
  router.registerRouteViewHandler((v) => seen.push(v.getType()));
  await new Promise((r) => setTimeout(r, 5));
  go(RouteType.MONTH);
  go(RouteType.DAY);
  expect(seen).toEqual(['WEEK', 'MONTH', 'DAY']);
});

test('a route view emits destroy when the route changes', () => {
  const { driver, go } = fakeDriver();
  const router = new Router(driver, membrane());
  const first = router.getCurrentRouteView();
  const onDestroy = jest.fn();
  first.on('destroy', onDestroy);
  expect(first.destroyed).toBe(false);
  go(RouteType.YEAR);
  expect(onDestroy).toHaveBeenCalledTimes(1);
  expect(first.destroyed).toBe(true);
  expect(router.getCurrentRouteView()).not.toBe(first);
});

test('an unregistered handler is not called; handlers are dropped on driver stop', async () => {
  const { driver, go, stopper } = fakeDriver();
  const router = new Router(driver, membrane());
  const a = jest.fn();
  const b = jest.fn();
  const unregisterA = router.registerRouteViewHandler(a);
  router.registerRouteViewHandler(b);
  await new Promise((r) => setTimeout(r, 5));
  unregisterA();
  go(RouteType.MONTH);
  expect(a).toHaveBeenCalledTimes(1);
  expect(b).toHaveBeenCalledTimes(2);
  stopper.destroy();
  go(RouteType.DAY);
  expect(b).toHaveBeenCalledTimes(2);
});

test('an app handler that throws does not stop others', async () => {
  const errors = jest
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);
  const { driver, go } = fakeDriver();
  const router = new Router(driver, membrane());
  const ok = jest.fn();
  router.registerRouteViewHandler(() => {
    throw new Error('app bug');
  });
  router.registerRouteViewHandler(ok);
  await new Promise((r) => setTimeout(r, 5));
  go(RouteType.MONTH);
  expect(ok).toHaveBeenCalledTimes(2);
  errors.mockRestore();
});
