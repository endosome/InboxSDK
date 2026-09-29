import kefirStopper from 'kefir-stopper';
import Membrane from '../lib/Membrane';
import Events from './events';
import EventView from '../views/event-view';
import CalendarEventViewDriver from '../dom-driver/google-calendar/views/calendar-event-view-driver';
import type { Driver } from '../driver-interfaces/driver';
import type {
  EventKind,
  EventRef,
  EventViewDriver,
} from '../driver-interfaces/event-view-driver';

function ref(eventId: string, kind: EventKind = 'event'): EventRef {
  return {
    eventId,
    calendarId: null,
    calendarIdHint: 'owner@m',
    kind,
    rawId: eventId,
    confidence: 'exact',
  };
}

function viewDriver(eventId: string, kind: EventKind = 'event') {
  return new CalendarEventViewDriver(
    document.createElement('div'),
    ref(eventId, kind),
    { getSegment: () => ({ index: 0, count: 1, isPrimary: true }) },
  );
}

function fakeDriver(initial: CalendarEventViewDriver[] = []) {
  const existing = [...initial];
  const subs = new Set<(d: EventViewDriver) => void>();
  const stopper = kefirStopper();
  const driver = {
    getStopper: () => stopper,
    getEventViewDrivers: () => existing,
    onEventViewDriver: (cb: (d: EventViewDriver) => void) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  } as unknown as Driver;
  return {
    driver,
    stopper,
    add(d: CalendarEventViewDriver) {
      existing.push(d);
      subs.forEach((cb) => cb(d));
    },
  };
}

const membrane = () =>
  new Membrane([[CalendarEventViewDriver, (d) => new EventView(d)]]);
const flush = () => new Promise((r) => setTimeout(r, 5));

test('handlers see chips already on the page and every later one', async () => {
  const { driver, add } = fakeDriver([viewDriver('a')]);
  const events = new Events(driver, membrane());
  const seen: string[] = [];
  events.registerEventViewHandler((v) => seen.push(v.getEventRef().eventId));
  await flush();
  add(viewDriver('b'));
  expect(seen).toEqual(['a', 'b']);
});

test('default kinds: plain events only; tasks and birthdays are opt-in', async () => {
  const { driver, add } = fakeDriver();
  const events = new Events(driver, membrane());
  const defaults: string[] = [];
  const all: string[] = [];
  events.registerEventViewHandler((v) => defaults.push(v.getEventRef().kind));
  events.registerEventViewHandler((v) => all.push(v.getEventRef().kind), {
    kinds: ['event', 'task', 'birthday'],
  });
  await flush();
  add(viewDriver('e'));
  add(viewDriver('t', 'task'));
  add(viewDriver('b', 'birthday'));
  add(viewDriver('u', 'unknown'));
  expect(defaults).toEqual(['event']);
  expect(all).toEqual(['event', 'task', 'birthday']);
});

test('unregister stops calls for every kind it was registered for', async () => {
  const { driver, add } = fakeDriver();
  const events = new Events(driver, membrane());
  const handler = jest.fn();
  const unregister = events.registerEventViewHandler(handler, {
    kinds: ['event', 'task'],
  });
  await flush();
  add(viewDriver('e'));
  unregister();
  add(viewDriver('e2'));
  add(viewDriver('t', 'task'));
  expect(handler).toHaveBeenCalledTimes(1);
});

test('the same EventView object is given to every handler, and it ends with the chip', async () => {
  const { driver, add } = fakeDriver();
  const events = new Events(driver, membrane());
  const a: EventView[] = [];
  const b: EventView[] = [];
  events.registerEventViewHandler((v) => a.push(v));
  events.registerEventViewHandler((v) => b.push(v));
  await flush();
  const d = viewDriver('x');
  add(d);
  expect(a[0]).toBe(b[0]);

  const onDestroy = jest.fn();
  a[0].on('destroy', onDestroy);
  d.destroy();
  expect(onDestroy).toHaveBeenCalledTimes(1);
  expect(a[0].destroyed).toBe(true);
});

test('handlers are dropped when the driver stops', async () => {
  const { driver, add, stopper } = fakeDriver();
  const events = new Events(driver, membrane());
  const handler = jest.fn();
  events.registerEventViewHandler(handler);
  await flush();
  stopper.destroy();
  add(viewDriver('late'));
  expect(handler).not.toHaveBeenCalled();
});

test('a handler that throws does not stop the others', async () => {
  const errors = jest
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);
  const { driver, add } = fakeDriver();
  const events = new Events(driver, membrane());
  const ok = jest.fn();
  events.registerEventViewHandler(() => {
    throw new Error('app bug');
  });
  events.registerEventViewHandler(ok);
  await flush();
  add(viewDriver('a'));
  expect(ok).toHaveBeenCalledTimes(1);
  errors.mockRestore();
});

test('an unknown kind is rejected loudly', () => {
  const { driver } = fakeDriver();
  const events = new Events(driver, membrane());
  expect(() =>
    events.registerEventViewHandler(() => undefined, {
      kinds: ['nope' as EventKind],
    }),
  ).toThrow('Unknown event kind');
});
