import CalendarSDK from '@calendarsdk/core';

/**
 * Puts a badge on every event: `CRM` with the extension icon for recurring
 * instances, `CRM` for the rest. Clicking a badge logs the event and does not
 * open Calendar's popover.
 */
CalendarSDK.load(1, { appId: 'calendar-badges' }).then((sdk) => {
  const iconUrl = (globalThis as any).chrome.runtime.getURL('icon.png');

  sdk.Events.registerEventViewHandler((eventView) => {
    const ref = eventView.getEventRef();
    eventView.addBadge({
      text: 'CRM',
      ...(ref.instanceId && { iconUrl }),
      title: `Open ${ref.eventId} in CRM`,
      onClick: (view) => {
        console.log('CalendarSDK badge click', view.getEventRef().eventId);
      },
    });
  });
});
