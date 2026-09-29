import CalendarSDK from '@inboxsdk/core';

CalendarSDK.load(1, { appId: 'calendar-hello' }).then((sdk) => {
  console.log('CalendarSDK loaded', sdk.LOADER_VERSION, sdk.IMPL_VERSION);
});
