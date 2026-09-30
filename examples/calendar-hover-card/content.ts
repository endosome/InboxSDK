import CalendarSDK from '@calendarsdk/core';

/**
 * A hover card on every event: a plain one, and an interactive one (with a button) for recurring
 * instances. Logs so a driver can follow the lifecycle.
 */
CalendarSDK.load(1, { appId: 'calendar-hover-card' }).then((sdk) => {
  sdk.Events.registerEventViewHandler(
    (eventView) => {
      const ref = eventView.getEventRef();

      eventView.addHoverCard({
        label: 'Event summary',
        render: (container, view, { signal }) => {
          console.log('CalendarSDK hover render', ref.eventId);
          signal.addEventListener('abort', () => {
            console.log('CalendarSDK hover abort', ref.eventId);
          });
          const title = document.createElement('strong');
          title.textContent = `${ref.kind}: ${ref.eventId.slice(0, 8)}`;
          const line = document.createElement('div');
          line.textContent = view.isAllDay() ? 'all day' : 'timed';
          container.append(title, line);
          return () => console.log('CalendarSDK hover cleanup', ref.eventId);
        },
      });

      if (ref.instanceId) {
        eventView.addHoverCard({
          interactive: true,
          delayMs: 200,
          label: 'Recurring event actions',
          render: (container) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Open in CRM';
            button.addEventListener('click', () => {
              console.log('CalendarSDK hover click', ref.eventId);
            });
            container.append(button);
          },
        });
      }
    },
    { kinds: ['event', 'task', 'birthday'] },
  );
});
