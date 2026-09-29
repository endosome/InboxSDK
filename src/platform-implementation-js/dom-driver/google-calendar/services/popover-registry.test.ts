import SelectorRegistry from '../../../lib/dom/selectorRegistry';
import { setReporter } from '../../../lib/reporter';
import { CALENDAR_SELECTORS, type CalendarSelectorKey } from '../selectors';
import PopoverRegistry from './popover-registry';
import type CalendarEventPopoverViewDriver from '../views/calendar-event-popover-view-driver';
import {
  b64url,
  flush,
  makePopover,
  overlayHost,
  renderShell,
  tokenFor,
} from '../testing-chip-fixtures';

function setup(
  appId = 'app-a',
  lookupCalendarId?: (id: string) => string | null,
  resolveCalendarId?: (hint: string) => string | null,
) {
  renderShell();
  const selectors = new SelectorRegistry<CalendarSelectorKey>(
    CALENDAR_SELECTORS,
  );
  const registry = new PopoverRegistry({
    document,
    selectors,
    appId,
    lookupCalendarId,
    resolveCalendarId,
  });
  const created: CalendarEventPopoverViewDriver[] = [];
  const destroyed: CalendarEventPopoverViewDriver[] = [];
  registry.subscribe((d) => {
    created.push(d);
    d.getStopper().onValue(() => destroyed.push(d));
  });
  return { registry, created, destroyed };
}

const buttonsIn = (dialog: Element) =>
  dialog.querySelectorAll('[data-calsdk-popover-button]');

afterEach(() => setReporter(null));

describe('discovery', () => {
  test('an existing event popover becomes a view with the right ref', async () => {
    const { registry, created } = setup();
    registry.start();

    overlayHost().append(
      makePopover({ decoded: 'a_20260929T110000Z owner@m' }),
    );
    await flush();

    expect(created).toHaveLength(1);
    expect(created[0].getEventRef()).toMatchObject({
      eventId: 'a',
      instanceId: '20260929T110000Z',
      kind: 'event',
    });
    registry.stop();
  });

  test('popovers already open at start are found', () => {
    const { registry } = setup();
    overlayHost().append(makePopover());
    registry.start();
    expect(registry.getAll()).toHaveLength(1);
    registry.stop();
  });

  test('the quick-create dialog (inputs, wheel=true) is not a popover — even though it has a data-eventid', async () => {
    const { registry, created } = setup();
    registry.start();

    overlayHost().append(
      makePopover({ decoded: 'draft owner@m', wheel: 'true', inputs: true }),
    );
    await flush();
    overlayHost().append(
      makePopover({ decoded: 'draft2 owner@m', inputs: true }),
    ); // wheel ok, inputs present
    await flush();

    expect(created).toHaveLength(0);
    registry.stop();
  });

  test('other dialogs (no data-chips-dialog) are ignored', async () => {
    const { registry, created } = setup();
    registry.start();
    const scope = document.createElement('div');
    scope.setAttribute('role', 'dialog');
    scope.textContent = 'Edit recurring event';
    overlayHost().append(scope);
    await flush();
    expect(created).toHaveLength(0);
    registry.stop();
  });

  test('a popover that renders in stages becomes a view when the id arrives', async () => {
    const { registry, created } = setup();
    registry.start();
    const dialog = makePopover({ omitId: true });
    overlayHost().append(dialog);
    await flush();
    expect(created).toHaveLength(0);

    dialog
      .querySelector('div')!
      .setAttribute('data-eventid', tokenFor('late owner@m'));
    await flush();

    expect(created.map((d) => d.getEventRef().eventId)).toEqual(['late']);
    registry.stop();
  });

  test('closing (removing) the popover destroys its view', async () => {
    const { registry, created, destroyed } = setup();
    registry.start();
    const dialog = makePopover();
    overlayHost().append(dialog);
    await flush();

    dialog.remove();
    await flush();

    expect(destroyed).toEqual(created);
    expect(registry.getAll()).toEqual([]);
    registry.stop();
  });

  test('opening another event replaces the popover: old view ends, new begins', async () => {
    const { registry, created, destroyed } = setup();
    registry.start();
    const first = makePopover({ decoded: 'a owner@m' });
    overlayHost().append(first);
    await flush();

    first.remove();
    overlayHost().append(makePopover({ decoded: 'b owner@m' }));
    await flush();

    expect(created.map((d) => d.getEventRef().eventId)).toEqual(['a', 'b']);
    expect(destroyed).toEqual([created[0]]);
    registry.stop();
  });

  test('the same dialog element showing a different event is a new view', async () => {
    const { registry, created, destroyed } = setup();
    registry.start();
    const dialog = makePopover({ decoded: 'a owner@m' });
    overlayHost().append(dialog);
    await flush();

    dialog
      .querySelector('div')!
      .setAttribute('data-eventid', tokenFor('b owner@m'));
    await flush();

    expect(created.map((d) => d.getEventRef().eventId)).toEqual(['a', 'b']);
    expect(destroyed).toEqual([created[0]]);
    registry.stop();
  });

  test('task and birthday popovers carry their kind', async () => {
    const { registry, created } = setup();
    registry.start();
    overlayHost().append(
      makePopover({ token: 'ttb_' + b64url('t1 owner@m') }),
      makePopover({ token: 'bday_' + b64url('b1_20261002 owner@m') }),
    );
    await flush();
    expect(created.map((d) => d.getEventRef().kind).sort()).toEqual([
      'birthday',
      'task',
    ]);
    registry.stop();
  });

  test('the full calendar id is borrowed from a chip of the same event', async () => {
    const { registry, created } = setup('app-a', (rawId) =>
      rawId === tokenFor('a owner@m') ? 'owner@gmail.com' : null,
    );
    registry.start();
    overlayHost().append(makePopover({ decoded: 'a owner@m' }));
    await flush();
    expect(created[0].getEventRef().calendarId).toBe('owner@gmail.com');
    registry.stop();
  });

  test('without a chip of the same event, a learned calendar abbreviation gives a derived id (events only)', async () => {
    const { registry, created } = setup('app-a', undefined, (hint) =>
      hint === 'owner@m' ? 'owner@example.com' : null,
    );
    registry.start();
    overlayHost().append(makePopover({ decoded: 'a owner@m' }));
    overlayHost().append(makePopover({ decoded: 'zzz unknown@m' }));
    await flush();
    expect(created[0].getEventRef()).toMatchObject({
      calendarId: 'owner@example.com',
      confidence: 'derived',
    });
    registry.stop();
  });

  test('stop() destroys everything and ignores later dialogs', async () => {
    const { registry, created, destroyed } = setup();
    registry.start();
    overlayHost().append(makePopover());
    await flush();
    registry.stop();
    overlayHost().append(makePopover({ decoded: 'later owner@m' }));
    await flush();
    expect(created).toHaveLength(1);
    expect(destroyed).toHaveLength(1);
  });

  test('a throwing subscriber does not break the others', async () => {
    setReporter({ error: () => undefined, event: () => undefined });
    const { registry } = setup();
    const seen: string[] = [];
    registry.subscribe(() => {
      throw new Error('boom');
    });
    registry.subscribe((d) => seen.push(d.getEventRef().eventId));
    registry.start();
    overlayHost().append(makePopover({ decoded: 'a owner@m' }));
    await flush();
    expect(seen).toEqual(['a']);
    registry.stop();
  });
});

describe('buttons', () => {
  const open = async (h: ReturnType<typeof setup>) => {
    h.registry.start();
    const dialog = makePopover({ decoded: 'a owner@m' });
    overlayHost().append(dialog);
    await flush();
    return dialog;
  };

  test('a button is inserted into the content root, built with textContent', async () => {
    const h = setup();
    const dialog = await open(h);
    h.created[0].addButton({ title: '<i>Open</i>', onClick: () => undefined });

    const button = buttonsIn(dialog)[0];
    expect(button.textContent).toBe('<i>Open</i>');
    expect(button.querySelector('i')).toBe(null);
    // injected into the element carrying data-eventid, in its own row
    const holder = dialog.querySelector('[data-eventid]')!;
    expect(button.closest('[data-calsdk-popover-actions]')!.parentElement).toBe(
      holder,
    );
    h.registry.stop();
  });

  test('title and onClick are required', async () => {
    const h = setup();
    await open(h);
    expect(() =>
      h.created[0].addButton({ title: '', onClick: () => undefined }),
    ).toThrow('title');
    expect(() => h.created[0].addButton({ title: 'x' } as never)).toThrow(
      'onClick',
    );
    h.registry.stop();
  });

  test('click runs the handler once and does not reach document handlers', async () => {
    const h = setup();
    const dialog = await open(h);
    const onClick = jest.fn();
    h.created[0].addButton({ title: 'Open', onClick });
    const reached: string[] = [];
    for (const t of ['click', 'mousedown', 'keydown'])
      document.addEventListener(t, () => reached.push(t));

    const button = buttonsIn(dialog)[0];
    for (const t of ['mousedown', 'click'])
      button.dispatchEvent(new MouseEvent(t, { bubbles: true }));
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'e', bubbles: true }),
    );

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(reached).toEqual([]);
    h.registry.stop();
  });

  test('Escape and Tab still reach Calendar; other keys do not', async () => {
    const h = setup();
    const dialog = await open(h);
    h.created[0].addButton({ title: 'Open', onClick: () => undefined });
    const reached: string[] = [];
    document.addEventListener('keydown', (e) => reached.push(e.key));
    const button = buttonsIn(dialog)[0];
    for (const key of ['Escape', 'Tab', 'e', 'Enter', ' ']) {
      button.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true }),
      );
    }
    expect(reached).toEqual(['Escape', 'Tab']);
    h.registry.stop();
  });

  test('a throwing onClick is reported, not thrown', async () => {
    const errors: unknown[] = [];
    setReporter({ error: (e) => errors.push(e), event: () => undefined });
    const h = setup();
    const dialog = await open(h);
    h.created[0].addButton({
      title: 'Open',
      onClick: () => {
        throw new Error('app bug');
      },
    });
    expect(() =>
      buttonsIn(dialog)[0].dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      ),
    ).not.toThrow();
    expect(errors).toHaveLength(1);
    h.registry.stop();
  });

  test('Calendar re-rendering the popover content is repaired, no duplicates', async () => {
    const h = setup();
    const dialog = await open(h);
    h.created[0].addButton({ title: 'One', onClick: () => undefined });
    h.created[0].addButton({ title: 'Two', onClick: () => undefined });

    for (let i = 0; i < 10; i++) {
      const holder = dialog.querySelector('[data-eventid]')!;
      holder.replaceChildren(); // content rebuilt by Calendar
      await flush();
      expect([...buttonsIn(dialog)].map((n) => n.textContent)).toEqual([
        'One',
        'Two',
      ]);
    }
    // even if the whole holder is swapped for a new element with the same id
    const oldHolder = dialog.querySelector('[data-eventid]')!;
    const newHolder = document.createElement('div');
    newHolder.setAttribute('data-eventid', tokenFor('a owner@m'));
    oldHolder.replaceWith(newHolder);
    await flush();
    expect(
      newHolder.querySelectorAll('[data-calsdk-popover-button]'),
    ).toHaveLength(2);
    expect(
      dialog.querySelectorAll('[data-calsdk-popover-button]'),
    ).toHaveLength(2);
    h.registry.stop();
  });

  test('repair happens before the next paint', async () => {
    const h = setup();
    const dialog = await open(h);
    h.created[0].addButton({ title: 'One', onClick: () => undefined });
    dialog.querySelector('[data-eventid]')!.replaceChildren();
    await Promise.resolve(); // one microtask checkpoint, no macrotask
    expect(buttonsIn(dialog)).toHaveLength(1);
    h.registry.stop();
  });

  test('update and remove; the row disappears with the last button', async () => {
    const h = setup();
    const dialog = await open(h);
    const a = h.created[0].addButton({ title: 'A', onClick: () => undefined });
    const b = h.created[0].addButton({ title: 'B', onClick: () => undefined });

    a.update({ title: 'A2' });
    expect([...buttonsIn(dialog)].map((n) => n.textContent)).toEqual([
      'A2',
      'B',
    ]);
    a.remove();
    b.remove();
    expect(dialog.querySelector('[data-calsdk-popover-actions]')).toBe(null);
    a.update({ title: 'ignored' });
    expect(buttonsIn(dialog)).toHaveLength(0);
    h.registry.stop();
  });

  test('closing the popover removes its buttons and later addButton is a no-op', async () => {
    const h = setup();
    const dialog = await open(h);
    const view = h.created[0];
    view.addButton({ title: 'A', onClick: () => undefined });

    dialog.remove();
    await flush();
    expect(
      document.querySelectorAll('[data-calsdk-popover-button]'),
    ).toHaveLength(0);
    expect(() =>
      view.addButton({ title: 'late', onClick: () => undefined }),
    ).not.toThrow();
    expect(
      document.querySelectorAll('[data-calsdk-popover-button]'),
    ).toHaveLength(0);
    h.registry.stop();
  });

  test('the style element is injected once and icons render as <img>', async () => {
    const h = setup();
    const dialog = await open(h);
    h.created[0].addButton({
      title: 'A',
      iconUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      onClick: () => undefined,
    });
    h.created[0].addButton({ title: 'B', onClick: () => undefined });
    expect(document.querySelectorAll('#calsdk-popover-style')).toHaveLength(1);
    expect(buttonsIn(dialog)[0].querySelector('img')).not.toBe(null);
    expect(buttonsIn(dialog)[1].querySelector('img')).toBe(null);
    h.registry.stop();
  });

  test('our own insertions do not feed the observer', async () => {
    const h = setup();
    await open(h);
    h.created[0].addButton({ title: 'A', onClick: () => undefined });
    await flush();
    let mutations = 0;
    const probe = new MutationObserver((r) => (mutations += r.length));
    probe.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    await new Promise((r) => setTimeout(r, 40));
    probe.disconnect();
    expect(mutations).toBe(0);
    h.registry.stop();
  });

  test('two SDK instances keep separate buttons', async () => {
    const a = setup('app-a');
    a.registry.start();
    const dialog = makePopover({ decoded: 'a owner@m' });
    overlayHost().append(dialog);
    await flush();
    a.created[0].addButton({ title: 'A', onClick: () => undefined });

    const selectors = new SelectorRegistry<CalendarSelectorKey>(
      CALENDAR_SELECTORS,
    );
    const b = new PopoverRegistry({ document, selectors, appId: 'app-b' });
    b.start();
    b.getAll()[0].addButton({ title: 'B', onClick: () => undefined });

    dialog.querySelector('[data-eventid]')!.replaceChildren();
    await flush();
    expect([...buttonsIn(dialog)].map((n) => n.textContent).sort()).toEqual([
      'A',
      'B',
    ]);
    b.stop();
    expect([...buttonsIn(dialog)].map((n) => n.textContent)).toEqual(['A']);
    a.registry.stop();
  });
});
