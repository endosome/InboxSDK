import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });
p.on('console', (m) => {
  if (m.text().startsWith('AUDIT')) console.log(m.text());
});
await p.addInitScript(() => {
  const chk = (k) =>
    console.log(
      'AUDIT ' +
        k +
        ' ' +
        JSON.stringify({
          rs: document.readyState,
          xUserInfo: !!document.getElementById('xUserInfo'),
          initialdata: !!document.getElementById('initialdata'),
          viewKey: document.documentElement.dataset.prefetchViewKey || null,
          main: !!document.querySelector('[role=main]'),
          chips: document.querySelectorAll('[data-eventchip]').length,
          t: Math.round(performance.now()),
        }),
    );
  chk('start');
  document.addEventListener('DOMContentLoaded', () => chk('DOMContentLoaded'));
  addEventListener('load', () => chk('load'));
  setTimeout(() => chk('+1s'), 1000);
  setTimeout(() => chk('+2.5s'), 2500);
});
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3500);
const s = await ctx.newCDPSession(p);
const { frameTree } = await s.send('Page.getFrameTree');
const { executionContextId } = await s.send('Page.createIsolatedWorld', {
  frameId: frameTree.frame.id,
  worldName: 'audit-iso2',
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
        (r.exceptionDetails.exception?.description || r.exceptionDetails.text)
          .split('\n')[0]
          .slice(0, 140)
    : r.result.value;
};
console.log(
  'TT createPolicy(calsdk):',
  await ev(
    `(()=>{const pol=trustedTypes.createPolicy('calsdk-audit',{createHTML:s=>s});const d=document.createElement('div');d.innerHTML=pol.createHTML('<b id=\"tt1\">ok</b>');document.body.appendChild(d);return !!document.getElementById('tt1')})()`,
  ),
);
console.log(
  'TT policy names allowed (second policy, other name):',
  await ev(
    `(()=>{try{trustedTypes.createPolicy('another-name',{createHTML:s=>s});return 'ok'}catch(e){return 'blocked: '+e.message.slice(0,80)}})()`,
  ),
);
console.log(
  'DOM-API build (createElement+textContent+setAttribute):',
  await ev(
    `(()=>{const c=document.querySelector('[data-eventchip]');const s=document.createElement('span');s.textContent='B';s.setAttribute('data-calsdk','1');s.style.color='red';c.appendChild(s);return getComputedStyle(s).color})()`,
  ),
);
console.log(
  'DOMParser/template parse:',
  await ev(
    `(()=>{try{const t=document.createElement('template');t.innerHTML='<i>x</i>';return 'template ok'}catch(e){return 'blocked: '+e.message.slice(0,60)}})()`,
  ),
);
console.log(
  'SVG via createElementNS:',
  await ev(
    `(()=>{const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('width','10');document.body.appendChild(s);return s.getBoundingClientRect().width})()`,
  ),
);
console.log(
  'img/icon load from data: url:',
  await ev(
    `new Promise(r=>{const i=new Image();i.onload=()=>r('data: image loaded');i.onerror=()=>r('data: image blocked');i.src='data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';document.body.appendChild(i);setTimeout(()=>r('timeout'),3000)})`,
  ),
);
await p.close();
await b.close();
