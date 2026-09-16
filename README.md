# StudyTogether

A plain HTML/CSS/JS study timer for two friends, synced live with Firebase
Realtime Database. No build tools, no frameworks, no login screen.

## File structure

```
study-timer/
├── index.html           All screens: landing, room-code, dashboard, note modal
├── style.css             All styling — mobile-first, with tablet/desktop breakpoints
├── firebase-config.js     Your Firebase project keys go here
├── app.js                 All app logic (room join, timers, logs, midnight split)
└── README.md              This file
```

Everything is plain global-scope JavaScript loaded via `<script>` tags, in this
order: Firebase SDK → `firebase-config.js` (creates `db`) → `app.js` (uses `db`).
There's no bundler, no `npm install`, no build step — just these five files.

## 1. Create a Firebase project

1. Go to https://console.firebase.google.com and create a new project (free tier is enough).
2. In the left sidebar: **Build → Realtime Database → Create Database**. Pick any region. Start in test mode for now (locked down in step 3).
3. Go to **Project settings** (gear icon) → **General** → scroll to "Your apps" → click the **Web** icon (`</>`) → register the app (no need for Firebase Hosting at this step). Firebase will show you a config object.
4. Open `firebase-config.js` and paste your real values in place of the placeholders.

## 2. Lock down the database rules

By default "test mode" allows anyone to read/write anything, which is too open.
In the Firebase console, go to **Realtime Database → Rules** and use this instead:

```json
{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read": true,
        ".write": true,
        "logs": {
          ".indexOn": ["date", "owner"]
        }
      }
    }
  }
}
```

This scopes access to one specific room path at a time — a client can only
read/write `/rooms/ABC123` if it already knows the code `ABC123`; it cannot
list or browse all rooms. That's the right amount of protection for "no
login, just two trusted friends with a shared code" — it is **not** meant to
withstand someone who intentionally tries to guess codes, so don't use this
pattern for sensitive data.

## 3. Run it locally

Since there's no build step, you can usually just double-click `index.html`
to open it in a browser. If your browser blocks anything when opened via
`file://`, run a tiny local server instead from inside the `study-timer`
folder:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## 4. Deploy it (optional)

Any static host works (Firebase Hosting, Netlify, GitHub Pages, etc.). For
Firebase Hosting specifically:

```
npm install -g firebase-tools
firebase login
firebase init hosting     # point the public directory at this folder
firebase deploy
```

## How it works

- **No login**: the first person clicks "Create Room," gets a 6-character
  code, and shares it. The second person clicks "Join Room" and enters that
  code plus their name. Each browser remembers its room and identity in
  `localStorage`, so returning visits skip straight to the dashboard.
- **Live sync**: each user's timer state (`isRunning`, `startedAt`) lives in
  Realtime Database. Both browsers listen for changes, so starting or
  stopping on one device shows up on the other within about a second. The
  visible clock ticks locally every second between updates — the app isn't
  writing to the database every second, just once on start and once on stop.
- **Stopping a timer** immediately halts the clock (for both viewers), then
  opens a note prompt. Saving (or skipping) writes one or more log entries.
- **Midnight roll-over**: if a session crosses one or more midnights, it's
  split into multiple log entries — one per calendar day — before saving, so
  daily totals stay accurate.
- **Logs & totals**: the "My Log" / "Friend Log" tabs and the date filter
  control which entries are shown; the green total banner always reflects
  the sum of exactly what's currently on screen.

## A couple of intentional simplifications

- The date filter is a single date, not a date range, to keep the code
  minimal — clear it with the "Clear" link to see everything again.
- Timestamps use each device's local clock (`Date.now()`) rather than a
  server-resolved timestamp, to keep the start/stop math simple. For two
  friends' devices with roughly correct clocks this is accurate enough; it's
  not designed for split-second precision.
