/**
 * Where a hover card goes. Pure geometry (no DOM), so it can be tested exhaustively —
 * jsdom has no layout, and this is the one part of the feature where off-by-one
 * mistakes would only show on a real screen.
 *
 * Rules (docs/hover-card-plan.md §4.6): beside the anchor, never over it; prefer the
 * right side (the left in RTL), then the other side, then below, then above; stay
 * inside the viewport with a margin; when nothing fits, take the side with the most
 * room and shrink the card to it.
 */
export type Box = { left: number; top: number; right: number; bottom: number };
export type Size = { width: number; height: number };
export type Placement = 'right' | 'left' | 'below' | 'above';

export type PlaceOptions = {
  /** Prefer the left side first. */
  rtl?: boolean;
  /** Minimum distance to the viewport edge. Default 8. */
  margin?: number;
  /** Distance between anchor and card. Default 6. */
  gap?: number;
};

export type Placed = {
  left: number;
  top: number;
  placement: Placement;
  /** Space the card may use: apply as CSS max-size, then measure and place again. */
  maxWidth: number;
  maxHeight: number;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export function placeCard(
  anchor: Box,
  card: Size,
  viewport: Size,
  options: PlaceOptions = {},
): Placed | null {
  const margin = options.margin ?? 8;
  const gap = options.gap ?? 6;
  const aw = anchor.right - anchor.left;
  const ah = anchor.bottom - anchor.top;
  // nothing to point at: hidden, detached or off-screen chips get no card
  if (
    !(aw > 0 && ah > 0) ||
    anchor.right <= 0 ||
    anchor.bottom <= 0 ||
    anchor.left >= viewport.width ||
    anchor.top >= viewport.height
  ) {
    return null;
  }
  const innerW = viewport.width - 2 * margin;
  const innerH = viewport.height - 2 * margin;
  if (innerW <= 0 || innerH <= 0) return null;

  const room: Record<Placement, number> = {
    right: viewport.width - margin - (anchor.right + gap),
    left: anchor.left - gap - margin,
    below: viewport.height - margin - (anchor.bottom + gap),
    above: anchor.top - gap - margin,
  };
  const order: Placement[] = options.rtl
    ? ['left', 'right', 'below', 'above']
    : ['right', 'left', 'below', 'above'];
  const needs = (p: Placement) =>
    p === 'right' || p === 'left' ? card.width : card.height;

  let placement = order.find((p) => room[p] >= needs(p));
  if (!placement) {
    // nothing fits whole: the roomiest side, card shrunk to it
    placement = order.reduce((best, p) => (room[p] > room[best] ? p : best));
    if (room[placement] <= 0) return null;
  }

  const horizontal = placement === 'right' || placement === 'left';
  const maxWidth = horizontal ? Math.max(0, room[placement]) : innerW;
  const maxHeight = horizontal ? innerH : Math.max(0, room[placement]);
  const width = Math.min(card.width, maxWidth);
  const height = Math.min(card.height, maxHeight);

  let left: number;
  let top: number;
  if (horizontal) {
    left =
      placement === 'right' ? anchor.right + gap : anchor.left - gap - width;
    top = clamp(anchor.top, margin, viewport.height - margin - height); // align tops, keep on screen
  } else {
    top =
      placement === 'below' ? anchor.bottom + gap : anchor.top - gap - height;
    left = clamp(anchor.left, margin, viewport.width - margin - width);
  }
  return { left, top, placement, maxWidth, maxHeight };
}
