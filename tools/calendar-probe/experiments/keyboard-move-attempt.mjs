import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3500);
for (const n of ['Dismiss', 'Got it'])
  await p
    .getByRole('button', { name: n })
    .click({ timeout: 1000 })
    .catch(() => {});
await p.evaluate(() => {
  window.__m = [];
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type == 'attributes') window.__m.push(m.attributeName);
      else
        window.__m.push(
          'c' + m.addedNodes.length + '/' + m.removedNodes.length,
        );
    }
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-eventid', 'aria-label'],
  });
});
const state = () =>
  p.evaluate(() => {
    const c = [...document.querySelectorAll('[data-eventchip]')].find((x) =>
      /Timed A/.test(x.innerText),
    );
    const a = document.activeElement;
    return {
      label: c ? c.innerText.split('\n')[0].slice(0, 24) : null,
      path: location.pathname,
      dialogs: [...document.querySelectorAll('[role=dialog]')].map((d) =>
        d.innerText.slice(0, 30).replace(/\n/g, '|'),
      ),
      focusIsChip: !!a?.matches?.('[data-eventchip]'),
      focusText: (a?.innerText || '').slice(0, 20).replace(/\n/g, '|'),
      mut: window.__m.splice(0).length,
    };
  });
async function focusChip() {
  await p.evaluate(() => {
    const c = [...document.querySelectorAll('[data-eventchip]')].find((x) =>
      /Timed A/.test(x.innerText),
    );
    c.focus();
  });
  await p.waitForTimeout(300);
}
console.log('baseline', JSON.stringify(await state()));
const combos = [
  'ArrowDown',
  'ArrowUp',
  'ArrowRight',
  'ArrowLeft',
  'Shift+ArrowDown',
  'Shift+ArrowRight',
  'Alt+ArrowDown',
  'Alt+ArrowRight',
  'Control+ArrowDown',
  'Control+ArrowRight',
  'Control+Shift+ArrowDown',
  'Alt+Shift+ArrowDown',
  'Space',
  'Space+ArrowDown',
  'm',
  'g',
];
for (const k of combos) {
  await focusChip();
  const parts = k.split('+');
  if (k === 'Space+ArrowDown') {
    await p.keyboard.press('Space');
    await p.waitForTimeout(200);
    await p.keyboard.press('ArrowDown');
    await p.waitForTimeout(200);
    await p.keyboard.press('Enter');
  } else await p.keyboard.press(k);
  await p.waitForTimeout(700);
  const st = await state();
  console.log(k.padEnd(24), JSON.stringify(st));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  if (st.path !== '/calendar/u/0/r/week/2026/9/30') {
    await p.goto(
      'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
      { waitUntil: 'load' },
    );
    await p.waitForTimeout(2500);
  }
}
console.log('final', JSON.stringify(await state()));
await p.close();
await b.close();
