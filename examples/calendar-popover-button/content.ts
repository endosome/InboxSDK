import CalendarSDK from '@calendarsdk/core';

/**
 * Adds an "Open in CRM" button to the popover of every event, task and
 * birthday. Clicking it logs the event; the popover stays open.
 */
CalendarSDK.load(1, { appId: 'calendar-popover-button' }).then((sdk) => {
  const iconUrl = (globalThis as any).chrome.runtime.getURL('icon.png');

  sdk.Events.registerEventPopoverHandler(
    (popover) => {
      const ref = popover.getEventRef();
      console.log(
        'CalendarSDK popover open',
        ref.kind,
        ref.eventId,
        ref.instanceId ?? '-',
      );
      popover.on('destroy', () => {
        console.log('CalendarSDK popover closed', ref.eventId);
      });
      popover.addButton({
        title: 'Open in CRM',
        iconUrl,
        onClick: (view) => {
          const r = view.getEventRef();
          console.log(
            'CalendarSDK popover click',
            r.kind,
            r.eventId,
            r.instanceId ?? '-',
          );
        },
      });
    },
    { kinds: ['event', 'task', 'birthday'] },
  );
});
