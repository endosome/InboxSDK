import CalendarSDK from '@calendarsdk/core';

/**
 * Logs every route and navigates with `Router.goto` when the page asks: put a
 * JSON target in `document.documentElement.dataset.calsdkGoto` and dispatch a
 * `calsdk-goto` event on `document` (a DOM attribute crosses the extension /
 * page boundary, event details do not).
 */
CalendarSDK.load(1, { appId: 'calendar-goto' }).then((sdk) => {
  sdk.Router.registerRouteViewHandler((route) => {
    console.log(
      'CalendarSDK route',
      route.getType(),
      route.getAnchorDate() ?? '-',
      route.getEventRef()?.eventId ?? '-',
    );
  });
  document.addEventListener('calsdk-goto', () => {
    const target = JSON.parse(document.documentElement.dataset.calsdkGoto!);
    sdk.Router.goto(target).then(
      () => console.log('CalendarSDK goto ok'),
      (err) => console.log('CalendarSDK goto error', String(err.message)),
    );
  });
});
