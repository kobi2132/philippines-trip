import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plannedReminders, dueReminders, legsToCheck, flightChangeAlert, localParts, telegramReminders, dueTelegram } from './schedule.mjs';

const leg = (no, dep, arr, from) => ({ flightNo: no, dep, arr, from: { code: from, city: from }, to: { city: 'Y' } });
const trip = {
  travelers: 'A ו-B', start: '2026-11-06', end: '2026-11-09',
  places: { israel: { name: 'ישראל' }, cebu: { name: 'סבו' } },
  days: [
    { date: '2026-11-06', place: 'israel' }, { date: '2026-11-07', place: 'cebu', title: 'סבו' },
    { date: '2026-11-08', place: 'cebu', title: 'טסים' }, { date: '2026-11-09', place: 'israel' },
  ],
  hotels: [{ name: 'H', checkIn: '2026-11-07', checkOut: '2026-11-08' }],
  flights: [
    { date: '2026-11-06', international: true, booking: 'AAA', legs: [leg('F1', '2026-11-06T10:40:00+02:00', '2026-11-07T09:30:00+08:00', 'TLV')] },
    { date: '2026-11-08', international: false, booking: 'BBB', legs: [leg('F2', '2026-11-08T12:00:00+08:00', '2026-11-08T13:00:00+08:00', 'CEB')] },
  ],
};

test('local time in a zone', () => {
  assert.deepEqual(localParts(new Date('2026-11-09T00:05:00Z'), 'Asia/Manila'), { date: '2026-11-09', hm: '08:05' });
});

test('flight day reminder is early enough to reach the airport', () => {
  const r = plannedReminders(trip).find((x) => x.key === 'morning_2026-11-06');
  assert.equal(r.time, '05:40');
  assert.equal(r.tz, 'Asia/Jerusalem');
});

test('no evening reminder while flying, one the night before a flight', () => {
  const keys = plannedReminders(trip).map((x) => x.key);
  assert.ok(keys.includes('eve_2026-11-06'));
  assert.ok(keys.includes('eve_2026-11-08'));
});

test('reminders are due once, inside the grace window', () => {
  const at = new Date('2026-11-07T00:10:00Z'); // 08:10 Manila
  assert.deepEqual(dueReminders(trip, at).map((x) => x.key), ['morning_2026-11-07']);
  assert.deepEqual(dueReminders(trip, at, { 'morning_2026-11-07': 'x' }), []);
  assert.deepEqual(dueReminders(trip, new Date('2026-11-07T05:00:00Z')).map((x) => x.key), []);
});

test('legs are polled near departure only', () => {
  assert.equal(legsToCheck(trip, new Date('2026-11-08T01:00:00Z')).length, 1); // 09:00 Manila, 3h before
  assert.equal(legsToCheck(trip, new Date('2026-11-01T00:00:00Z')).length, 0);
});

test('alerts for delay, gate and cancel; silence otherwise', () => {
  const l = trip.flights[1].legs[0];
  assert.equal(flightChangeAlert(l, null, { status: 'scheduled', depLocal: '12:05' }), null);
  assert.match(flightChangeAlert(l, null, { status: 'delayed', depLocal: '12:40' }).body, /12:40/);
  assert.match(flightChangeAlert(l, null, { status: 'scheduled', depLocal: '12:00', gate: '7' }).title, /7/);
  assert.match(flightChangeAlert(l, { status: 'scheduled' }, { status: 'cancelled' }).title, /בוטלה/);
});

test('telegram: check-in 24h before, with booking code', () => {
  const r = telegramReminders(trip).find((x) => x.key.startsWith('tg_checkin_2026-11-08'));
  assert.equal(r.at.toISOString(), '2026-11-07T04:00:00.000Z'); // 12:00 Manila the day before
  assert.match(r.text, /BBB/);
  const at = new Date('2026-11-07T04:20:00Z');
  assert.ok(dueTelegram(trip, at).some((x) => x.key === r.key));
  assert.ok(!dueTelegram(trip, at, { [r.key]: 'x' }).some((x) => x.key === r.key));
});

test('telegram: flight day morning at the push reminder time', () => {
  const r = telegramReminders(trip).find((x) => x.key === 'tg_day_2026-11-06');
  assert.equal(r.at.toISOString(), '2026-11-06T03:40:00.000Z'); // 05:40 Israel
  assert.match(r.text, /07:40/);
});
