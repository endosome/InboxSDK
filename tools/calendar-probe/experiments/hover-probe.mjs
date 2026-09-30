// EXPERIMENTAL — read-only probe for the hover-card design (docs/hover-card-plan.md §2): what does Calendar do when a
// chip is hovered, which pointer events reach a document-level capture listener, what clips a card placed inside a chip,
// where does a body-level fixed layer paint relative to the grid and to popovers, and what does a drag change.
// Uses one week-view page; the drag at the end returns to its start point (the fixture is left unchanged, but check
// `seed.mjs --check` and the "Timed A" time afterwards). No extension needed.
import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1300, height: 900 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(5000);
const chip = p
  .locator('[role=main] [data-eventchip]')
  .filter({ hasText: 'Timed A' })
  .first();
await chip.scrollIntoViewIfNeeded();
// 1. what does Calendar itself do on hover? record mutations + tooltips + title attrs
await p.evaluate(() => {
  window.__mut = [];
  new MutationObserver((rs) =>
    rs.forEach((r) =>
      window.__mut.push({
        t: r.type,
        target:
          (r.target.tagName || '') +
          '.' +
          (r.target.getAttribute?.('role') || ''),
        added: [...r.addedNodes].map((n) =>
          n.nodeType === 1
            ? n.tagName + '[' + (n.getAttribute('role') || '') + ']'
            : '#text',
        ),
        attr: r.attributeName,
      }),
    ),
  ).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'class',
      'aria-describedby',
      'title',
      'data-tooltip-id',
      'role',
    ],
  });
});
const before = await p.evaluate(() => ({
  tooltips: document.querySelectorAll('[role=tooltip]').length,
}));
await chip.hover();
await p.waitForTimeout(1800);
const after = await p.evaluate((sel) => {
  const c = [...document.querySelectorAll('[role=main] [data-eventchip]')].find(
    (x) => /Timed A/.test(x.innerText),
  );
  const tips = [
    ...document.querySelectorAll('[role=tooltip],[data-tooltip-id]'),
  ]
    .filter((e) => e.getBoundingClientRect().width > 0)
    .map((e) => ({
      tag: e.tagName,
      role: e.getAttribute('role'),
      text: (e.innerText || '').slice(0, 20),
    }));
  const cs = getComputedStyle(c);
  return {
    chipTitleAttr: c.getAttribute('title'),
    chipAria: !!c.getAttribute('aria-label'),
    pointerEvents: cs.pointerEvents,
    cursor: cs.cursor,
    tooltipsVisible: tips,
    mut: window.__mut
      .filter((m) => !/calsdk/.test(JSON.stringify(m)))
      .slice(0, 12),
    mutCount: window.__mut.length,
  };
});
console.log('hover(native):', JSON.stringify({ before, after }, null, 1));
// 2. events delivered: pointerenter/mouseover/mouseenter on chip from a document capture listener
const ev = await p.evaluate(
  () =>
    new Promise((res) => {
      const seen = [];
      const c = [
        ...document.querySelectorAll('[role=main] [data-eventchip]'),
      ].find((x) => /Timed A/.test(x.innerText));
      for (const t of [
        'pointerover',
        'pointerenter',
        'mouseover',
        'mouseenter',
        'pointermove',
        'pointerleave',
        'mouseleave',
        'mouseout',
      ]) {
        document.addEventListener(
          t,
          (e) => {
            if (c.contains(e.target) || e.target === c) seen.push(t);
          },
          true,
        );
      }
      window.__seen = seen;
      res(true);
    }),
);
await p.mouse.move(5, 300);
await p.waitForTimeout(300);
await chip.hover();
await p.waitForTimeout(400);
await p.mouse.move(5, 300);
await p.waitForTimeout(300);
console.log(
  'events on chip (capture at document):',
  JSON.stringify([...new Set(await p.evaluate(() => window.__seen))]),
);
// 3. stacking: what is on top at a chip's point vs overlay host, scroll container
const geo = await p.evaluate(() => {
  const c = [...document.querySelectorAll('[role=main] [data-eventchip]')].find(
    (x) => /Timed A/.test(x.innerText),
  );
  const r = c.getBoundingClientRect();
  const chain = [];
  for (let e = c.parentElement; e && e !== document.body; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (
      /(auto|scroll|hidden)/.test(s.overflowY + s.overflowX) ||
      s.transform !== 'none' ||
      s.position === 'fixed'
    )
      chain.push({
        tag: e.tagName,
        cls: (e.className || '').toString().slice(0, 20),
        ovf: s.overflowY + '/' + s.overflowX,
        tf: s.transform !== 'none',
        pos: s.position,
        z: s.zIndex,
      });
  }
  const host = document.getElementById('yDmH0d');
  return {
    rect: [
      Math.round(r.x),
      Math.round(r.y),
      Math.round(r.width),
      Math.round(r.height),
    ],
    ancestorsWithClipOrTransform: chain.slice(0, 6),
    overlayHost: host && {
      z: getComputedStyle(host).zIndex,
      pos: getComputedStyle(host).position,
      children: host.children.length,
    },
    bodyPos: getComputedStyle(document.body).position,
    bodyOverflow: getComputedStyle(document.body).overflow,
    scrollY: window.scrollY,
  };
});
console.log('geometry:', JSON.stringify(geo));
// 4. body-level fixed layer: does it paint above the grid and below/above popovers, and does Calendar strip a foreign body child?
const stack = await p.evaluate(async () => {
  const d = document.createElement('div');
  d.id = 'probe-layer';
  d.style.cssText =
    'position:fixed;left:300px;top:300px;width:60px;height:40px;background:red;z-index:' +
    (window.__z || 1000);
  document.body.appendChild(d);
  await new Promise((r) => setTimeout(r, 1500));
  const r = d.getBoundingClientRect();
  const top = document.elementFromPoint(r.x + 5, r.y + 5);
  const survived =
    document.getElementById('probe-layer') === d && d.isConnected;
  d.remove();
  return { onTopOfGrid: top === d, survivedReRender: survived };
});
console.log('body-level layer:', JSON.stringify(stack));
// 5. popover open: z-index of dialog vs a z=1000 layer
await chip.click();
await p.waitForTimeout(1400);
const pop = await p.evaluate(() => {
  const dlg = document.querySelector('[role=dialog][data-chips-dialog]');
  let e = dlg,
    z = [];
  for (; e && e !== document.body; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (s.zIndex !== 'auto') z.push(s.zIndex + '@' + s.position);
  }
  return {
    dialogZChain: z,
    rect:
      dlg &&
      Object.values(dlg.getBoundingClientRect().toJSON())
        .slice(0, 4)
        .map(Math.round),
  };
});
console.log('popover stacking:', JSON.stringify(pop));
await p.keyboard.press('Escape');
// 6. drag start: does pointerdown+move on a chip change anything we could detect (ghost)? just report ghost presence during a small move
await chip.hover();
const box = await chip.boundingBox();
await p.mouse.down();
await p.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, {
  steps: 6,
});
await p.waitForTimeout(300);
console.log(
  'during drag:',
  JSON.stringify(
    await p.evaluate(() => ({
      chipsWithId: document.querySelectorAll('[data-eventchip]').length,
      ghostOutsideMain: [
        ...document.querySelectorAll('[data-eventchip]'),
      ].filter((c) => !c.closest('[role=main]')).length,
    })),
  ),
);
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
await p.mouse.up();
await p.waitForTimeout(600);
await p.keyboard.press('Escape');
await p.close();
await b.close();
