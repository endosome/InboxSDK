import CalendarSDK from '@calendarsdk/core';

/** Publishes the live event views as JSON so a driver can compare them with the DOM. */
CalendarSDK.load(1, { appId: 'calendar-events' }).then((sdk) => {
  const views = new Map<object, ReturnType<typeof snapshotOf>>();
  let created = 0;
  let destroyed = 0;
  let scheduled = false;

  function snapshotOf(view: import('@calendarsdk/core').EventView) {
    const ref = view.getEventRef();
    return {
      eventId: ref.eventId,
      instanceId: ref.instanceId ?? null,
      kind: ref.kind,
      calendarIdHint: ref.calendarIdHint,
      rawId: ref.rawId,
      allDay: view.isAllDay(),
      segment: view.getSegment(),
    };
  }

  function publish() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      document.documentElement.setAttribute(
        'data-calsdk-events',
        JSON.stringify({
          created,
          destroyed,
          route: sdk.Router.getCurrentRouteView().getType(),
          // segment/allDay are recomputed on every read, as an app would
          live: [...views.keys()].map((v) => snapshotOf(v as never)),
        }),
      );
    });
  }

  sdk.Events.registerEventViewHandler(
    (view) => {
      created++;
      views.set(view, snapshotOf(view));
      view.on('destroy', () => {
        destroyed++;
        views.delete(view);
        publish();
      });
      publish();
    },
    { kinds: ['event', 'task', 'birthday'] },
  );
  sdk.Router.registerRouteViewHandler(() => publish());
  publish();
});
