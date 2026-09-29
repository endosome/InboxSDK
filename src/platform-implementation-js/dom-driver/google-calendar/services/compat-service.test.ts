import CompatService from './compat-service';
import SelectorRegistry from '../../../lib/dom/selectorRegistry';
import { CALENDAR_SELECTORS, type CalendarSelectorKey } from '../selectors';

const registry = (overrides = {}) =>
  new SelectorRegistry<CalendarSelectorKey>(CALENDAR_SELECTORS, { overrides });

function fakeRoutes() {
  const subs = new Set<() => void>();
  return {
    subscribe: (cb: () => void) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    fire: () => subs.forEach((cb) => cb()),
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  document.body.setAttribute('data-viewkey', 'WEEK');
  document.body.setAttribute('data-viewfamily', 'EVENT');
  window.history.pushState({}, '', '/calendar/u/0/r/week/2026/9/30');
  document.body.innerHTML =
    '<header id=gb role=banner></header><div id=yDmH0d></div><div role=main></div>';
});
afterEach(() => jest.useRealTimers());

test('healthy page: getReport has no issues and nothing is emitted', () => {
  const svc = new CompatService(document, registry(), 100);
  const seen: unknown[] = [];
  svc.onIssue((i) => seen.push(i));
  svc.start(fakeRoutes() as any);
  jest.advanceTimersByTime(200);
  expect(svc.getReport().issues).toEqual([]);
  expect(seen).toEqual([]);
  svc.stop();
});

test('a problem is emitted once, and again after it went away and came back', () => {
  const svc = new CompatService(document, registry(), 100);
  const seen: string[] = [];
  svc.onIssue((i) => seen.push(i.check + ':' + i.selectorKey));
  const routes = fakeRoutes();
  svc.start(routes as any);
  document.getElementById('yDmH0d')!.remove(); // overlayHost disappears
  jest.advanceTimersByTime(200);
  routes.fire();
  jest.advanceTimersByTime(200);
  expect(seen).toEqual(['selector-miss:overlayHost']);
  document.body.insertAdjacentHTML('beforeend', '<div id=yDmH0d></div>');
  routes.fire();
  jest.advanceTimersByTime(200);
  document.getElementById('yDmH0d')!.remove();
  routes.fire();
  jest.advanceTimersByTime(200);
  expect(seen).toEqual([
    'selector-miss:overlayHost',
    'selector-miss:overlayHost',
  ]);
  svc.stop();
});

test('checks are debounced across quick route changes and stop() cancels them', () => {
  const svc = new CompatService(document, registry(), 100);
  const spy = jest.spyOn(svc, 'getReport');
  const routes = fakeRoutes();
  svc.start(routes as any);
  routes.fire();
  routes.fire();
  jest.advanceTimersByTime(99);
  expect(spy).not.toHaveBeenCalled();
  jest.advanceTimersByTime(2);
  expect(spy).toHaveBeenCalledTimes(1);
  routes.fire();
  svc.stop();
  jest.advanceTimersByTime(500);
  expect(spy).toHaveBeenCalledTimes(1);
});

test('a throwing listener does not stop others', () => {
  document.getElementById('yDmH0d')!.remove();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const svc = new CompatService(document, registry(), 100);
  const seen: string[] = [];
  svc.onIssue(() => {
    throw new Error('x');
  });
  svc.onIssue((i) => seen.push(i.check));
  svc.start(fakeRoutes() as any);
  jest.advanceTimersByTime(200);
  expect(seen).toEqual(['selector-miss']);
});
