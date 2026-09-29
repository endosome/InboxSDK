import RouteService from './route-service';
import { RouteType } from '../../../constants/router';

/** A tiny stand-in for the Navigation API / window event targets. */
function makeTarget() {
  const target = new EventTarget();
  return {
    addEventListener: (t: string, fn: () => void) =>
      target.addEventListener(t, fn),
    removeEventListener: (t: string, fn: () => void) =>
      target.removeEventListener(t, fn),
    fire: (t: string) => target.dispatchEvent(new Event(t)),
  };
}

function setup(path: string, viewKey: string, family = 'EVENT') {
  document.head.innerHTML = '<title>Google Calendar</title>';
  document.body.setAttribute('data-viewkey', viewKey);
  document.body.setAttribute('data-viewfamily', family);
  const location = { pathname: path, search: '' };
  const navigation = makeTarget();
  const win = makeTarget();
  const onDisagreement = jest.fn();
  const service = new RouteService({
    document,
    location,
    window: win,
    navigation,
    onDisagreement,
    settleMs: 300,
  });
  const routes: string[] = [];
  const view = () => {
    const d = service.getCurrent();
    return `${d.getType()}${d.getAnchorDate() ? ':' + d.getAnchorDate() : ''}`;
  };
  return { service, location, navigation, win, onDisagreement, routes, view };
}

/** URL first, then (a moment later) the body attributes — like Calendar. */
async function navigateTo(
  ctx: ReturnType<typeof setup>,
  path: string,
  viewKey: string,
  domDelayMs = 100,
) {
  ctx.location.pathname = path;
  ctx.navigation.fire('navigate');
  await jest.advanceTimersByTimeAsync(domDelayMs);
  document.body.setAttribute('data-viewkey', viewKey);
  await jest.advanceTimersByTimeAsync(0); // MutationObserver microtask
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('emits the initial route synchronously on start', () => {
  const ctx = setup('/calendar/u/0/r/week/2026/9/30', 'WEEK');
  const first = ctx.service.start();
  expect(first.getType()).toBe(RouteType.WEEK);
  expect(ctx.view()).toBe('WEEK:2026-09-30');
  ctx.service.stop();
});

test('a view switch emits a new route and destroys the old one', async () => {
  const ctx = setup('/calendar/u/0/r/week/2026/9/30', 'WEEK');
  const seen: string[] = [];
  const first = ctx.service.start();
  const destroyed = jest.fn();
  first.getStopper().onValue(destroyed);
  ctx.service.subscribe((d) => seen.push(d.getType()));

  await navigateTo(ctx, '/calendar/u/0/r/month/2026/9/30', 'MONTH');

  expect(seen).toEqual([RouteType.MONTH]);
  expect(destroyed).toHaveBeenCalledTimes(1);
  ctx.service.stop();
});

test('while the URL leads the DOM no wrong route is emitted', async () => {
  const ctx = setup('/calendar/u/0/r/week/2026/9/30', 'WEEK');
  const seen: string[] = [];
  ctx.service.start();
  ctx.service.subscribe((d) => seen.push(d.getType()));

  ctx.location.pathname = '/calendar/u/0/r/month/2026/9/30';
  ctx.navigation.fire('navigate');
  await jest.advanceTimersByTimeAsync(200); // URL is MONTH, body still WEEK
  expect(seen).toEqual([]);

  document.body.setAttribute('data-viewkey', 'MONTH');
  await jest.advanceTimersByTimeAsync(0);
  expect(seen).toEqual([RouteType.MONTH]);
  expect(ctx.onDisagreement).not.toHaveBeenCalled();
  ctx.service.stop();
});

test('if the DOM never catches up, the DOM wins after settleMs and it is reported', async () => {
  const ctx = setup('/calendar/u/0/r/week/2026/9/30', 'WEEK');
  const seen: string[] = [];
  ctx.service.start();
  ctx.service.subscribe((d) => seen.push(d.getType()));

  ctx.location.pathname = '/calendar/u/0/r/month/2026/10/1'; // date changed too
  ctx.navigation.fire('navigate');
  await jest.advanceTimersByTimeAsync(1000);

  expect(ctx.onDisagreement).toHaveBeenCalledTimes(1);
  // type stays WEEK (body), but the date is new, so it is a new route
  expect(seen).toEqual([RouteType.WEEK]);
  expect(ctx.view()).toBe('WEEK:2026-10-01');
  ctx.service.stop();
});

test('week → next week is a new route of the same type', async () => {
  const ctx = setup('/calendar/u/0/r/week/2026/9/30', 'WEEK');
  const seen: string[] = [];
  ctx.service.start();
  ctx.service.subscribe((d) =>
    seen.push(`${d.getType()}:${d.getAnchorDate()}`),
  );

  ctx.location.pathname = '/calendar/u/0/r/week/2026/10/4';
  ctx.navigation.fire('navigate'); // no body attribute changes at all
  await jest.advanceTimersByTimeAsync(10);

  expect(seen).toEqual(['WEEK:2026-10-04']);
  ctx.service.stop();
});

test('the same route again emits nothing', async () => {
  const ctx = setup('/calendar/u/0/r/week/2026/9/30', 'WEEK');
  const seen: string[] = [];
  ctx.service.start();
  ctx.service.subscribe((d) => seen.push(d.getType()));

  ctx.navigation.fire('navigate');
  ctx.navigation.fire('currententrychange');
  ctx.win.fire('popstate');
  await jest.advanceTimersByTimeAsync(10);

  expect(seen).toEqual([]);
  ctx.service.stop();
});

test('settings pages are SETTINGS', async () => {
  const ctx = setup('/calendar/u/0/r/week/2026/9/30', 'WEEK');
  ctx.service.start();
  document.body.setAttribute('data-viewfamily', 'SETTINGS');
  await navigateTo(ctx, '/calendar/u/0/r/settings', 'GENERALSETTINGS');
  expect(ctx.view()).toBe('SETTINGS');
  ctx.service.stop();
});

test('works without the Navigation API (popstate + title)', async () => {
  const ctx = setup('/calendar/u/0/r/week/2026/9/30', 'WEEK');
  const noNav = new RouteService({
    document,
    location: ctx.location,
    window: ctx.win,
    settleMs: 300,
  });
  const seen: string[] = [];
  noNav.start();
  noNav.subscribe((d) => seen.push(`${d.getType()}:${d.getAnchorDate()}`));

  ctx.location.pathname = '/calendar/u/0/r/week/2026/10/4';
  document.title = 'Google Calendar - Week of October 4, 2026'; // title mutation triggers
  await jest.advanceTimersByTimeAsync(10);

  expect(seen).toEqual(['WEEK:2026-10-04']);
  noNav.stop();
});

test('stop() destroys the current route and ignores later events', async () => {
  const ctx = setup('/calendar/u/0/r/week/2026/9/30', 'WEEK');
  const first = ctx.service.start();
  const destroyed = jest.fn();
  first.getStopper().onValue(destroyed);
  const seen: string[] = [];
  ctx.service.subscribe((d) => seen.push(d.getType()));

  ctx.service.stop();
  await navigateTo(ctx, '/calendar/u/0/r/month/2026/9/30', 'MONTH');

  expect(destroyed).toHaveBeenCalledTimes(1);
  expect(seen).toEqual([]);
});

test('a throwing subscriber does not break routing', async () => {
  const errors = jest
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);
  const ctx = setup('/calendar/u/0/r/week/2026/9/30', 'WEEK');
  const seen: string[] = [];
  ctx.service.start();
  ctx.service.subscribe(() => {
    throw new Error('boom');
  });
  ctx.service.subscribe((d) => seen.push(d.getType()));

  await navigateTo(ctx, '/calendar/u/0/r/day/2026/9/30', 'DAY');

  expect(seen).toEqual([RouteType.DAY]);
  errors.mockRestore();
  ctx.service.stop();
});

test('editor A → editor B is a new route with the new event ref', async () => {
  const tokA = btoa('aaa111 owner@m').replace(/=+$/, '');
  const tokB = btoa('bbb222 owner@m').replace(/=+$/, '');
  const ctx = setup(
    `/calendar/u/0/r/eventedit/${tokA}`,
    'EVENTEDIT',
    'EVENT_EDIT',
  );
  const first = ctx.service.start();
  expect(first.getEventRef()?.eventId).toBe('aaa111');
  const seen: string[] = [];
  ctx.service.subscribe((d) => seen.push(d.getEventRef()?.eventId ?? '-'));
  await navigateTo(ctx, `/calendar/u/0/r/eventedit/${tokB}`, 'EVENTEDIT');
  expect(seen).toEqual(['bbb222']);
  expect(first.getStopper().stopped).toBe(true);
});
