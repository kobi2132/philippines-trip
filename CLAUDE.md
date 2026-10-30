# Philippines trip app: rules for working on it

Read this before changing anything. It records how the app is built and the decisions Jacob has made, so every thread works the same way.
The repo is **public**: never commit personal trip data (bookings, phone numbers, parents' emails, `trip.json`, preview builds).

## Who and what

- A Hebrew, right-to-left PWA for Jacob's parents, Shmulik and Etti (60+, both on Android), for their Philippines trip in November 2026 (now 4-26 Nov, Etihad flights).
- Jacob (GitHub `kobi2132`, admin) owns it and talks to Claude in Hebrew. Travel agent Adi has view-only access (iPhone).
- Live at https://kobi2132.github.io/philippines-trip/ . Everything must stay on free tiers (GitHub Pages, Actions, Firebase Spark, AeroDataBox free plan).
- Jacob may later turn it into a product for Adi's agency, so data stays per trip (`trips/{tripId}`) with its own members list.

## How work is approved and shipped

- One PR per change. Claude tests it, then posts Jacob a short plain-Hebrew summary of what his parents will see change, and **merges only after Jacob's explicit OK on that PR**. Then says it is live.
- Screenshots for approval: take them in `?date=` preview mode and hide the purple preview banner (`.preview-banner{display:none}`).
- Bigger UX ideas go as numbered options (mockups or an artifact) first; Jacob picks, then Claude builds only the picked items.
- Questions to Jacob: one at a time where possible, with a recommended option.

## Architecture

- Static site, vanilla JS, **no build step and no dependencies** in the app. Deployed by `.github/workflows/pages.yml` on every push to `main`; it stamps the commit into `<meta name="app-version">` and `version.json`, which drives the "new version ready" bar.
- Scripts are plain `<script>` tags loaded in order from `index.html`; each file is an IIFE that hangs its exports on `window.App`.

| File | Role |
| --- | --- |
| `js/config.js` | Public Firebase config, `tripId`, VAPID key, admin emails |
| `js/util.js` | Dates, times, `esc()`, preview "now", Maps links, localStorage `store` |
| `js/diag.js` | Freeze recorder (temporary, to be removed once freezes stay gone): notes when the screen stops answering or drawing for 1s+ and what ran before it; on this phone only, shown and copied in the admin screen ("קפיאות שנרשמו") |
| `js/shared.js` | Shared checklists and "עשינו" marks (Firestore `shared/state`, local copy offline) |
| `js/backend.js` | Google sign-in, Firestore listeners, push registration, admin load/save |
| `js/trip.js` | Questions about the data: phase, tonight's hotel, flights on a day, airport-by time |
| `js/views.js` | All screens and cards (HTML strings) |
| `js/main.js` | Router (`#/today`, `#/day/<date>`, `#/flights`, ...), tab bar, events, admin screen, weather |
| `js/fx.js` | 💱 peso converter button and modal |
| `js/install.js` | Install prompt (Android one tap, iPhone how-to) |
| `js/map.js` | Route map (real coastlines) |
| `js/print.js` | Admin "ייצוא ל-PDF" printable summary |
| `icons/ui/` | Our own icons (96px PNG, soft pastel line style, cut from Jacob's Gemini sheets); listed in `sw.js` |
| `sw.js` | Offline cache + push display |
| `notifier/` | Scheduled job: reminders, flight status, Telegram |
| `firebase/firestore.rules` | Access rules (Jacob pastes them into the Firebase console) |
| `tools/build_preview.py` | One-file HTML with data baked in, for previews and tests (never commit the output) |

### Firebase

- Project `philippines-trip-8eb57`. Firestore: `trips/{tripId}` = `{ data, members: {email: role}, updatedAt }`; subcollections `status/flights` and `status/notifier` (written by the notifier), `shared/state` (checklists, done marks), `devices/{uid}` (push tokens).
- `shared/state` saves every change as its own field (`items.{list}.{itemId}` = `{done}`, `{deleted: true}` or a new `{text, order}`; `done.{attractionId}`), never a whole list, so two phones (one offline) never wipe each other. A list = the trip data's items (id `src:<text>`) plus those changes; an older whole-list copy in `lists.{list}` is still read as the base. Items added to `checklists` in `trip.json` join the parents' lists; items they deleted stay deleted.
- `devices/{uid}` holds `tokens.{deviceId}` (one per phone or computer; older docs a single `token`). The app re-registers the token quietly on every start; the notifier sends to all of them and deletes dead ones.
- Roles: `traveler` (view + tick lists), `viewer` (read only, sees "מצב צפייה"), `admin` (Jacob, everything). Rules enforce it; changing `firestore.rules` means Jacob must paste the new rules into the console, so say so in the PR summary.
- Claude never writes to Firestore directly. Data changes reach the app only when Jacob loads the file in the admin screen.

### Offline and updates

- `sw.js` serves network-first, but falls back to the cached copy after 3 seconds (weak signal), and refreshes the cache when the slow answer arrives.
- **Bump `VERSION` in `sw.js` in every PR that changes app files**, and add any new file to its `FILES` list and to `index.html`.
- The app shows the last cached trip immediately, then live data. Background re-renders must not wipe the admin form or a list item being typed.

## Trip data (`trip.json`)

- The master copy lives in the project folder: `/mnt/project-files/philippines-trip/trip.json`. It is not in the repo.
- To update data: edit that file, check it in a preview, tell Jacob what changed, and ask him to load it: מידע ← ניהול נתונים ← עריכה מתקדמת ← טעינה מקובץ ← שמירה. Loading the file does not change the users list; before saving he should see all four users. If a thread can't attach the file, ask the project chat (coordinator) to post it.
- Shape (top level): `tripId, title, travelers, start, end, homeTz, contact, updatedNote, places{key:{name,en,lat,lon,color}}, route[placeKeys], flights[], hotels[], hotelDefaults, transfers[], attractions[], days[], checklists{before,packing}, info{insurance, emergencyPhone, embassyUrl, currency, timeDiff, plug}`.
- `flights[]`: `id, date` (the day they leave home / the day the card shows), `title, booking, international, baggage, carryOn, legs[{flightNo, airline, from{code,name,city,terminal}, to{...}, dep, arr}], connection{airport, duration, terminalChange, note}`. Times are ISO with the airport's own offset (`2026-11-05T00:50:00+02:00`) and are shown exactly as written: local time there.
- A flight whose first leg departs after midnight keeps `date` = the evening before; the UI and notifier say "ההמראה אחרי חצות" explicitly.
- `hotels[]`: `id, place, city, name, address, checkIn, checkOut` (dates; the night of `checkOut` is not included), `room, booking, whatsapp, phone, checkInTime, checkOutTime`.
- `transfers[]`: `id, date, type (taxi|ferry|bus), title, time, timeLabel, duration, details, grab, toHotel, navTo, links[]`.
- `attractions[]`: `id, place, name, en, desc, tags{water, difficulty, duration}, mustSee, mapQuery`. **Shown per place, not per day**: every day in a place lists all of that place's attractions, undone first (decision 2026-10-16; parents stay flexible). `day.attractions` is unused. The Attractions tab picks the place from a grid of all places with their dates (Jacob, 2026-10-20: no sideways-scrolling strip, it hid places and jumped back on every redraw).
- `days[]`: one per date from the prep day (`prep: true`) to the end: `date, place, title`, optional `tips[]`.

## UI rules

- Never add `viewport-fit=cover` to the viewport meta (2026-10-25): in the installed app on Jacob's Samsung it made the screen stop drawing for 9-11 seconds at random (PR #51). A Chrome tab was fine. Pinch and double-tap zoom are off (Jacob, 2026-10-25); bigger text comes from the text-size buttons.
- Everything in Hebrew, `dir="rtl"`. Font Rubik. Colors are tokens on `:root` in `css/app.css`.
- Audience is 60+: base font 16px, big tap targets, short text, one idea per card. The colored day header stays big on purpose (Jacob likes it).
- Always pass user data through `App.esc()`. Wrap dates and numbers that sit inside Hebrew in `<bdi>` (`App.range()`), and keep Latin codes (flight numbers, bookings, phones) `dir="ltr"`, or they flip.
- Number ranges use a plain hyphen (`30-60`), not an en dash; `esc()` converts it.
- Modals: `.modal-box` defaults to ltr, give each box its own rtl class.
- Flight, hotel and transfer cards are folding `details` cards; one open per list. Lists start closed; a tag marks the next flight and tonight's hotel (decision in #13). A flight still on its way the day after `date` (connection, landing) shows on that day too.
- Icons: views keep writing emoji; `App.iconize` (in `js/util.js`, run in `App.render`) swaps every emoji listed in `App.ICONS` for our own image from `icons/ui/`. One emoji = one meaning (✅ only means done). A new icon: add the PNG, its emoji in `ICONS`, and its name in `sw.js`. The admin screen keeps plain emoji (its JSON editor). WhatsApp buttons use the real WhatsApp logo (`App.icon('whatsapp')`), not 💬, which stays "chat/note".
- No online check-in reminder on the day page or the eve (Jacob, 2026-10-21): Jacob does the check-in after his Telegram alert, and the parents could mix it up with the airport check-in desk. The check-in button stays inside the flight card.
- Tab bar names stop growing with the text-size buttons (six must fit side by side); the icons grow instead.
- Attraction "עשינו?" stays in the bottom-left corner; the page's bottom space lets it scroll clear of the 💱 button (Jacob, 2026-10-21).
- Navigation buttons open Google Maps (`App.navButtons`). Hotels have WhatsApp/call buttons and "🪧 הראה לנהג".
- Phases: `before` (countdown home with the "before" list; packing list joins in the last 7 days), `eve` (day before: flight card, packing and before lists), `trip` (today = day page), `after` (summary).
- Text-size buttons and the push row stay at the bottom of the Info screen (Jacob's choice). The FX button hides on scroll down, on the login screen and on days in Israel.
- Parked by Jacob (don't build without asking): day timeline, next-item highlight, leave-time calculation (code on branch `claude/ux-proposals`).
- App name "יאללה טסים" with the logo `icons/logo.png` (Gemini symbol; the name is set in Rubik, never drawn in the image). It shows on the login screen, the countdown home and as the phone app icon (`icons/icon-192/512.png`, symbol on sky blue).

## Notifier (`notifier/`, GitHub Actions)

- `.github/workflows/notifier.yml` runs every 5 minutes in Oct-Nov (GitHub's own timer runs it only every 2-7 hours, so an outside cron-job.org job started by Jacob calls its `workflow_dispatch` every 5 minutes; the GitHub timer stays as a backup); `run.mjs` decides what is due. Pure logic in `schedule.mjs` with tests in `schedule.test.mjs` (`cd notifier && node --test`); keep new logic pure and tested.
- Push (FCM web push) goes to the travelers' phones: eTravel reminder (first whole hour in Israel once the 72h before landing opens, kept within 09:00-21:00), packing the day before, morning messages (on a day they wake up mid-flight: connection time and landing instead), flight day airport-by time, flight changes.
- Telegram goes to **Jacob only**: flight changes, landed, check-in opening, failures; also a timetable change of 5+ minutes in departure or landing against `trip.json` (parents get a push only from 20 minutes), and a flight that was found before and is no longer found (cancelled ahead of time). Format: bold title, then one "label: value" per line, route (from ← to) on every message, one message per leg. Every line gets a U+200F mark (done in `telegram.mjs`). Never print the bot URL (it has the token).
- `run.mjs` saves its state after every message it sends, and a failed flight check counts as a check (waits its normal interval), so a failure can't repeat pushes or burn the quota.
- AeroDataBox free plan: 400 requests/month. Polling: daily until 4 days out for the first flight, every 12h from 4 days, 3h on the last day, 20 min around departure and landing. Any change must keep the worst case under the quota; simulate it.
- Airline check-in windows live in **two places that must match**: `CHECKIN` in `js/views.js` and `CHECKIN` + `CHECKIN_HOURS` in `notifier/schedule.mjs` (Etihad 30h, others 24h). `airportBy` (3h international, 2h domestic) is also in both `js/trip.js` and `schedule.mjs`.
- Test from a branch without merging: run `notifier.yml` on that ref with `samples: true` (one of every Telegram message to Jacob, optionally `one_sample`), or `test: true` (push + Telegram test).
- Secrets (set by Jacob): `FIREBASE_SERVICE_ACCOUNT`, `AERODATABOX_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

## Testing a change

1. `python3 tools/build_preview.py /mnt/project-files/philippines-trip/trip.json <scratch>/preview.html`, serve it, and open it with Playwright (Chromium is preinstalled) at a phone size.
2. Check the dates the change touches with `?date=YYYY-MM-DD` (e.g. the eve, a flight day, a hotel change day, the last day), and the browser console for errors.
3. `cd notifier && node --test` when the notifier changes.

## Known device fix

If notifications are blocked on Android with permission "default" while other sites work, it is a stuck PWA install: Settings ← Apps ← Chrome ← Storage ← clear data, then reinstall from Chrome over https.
