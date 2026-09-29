import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const p = ctx.pages().find((x) => x.url().includes('calendar.google.com'));
const s = await ctx.newCDPSession(p);
const { frameTree } = await s.send('Page.getFrameTree');
const { executionContextId } = await s.send('Page.createIsolatedWorld', {
  frameId: frameTree.frame.id,
  worldName: 'probe-iso',
});
const ev = async (expr) =>
  (
    await s.send('Runtime.evaluate', {
      contextId: executionContextId,
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    })
  ).result.value;
console.log('isolated: typeof navigation =', await ev('typeof navigation'));
console.log(
  'isolated: globals from page (gapi/WIZ_global_data/_F_...)?',
  await ev(
    `['WIZ_global_data','gapi','_F_toggles','IJ_values','google','_jsa'].map(k=>k+':'+typeof window[k]).join(',')`,
  ),
);
await ev(
  `window.__n=[]; navigation.addEventListener('navigate',e=>window.__n.push([e.navigationType,new URL(e.destination.url).pathname]))`,
);
await p.getByRole('button', { name: /^Next week/ }).click();
await p.waitForTimeout(1200);
console.log(
  'isolated saw navigate events:',
  JSON.stringify(await ev('window.__n')),
);
console.log(
  'main-world keys of interest:',
  await p.evaluate(() =>
    [
      'WIZ_global_data',
      'gapi',
      '_F_toggles',
      'IJ_values',
      'google',
      '_jsa',
      '_F_installCss',
      '_wjdc',
      '_F_',
    ]
      .map((k) => k + ':' + typeof window[k])
      .join(','),
  ),
);
console.log(
  'WIZ_global_data keys',
  await p.evaluate(() =>
    Object.keys(window.WIZ_global_data || {})
      .slice(0, 40)
      .join(','),
  ),
);
await p.getByRole('button', { name: /^Previous week/ }).click();
await b.close();
