import mergeSelectorOverrides, {
  type InvalidSelectorReporter,
} from './mergeSelectorOverrides';
import { SelectorError } from './querySelectorOrFail';

/** An ORDERED candidate list per key; the first rung that matches wins. */
export type SelectorCandidates<K extends string = string> = Record<
  K,
  readonly string[]
>;

export type SelectorRegistryOptions<K extends string = string> = {
  /** Additional selector candidates to PREPEND to the SDK bundled defaults. */
  overrides?: Partial<Record<K, readonly string[]>>;
  /** Fires for each override candidate dropped as invalid CSS in THIS browser. */
  onInvalidSelector?: InvalidSelectorReporter;
};

/**
 * Install overrides into the bundled defaults, filtering out invalid
 * selectors. If there are any errors merging the overrides, we fallback
 * to the SDK bundled defaults.
 */
function mergeOrFallBack<K extends string>(
  defaults: SelectorCandidates<K>,
  { overrides, onInvalidSelector }: SelectorRegistryOptions<K>,
): SelectorCandidates<K> {
  if (!overrides) {
    return defaults;
  }

  try {
    return mergeSelectorOverrides(defaults, overrides, onInvalidSelector);
  } catch {
    return defaults;
  }
}

/**
 * Resolves named keys to elements, trying each of the key's candidates in
 * order. Owned by the driver, so each SDK instance resolves against its own
 * candidates and a registry is never read before it is built.
 */
export default class SelectorRegistry<K extends string = string> {
  readonly #candidates: SelectorCandidates<K>;

  constructor(
    defaults: SelectorCandidates<K>,
    options: SelectorRegistryOptions<K> = {},
  ) {
    this.#candidates = mergeOrFallBack(defaults, options);
  }

  /**
   * Resolve a registry key against `el`, returning null on a miss. Use this
   * method if you want to degrade functionality when a selector is missing,
   * instead of throwing an error.
   */
  querySelectorByKey(
    el: Document | DocumentFragment | Element,
    key: K,
  ): HTMLElement | null {
    // Try each candidate in order, returning the first match (null otherwise).
    for (const candidateSelector of this.#candidates[key]) {
      const found = el.querySelector<HTMLElement>(candidateSelector);
      if (found) {
        return found;
      }
    }

    return null;
  }

  /**
   * Every match of the first candidate that matches, not of every candidate.
   */
  querySelectorAllByKey(
    el: Document | DocumentFragment | Element,
    key: K,
  ): HTMLElement[] {
    for (const candidateSelector of this.#candidates[key]) {
      const found = el.querySelectorAll<HTMLElement>(candidateSelector);
      if (found.length > 0) {
        return Array.from(found);
      }
    }

    return [];
  }

  /**
   * Resolve a registry key against `el`, but throws if no candidate matches.
   */
  querySelectorByKeyOrFail(
    el: Document | DocumentFragment | Element,
    key: K,
  ): HTMLElement {
    const found = this.querySelectorByKey(el, key);
    if (!found) {
      throw new SelectorError(`${key} (${this.#candidates[key].join(' || ')})`);
    }
    return found;
  }
}
