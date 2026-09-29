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
}, 30_000);

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

describe('compact badges in narrow chips', () => {
  type Cb = (
    entries: { target: Element; contentRect: { width: number } }[],
  ) => void;
  const created: FakeRO[] = [];
  class FakeRO {
    observed = new Set<Element>();
    disconnected = false;
    constructor(readonly cb: Cb) {
      created.push(this);
    }
    observe(el: Element) {
      this.observed.add(el);
    }
    unobserve(el: Element) {
      this.observed.delete(el);
    }
    disconnect() {
      this.disconnected = true;
      this.observed.clear();
    }
  }
  const realRO = (window as any).ResizeObserver;
  beforeEach(() => {
    created.length = 0;
    (window as any).ResizeObserver = FakeRO;
  });
  afterEach(() => {
    (window as any).ResizeObserver = realRO;
  });

  const positionedChip = (width: number) => {
    const chip = makeChip({ decoded: 'a owner@m' });
    chip.style.position = 'absolute';
    chip.getBoundingClientRect = () =>
      ({
        width,
        height: 40,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: 40,
        toJSON: () => ({}),
      }) as DOMRect;
    return chip;
  };
  const resizeTo = (chip: HTMLElement, width: number) => {
    chip.getBoundingClientRect = () => ({ width }) as DOMRect;
  };
  const compact = (chip: Element) =>
    chip
      .querySelector('[data-calsdk-badges]')!
      .hasAttribute('data-calsdk-compact');

  test('narrow chips start compact, wide ones do not; resizing toggles it', () => {
    const h = harness();
    const narrow = positionedChip(40);
    const wide = positionedChip(150);
    h.main.append(narrow, wide);
    start(h);
    h.views[0].addBadge({ text: 'CRM' });
    h.views[1].addBadge({ text: 'CRM' });
    expect(compact(narrow)).toBe(true);
    expect(compact(wide)).toBe(false);

    const ro = created[0];
    resizeTo(wide, 50);
    ro.cb([{ target: wide, contentRect: { width: 50 } }]);
    expect(compact(wide)).toBe(true);
    resizeTo(narrow, 200);
    ro.cb([{ target: narrow, contentRect: { width: 200 } }]);
    expect(compact(narrow)).toBe(false);
    h.registry.stop();
    h.reconciler.stop();
  });

  test('a zero width (hidden chip) is not compact; the text stays in the DOM and the tooltip', () => {
    const h = harness();
    const chip = positionedChip(0);
    h.main.append(chip);
    start(h);
    h.views[0].addBadge({ text: 'CRM', title: 'Open in CRM' });
    expect(compact(chip)).toBe(false);
    const badge = chip.querySelector('[data-calsdk-badge]') as HTMLElement;
    expect(badge.textContent).toBe('CRM');
    expect(badge.title).toBe('Open in CRM');
    h.registry.stop();
    h.reconciler.stop();
  });

  test('the observer stops watching a chip when its badges go, and is disconnected on stop', () => {
    const h = harness();
    const chip = positionedChip(40);
    h.main.append(chip);
    start(h);
    const handle = h.views[0].addBadge({ text: 'CRM' });
    const ro = created[0];
    expect(ro.observed.has(chip)).toBe(true);
    handle.remove();
    expect(ro.observed.has(chip)).toBe(false);
    h.views[0].addBadge({ text: 'again' });
    expect(ro.observed.has(chip)).toBe(true);
    h.registry.stop();
    h.reconciler.stop();
    expect(ro.disconnected).toBe(true);
  });

  test('a repaired badge (Calendar stripped the chip) keeps its compact state', async () => {
    const h = harness();
    const chip = positionedChip(40);
    h.main.append(chip);
    start(h);
    h.views[0].addBadge({ text: 'CRM' });
    chip.replaceChildren();
    await flush();
    expect(compact(chip)).toBe(true);
    h.registry.stop();
    h.reconciler.stop();
  });
});
