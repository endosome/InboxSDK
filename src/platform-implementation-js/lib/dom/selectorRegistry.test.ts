import SelectorRegistry from './selectorRegistry';

/**
 * Synthetic table. Order matters: the `strict` rung matches a subset of the
 * loose one, so it must come first.
 */
const TABLE = {
  'widget.titleTable': ['.root table.tbl.strict', '.root table.tbl'],
  'widget.titleCell': [
    '.root table.tbl.strict td.cell',
    '.root table.tbl td.cell',
  ],
} as const;
type Key = keyof typeof TABLE;

/** A widget root whose table carries the `strict` token, or not. */
function widgetRoot(withStrict: boolean): HTMLElement {
  const root = document.createElement('div');
  root.className = 'root';
  root.innerHTML = `
    <table class="tbl${withStrict ? ' strict' : ''}">
      <tbody><tr><td class="cell"></td></tr></tbody>
    </table>`;
  return root;
}

test('a mistyped key is rejected at compile time', () => {
  // @ts-expect-error — 'THIS_SELECTOR_DOES_NOT_EXIST' is not a key in TABLE
  const mistyped: Key = 'widget.THIS_SELECTOR_DOES_NOT_EXIST';

  expect(mistyped in TABLE).toBe(false);
});

// No overrides is what most users run.
describe('with no config loaded', () => {
  test('a key resolves through the bundled chain', () => {
    const registry = new SelectorRegistry(TABLE);
    const root = widgetRoot(true);

    expect(registry.querySelectorByKey(root, 'widget.titleTable')).toBe(
      root.querySelector('table'),
    );
    expect(registry.querySelectorByKey(root, 'widget.titleCell')).toBe(
      root.querySelector('td'),
    );
  });

  test('a later rung catches what the first one misses', () => {
    const registry = new SelectorRegistry(TABLE);
    const root = widgetRoot(false);

    expect(registry.querySelectorByKey(root, 'widget.titleTable')).toBe(
      root.querySelector('table'),
    );
  });

  test('querySelectorAllByKey returns every match of the first rung that hits', () => {
    const registry = new SelectorRegistry(TABLE);
    const root = document.createElement('div');
    root.append(widgetRoot(true), widgetRoot(true), widgetRoot(false));

    // Both `strict` tables come from the first rung; the `strict`-less one is left out.
    expect(registry.querySelectorAllByKey(root, 'widget.titleTable')).toEqual(
      Array.from(root.querySelectorAll('table.strict')),
    );
    expect(
      registry.querySelectorAllByKey(root, 'widget.titleCell'),
    ).toHaveLength(2);
    expect(
      registry.querySelectorAllByKey(
        document.createElement('div'),
        'widget.titleTable',
      ),
    ).toEqual([]);
  });

  test('candidates are tried in LIST order, not document order', () => {
    const registry = new SelectorRegistry(TABLE);
    const root = document.createElement('div');
    root.append(widgetRoot(false), widgetRoot(true));

    // The `strict`-less table comes first in the document, but its rung is second.
    expect(registry.querySelectorByKey(root, 'widget.titleTable')).toBe(
      root.querySelectorAll('table')[1],
    );
  });

  test('a total miss is null, or a throw naming the key', () => {
    const registry = new SelectorRegistry(TABLE);
    const empty = document.createElement('div');

    expect(registry.querySelectorByKey(empty, 'widget.titleTable')).toBe(null);
    expect(() =>
      registry.querySelectorByKeyOrFail(empty, 'widget.titleTable'),
    ).toThrow('widget.titleTable');
  });
});

describe('with a config loaded', () => {
  test('an empty config is indistinguishable from no config', () => {
    const registry = new SelectorRegistry(TABLE, { overrides: {} });
    const root = widgetRoot(true);

    expect(registry.querySelectorByKey(root, 'widget.titleTable')).toBe(
      root.querySelector('table'),
    );
  });

  test('an override repairs a key the bundled chain can no longer find', () => {
    const root = document.createElement('div');
    root.innerHTML = '<table class="brand-new"></table>';

    expect(
      new SelectorRegistry(TABLE).querySelectorByKey(root, 'widget.titleTable'),
    ).toBe(null);

    const registry = new SelectorRegistry(TABLE, {
      overrides: { 'widget.titleTable': ['table.brand-new'] },
    });

    expect(registry.querySelectorByKey(root, 'widget.titleTable')).toBe(
      root.querySelector('table'),
    );
  });

  test('an override that matches nothing cannot break the bundled chain', () => {
    const registry = new SelectorRegistry(TABLE, {
      overrides: { 'widget.titleTable': ['table.matches-nothing'] },
    });
    const root = widgetRoot(true);

    expect(registry.querySelectorByKey(root, 'widget.titleTable')).toBe(
      root.querySelector('table'),
    );
  });

  test('an unparseable override is dropped, reported, and inert', () => {
    const onInvalidSelector = jest.fn();
    const registry = new SelectorRegistry(TABLE, {
      overrides: { 'widget.titleTable': ['table['] },
      onInvalidSelector,
    });
    const root = widgetRoot(true);

    expect(onInvalidSelector).toHaveBeenCalledWith(
      'widget.titleTable',
      'table[',
    );
    expect(registry.querySelectorByKey(root, 'widget.titleTable')).toBe(
      root.querySelector('table'),
    );
  });

  test('a key from a newer config is a no-op', () => {
    const registry = new SelectorRegistry(TABLE, {
      overrides: { 'widget.fromTheFuture': ['.x'] } as never,
    });
    const root = widgetRoot(true);

    expect(registry.querySelectorByKey(root, 'widget.titleTable')).toBe(
      root.querySelector('table'),
    );
  });

  test('one registry cannot see another registry config', () => {
    const root = document.createElement('div');
    root.innerHTML = '<table class="brand-new"></table>';

    const withOverrides = new SelectorRegistry(TABLE, {
      overrides: { 'widget.titleTable': ['table.brand-new'] },
    });
    const withoutOverrides = new SelectorRegistry(TABLE);

    expect(withOverrides.querySelectorByKey(root, 'widget.titleTable')).toBe(
      root.querySelector('table'),
    );
    expect(withoutOverrides.querySelectorByKey(root, 'widget.titleTable')).toBe(
      null,
    );
  });
});
