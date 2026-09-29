import EditorService from './editor-service';
import SelectorRegistry from '../../../lib/dom/selectorRegistry';
import { CALENDAR_SELECTORS, type CalendarSelectorKey } from '../selectors';
import CalendarRouteViewDriver from '../views/calendar-route-view-driver';
import { RouteType } from '../../../constants/router';

const token = (id: string) => btoa(`${id} owner@m`).replace(/=+$/, '');

function route(type: RouteType, eventRawId: string | null = null) {
  return new CalendarRouteViewDriver({
    type,
    anchorDate: null,
    searchQuery: null,
    eventRawId,
  });
}

/** Just enough of RouteService for the editor service. */
function fakeRoutes(initial: CalendarRouteViewDriver) {
  let current = initial;
  const subs = new Set<(d: CalendarRouteViewDriver) => void>();
  return {
    getCurrent: () => current,
    subscribe: (cb: (d: CalendarRouteViewDriver) => void) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    go(next: CalendarRouteViewDriver) {
      const prev = current;
      current = next;
      prev.destroy();
      subs.forEach((cb) => cb(next));
    },
  };
}

function setup(initial: CalendarRouteViewDriver) {
  document.body.innerHTML = '';
  const routes = fakeRoutes(initial);
  const service = new EditorService(
    routes as any,
    document,
    new SelectorRegistry<CalendarSelectorKey>(CALENDAR_SELECTORS, {}),
  );
  const created: any[] = [];
  service.subscribe((d) => created.push(d));
  service.start();
  return { routes, service, created };
}

const addTitle = () => {
  const input = document.createElement('input');
  input.id = 'xTiIn';
  document.body.appendChild(input);
  return input;
};

test('the initial editor route yields an editor (listed, not announced)', () => {
  const t = token('abc');
  const { service, created } = setup(route(RouteType.EVENT_EDIT, t));
  expect(created).toHaveLength(0);
  const [d] = service.getAll();
  expect(d.getEventRef()?.eventId).toBe('abc');
  expect(d.getEventRef()?.rawId).toBe(t);
  expect(d.getEventRef()?.calendarId).toBeNull();
});

test('non-editor routes yield no editor', () => {
  const { service, routes, created } = setup(route(RouteType.WEEK));
  expect(service.getAll()).toEqual([]);
  routes.go(route(RouteType.MONTH));
  routes.go(route(RouteType.SETTINGS));
  expect(created).toHaveLength(0);
});

test('lifetime = route lifetime: created on entering, destroyed on leaving', () => {
  const { service, routes, created } = setup(route(RouteType.WEEK));
  routes.go(route(RouteType.EVENT_EDIT, token('abc')));
  expect(created).toHaveLength(1);
  expect(service.getAll()).toHaveLength(1);
  expect(created[0].getStopper().stopped).toBe(false);
  routes.go(route(RouteType.WEEK)); // Cancel → grid
  expect(created[0].getStopper().stopped).toBe(true);
  expect(service.getAll()).toEqual([]);
});

test('editor A → editor B: A is destroyed, B is a new editor', () => {
  const { routes, created } = setup(route(RouteType.EVENT_EDIT, token('aaa')));
  routes.go(route(RouteType.EVENT_EDIT, token('bbb')));
  expect(created).toHaveLength(1);
  expect(created[0].getEventRef().eventId).toBe('bbb');
});

test('a new-event editor has a null ref', () => {
  const { service } = setup(route(RouteType.EVENT_EDIT, null));
  expect(service.getAll()[0].getEventRef()).toBeNull();
});

test('an unreadable token is a null ref, never a guess', () => {
  const { service } = setup(route(RouteType.EVENT_EDIT, '!!!'));
  expect(service.getAll()[0].getEventRef()).toBeNull();
});

test('dialogs, popovers and quick-create appearing over the editor change nothing', async () => {
  const { service, created } = setup(route(RouteType.EVENT_EDIT, token('abc')));
  const before = service.getAll()[0];
  for (const html of [
    '<div role=dialog aria-label="Send invitation emails?"></div>',
    '<div role=dialog data-chips-dialog data-allow-wheel-scroll=false><div data-eventid="x"></div></div>',
    '<div role=dialog data-chips-dialog><input></div>',
  ]) {
    document.body.insertAdjacentHTML('beforeend', html);
    await Promise.resolve();
  }
  document.body.innerHTML = '';
  await Promise.resolve();
  expect(service.getAll()[0]).toBe(before);
  expect(before.getStopper().stopped).toBe(false);
  expect(created).toHaveLength(0);
});

test('getTitle reads the field live and is null before it renders', () => {
  const { service } = setup(route(RouteType.EVENT_EDIT, token('abc')));
  const d = service.getAll()[0];
  expect(d.getTitle()).toBeNull();
  const input = addTitle();
  input.value = 'Hello';
  expect(d.getTitle()).toBe('Hello');
  input.value = 'Hello again';
  expect(d.getTitle()).toBe('Hello again');
});

test('titleChange fires for typing in the title field only', () => {
  const { service } = setup(route(RouteType.EVENT_EDIT, token('abc')));
  const d = service.getAll()[0];
  const seen: string[] = [];
  d.onTitleChange((t: string) => seen.push(t));
  const input = addTitle();
  const other = document.createElement('input');
  document.body.appendChild(other);
  input.value = 'a';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  other.value = 'zzz';
  other.dispatchEvent(new Event('input', { bubbles: true }));
  expect(seen).toEqual(['a']);
});

test('saveClicked fires for the Save button (and its children)', () => {
  const { service } = setup(route(RouteType.EVENT_EDIT, token('abc')));
  const d = service.getAll()[0];
  let n = 0;
  d.onSaveClicked(() => n++);
  document.body.innerHTML =
    '<button id=xSaveBu><span id=in></span></button><button id=xCancelBu></button>';
  document.getElementById('in')!.click();
  document.getElementById('xCancelBu')!.click();
  expect(n).toBe(1);
});

test('listeners are removed when the route ends', () => {
  const { service, routes } = setup(route(RouteType.EVENT_EDIT, token('abc')));
  const d = service.getAll()[0];
  const seen: string[] = [];
  d.onTitleChange((t: string) => seen.push(t));
  const input = addTitle();
  routes.go(route(RouteType.WEEK));
  input.value = 'late';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  expect(seen).toEqual([]);
});

test('a throwing listener does not break others', () => {
  const { service } = setup(route(RouteType.EVENT_EDIT, token('abc')));
  const d = service.getAll()[0];
  const seen: string[] = [];
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  d.onTitleChange(() => {
    throw new Error('boom');
  });
  d.onTitleChange((t: string) => seen.push(t));
  const input = addTitle();
  input.value = 'x';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  expect(seen).toEqual(['x']);
});

test('the editor ref picks up a calendar id learned after the editor opened (derived)', () => {
  let learned: string | null = null;
  const r = new CalendarRouteViewDriver(
    {
      type: RouteType.EVENT_EDIT,
      anchorDate: null,
      searchQuery: null,
      eventRawId: token('abc'),
    },
    (hint) => (hint === 'owner@m' ? learned : null),
  );
  const { service } = setup(r);
  const d = service.getAll()[0];
  expect(d.getEventRef()?.calendarId).toBeNull();
  learned = 'owner@example.com';
  expect(d.getEventRef()).toMatchObject({
    calendarId: 'owner@example.com',
    confidence: 'derived',
  });
});
