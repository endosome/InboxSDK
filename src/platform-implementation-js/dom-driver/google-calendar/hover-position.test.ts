import { placeCard, type Box } from './hover-position';

const VP = { width: 1000, height: 800 };
const box = (left: number, top: number, w: number, h: number): Box => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});
const card = { width: 300, height: 200 };

describe('placement order', () => {
  test('right of the anchor, tops aligned', () => {
    expect(placeCard(box(100, 300, 80, 50), card, VP)).toMatchObject({
      placement: 'right',
      left: 186,
      top: 300,
    });
  });
  test('left when the right has no room', () => {
    const p = placeCard(box(800, 300, 80, 50), card, VP)!;
    expect(p.placement).toBe('left');
    expect(p.left).toBe(800 - 6 - 300);
    expect(p.left + 300).toBeLessThanOrEqual(800); // never over the anchor
  });
  test('RTL prefers the left first, and falls back to the right', () => {
    expect(
      placeCard(box(500, 300, 80, 50), card, VP, { rtl: true })!.placement,
    ).toBe('left');
    expect(
      placeCard(box(100, 300, 80, 50), card, VP, { rtl: true })!.placement,
    ).toBe('right');
  });
  test('below, then above, when neither side fits', () => {
    const wide = { width: 900, height: 120 };
    expect(placeCard(box(300, 100, 100, 40), wide, VP)!.placement).toBe(
      'below',
    );
    const p = placeCard(box(300, 700, 100, 40), wide, VP)!;
    expect(p.placement).toBe('above');
    expect(p.top + 120).toBeLessThanOrEqual(700);
  });
});

describe('staying on screen', () => {
  test('a card that would run off the bottom is moved up, not resized', () => {
    const p = placeCard(box(100, 740, 80, 50), card, VP)!;
    expect(p.placement).toBe('right');
    expect(p.top).toBe(800 - 8 - 200);
  });
  test('a card near the top edge is kept below the margin', () => {
    expect(placeCard(box(100, -20, 80, 60), card, VP)!.top).toBe(8);
  });
  test('vertical placements clamp horizontally', () => {
    const wide = { width: 900, height: 100 };
    const p = placeCard(box(700, 100, 100, 40), wide, VP)!;
    expect(p.placement).toBe('below');
    expect(p.left).toBe(1000 - 8 - 900);
  });
  test('margin and gap are configurable', () => {
    const p = placeCard(box(100, 300, 80, 50), card, VP, {
      gap: 20,
      margin: 0,
    })!;
    expect(p.left).toBe(200);
  });
});

describe('nothing fits', () => {
  test('takes the roomiest side and reports the space to shrink into', () => {
    const p = placeCard(
      box(300, 300, 400, 100),
      { width: 500, height: 300 },
      { width: 1000, height: 420 },
    )!;
    // right: 1000-8-706 = 286, left: 300-6-8 = 286, below: 420-8-406 = 6, above: 300-6-8 = 286
    expect(['right', 'left', 'above']).toContain(p.placement);
    if (p.placement === 'right' || p.placement === 'left') {
      expect(p.maxWidth).toBe(286);
      expect(p.left + Math.min(500, p.maxWidth)).toBeLessThanOrEqual(
        p.placement === 'left' ? 300 : 1000,
      );
    }
    expect(p.maxHeight).toBeLessThanOrEqual(420 - 16);
  });
  test('a card taller than the viewport is limited to it', () => {
    const p = placeCard(
      box(100, 300, 80, 50),
      { width: 200, height: 5000 },
      VP,
    )!;
    expect(p.maxHeight).toBe(800 - 16);
    expect(p.top).toBe(8);
  });
  test('a viewport with no usable room gives up', () => {
    expect(
      placeCard(box(3, 3, 10, 10), card, { width: 10, height: 10 }),
    ).toBeNull();
  });
});

describe('no anchor, no card', () => {
  test.each([
    ['zero width', box(100, 100, 0, 50)],
    ['zero height', box(100, 100, 50, 0)],
    ['negative size', { left: 100, top: 100, right: 90, bottom: 90 }],
    ['entirely above', box(100, -100, 50, 50)],
    ['entirely left', box(-100, 100, 50, 50)],
    ['entirely right', box(1000, 100, 50, 50)],
    ['entirely below', box(100, 800, 50, 50)],
  ])('%s', (_n, a) => {
    expect(placeCard(a as Box, card, VP)).toBeNull();
  });
  test('partly visible anchors still get a card', () => {
    expect(placeCard(box(-30, 100, 80, 50), card, VP)).not.toBeNull();
  });
});

test('the result never overlaps the anchor and stays inside the margin (property sweep)', () => {
  for (let x = 0; x <= 900; x += 150) {
    for (let y = 0; y <= 700; y += 175) {
      for (const rtl of [false, true]) {
        const a = box(x, y, 90, 60);
        const p = placeCard(a, card, VP, { rtl });
        if (!p) continue;
        const w = Math.min(card.width, p.maxWidth);
        const h = Math.min(card.height, p.maxHeight);
        const overlapsX = p.left < a.right && p.left + w > a.left;
        const overlapsY = p.top < a.bottom && p.top + h > a.top;
        expect(overlapsX && overlapsY).toBe(false);
        expect(p.left).toBeGreaterThanOrEqual(8 - 1e-9);
        expect(p.top).toBeGreaterThanOrEqual(8 - 1e-9);
        expect(p.left + w).toBeLessThanOrEqual(1000 - 8 + 1e-9);
        expect(p.top + h).toBeLessThanOrEqual(800 - 8 + 1e-9);
      }
    }
  }
});
