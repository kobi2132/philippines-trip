// Questions the screens ask about the trip data (App.trip).
(function (App) {
  const T = () => App.trip;

  const place = (key) => T().places[key] || { name: key, en: key, color: '#64748b' };
  const dayInfo = (date) => T().days.find((d) => d.date === date) || { date, place: null, title: '' };
  const hotelById = (id) => T().hotels.find((h) => h.id === id);
  const hotelTimes = (h) => ({
    checkInTime: h.checkInTime || T().hotelDefaults.checkInTime,
    checkOutTime: h.checkOutTime || T().hotelDefaults.checkOutTime,
    estimated: h.checkInTime ? false : T().hotelDefaults.timesEstimated,
  });
  const hotelForNight = (date) => T().hotels.find((h) => h.checkIn <= date && date < h.checkOut);
  const hotelCheckingOut = (date) => T().hotels.find((h) => h.checkOut === date);
  const flightsOn = (date) => T().flights.filter((f) => f.date === date);
  const transfersOn = (date) => T().transfers.filter((t) => t.date === date);
  const attraction = (id) => T().attractions.find((a) => a.id === id);

  const totalDays = () => App.daysBetween(T().start, T().end) + 1;
  const dayNumber = (date) => App.daysBetween(T().start, date) + 1;

  // before: more than one day out · eve: the day before · trip · after
  const phase = (date = App.today()) => {
    if (date < App.addDays(T().start, -1)) return 'before';
    if (date === App.addDays(T().start, -1)) return 'eve';
    if (date <= T().end) return 'trip';
    return 'after';
  };

  // When to be at the airport: 3h before international, 2h before domestic.
  // "30–60 דקות" → 60, "כ-3 שעות" → 180, "כשעתיים" → 120: the longest the ride may take, in minutes.
  const rideMinutes = (text) => {
    if (!text) return 0;
    if (/שעתיים/.test(text)) return 120;
    const nums = (text.match(/\d+/g) || []).map(Number);
    if (!nums.length) return /שעה/.test(text) ? 60 : 0;
    return Math.max(...nums) * (/שעו?ת|שעה/.test(text) ? 60 : 1);
  };
  const airportBy = (flight) => App.minusMinutes(App.localTime(flight.legs[0].dep), flight.international ? 180 : 120);

  // Live status written by the flight-status job: trips/{id}/status/flights
  const statusKey = (leg) => `${leg.flightNo}_${App.localDate(leg.dep)}`;
  const legStatus = (leg) => (App.flightStatus || {})[statusKey(leg)] || null;

  const nextFlight = () => {
    const n = App.now();
    return T().flights.find((f) => new Date(f.legs[f.legs.length - 1].arr) > n);
  };

  Object.assign(App, {
    place, dayInfo, rideMinutes, hotelById, hotelTimes, hotelForNight, hotelCheckingOut, flightsOn, transfersOn,
    attraction, totalDays, dayNumber, phase, airportBy, statusKey, legStatus, nextFlight,
  });
})(window.App);
