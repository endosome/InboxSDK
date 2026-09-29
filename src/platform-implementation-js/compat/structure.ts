/**
 * Structural fingerprints: the shape of an element's subtree (tag names and
 * attribute NAMES, no values, no text), so a Calendar redesign shows up as a
 * changed hash while ordinary content changes do not — and nothing user-owned
 * ends up in a report or baseline.
 */

/** Attributes whose presence varies with state, not with structure. */
const VOLATILE_ATTRS = new Set([
  'class',
  'style',
  'id',
  'tabindex',
  'title',
  'draggable',
  'data-eventid',
  'data-tooltip-id',
  'data-tooltip-enabled',
  'aria-expanded',
  'aria-hidden',
  'aria-selected',
  'aria-pressed',
  'aria-checked',
  'aria-describedby',
  'aria-labelledby',
  'aria-controls',
  'aria-owns',
  'aria-activedescendant',
]);

function describe(el: Element, depth: number): string {
  const attrs = [...el.attributes]
    .map((a) => a.name)
    .filter((n) => !VOLATILE_ATTRS.has(n) && !n.startsWith('data-idom'))
    .sort();
  const head = `${el.tagName.toLowerCase()}[${attrs.join(',')}]`;
  if (depth <= 0 || el.children.length === 0) return head;
  const kids: string[] = [];
  for (const child of el.children) {
    const d = describe(child, depth - 1);
    // a repeated identical sibling (list rows, chips) counts once
    if (kids[kids.length - 1] !== d) kids.push(d);
  }
  return `${head}(${kids.join(' ')})`;
}

/** FNV-1a, 32 bit, as 8 hex digits. */
export function hashString(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function structureHash(el: Element, depth: number): string {
  return hashString(describe(el, depth));
}
