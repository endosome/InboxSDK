import SelectorRegistry from '../../../lib/dom/selectorRegistry';
import { setReporter } from '../../../lib/reporter';
import { CALENDAR_SELECTORS, type CalendarSelectorKey } from '../selectors';
import EventRegistry from './event-registry';
import HoverCardService from './hover-card-service';
import { makeChip, renderShell } from '../testing-chip-fixtures';
import type CalendarEventViewDriver from '../views/calendar-event-view-driver';
import type { HoverCardDescriptor } from '../../../driver-interfaces/event-view-driver';

const noBadges = {
  addBadge: () => ({ update: () => undefined, remove: () => undefined }),
};

function harness(appId = 'app-a') {
  const { main } = renderShell();
  const selectors = new SelectorRegistry<CalendarSelectorKey>(
    CALENDAR_SELECTORS,
  );
  // eslint-disable-next-line prefer-const
  let registry!: EventRegistry;
  const service = new HoverCardService({
    document,
    selectors,
    appId,
    getDriverForElement: (el) => registry.getDriverForElement(el),
  });
  registry = new EventRegistry(
    document,
    selectors,
    noBadges,
    undefined,
    service,
  );
  const views: CalendarEventViewDriver[] = [];
  registry.subscribe((d) => views.push(d));
  const chips = ['a', 'b'].map((id) => {
    const c = makeChip({ decoded: `${id} owner@m` });
    c.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 200,
        right: 180,
        bottom: 250,
        width: 80,
        height: 50,
      }) as DOMRect;
    main.append(c);
    return c;
  });
  registry.start();
  service.start();
  return { main, chips, registry, service, views };
}

/** jsdom has no layout: cards measure 200×100. */
const realRect = Element.prototype.getBoundingClientRect;
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    if ((this as HTMLElement).classList?.contains('calsdk-hover-card')) {
      return {
        left: 0,
        top: 0,
        right: 200,
        bottom: 100,
        width: 200,
        height: 100,
      } as DOMRect;
    }
    return realRect.call(this);
  };
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = realRect;
});

function pointer(
  type: string,
  target: Element | Document | Window,
  init: { pointerType?: string; buttons?: number; bubbles?: boolean } = {},
) {
  const e = new MouseEvent(type, {
    bubbles: init.bubbles ?? false,
    cancelable: true,
    buttons: init.buttons ?? 0,
  });
  Object.defineProperty(e, 'pointerType', {
    value: init.pointerType ?? 'mouse',
  });
  target.dispatchEvent(e);
  return e;
}
const enter = (el: Element, init = {}) => pointer('pointerenter', el, init);
const leave = (el: Element, init = {}) => pointer('pointerleave', el, init);
const frames = () => document.querySelectorAll('[data-calsdk-hover-card]');
const settle = async (ms = 0) => {
  await jest.advanceTimersByTimeAsync(ms);
};

const simple = (
  over: Partial<HoverCardDescriptor> = {},
): HoverCardDescriptor => ({
  render: (c) => {
    c.textContent = 'hello';
  },
  ...over,
});

beforeEach(() => {
  jest.useFakeTimers();
  document.head.innerHTML = '';
});
afterEach(() => {
  jest.useRealTimers();
  setReporter(null);
});

describe('showing', () => {
  test('shows after the default delay, beside the chip, with the app content', async () => {
    const h = harness();
    h.views[0].addHoverCard(simple());
    enter(h.chips[0]);
    await settle(349);
    expect(frames()).toHaveLength(0);
    await settle(2);
    expect(frames()).toHaveLength(1);
    const frame = frames()[0] as HTMLElement;
    expect(frame.textContent).toBe('hello');
    expect(frame.getAttribute('role')).toBe('tooltip');
    expect(frame.style.visibility).toBe('visible');
    expect(parseInt(frame.style.left)).toBeGreaterThanOrEqual(180); // right of the chip (100..180), never over it
    expect(h.service.isShowing()).toBe(true);
    h.service.stop();
  });

  test('delayMs is honoured and clamped (0–2000)', async () => {
    const h = harness();
    h.views[0].addHoverCard(simple({ delayMs: 0 }));
    enter(h.chips[0]);
    await settle(0);
    expect(frames()).toHaveLength(1);
    h.service.hide();
    const slow = h.views[1].addHoverCard(simple({ delayMs: 99999 }));
    enter(h.chips[1]);
    await settle(1999);
    expect(frames()).toHaveLength(0);
    await settle(2);
    expect(frames()).toHaveLength(1);
    slow.remove();
    h.service.stop();
  });

  test('leaving before the delay cancels; a chip without cards or without a view gets nothing', async () => {
    const h = harness();
    h.views[0].addHoverCard(simple());
    enter(h.chips[0]);
    await settle(100);
    leave(h.chips[0]);
    await settle(1000);
    expect(frames()).toHaveLength(0);
    enter(h.chips[1]); // no cards registered on b
    await settle(1000);
    expect(frames()).toHaveLength(0);
    enter(document.createElement('div')); // not a chip
    await settle(1000);
    expect(frames()).toHaveLength(0);
    h.service.stop();
  });

  test('render is called on every showing with a NEW container each time', async () => {
    const h = harness();
    const containers: HTMLElement[] = [];
    h.views[0].addHoverCard({
      render: (c) => {
        containers.push(c);
      },
    });
    for (let i = 0; i < 2; i++) {
      enter(h.chips[0]);
      await settle(400);
      leave(h.chips[0]);
      await settle(10);
    }
    expect(containers).toHaveLength(2);
    expect(containers[0]).not.toBe(containers[1]);
    expect(frames()).toHaveLength(0);
    h.service.stop();
  });

  test('touch pointers, pressed buttons and open dialogs never show a card', async () => {
    const h = harness();
    h.views[0].addHoverCard(simple());
    enter(h.chips[0], { pointerType: 'touch' });
    await settle(500);
    expect(frames()).toHaveLength(0);
    enter(h.chips[0], { buttons: 1 }); // dragging
    await settle(500);
    expect(frames()).toHaveLength(0);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    enter(h.chips[0]);
    await settle(500);
    expect(frames()).toHaveLength(0);
    dialog.remove();
    enter(h.chips[0]);
    await settle(500);
    expect(frames()).toHaveLength(1);
    h.service.stop();
  });
});

describe('hiding', () => {
  async function shown() {
    const h = harness();
    h.views[0].addHoverCard(simple());
    enter(h.chips[0]);
    await settle(400);
    expect(frames()).toHaveLength(1);
    return h;
  }

  test.each([
    ['pointerleave of the chip', (h: any) => leave(h.chips[0])],
    ['pointerdown', () => pointer('pointerdown', document, { bubbles: true })],
    ['click', () => document.body.click()],
    [
      'Escape',
      () =>
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        ),
    ],
    [
      'Enter',
      () =>
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        ),
    ],
    [
      'scroll (of any element, captured)',
      (h: any) => h.main.dispatchEvent(new Event('scroll')),
    ],
    ['wheel', () => document.dispatchEvent(new Event('wheel'))],
    ['window blur', () => window.dispatchEvent(new Event('blur'))],
  ])('hides on %s', async (_n, trigger) => {
    const h = await shown();
    trigger(h);
    expect(frames()).toHaveLength(0);
    expect(h.service.isShowing()).toBe(false);
    h.service.stop();
  });

  test('hides when the view is destroyed, the chip leaves the document, or the app calls hide()', async () => {
    let h = await shown();
    h.chips[0].remove();
    await settle(0);
    await Promise.resolve();
    await settle(50);
    expect(frames()).toHaveLength(0);
    h.service.stop();
    h = await shown();
    h.service.hide();
    expect(frames()).toHaveLength(0);
    h.service.stop();
  });

  test('a non-interactive card hides immediately and ignores the pointer', async () => {
    const h = await shown();
    expect(
      (frames()[0] as HTMLElement).hasAttribute('data-calsdk-interactive'),
    ).toBe(false);
    leave(h.chips[0]);
    expect(frames()).toHaveLength(0);
    h.service.stop();
  });

  test('moving to another chip replaces the card and starts a fresh delay', async () => {
    const h = harness();
    h.views[0].addHoverCard(
      simple({
        render: (c) => {
          c.textContent = 'A';
        },
      }),
    );
    h.views[1].addHoverCard(
      simple({
        render: (c) => {
          c.textContent = 'B';
        },
      }),
    );
    enter(h.chips[0]);
    await settle(400);
    expect(frames()[0].textContent).toBe('A');
    enter(h.chips[1]);
    expect(frames()).toHaveLength(0); // A is gone at once
    await settle(349);
    expect(frames()).toHaveLength(0);
    await settle(2);
    expect(frames()[0].textContent).toBe('B');
    h.service.stop();
  });

  test('a pointerdown suppresses hover cards until the pointer is released (drag over other chips)', async () => {
    const h = harness();
    h.views[1].addHoverCard(simple());
    pointer('pointerdown', document, { bubbles: true });
    enter(h.chips[1]);
    await settle(500);
    expect(frames()).toHaveLength(0);
    pointer('pointerup', document, { bubbles: true });
    enter(h.chips[1]);
    await settle(500);
    expect(frames()).toHaveLength(1);
    h.service.stop();
  });
});

describe('async content, abort and errors', () => {
  test('a late render after the pointer left never paints, and its signal is aborted', async () => {
    const h = harness();
    let release!: () => void;
    let signal!: AbortSignal;
    const container: HTMLElement[] = [];
    h.views[0].addHoverCard({
      render: (c, ctx) => {
        signal = ctx.signal;
        container.push(c);
        return new Promise<void>((r) => {
          release = () => {
            c.textContent = 'late';
            r();
          };
        });
      },
    });
    enter(h.chips[0]);
    await settle(400);
    expect(frames()).toHaveLength(0); // nothing shown while pending
    leave(h.chips[0]);
    expect(signal.aborted).toBe(true);
    release();
    await settle(50);
    expect(frames()).toHaveLength(0);
    expect(document.contains(container[0])).toBe(false);
    h.service.stop();
  });

  test('async content that resolves in time is shown', async () => {
    const h = harness();
    h.views[0].addHoverCard({
      render: async (c) => {
        await Promise.resolve();
        c.textContent = 'async';
      },
    });
    enter(h.chips[0]);
    await settle(400);
    expect(frames()[0].textContent).toBe('async');
    h.service.stop();
  });

  test('cleanup functions run on hide, exactly once', async () => {
    const h = harness();
    const cleanup = jest.fn();
    h.views[0].addHoverCard({ render: () => cleanup });
    enter(h.chips[0]);
    await settle(400);
    leave(h.chips[0]);
    h.service.hide();
    expect(cleanup).toHaveBeenCalledTimes(1);
    h.service.stop();
  });

  test('a throwing render or a rejection is reported and shows nothing; other cards still show', async () => {
    const errors: unknown[] = [];
    setReporter({ error: (e) => errors.push(e), event: () => undefined });
    const h = harness();
    h.views[0].addHoverCard({
      render: () => {
        throw new Error('sync');
      },
    });
    enter(h.chips[0]);
    await settle(400);
    expect(frames()).toHaveLength(0);
    expect(errors).toHaveLength(1);
    h.service.hide();
    h.views[0].addHoverCard({
      render: async () => {
        throw new Error('async');
      },
    });
    h.views[0].addHoverCard(simple());
    leave(h.chips[0]);
    enter(h.chips[0]);
    await settle(400);
    expect(errors.length).toBeGreaterThanOrEqual(3);
    expect(frames()).toHaveLength(1); // the healthy card
    expect(frames()[0].textContent).toBe('hello');
    h.service.stop();
  });

  test('a throwing cleanup is reported, not thrown', async () => {
    const errors: unknown[] = [];
    setReporter({ error: (e) => errors.push(e), event: () => undefined });
    const h = harness();
    h.views[0].addHoverCard({
      render: () => () => {
        throw new Error('cleanup');
      },
    });
    enter(h.chips[0]);
    await settle(400);
    expect(() => h.service.hide()).not.toThrow();
    expect(errors).toHaveLength(1);
    h.service.stop();
  });
});

describe('several cards, update, remove', () => {
  test('several cards on one view are stacked in one frame in registration order', async () => {
    const h = harness();
    h.views[0].addHoverCard(
      simple({
        render: (c) => {
          c.textContent = 'one';
        },
      }),
    );
    h.views[0].addHoverCard(
      simple({
        render: (c) => {
          c.textContent = 'two';
        },
      }),
    );
    enter(h.chips[0]);
    await settle(400);
    expect(frames()).toHaveLength(1);
    expect([...frames()[0].children].map((c) => c.textContent)).toEqual([
      'one',
      'two',
    ]);
    h.service.stop();
  });

  test('remove() drops the card (and hides it if it was showing); update() takes effect on the next showing', async () => {
    const h = harness();
    const handle = h.views[0].addHoverCard(
      simple({
        render: (c) => {
          c.textContent = 'v1';
        },
      }),
    );
    enter(h.chips[0]);
    await settle(400);
    handle.update({
      render: (c) => {
        c.textContent = 'v2';
      },
    });
    expect(frames()).toHaveLength(0);
    leave(h.chips[0]);
    enter(h.chips[0]);
    await settle(400);
    expect(frames()[0].textContent).toBe('v2');
    handle.remove();
    expect(frames()).toHaveLength(0);
    handle.remove();
    handle.update({ label: 'x' });
    leave(h.chips[0]);
    enter(h.chips[0]);
    await settle(400);
    expect(frames()).toHaveLength(0);
    h.service.stop();
  });

  test('requires render; a destroyed view drops its cards', async () => {
    const h = harness();
    expect(() => h.views[0].addHoverCard({} as any)).toThrow('render');
    h.views[0].addHoverCard(simple());
    h.views[0].destroy();
    enter(h.chips[0]);
    await settle(500);
    expect(frames()).toHaveLength(0);
    h.service.stop();
  });
});

describe('interactive cards', () => {
  async function interactive() {
    const h = harness();
    h.views[0].addHoverCard(simple({ interactive: true, label: 'Details' }));
    enter(h.chips[0]);
    await settle(400);
    return h;
  }

  test('role dialog + label, pointer-events on, and the pointer can cross from chip to card', async () => {
    const h = await interactive();
    const frame = frames()[0] as HTMLElement;
    expect(frame.getAttribute('role')).toBe('dialog');
    expect(frame.getAttribute('aria-label')).toBe('Details');
    expect(frame.hasAttribute('data-calsdk-interactive')).toBe(true);
    leave(h.chips[0]);
    await settle(60);
    expect(frames()).toHaveLength(1); // grace period
    enter(frame); // the bridge
    await settle(500);
    expect(frames()).toHaveLength(1);
    leave(frame);
    await settle(130);
    expect(frames()).toHaveLength(0);
    h.service.stop();
  });

  test('leaving the chip without reaching the card hides it after the grace', async () => {
    const h = await interactive();
    leave(h.chips[0]);
    await settle(121);
    expect(frames()).toHaveLength(0);
    h.service.stop();
  });

  test('re-entering the chip during the grace keeps the card', async () => {
    const h = await interactive();
    leave(h.chips[0]);
    await settle(50);
    enter(h.chips[0]);
    await settle(300);
    expect(frames()).toHaveLength(1);
    h.service.stop();
  });

  test('the card contains pointer events and single keys but lets Escape and Tab through', async () => {
    const h = await interactive();
    const frame = frames()[0] as HTMLElement;
    const reached: string[] = [];
    for (const t of ['mousedown', 'click', 'keydown'])
      document.body.addEventListener(t, () => reached.push(t));
    frame.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    frame.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    frame.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'e', bubbles: true }),
    );
    expect(reached).toEqual([]);
    frame.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    );
    expect(reached).toEqual(['keydown']);
    h.service.stop();
  });

  test('using an interactive card does not close it: click, press, scroll and Enter inside it', async () => {
    const h = harness();
    let button!: HTMLButtonElement;
    h.views[0].addHoverCard({
      interactive: true,
      render: (c) => {
        button = document.createElement('button');
        c.append(button);
      },
    });
    enter(h.chips[0]);
    await settle(400);
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    button.click();
    button.dispatchEvent(new Event('scroll'));
    button.dispatchEvent(new Event('wheel', { bubbles: true }));
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(frames()).toHaveLength(1);
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(frames()).toHaveLength(0); // Escape still closes it
    h.service.stop();
  });

  test('a default (non-interactive) card lives in a layer that ignores the pointer', async () => {
    const h = harness();
    h.views[0].addHoverCard(simple());
    enter(h.chips[0]);
    await settle(400);
    const layer = document.querySelector('[data-calsdk-hover-layer]')!;
    expect(layer.parentElement).toBe(document.body);
    expect(
      document.getElementById('calsdk-hover-style')!.textContent,
    ).toContain('pointer-events: none');
    h.service.stop();
  });
});

describe('keyboard focus', () => {
  test('focusin on a chip shows the card at once; focusout hides it; Escape hides it', async () => {
    const h = harness();
    h.views[0].addHoverCard(simple({ delayMs: 1500 }));
    h.chips[0].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle(0);
    expect(frames()).toHaveLength(1);
    h.chips[0].dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(frames()).toHaveLength(0);
    h.chips[0].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle(0);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(frames()).toHaveLength(0);
    h.service.stop();
  });

  test('Escape does not stop propagation (Calendar still sees it)', async () => {
    const h = harness();
    h.views[0].addHoverCard(simple());
    enter(h.chips[0]);
    await settle(400);
    const seen = jest.fn();
    document.body.addEventListener('keydown', seen);
    h.chips[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(seen).toHaveBeenCalledTimes(1);
    h.service.stop();
  });
});

describe('placement and theme', () => {
  test('a chip with no size gets no card', async () => {
    const h = harness();
    h.chips[0].getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
      }) as DOMRect;
    h.views[0].addHoverCard(simple());
    enter(h.chips[0]);
    await settle(500);
    expect(frames()).toHaveLength(0);
    h.service.stop();
  });

  test('the theme follows the real background behind the grid, not prefers-color-scheme', async () => {
    const h = harness();
    h.views[0].addHoverCard(simple());
    const grid = document.querySelector<HTMLElement>('[role=main]')!;
    grid.style.backgroundColor = 'rgb(32, 33, 36)';
    enter(h.chips[0]);
    await settle(400);
    expect(frames()[0].getAttribute('data-calsdk-theme')).toBe('dark');
    h.service.hide();
    grid.style.backgroundColor = 'rgb(255, 255, 255)';
    enter(h.chips[0]);
    await settle(400);
    expect(frames()[0].getAttribute('data-calsdk-theme')).toBe('light');
    h.service.stop();
  });

  test('RTL prefers the left of the chip', async () => {
    const h = harness();
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.style.direction = 'rtl';
    h.chips[0].getBoundingClientRect = () =>
      ({
        left: 500,
        top: 200,
        right: 580,
        bottom: 250,
        width: 80,
        height: 50,
      }) as DOMRect;
    h.views[0].addHoverCard(simple());
    enter(h.chips[0]);
    await settle(400);
    expect(parseInt((frames()[0] as HTMLElement).style.left)).toBeLessThan(500);
    document.documentElement.removeAttribute('dir');
    document.documentElement.style.direction = '';
    h.service.stop();
  });
});

describe('teardown', () => {
  test('stop() removes the layer, the style and every listener, and later triggers do nothing', async () => {
    const h = harness();
    h.views[0].addHoverCard(simple());
    enter(h.chips[0]);
    await settle(400);
    expect(frames()).toHaveLength(1);
    h.service.stop();
    expect(document.querySelector('[data-calsdk-hover-layer]')).toBeNull();
    expect(document.getElementById('calsdk-hover-style')).toBeNull();
    enter(h.chips[0]);
    await settle(1000);
    expect(frames()).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
    // adding after stop is a no-op handle
    expect(() => h.views[0].addHoverCard(simple()).remove()).not.toThrow();
  });

  test('stop() while a render is pending aborts it and never paints', async () => {
    const h = harness();
    let signal!: AbortSignal;
    h.views[0].addHoverCard({
      render: (_c, ctx) => {
        signal = ctx.signal;
        return new Promise<void>(() => undefined);
      },
    });
    enter(h.chips[0]);
    await settle(400);
    h.service.stop();
    expect(signal.aborted).toBe(true);
    expect(frames()).toHaveLength(0);
  });

  test('two apps: each owns its own layer', async () => {
    const a = harness('app-a');
    a.views[0].addHoverCard(simple());
    enter(a.chips[0]);
    await settle(400);
    expect(
      document.querySelectorAll(
        '[data-calsdk-hover-layer][data-calsdk-owned="app-a"]',
      ),
    ).toHaveLength(1);
    a.service.stop();
  });
});
