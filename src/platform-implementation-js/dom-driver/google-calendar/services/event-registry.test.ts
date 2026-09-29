import SelectorRegistry from '../../../lib/dom/selectorRegistry';
import { setReporter } from '../../../lib/reporter';
import { CALENDAR_SELECTORS, type CalendarSelectorKey } from '../selectors';
import EventRegistry from './event-registry';
import CalendarEventViewDriver from '../views/calendar-event-view-driver';
import {
  flush,
  makeChip,
  renderShell,
  tokenFor,
} from '../testing-chip-fixtures';

const noBadges = {
  addBadge: () => ({ update: () => undefined, remove: () => undefined }),
};

function setup() {
  const { main, ghostLayer } = renderShell();
  const selectors = new SelectorRegistry<CalendarSelectorKey>(
    CALENDAR_SELECTORS,
  );
  const registry = new EventRegistry(document, selectors, noBadges);
  const created: CalendarEventViewDriver[] = [];
  const destroyed: CalendarEventViewDriver[] = [];
  registry.subscribe((d) => {
    created.push(d);
    d.getStopper().onValue(() => destroyed.push(d));
  });
  return { main, ghostLayer, registry, created, destroyed };
}

const ids = (created: CalendarEventViewDriver[]) =>
  created.map((d) => d.getEventRef().eventId);

afterEach(() => setReporter(null));

test('initial scan: only eligible chips get views', () => {
  const { main, ghostLayer, registry } = setup();
  main.append(
    makeChip({ decoded: 'a owner@m' }),
    makeChip({ decoded: 'draft owner@m', jsaction: false }), // quick-create draft
    makeChip({ token: '???' }), // undecodable
  );
  ghostLayer.append(makeChip({ decoded: 'ghost owner@m' })); // outside [role=main]
  const outsideEverything = makeChip({ decoded: 'orphan owner@m' });
  document.body.append(outsideEverything);

  registry.start();

  expect(registry.getAll().map((d) => d.getEventRef().eventId)).toEqual(['a']);
  registry.stop();
});

test('Calendar sets data-eventid AFTER inserting the chip: the view appears on the attribute', async () => {
  const { main, registry, created } = setup();
  registry.start();

  const chip = makeChip({ decoded: 'late owner@m', omitId: true });
  main.append(chip);
  await flush();
  expect(created).toHaveLength(0);

  chip.setAttribute('data-eventid', tokenFor('late owner@m'));
  await flush();
  expect(ids(created)).toEqual(['late']);
  registry.stop();
});

test('removing a chip destroys its view', async () => {
  const { main, registry, created, destroyed } = setup();
  const chip = makeChip({ decoded: 'a owner@m' });
  main.append(chip);
  registry.start();

  chip.remove();
  await flush();

  expect(destroyed).toEqual(created);
  expect(registry.getAll()).toEqual([]);
  registry.stop();
});

test('removing an ancestor destroys every chip below it', async () => {
  const { main, registry, destroyed } = setup();
  const row = document.createElement('div');
  row.append(
    makeChip({ decoded: 'a owner@m' }),
    makeChip({ decoded: 'b owner@m' }),
  );
  main.append(row);
  registry.start();

  row.remove();
  await flush();

  expect(destroyed).toHaveLength(2);
  registry.stop();
});

test('remove + re-add of the SAME element in one render keeps its view', async () => {
  const { main, registry, created, destroyed } = setup();
  const chip = makeChip({ decoded: 'a owner@m' });
  main.append(chip);
  registry.start();

  chip.remove();
  main.append(chip); // same task ⇒ one mutation batch
  await flush();

  expect(created).toHaveLength(1);
  expect(destroyed).toHaveLength(0);
  registry.stop();
});

test('a REPLACED element with the same id (cross-day drag) = destroy + new view', async () => {
  const { main, registry, created, destroyed } = setup();
  const first = makeChip({ decoded: 'a owner@m' });
  main.append(first);
  registry.start();

  first.remove();
  main.append(makeChip({ decoded: 'a owner@m' }));
  await flush();

  expect(created).toHaveLength(2);
  expect(destroyed).toEqual([created[0]]);
  expect(registry.getAll()).toEqual([created[1]]);
  registry.stop();
});

test('a live element whose data-eventid changes: old view ends, new view starts', async () => {
  const { main, registry, created, destroyed } = setup();
  const chip = makeChip({ decoded: 'a owner@m' });
  main.append(chip);
  registry.start();

  chip.setAttribute('data-eventid', tokenFor('b owner@m'));
  await flush();

  expect(ids(created)).toEqual(['a', 'b']);
  expect(destroyed).toEqual([created[0]]);
  registry.stop();
});

test('a view never changes its ref; setting the same id again changes nothing', async () => {
  const { main, registry, created } = setup();
  const chip = makeChip({ decoded: 'a owner@m' });
  main.append(chip);
  registry.start();
  const [view] = registry.getAll();
  const ref = view.getEventRef();

  chip.setAttribute('data-eventid', tokenFor('a owner@m'));
  await flush();

  expect(created).toHaveLength(1);
  expect(view.getEventRef()).toBe(ref);
  registry.stop();
});

test('a quick-create draft chip becomes a view only once it is a real chip', async () => {
  const { main, registry, created } = setup();
  const draft = makeChip({ decoded: 'draft owner@m', jsaction: false });
  main.append(draft);
  registry.start();
  expect(created).toHaveLength(0);

  draft.setAttribute('jsaction', 'click:x');
  draft.setAttribute('data-keyboardactiontype', '0;1');
  await flush();

  expect(ids(created)).toEqual(['draft']);
  registry.stop();
});

test('a chip moved OUT of [role=main] (drag ghost layer) loses its view', async () => {
  const { main, ghostLayer, registry, destroyed } = setup();
  const chip = makeChip({ decoded: 'a owner@m' });
  main.append(chip);
  registry.start();

  ghostLayer.append(chip);
  await flush();

  expect(destroyed).toHaveLength(1);
  expect(registry.getAll()).toEqual([]);
  registry.stop();
});

test('drag: a ghost chip with the same id outside main never becomes a view', async () => {
  const { main, ghostLayer, registry, created } = setup();
  main.append(makeChip({ decoded: 'a owner@m' }));
  registry.start();

  for (let i = 0; i < 5; i++) {
    const ghost = makeChip({ decoded: 'a owner@m' });
    ghostLayer.append(ghost);
    await flush();
    ghost.remove();
    await flush();
  }

  expect(created).toHaveLength(1);
  registry.stop();
});

describe('segments of a multi-day event', () => {
  const setupMultiDay = () => {
    const ctx = setup();
    const chips = [1, 2, 3].map(() =>
      makeChip({ decoded: 'multi owner@m', role: null, dragClass: '6' }),
    );
    ctx.main.append(...chips, makeChip({ decoded: 'other owner@m' }));
    ctx.registry.start();
    const views = ctx.registry.getAll();
    return { ...ctx, chips, views };
  };

  test('index/count/isPrimary in document order', () => {
    const { views, registry } = setupMultiDay();
    const multi = views.filter((v) => v.getEventRef().eventId === 'multi');
    expect(multi.map((v) => v.getSegment())).toEqual([
      { index: 0, count: 3, isPrimary: true },
      { index: 1, count: 3, isPrimary: false },
      { index: 2, count: 3, isPrimary: false },
    ]);
    expect(
      views.find((v) => v.getEventRef().eventId === 'other')!.getSegment(),
    ).toEqual({
      index: 0,
      count: 1,
      isPrimary: true,
    });
    registry.stop();
  });

  test('recomputed on every call as chips come and go', async () => {
    const { views, chips, registry } = setupMultiDay();
    const last = views.find((v) => v.element === chips[2])!;
    expect(last.getSegment().index).toBe(2);

    chips[0].remove();
    await flush();

    expect(last.getSegment()).toEqual({ index: 1, count: 2, isPrimary: false });
    registry.stop();
  });
});

describe('isAllDay is derived per call', () => {
  test.each([
    ['2', 'button', false],
    ['6', null, true],
    [null, null, true], // fallback: no role, no [data-datekey] ancestor
    [null, 'button', false],
  ] as const)('dragsource %s, role %s → %s', (dragClass, role, expected) => {
    const { main, registry } = setup();
    main.append(makeChip({ dragClass, role }));
    registry.start();
    expect(registry.getAll()[0].isAllDay()).toBe(expected);
    registry.stop();
  });

  test('the same element flipping timed → all-day is reflected', () => {
    const { main, registry } = setup();
    const chip = makeChip({ dragClass: '2' });
    main.append(chip);
    registry.start();
    const view = registry.getAll()[0];
    expect(view.isAllDay()).toBe(false);
    chip.setAttribute('data-dragsource-type', '6');
    expect(view.isAllDay()).toBe(true);
    registry.stop();
  });

  test('the [data-datekey] ancestor marks timed chips when the class is not decisive', () => {
    const { main, registry } = setup();
    const cell = document.createElement('div');
    cell.setAttribute('data-datekey', '28990');
    const chip = makeChip({ dragClass: '9', role: null });
    cell.append(chip);
    main.append(cell);
    registry.start();
    expect(registry.getAll()[0].isAllDay()).toBe(false);
    registry.stop();
  });
});

test('undecodable ids are reported once per token and never produce a view', async () => {
  const events: Array<[string, unknown]> = [];
  setReporter({ error: () => undefined, event: (n, d) => events.push([n, d]) });
  const { main, registry, created } = setup();
  registry.start();

  main.append(
    makeChip({ token: 'not!valid' }),
    makeChip({ token: 'not!valid' }),
  );
  await flush();

  expect(created).toHaveLength(0);
  expect(events.filter(([n]) => n === 'identity-decode-failed')).toHaveLength(
    1,
  );
  registry.stop();
});

test('a throwing subscriber does not break other subscribers', async () => {
  setReporter({ error: () => undefined, event: () => undefined });
  const { main, registry } = setup();
  const seen: string[] = [];
  registry.subscribe(() => {
    throw new Error('boom');
  });
  registry.subscribe((d) => seen.push(d.getEventRef().eventId));
  registry.start();

  main.append(makeChip({ decoded: 'a owner@m' }));
  await flush();

  expect(seen).toEqual(['a']);
  registry.stop();
});

test('stop() destroys all views and ignores later mutations', async () => {
  const { main, registry, created, destroyed } = setup();
  main.append(
    makeChip({ decoded: 'a owner@m' }),
    makeChip({ decoded: 'b owner@m' }),
  );
  registry.start();

  registry.stop();
  main.append(makeChip({ decoded: 'c owner@m' }));
  await flush();

  expect(destroyed).toHaveLength(2);
  expect(created).toHaveLength(2);
  expect(registry.getAll()).toEqual([]);
});

test('reconcileAll is idempotent and picks up chips inserted while the observer was blind', () => {
  const { main, registry, created } = setup();
  main.append(makeChip({ decoded: 'a owner@m' }));
  registry.start();

  registry.reconcileAll();
  registry.reconcileAll();
  expect(created).toHaveLength(1);
  registry.stop();
});

describe('leaks and scale', () => {
  test('100 navigations that rebuild the grid leave no live views behind', async () => {
    const { main, registry, created, destroyed } = setup();
    registry.start();

    for (let nav = 0; nav < 100; nav++) {
      main.replaceChildren(
        ...Array.from({ length: 50 }, (_, i) =>
          makeChip({ decoded: `e${nav}_${i} owner@m`.replace('_', 'x') }),
        ),
      );
      await flush();
    }

    expect(registry.getAll()).toHaveLength(50);
    expect(created).toHaveLength(5000);
    expect(destroyed).toHaveLength(4950);
    expect(registry.getAll().every((d) => d.element.isConnected)).toBe(true);
    registry.stop();
    expect(destroyed).toHaveLength(5000);
  });

  test('a 500-chip render is handled in one batch quickly', async () => {
    const { main, registry, created } = setup();
    registry.start();

    const started = performance.now();
    main.append(
      ...Array.from({ length: 500 }, (_, i) =>
        makeChip({ decoded: `s${i} owner@m` }),
      ),
    );
    await flush();
    const elapsed = performance.now() - started;

    expect(created).toHaveLength(500);
    // generous: jsdom is slow; this catches accidental O(n²) or full-document rescans
    expect(elapsed).toBeLessThan(1500);
    registry.stop();
  });
});
