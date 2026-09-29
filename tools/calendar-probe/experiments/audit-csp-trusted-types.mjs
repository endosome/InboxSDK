import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.addInitScript(() => {
  window.__t = {};
  const chk = (k) => {
    window.__t[k] = {
      xUserInfo: !!document.getElementById('xUserInfo'),
      initialdata: !!document.getElementById('initialdata'),
      readyState: document.readyState,
      htmlViewKey: document.documentElement.dataset.prefetchViewKey || null,
      main: !!document.querySelector('[role=main]'),
      chips: document.querySelectorAll('[data-eventchip]').length,
      t: Math.round(performance.now()),
    };
  };
  chk('atStart');
  document.addEventListener('DOMContentLoaded', () => chk('DOMContentLoaded'));
  addEventListener('load', () => chk('load'));
  setTimeout(() => chk('+1s'), 1000);
  setTimeout(() => chk('+2.5s'), 2500);
});
const resp = await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3500);
const h = resp.headers();
console.log(
  'CSP header:',
  (h['content-security-policy'] || '(none)').slice(0, 400),
);
console.log(
  'CSP-report-only:',
  (h['content-security-policy-report-only'] || '(none)').slice(0, 300),
);
console.log(
  'timing (main-world observations)',
  JSON.stringify(await p.evaluate(() => window.__t)),
);
const s = await ctx.newCDPSession(p);
const { frameTree } = await s.send('Page.getFrameTree');
const { executionContextId } = await s.send('Page.createIsolatedWorld', {
  frameId: frameTree.frame.id,
  worldName: 'audit-iso',
});
const ev = async (e) => {
  const r = await s.send('Runtime.evaluate', {
    contextId: executionContextId,
    expression: e,
    returnByValue: true,
    awaitPromise: true,
  });
  return r.exceptionDetails
    ? 'EXC: ' +
        (
          r.exceptionDetails.exception?.description || r.exceptionDetails.text
        ).slice(0, 160)
    : r.result.value;
};
console.log(
  'iso innerHTML on div:',
  await ev(
    `(()=>{const d=document.createElement('div');d.innerHTML='<b id=\"x\">hi</b>';document.body.appendChild(d);return !!document.getElementById('x')})()`,
  ),
);
console.log(
  'iso insertAdjacentHTML on chip:',
  await ev(
    `(()=>{const c=document.querySelector('[data-eventchip]');c.insertAdjacentHTML('beforeend','<span id=\"y\">b</span>');return !!c.querySelector('#y')})()`,
  ),
);
console.log(
  'iso <style> applies:',
  await ev(
    `(()=>{const st=document.createElement('style');st.textContent='#zz{color:rgb(1,2,3)}';document.head.appendChild(st);const d=document.createElement('div');d.id='zz';document.body.appendChild(d);return getComputedStyle(d).color})()`,
  ),
);
console.log(
  'iso inline style attr applies:',
  await ev(
    `(()=>{const d=document.createElement('div');d.setAttribute('style','color:rgb(4,5,6)');document.body.appendChild(d);return getComputedStyle(d).color})()`,
  ),
);
console.log(
  'iso typeof trustedTypes:',
  await ev(`typeof trustedTypes`),
  '| main:',
  await p.evaluate(() => typeof trustedTypes + ' policies?'),
);
console.log(
  'iso window.open/fetch to extension-like url irrelevant; iso customElements:',
  await ev(`typeof customElements`),
);
console.log(
  'iso shadow root attach:',
  await ev(
    `(()=>{const d=document.createElement('div');document.body.appendChild(d);const r=d.attachShadow({mode:'open'});r.innerHTML='<i>s</i>';return !!r.querySelector('i')})()`,
  ),
);
await p.close();
await b.close();
