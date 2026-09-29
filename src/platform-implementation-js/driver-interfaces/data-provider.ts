import type { EventRef } from './event-view-driver';

export type CalendarAttendee = {
  email: string;
  displayName?: string;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  self?: boolean;
  organizer?: boolean;
  optional?: boolean;
};

export type CalendarEvent = {
  id: string;
  calendarId: string;
  iCalUID?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  title?: string;
  description?: string;
  location?: string;
  allDay: boolean;
  start: string;
  end: string;
  timeZone?: string;
  recurringEventId?: string;
  attendees?: CalendarAttendee[];
  conferenceUrl?: string;
  htmlLink?: string;
};

export type CalendarInfo = {
  id: string;
  title: string;
  primary?: boolean;
  accessRole?: 'freeBusyReader' | 'reader' | 'writer' | 'owner';
  timeZone?: string;
};

/** Owned by the extension; the core SDK never sees tokens. */
export interface CalendarDataProvider {
  getEvent(ref: EventRef): Promise<CalendarEvent | null>;
  listCalendars?(): Promise<CalendarInfo[]>;
}
