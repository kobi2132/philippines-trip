// Live flight status from AeroDataBox (RapidAPI). Returns the shape the app reads:
// { status, depLocal, arrLocal, gate, terminal, updatedAt }

const STATUS = {
  Canceled: 'cancelled', CanceledUncertain: 'cancelled', Delayed: 'delayed',
  Boarding: 'boarding', GateClosed: 'boarding', Departed: 'departed', EnRoute: 'departed',
  Approaching: 'departed', Arrived: 'landed', Diverted: 'delayed',
};

// "2026-11-06 10:40+02:00" → "10:40"
const hm = (t) => (t && t.local ? t.local.slice(11, 16) : null);
const minutes = (t) => (t && t.utc ? new Date(t.utc.replace(' ', 'T')).getTime() / 60000 : null);

export function mapFlight(item) {
  const dep = item.departure || {}, arr = item.arrival || {};
  let status = STATUS[item.status] || 'scheduled';
  const late = minutes(dep.revisedTime) - minutes(dep.scheduledTime);
  if (status === 'scheduled' && late >= 15) status = 'delayed';
  return {
    status,
    depLocal: hm(dep.revisedTime) || hm(dep.scheduledTime),
    arrLocal: hm(arr.revisedTime) || hm(arr.predictedTime) || hm(arr.scheduledTime),
    gate: dep.gate || null,
    terminal: dep.terminal || null,
    arrTerminal: arr.terminal || null,
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchLegStatus(leg, apiKey) {
  const date = leg.dep.slice(0, 10);
  const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(leg.flightNo)}/${date}?dateLocalRole=Departure&withAircraftImage=false&withLocation=false`;
  const res = await fetch(url, { headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' } });
  if (res.status === 204 || res.status === 404) return null; // not published yet
  if (!res.ok) throw new Error(`AeroDataBox ${res.status} for ${leg.flightNo}`);
  const items = await res.json();
  const item = (Array.isArray(items) ? items : []).find((x) => x.departure?.airport?.iata === leg.from.code) || items[0];
  return item ? mapFlight(item) : null;
}
