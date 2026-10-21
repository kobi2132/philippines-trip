import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plannedReminders, dueReminders, legsToCheck, flightChangeAlert, landedAlert, pollEvery, localParts, telegramReminders, dueTelegram } from './schedule.mjs';

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

test('poll schedule: 12h, 3h, then every 20 min; stops once landed', () => {
  const l = trip.flights[1].legs[0]; // CEB 12:00 Manila = 04:00Z, lands 05:00Z
  const at = (iso) => pollEvery(l, new Date(iso).getTime(), null);
  assert.equal(at('2026-11-01T00:00:00Z'), null);            // a week out
  assert.equal(at('2026-11-05T00:00:00Z'), 12 * 3600e3);     // 3 days out
  assert.equal(at('2026-11-07T12:00:00Z'), 3 * 3600e3);      // 16h out
  assert.equal(at('2026-11-08T01:00:00Z'), 20 * 60e3);       // 3h out
  assert.equal(pollEvery(l, new Date('2026-11-08T05:10:00Z').getTime(), { status: 'landed' }), null);
  assert.equal(legsToCheck(trip, new Date('2026-11-08T01:00:00Z')).length, 1);
  assert.equal(legsToCheck(trip, new Date('2026-11-08T01:00:00Z'), { 'F2_2026-11-08': new Date('2026-11-08T00:50:00Z').getTime() }).length, 0);
});

test('daily check before the 4-day window, first flight only', () => {
  const first = trip.flights[0].legs[0], later = trip.flights[1].legs[0];
  const t = new Date(first.dep).getTime() - 20 * 24 * 3600e3;
  assert.equal(pollEvery(first, t, null, true), 24 * 3600e3);
  assert.equal(pollEvery(later, t, null, false), null);
  assert.ok(legsToCheck(trip, new Date(t)).every((x) => trip.flights[0].legs.includes(x.leg)));
  assert.ok(legsToCheck(trip, new Date(t)).length > 0);
});

test('landed note once', () => {
  const l = trip.flights[1].legs[0];
  assert.match(landedAlert(l, { status: 'departed' }, { status: 'landed', arrLocal: '13:05' }), /13:05/);
  assert.equal(landedAlert(l, { status: 'landed' }, { status: 'landed' }), null);
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

test('evening reminder still comes after a daytime flight that landed', () => {
  const t2 = { ...trip, end: '2026-11-10', days: [...trip.days, { date: '2026-11-10', place: 'israel' }],
    flights: [...trip.flights, { date: '2026-11-09', international: true, booking: 'CCC', legs: [leg('F3', '2026-11-09T18:05:00+08:00', '2026-11-10T10:20:00+02:00', 'MNL')] }] };
  const keys = plannedReminders(t2).map((r) => r.key);
  assert.ok(keys.includes('eve_2026-11-09')); // F2 landed at 13:00 on the 8th
});

test('mid-flight morning: connection and landing instead of good morning', () => {
  const t3 = { ...trip, start: '2026-11-04', days: [{ date: '2026-11-04', place: 'israel' }, { date: '2026-11-05', place: 'cebu' }, ...trip.days.slice(1)],
    flights: [{ date: '2026-11-04', international: true, booking: 'EEE', legs: [
      leg('E1', '2026-11-05T00:50:00+02:00', '2026-11-05T05:50:00+04:00', 'TLV'),
      { ...leg('E2', '2026-11-05T09:20:00+04:00', '2026-11-05T21:55:00+08:00', 'AUH'), to: { city: 'מנילה' } }] }, ...trip.flights.slice(1)] };
  const r = plannedReminders(t3).find((x) => x.key === 'morning_2026-11-05');
  assert.equal(r.tz, 'Asia/Dubai');
  assert.equal(r.time, '07:20');
  assert.match(r.body, /E2 ב-09:20\. נוחתים במנילה ב-21:55/);
  // eTravel: 72h before 21:55 Manila = 2.11 15:55 Israel -> 16:00
  const e = plannedReminders(t3).find((x) => x.key === 'etravel');
  assert.deepEqual([e.date, e.time], ['2026-11-02', '16:00']);
});

test('a flight-status service that keeps failing still stays within the monthly quota', () => {
  // run.mjs counts a failed check as a check; nothing is ever learned, so no leg is marked landed.
  const lastChecked = {};
  let n = 0;
  for (let t = Date.parse('2026-10-10T00:00Z'); t < Date.parse('2026-11-10T00:00Z'); t += 5 * 60e3) {
    for (const { key } of legsToCheck(trip, new Date(t), lastChecked, {})) { n++; lastChecked[key] = t; }
  }
  assert.ok(n < 150, `${n} checks`); // about 120; retrying every run would be thousands
});
