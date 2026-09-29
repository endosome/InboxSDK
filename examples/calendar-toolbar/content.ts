import CalendarSDK from '@calendarsdk/core';

/** Adds an "Open CRM" icon button next to Calendar's Search button. */
CalendarSDK.load(1, { appId: 'calendar-toolbar' }).then((sdk) => {
  const iconUrl = (globalThis as any).chrome.runtime.getURL('icon.png');
  sdk.Toolbar.addButton({
    title: 'Open CRM',
    iconUrl,
    onClick: () => {
      console.log('CalendarSDK toolbar click');
    },
  });
});
