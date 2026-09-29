import CalendarSDK from '@calendarsdk/core';

CalendarSDK.load(1, { appId: 'calendar-hello' }).then((sdk) => {
  console.log(
    'CalendarSDK loaded',
    sdk.LOADER_VERSION,
    sdk.User.getEmailAddress().replace(/^.*@/, '<user>@'),
    sdk.User.getTimeZone(),
    sdk.User.getLanguage(),
  );

  sdk.Router.registerRouteViewHandler((routeView) => {
    console.log(
      'CalendarSDK route',
      routeView.getType(),
      routeView.getAnchorDate(),
      routeView.getSearchQuery(),
    );
    routeView.on('destroy', () => {
      console.log('CalendarSDK route ended', routeView.getType());
    });
  });
});
