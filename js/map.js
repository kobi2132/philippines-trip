// Hand-drawn style route map (inline SVG, works offline).
(function (App) {
  // Legs inside the Philippines, in travel order: [from, to, mode]
  const LEGS = [
    ['manila', 'cebu', 'flight'], ['cebu', 'oslob', 'taxi'], ['oslob', 'bohol', 'ferry'],
    ['bohol', 'cebu', 'ferry'], ['cebu', 'elnido', 'flight'], ['elnido', 'coron', 'flight'],
    ['coron', 'clark', 'flight'], ['clark', 'manila', 'taxi'],
  ];
  const W = 360, H = 430;
  const proj = (p) => [((p.lon - 118.6) / (125 - 118.6)) * (W - 40) + 20, ((16 - p.lat) / (16 - 8.8)) * (H - 40) + 20];
  const STYLE = { flight: 'stroke-dasharray="2 7" stroke-width="3"', ferry: 'stroke-dasharray="10 6" stroke-width="3"', taxi: 'stroke-width="3"' };
  const ICON = { flight: '✈️', ferry: '⛴️', taxi: '🚕' };
  // Label position per place [dx, dy, anchor], tuned so the Cebu cluster stays readable.
  const LABEL = {
    manila: [14, 6, 'start'], clark: [14, -2, 'start'], cebu: [14, 2, 'start'], oslob: [-14, 12, 'end'],
    bohol: [14, 14, 'start'], elnido: [-14, 6, 'end'], coron: [14, 6, 'start'],
  };
  // Very rough island outlines [lon, lat], just for orientation.
  const LAND = [
    [[119.9, 16.2], [120.3, 14.8], [120.6, 14.3], [121, 13.8], [121.6, 13.9], [122.4, 13.4], [123, 13.9], [124, 13], [124.2, 13.6], [122.6, 14.3], [122.1, 14.6], [121.7, 15.6], [121.6, 16.2]],
    [[120.3, 13.5], [121.2, 13.4], [121.5, 12.5], [121, 12.2], [120.4, 12.7]],
    [[118.4, 9.7], [119.2, 10.4], [119.7, 11.1], [119.5, 11.45], [119.2, 11], [118.4, 10.3]],
    [[119.8, 12.3], [120.35, 12.25], [120.3, 11.85], [119.9, 11.95]],
    [[121.9, 11.9], [122.9, 11.6], [123.1, 10.9], [122.5, 10.6], [121.9, 10.9]],
    [[122.9, 10.9], [123.5, 10.5], [123.3, 9.2], [122.9, 9.4], [122.4, 10.1]],
    [[123.95, 11.2], [124.08, 10.9], [123.75, 10], [123.45, 9.42], [123.33, 9.6], [123.65, 10.3], [123.9, 10.9]],
    [[123.8, 9.95], [124.5, 10.12], [124.6, 9.75], [124.1, 9.55], [123.85, 9.58]],
    [[124.3, 11.5], [125, 11.4], [125.2, 10.2], [124.8, 10], [124.4, 10.8]],
    [[122.8, 8.6], [125.2, 8.6], [125.2, 9.3], [124.1, 8.95], [123.3, 8.75]],
  ];

  App.routeMap = () => {
    const P = App.trip.places;
    const lines = LEGS.map(([a, b, mode]) => {
      const [x1, y1] = proj(P[a]), [x2, y2] = proj(P[b]);
      // gentle curve so overlapping legs (Cebu <-> Bohol) stay readable
      const mx = (x1 + x2) / 2 + (y2 - y1) * 0.15, my = (y1 + y2) / 2 - (x2 - x1) * 0.15;
      return `<path d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" fill="none" stroke="#475569" ${STYLE[mode]} stroke-linecap="round"/>
        <text x="${mx}" y="${my}" font-size="16" text-anchor="middle" dominant-baseline="middle">${ICON[mode]}</text>`;
    }).join('');
    const land = LAND.map((pts) => `<polygon points="${pts.map(([lon, lat]) => proj({ lon, lat }).join(',')).join(' ')}" fill="#fde9c4" stroke="#f2d49b" stroke-width="2" stroke-linejoin="round"/>`).join('');
    const seen = new Set();
    const order = App.trip.route.filter((k) => k !== 'israel' && !seen.has(k) && seen.add(k));
    const dots = [...order, 'clark'].map((k) => {
      const p = P[k]; const [x, y] = proj(p);
      const [dx, dy, anchor] = LABEL[k] || [14, 5, 'start'];
      return { dot: `<circle cx="${x}" cy="${y}" r="9" fill="${p.color}" stroke="#fff" stroke-width="3"/>`,
        label: `<text x="${x + dx}" y="${y + dy}" font-size="15" font-weight="700" fill="#1e293b" text-anchor="${anchor}" paint-order="stroke" stroke="#fffbf5" stroke-width="4">${App.esc(p.name)}</text>` };
    });
    return `<div class="map-card"><svg viewBox="0 0 ${W} ${H}" direction="ltr" role="img" aria-label="מפת המסלול">
      <rect width="${W}" height="${H}" rx="20" fill="#e0f2fe"/>
      ${land}${lines}${dots.map((d) => d.dot).join('')}${dots.map((d) => d.label).join('')}
    </svg>
    <div class="legend"><span>✈️ טיסה</span><span>⛴️ מעבורת</span><span>🚕 נסיעה</span></div></div>`;
  };
})(window.App);
