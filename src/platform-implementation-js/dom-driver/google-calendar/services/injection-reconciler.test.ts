import SelectorRegistry from '../../../lib/dom/selectorRegistry';
import { setReporter } from '../../../lib/reporter';
import { CALENDAR_SELECTORS, type CalendarSelectorKey } from '../selectors';
import EventRegistry from './event-registry';
import InjectionReconciler from './injection-reconciler';
import { flush, makeChip, renderShell } from '../testing-chip-fixtures';
import type CalendarEventViewDriver from '../views/calendar-event-view-driver';

function harness(appId = 'app-a') {
  const { main } = renderShell();
  const selectors = new SelectorRegistry<CalendarSelectorKey>(
    CALENDAR_SELECTORS,
  );
  // eslint-disable-next-line prefer-const
  let registry: EventRegistry;
  const reconciler = new InjectionReconciler({
    document,
    appId,
    getDriverForElement: (el) => registry.getDriverForElement(el),
  });
  registry = new EventRegistry(document, selectors, reconciler);
  const views: CalendarEventViewDriver[] = [];
  registry.subscribe((d) => views.push(d));
  return { main, registry, reconciler, views };
}

const badgesIn = (chip: Element) =>
  chip.querySelectorAll('[data-calsdk-badge]');
const start = (h: ReturnType<typeof harness>) => {
  h.registry.start();
  h.reconciler.start();
};

afterEach(() => setReporter(null));

test('a badge appears inside the chip, built with textContent (no HTML injection)', () => {
  const h = harness();
  const chip = makeChip({ decoded: 'a owner@m' });
  h.main.append(chip);
  start(h);

  h.views[0].addBadge({ text: '<b>CRM</b>', title: 'hi' });

  const badge = badgesIn(chip)[0] as HTMLElement;
  expect(badge.textContent).toBe('<b>CRM</b>');
  expect(badge.querySelector('b')).toBe(null);
  expect(badge.title).toBe('hi');
  expect(chip.querySelectorAll('[data-calsdk-badges]')).toHaveLength(1);
  h.registry.stop();
  h.reconciler.stop();
});

test('needs text or iconUrl', () => {
  const h = harness();
  h.main.append(makeChip({ decoded: 'a owner@m' }));
  start(h);
  expect(() => h.views[0].addBadge({})).toThrow('text');
  h.registry.stop();
  h.reconciler.stop();
});

test('Calendar stripping the chip children is repaired, without duplicates', async () => {
  const h = harness();
  const chip = makeChip({ decoded: 'a owner@m' });
  h.main.append(chip);
  start(h);
  h.views[0].addBadge({ text: 'CRM' });

  for (let i = 0; i < 20; i++) {
    chip.replaceChildren(); // what a popover open did on live Calendar
    await flush();
    expect(badgesIn(chip)).toHaveLength(1);
    expect(badgesIn(chip)[0].textContent).toBe('CRM');
  }
  h.registry.stop();
  h.reconciler.stop();
});

test('removing only our node is repaired too', async () => {
  const h = harness();
  const chip = makeChip({ decoded: 'a owner@m' });
  h.main.append(chip);
  start(h);
  h.views[0].addBadge({ text: 'CRM' });

  chip.querySelector('[data-calsdk-badges]')!.remove();
  await flush();

  expect(badgesIn(chip)).toHaveLength(1);
  h.registry.stop();
  h.reconciler.stop();
});

test('re-insertion happens before the next paint: in the same task as the strip', async () => {
  const h = harness();
  const chip = makeChip({ decoded: 'a owner@m' });
  h.main.append(chip);
  start(h);
  h.views[0].addBadge({ text: 'CRM' });

  let frames = 0;
  let missingAtCheck = 0;
  chip.replaceChildren();
  // a microtask checkpoint runs the MutationObserver callbacks; then we "paint"
  await Promise.resolve();
  frames++;
  if (badgesIn(chip).length !== 1) missingAtCheck++;

  expect(frames).toBe(1);
  expect(missingAtCheck).toBe(0);
  h.registry.stop();
  h.reconciler.stop();
});

test('order of several badges is kept across repairs', async () => {
  const h = harness();
  const chip = makeChip({ decoded: 'a owner@m' });
  h.main.append(chip);
  start(h);
  h.views[0].addBadge({ text: 'one' });
  h.views[0].addBadge({ text: 'two' });
  h.views[0].addBadge({ text: 'three' });

  chip.replaceChildren();
  await flush();

  expect([...badgesIn(chip)].map((n) => n.textContent)).toEqual([
    'one',
    'two',
    'three',
  ]);
  h.registry.stop();
  h.reconciler.stop();
});

test('update changes what is shown; remove takes it away; no stale text', async () => {
  const h = harness();
  const chip = makeChip({ decoded: 'a owner@m' });
  h.main.append(chip);
  start(h);
  const first = h.views[0].addBadge({ text: 'old' });
  const second = h.views[0].addBadge({ text: 'keep' });

  first.update({ text: 'new' });
  chip.replaceChildren();
  await flush();
  expect([...badgesIn(chip)].map((n) => n.textContent)).toEqual([
    'new',
    'keep',
  ]);

  first.remove();
  chip.replaceChildren();
  await flush();
  expect([...badgesIn(chip)].map((n) => n.textContent)).toEqual(['keep']);

  second.remove();
  await flush();
  expect(chip.querySelector('[data-calsdk-badges]')).toBe(null);
  first.update({ text: 'ignored after remove' });
  expect(badgesIn(chip)).toHaveLength(0);
  h.registry.stop();
  h.reconciler.stop();
});

test('destroying the view (chip removed) leaves no injected nodes and no bookkeeping', async () => {
  const h = harness();
  const chip = makeChip({ decoded: 'a owner@m' });
  h.main.append(chip);
  start(h);
  h.views[0].addBadge({ text: 'CRM' });

  chip.remove();
  await flush();

  expect(document.querySelectorAll('[data-calsdk-badge]')).toHaveLength(0);
  expect(h.reconciler.countInjectedNodes()).toBe(0);
  h.registry.stop();
  h.reconciler.stop();
});

test('a REPLACED chip element gets a badge only when the app adds one to the new view', async () => {
  const h = harness();
  const first = makeChip({ decoded: 'a owner@m' });
  h.main.append(first);
  start(h);
  h.views[0].addBadge({ text: 'CRM' });

  first.remove();
  const second = makeChip({ decoded: 'a owner@m' });
  h.main.append(second);
  await flush();
  expect(badgesIn(second)).toHaveLength(0);

  h.views[1].addBadge({ text: 'CRM' });
  expect(badgesIn(second)).toHaveLength(1);
  h.registry.stop();
  h.reconciler.stop();
});

describe('clicks', () => {
  test('call onClick once and never reach Calendar (document-level) handlers', () => {
    const h = harness();
    const chip = makeChip({ decoded: 'a owner@m' });
    h.main.append(chip);
    start(h);
    const onClick = jest.fn();
    h.views[0].addBadge({ text: 'CRM', onClick });

    const reachedDocument: string[] = [];
    for (const type of ['click', 'mousedown', 'pointerdown', 'dblclick']) {
      document.addEventListener(type, () => reachedDocument.push(type));
    }
    const badge = badgesIn(chip)[0];
    for (const type of ['mousedown', 'pointerdown', 'click', 'dblclick']) {
      badge.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    }

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(reachedDocument).toEqual([]);
    h.registry.stop();
    h.reconciler.stop();
  });

  test('a throwing onClick is reported, not thrown', () => {
    const errors: unknown[] = [];
    setReporter({ error: (e) => errors.push(e), event: () => undefined });
    const h = harness();
    const chip = makeChip({ decoded: 'a owner@m' });
    h.main.append(chip);
    start(h);
    h.views[0].addBadge({
      text: 'CRM',
      onClick: () => {
        throw new Error('app bug');
      },
    });
    expect(() =>
      badgesIn(chip)[0].dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      ),
    ).not.toThrow();
    expect(errors).toHaveLength(1);
    h.registry.stop();
    h.reconciler.stop();
  });
});

describe('positioning', () => {
  test('absolutely positioned chips get a corner badge, static rows an inline one', () => {
    const h = harness();
    const abs = makeChip({ decoded: 'a owner@m' });
    abs.style.position = 'absolute';
    const row = makeChip({ decoded: 'b owner@m' });
    h.main.append(abs, row);
    start(h);
    h.views.forEach((v) => v.addBadge({ text: 'x' }));

    expect(abs.querySelector('[data-calsdk-badges]')!.className).toContain(
      '--corner',
    );
    expect(row.querySelector('[data-calsdk-badges]')!.className).toContain(
      '--inline',
    );
    h.registry.stop();
    h.reconciler.stop();
  });

  test('the style element is injected once', () => {
    const h = harness();
    h.main.append(
      makeChip({ decoded: 'a owner@m' }),
      makeChip({ decoded: 'b owner@m' }),
    );
    start(h);
    h.views.forEach((v) => v.addBadge({ text: 'x' }));
    expect(document.querySelectorAll('#calsdk-badge-style')).toHaveLength(1);
    h.registry.stop();
    h.reconciler.stop();
  });
});

test('two SDK instances (different appIds) do not touch each other’s nodes', async () => {
  const a = harness('app-a');
  const chip = makeChip({ decoded: 'a owner@m' });
  a.main.append(chip);
  start(a);
  a.views[0].addBadge({ text: 'A' });

  // a second instance on the same page
  const selectors = new SelectorRegistry<CalendarSelectorKey>(
    CALENDAR_SELECTORS,
  );
  // eslint-disable-next-line prefer-const
  let registryB: EventRegistry;
  const reconcilerB = new InjectionReconciler({
    document,
    appId: 'app-b',
    getDriverForElement: (el) => registryB.getDriverForElement(el),
  });
  registryB = new EventRegistry(document, selectors, reconcilerB);
  registryB.start();
  reconcilerB.start();
  registryB.getAll()[0].addBadge({ text: 'B' });

  chip.replaceChildren();
  await flush();
  expect([...badgesIn(chip)].map((n) => n.textContent).sort()).toEqual([
    'A',
    'B',
  ]);

  reconcilerB.stop();
  registryB.stop();
  expect([...badgesIn(chip)].map((n) => n.textContent)).toEqual(['A']);
  a.registry.stop();
  a.reconciler.stop();
});

test('our own insertions do not feed the observer: the DOM is quiet after settling', async () => {
  const h = harness();
  const chips = Array.from({ length: 20 }, (_, i) =>
    makeChip({ decoded: `e${i} owner@m` }),
  );
  h.main.append(...chips);
  start(h);
  h.views.forEach((v) => v.addBadge({ text: 'x' }));
  await flush();

  let mutations = 0;
  const probe = new MutationObserver((r) => (mutations += r.length));
  probe.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
  });
  await new Promise((r) => setTimeout(r, 50));
  probe.disconnect();

  expect(mutations).toBe(0);
  h.registry.stop();
  h.reconciler.stop();
});

test('50 navigations that rebuild the grid: exactly one fresh badge per chip every time', async () => {
  const h = harness();
  h.registry.subscribe((d) => d.addBadge({ text: d.getEventRef().eventId }));
  start(h);

  for (let nav = 0; nav < 50; nav++) {
    h.main.replaceChildren(
      ...Array.from({ length: 30 }, (_, i) =>
        makeChip({ decoded: `n${nav}x${i} owner@m` }),
      ),
    );
    await flush();
    const chips = [...h.main.querySelectorAll('[data-eventchip]')];
    expect(chips).toHaveLength(30);
    for (const chip of chips) {
      const badges = badgesIn(chip);
      expect(badges).toHaveLength(1);
      expect(badges[0].textContent).toBe(
        chip.getAttribute('data-eventid')
          ? h.registry.getDriverForElement(chip)!.getEventRef().eventId
          : '',
      );
    }
    expect(document.querySelectorAll('[data-calsdk-badge]')).toHaveLength(30); // nothing stale elsewhere
  }
  h.registry.stop();
  h.reconciler.stop();
  expect(document.querySelectorAll('[data-calsdk-badge]')).toHaveLength(0);
});

test('stop() removes every injected node', () => {
  const h = harness();
  h.main.append(makeChip({ decoded: 'a owner@m' }));
  start(h);
  h.views[0].addBadge({ text: 'x' });
  h.reconciler.stop();
  expect(
    document.querySelectorAll('[data-calsdk-badges],[data-calsdk-badge]'),
  ).toHaveLength(0);
  expect(() => h.views[0].addBadge({ text: 'late' })).not.toThrow();
  h.registry.stop();
});

test('updating a badge keeps its position among the others', () => {
  const h = harness();
  const chip = makeChip({ decoded: 'a owner@m' });
  h.main.append(chip);
  start(h);
  const first = h.views[0].addBadge({ text: 'one' });
  h.views[0].addBadge({ text: 'two' });
  h.views[0].addBadge({ text: 'three' });

  first.update({ text: 'ONE' });

  expect([...badgesIn(chip)].map((n) => n.textContent)).toEqual([
    'ONE',
    'two',
    'three',
  ]);
  h.registry.stop();
  h.reconciler.stop();
});
