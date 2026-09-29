import Data from './data';
import type { EventRef } from '../driver-interfaces/event-view-driver';

const ref: EventRef = {
  eventId: 'abc',
  calendarId: 'me@example.com',
  calendarIdHint: 'me@m',
  kind: 'event',
  rawId: 'x',
  confidence: 'exact',
};

test('delegates to the provider', async () => {
  const event = {
    id: 'abc',
    calendarId: 'c',
    allDay: false,
    start: 's',
    end: 'e',
  };
  const data = new Data({
    getEvent: async (r) => (r === ref ? event : null),
    listCalendars: async () => [{ id: 'c', title: 'C' }],
  });
  await expect(data.getEvent(ref)).resolves.toBe(event);
  await expect(data.listCalendars()).resolves.toEqual([
    { id: 'c', title: 'C' },
  ]);
});

test('rejects clearly without a provider, and for a bad ref', async () => {
  await expect(new Data().getEvent(ref)).rejects.toThrow('no dataProvider');
  await expect(new Data().listCalendars()).rejects.toThrow('no dataProvider');
  await expect(
    new Data({ getEvent: async () => null }).getEvent({} as EventRef),
  ).rejects.toThrow('EventRef is required');
  await expect(
    new Data({ getEvent: async () => null }).listCalendars(),
  ).rejects.toThrow('cannot list');
});

test('provider errors propagate untouched', async () => {
  const boom = new Error('boom');
  await expect(
    new Data({ getEvent: async () => Promise.reject(boom) }).getEvent(ref),
  ).rejects.toBe(boom);
});
