# User Manual

**Product:** RailGaadi  
**Audience:** Traveller using a web browser; examiner demonstrating the system

This manual describes **implemented** screens. It does not describe booking tickets or logging in (those features do not exist).

---

## 1. What you need

- A network connection
- A modern browser
- For **real** live trains: the deployed app must have `RAILRADAR_API_KEY` configured by the operator

If the operator has no RailRadar key:

- **Development** (`pnpm dev`): you may see an estimated demo journey with badge **Fallback / estimated**
- **Production:** journey pages show an error (live data unavailable)

---

## 2. Home — search

1. Open the site home page (`/`).
2. Type a train **number** (example `12951`) or part of a **name** (example `Rajdhani`).
3. Shortcut: **Ctrl+K** or **⌘K** focuses search. The field shows a ⌘K hint.
4. Example chips under the box jump to sample numbers (as shown on the page).
5. Results from the built-in popular list appear immediately.
6. If you type a **name** (at least 3 characters) that is **not** in the popular list, the app may query live lookup.
7. If you type a **4–5 digit number** that is **not** in the popular list, the home search **does not** call live lookup. Open `/train/<number>` directly (or use a bookmark) to try tracking.

**Recent searches:** up to six trains, stored in this browser. **Clear All** removes them.

**Navbar:** RailGaadi logo (home), theme toggle (sun/moon), Search, Favorites (heart; badge shows count).

---

## 3. Journey page (`/train/<number>`)

Header shows train name/number, a status chip when the value is `running`, `not_started`, `completed`, or `cancelled` (labels: Running, Not Started, Journey Complete, Cancelled), **data-source badge** (Live / Cached / Fallback / estimated / Unavailable), favorite heart, share, and **Auto 30s** / **Paused**. Delay is shown separately (not as a `delayed` / `on_time` status from the normaliser).

**Auto 30s:** when on, the page refreshes journey data about every 30 seconds. Pause to stop polling (saves quota on the server).

### Tab: Live Map

- Dark map, cyan/blue route, train marker
- **Following Train** recenters on the train; dragging the map turns follow off
- Zoom and recenter controls
- **Station Route Timeline** (right or below on small screens): passed (green check), current (pulse), upcoming (circle)
- Times: **SCH** scheduled, **ACT** actual, **EXP** expected
- Delay: **On Time** or **+Nm**; **est.** means estimated inheritance, not necessarily a reported actual delay
- Tap a halt to select it and stop follow-train

Treat **Fallback / estimated** as demonstration or degraded data, not operational GPS.

### Tab: Weather

Cards for **current**, **next**, and **destination** stations (OpenWeather when configured). The badge may show **Live**, **Cached** (900 s weather cache), or **Fallback / estimated** (static sample weather).

### Tab: Terrain & Analytics

Distance, highest point, covered km, delay summary, elevation profile, per-station delay list. Elevation may be **live** DEM samples or a **synthetic** curve—read the badge. Terrain POIs come from OpenStreetMap Overpass or, on Overpass failure, a small fixed list that may **not** match your route.

---

## 4. Share (`/share/<number>`)

Same live API as the journey page. Use **Share** on the journey page (Web Share dialog or copy link). Recipients need network access to the same app. Quota or rate-limit errors show an explicit message, not a fake map.

---

## 5. Favorites (`/favorites`)

Heart a train on the journey page. List is stored **only in this browser** (`localStorage`). Clearing site data removes favorites. Empty state links back to search.

---

## 6. Theme

Toggle light/dark in the navbar. Choice is saved as `railgaadi-theme`. If you never toggle, the system colour scheme is used. The **map stays dark-styled** even in light mode.

---

## 7. Install / PWA

`public/manifest.json` allows some browsers to **Add to Home Screen** (standalone). Shortcuts: Search (`/?search=1`), Favorites (`/favorites`). This is not a native store app.

---

## 8. Errors you may see

| Message / situation | Meaning |
| --- | --- |
| Invalid train ID | Use 4–5 digits only |
| Train not found | RailRadar had no live journey |
| Too many requests | 45 API calls/minute from your IP; wait for Retry-After |
| Live data / quota | Daily RailRadar budget exhausted; try later (next UTC day for the app budget) |
| Shared journey unavailable | Same as journey errors on the share URL |

---

## 9. Privacy (as implemented)

No login. Favorites and recents stay on the device. The server sees IP addresses for rate limiting and sees train ids you request. Provider policies (RailRadar, MapTiler, OpenWeather, etc.) apply to those requests. This manual is not a legal privacy policy.

---

## 10. Screenshots

See repository `docs/screenshots/home.png`, `journey.png`, `weather.png`, `analytics.png`, and the root `README.md`.
