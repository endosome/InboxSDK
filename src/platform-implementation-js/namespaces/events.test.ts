import kefirStopper from 'kefir-stopper';
import Membrane from '../lib/Membrane';
import Events from './events';
import EventView from '../views/event-view';
import EventPopoverView from '../views/event-popover-view';
import CalendarEventPopoverViewDriver from '../dom-driver/google-calendar/views/calendar-event-popover-view-driver';
import EventEditorView from '../views/event-editor-view';
import CalendarEventEditorViewDriver from '../dom-driver/google-calendar/views/calendar-event-editor-view-driver';
import SelectorRegistry from '../lib/dom/selectorRegistry';
import {
  CALENDAR_SELECTORS,
  type CalendarSelectorKey,
} from '../dom-driver/google-calendar/selectors';
import type { EventEditorViewDriver } from '../driver-interfaces/event-editor-view-driver';
import CalendarEventViewDriver from '../dom-driver/google-calendar/views/calendar-event-view-driver';
import type { Driver } from '../driver-interfaces/driver';
import type { EventPopoverViewDriver } from '../driver-interfaces/event-popover-view-driver';
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
    {
      getSegment: () => ({ index: 0, count: 1, isPrimary: true }),
      addBadge: () => ({ update: () => undefined, remove: () => undefined }),
      addHoverCard: () => ({
        update: () => undefined,
        remove: () => undefined,
      }),
    },
  );
}

function fakeDriver(initial: CalendarEventViewDriver[] = []) {
  const existing = [...initial];
  const subs = new Set<(d: EventViewDriver) => void>();
  const stopper = kefirStopper();
  const driver = {
    getStopper: () => stopper,
    getEventViewDrivers: () => existing,
    getEventPopoverViewDrivers: () => [],
    onEventPopoverViewDriver: () => () => undefined,
    getEventEditorViewDrivers: () => [],
    onEventEditorViewDriver: () => () => undefined,
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

describe('popover handlers', () => {
  const popoverDriver = (eventId: string, kind: EventKind = 'event') =>
    new CalendarEventPopoverViewDriver(
      document.createElement('div'),
      ref(eventId, kind),
      {
        addButton: () => ({ update: () => undefined, remove: () => undefined }),
      },
    );

  function fakePopoverDriver(initial: CalendarEventPopoverViewDriver[] = []) {
    const subs = new Set<(d: EventPopoverViewDriver) => void>();
    const stopper = kefirStopper();
    const driver = {
      getStopper: () => stopper,
      getEventViewDrivers: () => [],
      onEventViewDriver: () => () => undefined,
      getEventEditorViewDrivers: () => [],
      onEventEditorViewDriver: () => () => undefined,
      getEventPopoverViewDrivers: () => initial,
      onEventPopoverViewDriver: (cb: (d: EventPopoverViewDriver) => void) => {
        subs.add(cb);
        return () => subs.delete(cb);
      },
    } as unknown as Driver;
    return {
      driver,
      stopper,
      open: (d: CalendarEventPopoverViewDriver) => subs.forEach((cb) => cb(d)),
    };
  }

  const popoverMembrane = () =>
    new Membrane([
      [CalendarEventViewDriver, (d) => new EventView(d)],
      [CalendarEventPopoverViewDriver, (d) => new EventPopoverView(d)],
    ]);

  test('open popovers are delivered to a late handler and later ones too; default kind is event', async () => {
    const { driver, open } = fakePopoverDriver([popoverDriver('a')]);
    const events = new Events(driver, popoverMembrane());
    const seen: string[] = [];
    events.registerEventPopoverHandler((v) =>
      seen.push(v.getEventRef().eventId),
    );
    await flush();
    open(popoverDriver('b'));
    open(popoverDriver('t', 'task'));
    expect(seen).toEqual(['a', 'b']);
  });

  test('kinds opt-in, unregister, destroy on close', async () => {
    const { driver, open } = fakePopoverDriver();
    const events = new Events(driver, popoverMembrane());
    const tasks = jest.fn();
    const unregister = events.registerEventPopoverHandler(tasks, {
      kinds: ['task'],
    });
    await flush();
    const t = popoverDriver('t', 'task');
    open(t);
    expect(tasks).toHaveBeenCalledTimes(1);
    const view = tasks.mock.calls[0][0] as EventPopoverView;
    const onDestroy = jest.fn();
    view.on('destroy', onDestroy);
    t.destroy();
    expect(onDestroy).toHaveBeenCalledTimes(1);
    unregister();
    open(popoverDriver('t2', 'task'));
    expect(tasks).toHaveBeenCalledTimes(1);
  });

  test('addButton passes the popover view to onClick and refuses a destroyed view', async () => {
    const added: Array<{ title: string; onClick: () => void }> = [];
    const d = new CalendarEventPopoverViewDriver(
      document.createElement('div'),
      ref('x'),
      {
        addButton: (_d, descriptor) => {
          added.push(descriptor);
          return { update: () => undefined, remove: () => undefined };
        },
      },
    );
    const view = new EventPopoverView(d);
    const onClick = jest.fn();
    view.addButton({ title: 'Open', onClick });
    added[0].onClick();
    expect(onClick).toHaveBeenCalledWith(view);
    d.destroy();
    expect(() => view.addButton({ title: 'late', onClick })).toThrow(
      'destroyed',
    );
  });
});

describe('editor handlers', () => {
  const editorDriver = (eventId: string | null) =>
    new CalendarEventEditorViewDriver(
      () => (eventId ? ref(eventId) : null),
      kefirStopper(),
      {
        document,
        selectors: new SelectorRegistry<CalendarSelectorKey>(
          CALENDAR_SELECTORS,
          {},
        ),
      },
    );

  function fakeEditorDriver(initial: CalendarEventEditorViewDriver[] = []) {
    const subs = new Set<(d: EventEditorViewDriver) => void>();
    const stopper = kefirStopper();
    const driver = {
      getStopper: () => stopper,
      getEventViewDrivers: () => [],
      onEventViewDriver: () => () => undefined,
      getEventPopoverViewDrivers: () => [],
      onEventPopoverViewDriver: () => () => undefined,
      getEventEditorViewDrivers: () => initial,
      onEventEditorViewDriver: (cb: (d: EventEditorViewDriver) => void) => {
        subs.add(cb);
        return () => subs.delete(cb);
      },
    } as unknown as Driver;
    return {
      driver,
      stopper,
      enter: (d: CalendarEventEditorViewDriver) => subs.forEach((cb) => cb(d)),
    };
  }

  const membrane = () =>
    new Membrane([
      [CalendarEventEditorViewDriver, (d) => new EventEditorView(d)],
    ]);

  test('the current editor reaches a late handler; later editors too; new events have a null ref', async () => {
    const { driver, enter } = fakeEditorDriver([editorDriver('a')]);
    const events = new Events(driver, membrane());
    const seen: (string | null)[] = [];
    events.registerEventEditorHandler((v) =>
      seen.push(v.getEventRef()?.eventId ?? null),
    );
    await flush();
    enter(editorDriver(null));
    enter(editorDriver('b'));
    expect(seen).toEqual(['a', null, 'b']);
  });

  test('destroy fires with the route stopper and unregister works', async () => {
    const { driver, enter } = fakeEditorDriver();
    const events = new Events(driver, membrane());
    const views: EventEditorView[] = [];
    const off = events.registerEventEditorHandler((v) => views.push(v));
    const stopper = kefirStopper();
    const d = new CalendarEventEditorViewDriver(() => ref('a'), stopper, {
      document,
      selectors: new SelectorRegistry<CalendarSelectorKey>(
        CALENDAR_SELECTORS,
        {},
      ),
    });
    enter(d);
    await flush();
    const onDestroy = jest.fn();
    views[0].on('destroy', onDestroy);
    stopper.destroy();
    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect(views[0].destroyed).toBe(true);
    off();
    enter(editorDriver('c'));
    await flush();
    expect(views).toHaveLength(1);
  });
});
