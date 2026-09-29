import CalendarSDK from '@calendarsdk/core';

/** Logs every problem the SDK's local self-check finds, and exposes the report on demand. */
CalendarSDK.load(1, {
  appId: 'calendar-compat',
  onCompatIssue: (issue) => {
    console.log('CalendarSDK compat issue', JSON.stringify(issue));
  },
}).then((sdk) => {
  // `sdk.Compat.getReport()` checks the page right now; nothing is sent anywhere.
  document.addEventListener('calsdk-compat-report', () => {
    console.log(
      'CalendarSDK compat report',
      JSON.stringify(sdk.Compat.getReport()),
    );
  });
  console.log('CalendarSDK compat ready');
});
