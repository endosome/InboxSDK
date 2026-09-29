/**
 * Smoke test for the CalendarSDK plan (docs/calendar-sdk-plan.md §12 Phase 2,
 * first task). Runs as a REAL MV3 content script (isolated world) and writes
 * its findings, as JSON, to `<html data-calsdk-smoke>` so a driver
 * (tools/calendar-probe/experiments/extension-smoke.mjs) can read them.
 * Deliberately independent of the SDK: it checks the assumptions the SDK is
 * built on.
 */
type Json = Record<string, unknown>;
const results: Json = { startedAt: Date.now() };
const navEvents: Array<[string, string]> = [];
const bodyAttrChanges: Array<[string, string | null]> = [];
const markerLog: string[] = [];

function publish() {
  results.navEvents = navEvents.slice(-20);
  results.bodyAttrChanges = bodyAttrChanges.slice(-20);
  results.markerLog = markerLog.slice(-20);
  results.now = Date.now();
  document.documentElement.setAttribute(
    'data-calsdk-smoke',
    JSON.stringify(results),
  );
}

function attempt<T>(
  fn: () => T,
): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return {
      ok: false,
      error: String((e as Error)?.message ?? e).slice(0, 120),
    };
  }
}

// --- world / globals -------------------------------------------------------
results.world = {
  chromeRuntime: typeof (globalThis as any).chrome?.runtime?.getURL,
  extensionId: (globalThis as any).chrome?.runtime?.id ?? null,
  pageGlobalsVisible: [
    'WIZ_global_data',
    'gapi',
    'google',
    '_F_toggles',
  ].filter((k) => typeof (globalThis as any)[k] !== 'undefined'),
  navigationApi: typeof (globalThis as any).navigation,
  trustedTypes: typeof (globalThis as any).trustedTypes,
};

// --- routing: Navigation API + body attributes -------------------------------
const nav = (globalThis as any).navigation;
nav?.addEventListener?.('navigate', (e: any) => {
  navEvents.push([e.navigationType, new URL(e.destination.url).pathname]);
  publish();
});
new MutationObserver((ms) => {
  for (const m of ms) {
    if (m.type === 'attributes' && m.attributeName) {
      bodyAttrChanges.push([
        m.attributeName,
        document.body.getAttribute(m.attributeName),
      ]);
    }
  }
  publish();
}).observe(document.body, {
  attributes: true,
  attributeFilter: ['data-viewkey', 'data-viewfamily'],
});

// --- user info --------------------------------------------------------------
function readUser() {
  const text = (id: string) => document.getElementById(id)?.textContent ?? null;
  results.user = {
    hasEmail: !!text('xUserEmail')?.includes('@'),
    timezone: text('xTimezone'),
    gmtOffset: text('xGmtOffset'),
    locale: text('xUserLocale'),
  };
  results.route = {
    viewkey: document.body.dataset.viewkey ?? null,
    viewfamily: document.body.dataset.viewfamily ?? null,
    htmlPrefetchKey: document.documentElement.dataset.prefetchViewKey ?? null,
    path: location.pathname,
  };
}

// --- Trusted Types / injection ---------------------------------------------
function injectionChecks() {
  const tt: Json = {};
  const probe = document.createElement('div');
  tt.innerHTMLPlain = attempt(() => {
    probe.innerHTML = '<b>x</b>';
    return true;
  });
  tt.insertAdjacentHTMLPlain = attempt(() => {
    probe.insertAdjacentHTML('beforeend', '<i></i>');
    return true;
  });
  tt.createPolicy = attempt(() => {
    const policy = (globalThis as any).trustedTypes.createPolicy(
      'calsdk-smoke',
      { createHTML: (s: string) => s },
    );
    const el = document.createElement('div');
    el.innerHTML = policy.createHTML('<b id="calsdk-tt">ok</b>');
    return !!el.querySelector('#calsdk-tt');
  });
  tt.styleElement = attempt(() => {
    const st = document.createElement('style');
    st.textContent = '#calsdk-style-probe{color:rgb(1,2,3)}';
    document.head.appendChild(st);
    const d = document.createElement('div');
    d.id = 'calsdk-style-probe';
    document.body.appendChild(d);
    const color = getComputedStyle(d).color;
    d.remove();
    st.remove();
    return color;
  });
  // Same sinks on a live, attached page element (a chip) — not just a detached div.
  const chip = document.querySelector('[data-eventchip]');
  tt.innerHTMLOnChip = attempt(() => {
    if (!chip) throw new Error('no chip yet');
    const host = document.createElement('span');
    host.setAttribute('data-calsdk-html-probe', '1');
    chip.appendChild(host);
    host.innerHTML = '<b id="calsdk-html-probe">x</b>';
    const ok = !!document.getElementById('calsdk-html-probe');
    host.remove();
    return ok;
  });
  tt.insertAdjacentHTMLOnBody = attempt(() => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<i id="calsdk-adj-probe"></i>',
    );
    const ok = !!document.getElementById('calsdk-adj-probe');
    document.getElementById('calsdk-adj-probe')?.remove();
    return ok;
  });
  results.trustedTypes = tt;

  // extension-URL image under the page CSP
  const url = (globalThis as any).chrome?.runtime?.getURL('icon.png');
  const img = new Image();
  img.onload = () => {
    results.extensionImage = { loaded: true, width: img.naturalWidth };
    publish();
  };
  img.onerror = () => {
    results.extensionImage = { loaded: false };
    publish();
  };
  img.src = url;
}

// --- chip marker (survival) ---------------------------------------------------
let marked = false;
function markFirstChip() {
  const chip = document.querySelector('[data-eventchip]');
  if (!chip || marked) return;
  marked = true;
  const marker = document.createElement('span');
  marker.setAttribute('data-calsdk-marker', '1');
  marker.textContent = '•';
  chip.appendChild(marker);
  markerLog.push(`inserted@${Date.now() - (results.startedAt as number)}`);
  new MutationObserver(() => {
    if (!marker.isConnected && !markerLog.includes('removed')) {
      markerLog.push('removed');
      publish();
    }
  }).observe(document.body, { childList: true, subtree: true });
  results.chipsAtMark = document.querySelectorAll('[data-eventchip]').length;
}

// --- chip appearance timing -----------------------------------------------------
new MutationObserver(() => {
  if (
    results.firstChipMs === undefined &&
    document.querySelector('[data-eventchip]')
  ) {
    results.firstChipMs = Date.now() - (results.startedAt as number);
    markFirstChip();
  }
  results.chips = document.querySelectorAll('[data-eventchip]').length;
  results.popoverPresent = !!document.querySelector(
    '[role=dialog][data-chips-dialog][data-allow-wheel-scroll=false]',
  );
  publish();
}).observe(document.body, { childList: true, subtree: true });

readUser();
injectionChecks();
// chips are not there at document_idle: repeat the on-chip probe when the first chip appears
new MutationObserver((_ms, obs) => {
  if (document.querySelector('[data-eventchip]')) {
    obs.disconnect();
    injectionChecks();
  }
}).observe(document.body, { childList: true, subtree: true });
setInterval(() => {
  readUser();
  publish();
}, 500);
publish();
