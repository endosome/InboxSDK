import { CALENDAR_SELECTORS } from './selectors';
import { isValidSelector } from '../../lib/dom/mergeSelectorOverrides';

test('every bundled candidate is valid CSS in this DOM', () => {
  for (const [key, chain] of Object.entries(CALENDAR_SELECTORS)) {
    expect(chain.length).toBeGreaterThan(0);
    for (const selector of chain) {
      expect([key, selector, isValidSelector(selector)]).toEqual([
        key,
        selector,
        true,
      ]);
    }
  }
});

test('chains are ordered lists, never comma-joined selectors', () => {
  for (const chain of Object.values(CALENDAR_SELECTORS)) {
    for (const selector of chain) {
      // a top-level comma would defeat the ranking (`querySelector('a, b')`)
      expect(selector.replace(/\[[^\]]*\]/g, '')).not.toMatch(/,/);
    }
  }
});
