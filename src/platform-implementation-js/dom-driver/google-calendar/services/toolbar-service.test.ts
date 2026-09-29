import ToolbarService from './toolbar-service';
import SelectorRegistry from '../../../lib/dom/selectorRegistry';
import { CALENDAR_SELECTORS, type CalendarSelectorKey } from '../selectors';

const HEADER =
  '<header role=banner><div id=row><div id=other></div><span id=slot><button jsname=KzBUhd aria-label=Search></button></span></div></header>';

function setup(appId = 'app-a', html = HEADER) {
  document.head.innerHTML = '';
  document.body.innerHTML = html;
  const svc = new ToolbarService({
    document,
    selectors: new SelectorRegistry<CalendarSelectorKey>(
      CALENDAR_SELECTORS,
      {},
    ),
    appId,
  });
  svc.start();
  return svc;
}
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const labels = () =>
  [...document.querySelectorAll('[data-calsdk-toolbar-button]')].map((n) =>
    n.getAttribute('aria-label'),
  );
const desc = (title: string, onClick: () => void = jest.fn()) => ({
  title,
  iconUrl: 'data:image/png;base64,AA',
  onClick,
});

test('places one container right before the Search wrapper, buttons in order', () => {
  const svc = setup();
  svc.addButton(desc('A'));
  svc.addButton(desc('B'));
  const slot = document.getElementById('slot')!;
  const container = slot.previousElementSibling!;
  expect(container.hasAttribute('data-calsdk-toolbar')).toBe(true);
  expect(container.parentElement).toBe(document.getElementById('row'));
  expect(labels()).toEqual(['A', 'B']);
  expect(document.querySelectorAll('[data-calsdk-toolbar]')).toHaveLength(1);
  svc.stop();
});

test('click runs the handler once and does not reach Calendar; pointer events are contained', () => {
  const svc = setup();
  const onClick = jest.fn();
  svc.addButton(desc('A', onClick));
  const reached = jest.fn();
  document.body.addEventListener('click', reached);
  document.body.addEventListener('mousedown', reached);
  const btn = document.querySelector<HTMLElement>(
    '[data-calsdk-toolbar-button]',
  )!;
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  btn.click();
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(reached).not.toHaveBeenCalled();
  svc.stop();
});

test('put back when Calendar strips it; also when the whole header is replaced', async () => {
  const svc = setup();
  svc.addButton(desc('A'));
  document.querySelector('[data-calsdk-toolbar]')!.remove();
  await flush();
  expect(labels()).toEqual(['A']);
  document.body.innerHTML = HEADER; // header re-rendered from scratch
  await flush();
  expect(labels()).toEqual(['A']);
  expect(document.querySelectorAll('[data-calsdk-toolbar]')).toHaveLength(1);
  svc.stop();
});

test('a single stripped button is rebuilt in its place', async () => {
  const svc = setup();
  svc.addButton(desc('A'));
  svc.addButton(desc('B'));
  svc.addButton(desc('C'));
  document.querySelectorAll('[data-calsdk-toolbar-button]')[1].remove();
  await flush();
  expect(labels()).toEqual(['A', 'B', 'C']);
  svc.stop();
});

test('waits for the header, then appears', async () => {
  const svc = setup('app-a', '<div id=main></div>');
  svc.addButton(desc('A'));
  expect(labels()).toEqual([]);
  document.body.insertAdjacentHTML('afterbegin', HEADER);
  await flush();
  expect(labels()).toEqual(['A']);
  svc.stop();
});

test('update keeps the position; remove takes the button out and the empty container too', () => {
  const svc = setup();
  const a = svc.addButton(desc('A'));
  svc.addButton(desc('B'));
  a.update({ title: 'A2' });
  expect(labels()).toEqual(['A2', 'B']);
  a.remove();
  expect(labels()).toEqual(['B']);
  a.update({ title: 'ignored' });
  expect(labels()).toEqual(['B']);
  svc.stop();
  expect(document.querySelector('[data-calsdk-toolbar]')).toBeNull();
});

test('stop removes everything including the style; later adds are no-ops', () => {
  const svc = setup();
  svc.addButton(desc('A'));
  expect(document.getElementById('calsdk-toolbar-style')).not.toBeNull();
  svc.stop();
  expect(document.querySelector('[data-calsdk-toolbar]')).toBeNull();
  expect(document.getElementById('calsdk-toolbar-style')).toBeNull();
  svc.addButton(desc('B')).remove();
  expect(labels()).toEqual([]);
});

test('validates the descriptor', () => {
  const svc = setup();
  expect(() => svc.addButton({ ...desc('A'), title: '' })).toThrow('title');
  expect(() => svc.addButton({ ...desc('A'), iconUrl: '' })).toThrow('iconUrl');
  expect(() =>
    svc.addButton({ ...desc('A'), onClick: undefined as any }),
  ).toThrow('onClick');
  svc.stop();
});

test('two apps coexist, each with its own container and ownership', () => {
  const a = setup('app-a');
  const observerB = new ToolbarService({
    document,
    selectors: new SelectorRegistry<CalendarSelectorKey>(
      CALENDAR_SELECTORS,
      {},
    ),
    appId: 'app-b',
  });
  observerB.start();
  a.addButton(desc('A'));
  observerB.addButton(desc('B'));
  expect(document.querySelectorAll('[data-calsdk-toolbar]')).toHaveLength(2);
  expect(labels().sort()).toEqual(['A', 'B']);
  a.stop();
  expect(labels()).toEqual(['B']);
  observerB.stop();
});

test('a throwing handler does not break the button', () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const svc = setup();
  svc.addButton(
    desc('A', () => {
      throw new Error('x');
    }),
  );
  expect(() =>
    document
      .querySelector<HTMLElement>('[data-calsdk-toolbar-button]')!
      .click(),
  ).not.toThrow();
  svc.stop();
});
