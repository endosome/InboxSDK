/**
 * The SDK against SANITISED SNAPSHOTS OF REAL Calendar markup (`__tests__/calendar-fixtures/`, captured with
 * `tools/calendar-probe/capture-fixtures.mjs`). Hand-built fixtures prove the logic; these prove the selectors
 * and assumptions still match what Google actually served on the capture date. When Calendar changes, re-capture
 * (see the probe README), look at the diff, and fix the selectors these tests point at.
 */
import fs from 'node:fs';
import path from 'node:path';
import kefirStopper from 'kefir-stopper';
import SelectorRegistry from '../src/platform-implementation-js/lib/dom/selectorRegistry';
import {
  CALENDAR_SELECTORS,
  type CalendarSelectorKey,
} from '../src/platform-implementation-js/dom-driver/google-calendar/selectors';
import { runCompatChecks } from '../src/platform-implementation-js/compat/checks';
import EventRegistry from '../src/platform-implementation-js/dom-driver/google-calendar/services/event-registry';
import PopoverRegistry from '../src/platform-implementation-js/dom-driver/google-calendar/services/popover-registry';
import HoverCardService from '../src/platform-implementation-js/dom-driver/google-calendar/services/hover-card-service';
import ToolbarService from '../src/platform-implementation-js/dom-driver/google-calendar/services/toolbar-service';
import CalendarEventEditorViewDriver from '../src/platform-implementation-js/dom-driver/google-calendar/views/calendar-event-editor-view-driver';
import { classifyRoute } from '../src/platform-implementation-js/dom-driver/google-calendar/route-classifier';
import { decodeEventId } from '../src/platform-implementation-js/dom-driver/google-calendar/identity';

const DIR = path.join(__dirname, 'calendar-fixtures');
const manifest = JSON.parse(
  fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'),
);
const NAMES = Object.keys(manifest.fixtures);

function load(name: string) {
  const meta = manifest.fixtures[name];
  document.head.innerHTML = '';
  document.body.innerHTML = fs.readFileSync(
    path.join(DIR, `${name}.html`),
    'utf8',
  );
  for (const a of [...document.body.attributes])
    document.body.removeAttribute(a.name);
  for (const [k, v] of Object.entries(meta.body))
    document.body.setAttribute(k, v as string);
  document.documentElement.lang = meta.html.lang;
  document.documentElement.setAttribute(
    'data-ui-kind',
    meta.html['data-ui-kind'],
  );
  window.history.pushState({}, '', meta.path);
}
const selectors = () =>
  new SelectorRegistry<CalendarSelectorKey>(CALENDAR_SELECTORS);
const noBadges = {
  addBadge: () => ({ update: () => undefined, remove: () => undefined }),
};
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function eventViews() {
  const registry = new EventRegistry(document, selectors(), noBadges);
  registry.start();
  const drivers = registry.getAll();
  return { registry, drivers, refs: drivers.map((d) => d.getEventRef()) };
}
function popovers() {
  const registry = new PopoverRegistry({
    document,
    selectors: selectors(),
    appId: 'fx',
  });
  registry.start();
  return { registry, all: registry.getAll() };
}

describe('capture hygiene', () => {
  test('there are fixtures, dated', () => {
    expect(NAMES.length).toBeGreaterThanOrEqual(8);
    expect(manifest.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test.each(NAMES)('%s: no user data and no SDK-injected nodes', (name) => {
    const html = fs.readFileSync(path.join(DIR, `${name}.html`), 'utf8');
    const emails =
      html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
    expect(
      emails.filter(
        (e) =>
          e !== 'cal@example.com' &&
          e !== 'owner@example.com' &&
          !/^x+@x+\.x+$/.test(e),
      ),
    ).toEqual([]);
    expect(html).not.toMatch(/calsdk-|data-calsdk/);
    // jslog carries event and calendar ids: only synthetic values may be left
    for (const [, jslog] of html.matchAll(/jslog="([^"]*)"/g)) {
      const quoted = [...jslog.matchAll(/&quot;([^&]*)&quot;/g)].map(
        (m) => m[1],
      );
      for (const q of quoted) {
        expect(q.length < 16 || q === 'cal@example.com').toBe(true);
      }
    }
    // every event token decodes to synthetic ids only
    for (const [, raw] of html.matchAll(/data-eventid="([^"]+)"/g)) {
      const d = decodeEventId(raw);
      expect(d).not.toBeNull();
      expect(d!.eventId).toMatch(/^evt\d+$/);
      expect(d!.calendarIdHint).toMatch(/^owner@/);
    }
  });
});

describe('selectors and compat against the real markup', () => {
  test.each(NAMES)(
    '%s: no hard compat issue, no fallback rung needed',
    (name) => {
      load(name);
      const report = runCompatChecks(document, CALENDAR_SELECTORS);
      expect(report.issues).toEqual([]);
    },
  );

  test('every context-specific key is active where it must be (the checks are not vacuous)', () => {
    const status = (name: string, key: string) => {
      load(name);
      return runCompatChecks(document, CALENDAR_SELECTORS).selectors.find(
        (s) => s.key === key,
      )!.status;
    };
    expect(status('week', 'eventChip')).toBe('ok');
    expect(status('week', 'dateCell')).toBe('ok');
    expect(status('week', 'searchButton')).toBe('ok');
    expect(status('week', 'appHeader')).toBe('ok');
    expect(status('week', 'eventPopover')).toBe('inactive');
    expect(status('week-popover-event', 'eventPopover')).toBe('ok');
    expect(status('week-popover-event', 'popoverEventIdNode')).toBe('ok');
    expect(status('week-popover-event', 'popoverEditButton')).toBe('ok');
    expect(status('week-quick-create', 'eventPopover')).toBe('inactive'); // has inputs
    expect(status('editor', 'editorTitle')).toBe('ok');
    expect(status('editor', 'editorSave')).toBe('ok');
    expect(status('editor', 'editorCancel')).toBe('ok');
  });

  test.each(NAMES)(
    '%s: the body attributes classify to the expected route',
    (name) => {
      load(name);
      const type = classifyRoute({
        viewKey: document.body.getAttribute('data-viewkey'),
        viewFamily: document.body.getAttribute('data-viewfamily'),
        pathname: location.pathname,
        search: '',
      });
      expect(type.agrees).toBe(true);
      const expected: Record<string, string> = {
        week: 'WEEK',
        month: 'MONTH',
        agenda: 'AGENDA',
        editor: 'EVENT_EDIT',
      };
      const key = name.split('-')[0];
      expect(type.descriptor.type).toBe(expected[key]);
    },
  );
});

describe('event chips', () => {
  test('week: every eligible chip becomes a view with a decodable ref; kinds and recurrence are right', () => {
    load('week');
    const dom = document.querySelectorAll(
      '[role=main] [data-eventchip][jsaction][data-keyboardactiontype][data-eventid]',
    );
    const { registry, refs } = eventViews();
    expect(dom.length).toBeGreaterThan(10);
    expect(refs).toHaveLength(dom.length);
    const kinds = new Set(refs.map((r) => r.kind));
    expect(kinds.has('event')).toBe(true);
    expect(kinds.has('task')).toBe(true);
    expect(refs.some((r) => r.instanceId)).toBe(true); // recurring instances
    // plain events carry their full calendar id (from jslog); tasks do not
    expect(
      refs
        .filter((r) => r.kind === 'event')
        .every((r) => r.calendarId === 'cal@example.com'),
    ).toBe(true);
    expect(
      refs.filter((r) => r.kind === 'task').every((r) => r.calendarId === null),
    ).toBe(true);
    registry.stop();
  });

  test('week: a multi-day event has one view per chip with consistent segments', () => {
    load('week');
    const { registry, drivers } = eventViews();
    const multi = drivers.filter((d) => d.getSegment().count > 1);
    expect(multi.length).toBeGreaterThan(1);
    for (const d of multi) {
      const s = d.getSegment();
      expect(s.index).toBeLessThan(s.count);
    }
    expect(multi.filter((d) => d.getSegment().isPrimary)).toHaveLength(
      new Set(multi.map((d) => d.getEventRef().eventId)).size,
    );
    registry.stop();
  });

  test('month and agenda: views exist for every eligible chip, and month has a birthday', () => {
    for (const name of ['month', 'agenda']) {
      load(name);
      const dom = document.querySelectorAll(
        '[role=main] [data-eventchip][jsaction][data-keyboardactiontype][data-eventid]',
      );
      const { registry, refs } = eventViews();
      expect(refs).toHaveLength(dom.length);
      expect(refs.length).toBeGreaterThan(5);
      if (name === 'month')
        expect(refs.some((r) => r.kind === 'birthday')).toBe(true);
      registry.stop();
    }
  });

  test('all-day vs timed is read from data-dragsource-type on real chips', () => {
    load('week');
    const { registry, drivers } = eventViews();
    expect(drivers.some((d) => d.isAllDay())).toBe(true);
    expect(drivers.some((d) => !d.isAllDay())).toBe(true);
    registry.stop();
  });
});

describe('popovers', () => {
  test('an event popover is found once, with the same identity as its chip, and takes a button', async () => {
    load('week-popover-event');
    const { registry, all } = popovers();
    expect(all).toHaveLength(1);
    const ref = all[0].getEventRef();
    expect(ref.kind).toBe('event');
    const chipIds = new Set(
      [...document.querySelectorAll('[role=main] [data-eventchip]')].map((c) =>
        c.getAttribute('data-eventid'),
      ),
    );
    expect(chipIds.has(ref.rawId)).toBe(true); // the popover shows an event that is on the grid
    all[0].addButton({ title: 'Open', onClick: () => undefined });
    await flush();
    const dialog = all[0].element;
    expect(
      dialog.querySelectorAll('[data-calsdk-popover-button]'),
    ).toHaveLength(1);
    // the button row sits inside the holder that carries the event id
    const row = dialog.querySelector('.calsdk-popover-actions')!;
    expect(row.parentElement!.hasAttribute('data-eventid')).toBe(true);
    // Calendar re-rendering the popover strips foreign nodes: it is put back
    row.remove();
    await flush();
    expect(
      dialog.querySelectorAll('[data-calsdk-popover-button]'),
    ).toHaveLength(1);
    registry.stop();
  });

  test('a task popover and a birthday popover are found with the right kind', () => {
    load('week-popover-task');
    let p = popovers();
    expect(p.all.map((d) => d.getEventRef().kind)).toEqual(['task']);
    p.registry.stop();
    load('month-popover-birthday');
    p = popovers();
    expect(p.all.map((d) => d.getEventRef().kind)).toEqual(['birthday']);
    p.registry.stop();
  });

  test('the quick-create dialog (real markup, with inputs) is never an event popover', () => {
    load('week-quick-create');
    expect(
      document.querySelector(
        '[role=dialog][data-chips-dialog] input, [role=dialog][data-chips-dialog] textarea',
      ),
    ).not.toBeNull();
    const p = popovers();
    expect(p.all).toHaveLength(0);
    p.registry.stop();
  });

  test('pages without a popover have none', () => {
    for (const name of ['week', 'month', 'agenda', 'editor']) {
      load(name);
      const p = popovers();
      expect(p.all).toHaveLength(0);
      p.registry.stop();
    }
  });
});

describe('editor', () => {
  test('title, save and cancel are found; the title is read live from the real field', () => {
    load('editor');
    const sel = selectors();
    expect(sel.querySelectorByKey(document.body, 'editorTitle')?.tagName).toBe(
      'INPUT',
    );
    expect(sel.querySelectorByKey(document.body, 'editorSave')?.tagName).toBe(
      'BUTTON',
    );
    expect(sel.querySelectorByKey(document.body, 'editorCancel')?.tagName).toBe(
      'BUTTON',
    );
    const driver = new CalendarEventEditorViewDriver(
      () => null,
      kefirStopper(),
      { document, selectors: sel },
    );
    expect(typeof driver.getTitle()).toBe('string');
    // NOT jsname=YPqjbf: it is shared by every text input on the page
    expect(
      document.querySelectorAll('input[jsname=YPqjbf]').length,
    ).toBeGreaterThan(1);
    expect(document.querySelectorAll('input#xTiIn')).toHaveLength(1);
  });

  test('the title selector does not match other inputs', () => {
    load('editor');
    const sel = selectors();
    const title = sel.querySelectorByKey(document.body, 'editorTitle')!;
    const others = [...document.querySelectorAll('input')].filter(
      (i) => i !== title,
    );
    expect(others.length).toBeGreaterThan(3);
    expect(others.some((i) => sel.matchesByKey(i, 'editorTitle'))).toBe(false);
  });
});

describe('toolbar', () => {
  test('the button goes right before the Search wrapper of the real header', () => {
    load('week');
    const svc = new ToolbarService({
      document,
      selectors: selectors(),
      appId: 'fx',
    });
    svc.start();
    svc.addButton({
      title: 'CRM',
      iconUrl: 'data:image/png;base64,AA',
      onClick: () => undefined,
    });
    const button = document.querySelector('[data-calsdk-toolbar-button]')!;
    const search = document.querySelector(
      'header[role=banner] button[jsname=KzBUhd]',
    )!;
    const container = button.parentElement!;
    expect(container.nextElementSibling).toBe(search.parentElement);
    expect(document.querySelector('header')!.contains(container)).toBe(true);
    svc.stop();
  });
});

describe('hover card', () => {
  test('on the real week markup a hovered chip gets a card next to it (chips found, view mapped, listeners passive)', async () => {
    jest.useFakeTimers();
    load('week');
    // eslint-disable-next-line prefer-const
    let registry!: EventRegistry;
    const service = new HoverCardService({
      document,
      selectors: selectors(),
      appId: 'fx',
      getDriverForElement: (el) => registry.getDriverForElement(el),
    });
    registry = new EventRegistry(
      document,
      selectors(),
      noBadges,
      undefined,
      service,
    );
    registry.start();
    service.start();
    const driver = registry
      .getAll()
      .find((d) => d.getEventRef().kind === 'event')!;
    driver.addHoverCard({
      render: (c) => {
        c.textContent = 'hi';
      },
    });
    const chip = driver.element;
    chip.getBoundingClientRect = () =>
      ({
        left: 300,
        top: 300,
        right: 380,
        bottom: 350,
        width: 80,
        height: 50,
      }) as DOMRect;
    const real = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return (this as Element).hasAttribute('data-calsdk-hover-card')
        ? ({
            left: 0,
            top: 0,
            right: 200,
            bottom: 80,
            width: 200,
            height: 80,
          } as DOMRect)
        : real.call(this);
    };
    const seen = jest.fn();
    document.addEventListener('pointerenter', seen, true);
    const e = new MouseEvent('pointerenter', {
      bubbles: false,
      cancelable: true,
    });
    Object.defineProperty(e, 'pointerType', { value: 'mouse' });
    chip.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false); // passive: Calendar's own mouseenter handling is untouched
    await jest.advanceTimersByTimeAsync(400);
    const frame = document.querySelector(
      '[data-calsdk-hover-card]',
    ) as HTMLElement;
    expect(frame.textContent).toBe('hi');
    expect(parseInt(frame.style.left)).toBeGreaterThanOrEqual(380);
    document.removeEventListener('pointerenter', seen, true);
    Element.prototype.getBoundingClientRect = real;
    service.stop();
    registry.stop();
    jest.useRealTimers();
  });
});
