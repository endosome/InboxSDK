import CalendarSDK from '@calendarsdk/core';

/** Logs the event editor: which item, title changes, Save clicks and when it goes away. */
CalendarSDK.load(1, { appId: 'calendar-editor' }).then((sdk) => {
  sdk.Events.registerEventEditorHandler((editor) => {
    const ref = editor.getEventRef();
    console.log(
      'CalendarSDK editor open',
      ref ? `${ref.kind} ${ref.eventId} ${ref.instanceId ?? '-'}` : 'new',
    );
    // the calendar id of the edited event is learned from grid chips: known after in-app navigation
    console.log(
      'CalendarSDK editor ref',
      ref
        ? `${ref.confidence} ${
            ref.calendarId ? 'calendar-known' : 'calendar-null'
          }`
        : 'new',
    );
    editor.on('titleChange', (title) => {
      console.log('CalendarSDK editor title', title);
    });
    editor.on('saveClicked', () => {
      console.log('CalendarSDK editor saveClicked', editor.getTitle());
    });
    editor.on('destroy', () => {
      console.log('CalendarSDK editor closed');
    });
  });
});
