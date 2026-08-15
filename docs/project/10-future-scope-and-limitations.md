# Future Scope and Limitations

**Project:** RailGaadi  
**Rule:** The “future” section is **not** implemented. The “limitations” section describes **current** code.

---

## 1. Limitations (as built)

| ID | Limitation | Evidence |
| --- | --- | --- |
| L1 | Homepage does not live-search unknown 4–5 digit numbers | `useTrainSearch.ts` `shouldFetchRemote` excludes `isTrainNumber` |
| L2 | `TRAINS_DB` is a static popular subset, not the full IR timetable | `lib/trains-db.ts` |
| L3 | Production never shows synthetic live journeys | `allowDevFallback()` |
| L4 | Weather fallback is a constant climate sample (28 °C, etc.) | `lib/openweather.ts` |
| L5 | Elevation fallback is a sine-like synthetic profile | `syntheticElevation` |
| L6 | Overpass fallback POIs are fixed (Tapti, Kota bridge, Aravallis), not route-specific | `lib/overpass.ts` |
| L7 | Map style is MapTiler `dataviz-dark` or CARTO dark; no light basemap | `MapView.tsx` |
| L8 | Analytics `dataSource` tracks elevation, not RailRadar | `app/api/analytics/[id]/route.ts` |
| L9 | Route GeoJSON can fail while live status succeeds | `fetchRouteGeometry` swallows errors → `undefined` |
| L10 | No user accounts; favorites/recents are device-local | Zustand persist keys |
| L11 | `package.json` version `0.1.0` vs git tag `v1.0.0` | files / git |
| L12 | In-flight coalescing is per Node process, not cluster-wide | `inflight` Map |
| L13 | Memory cache/budget/rate-limit do not survive restart or multi-instance | Redis optional |
| L14 | RailRadar timeout 4 s may fail on slow networks | `rrFetch` |
| L15 | Daily budget is an app counter (UTC), not a legal SLA with RailRadar | `lib/railradar-budget.ts` |
| L16 | No E2E browser tests | `package.json` scripts |
| L17 | Overpass public instance may throttle; timeout 25 s in QL | `lib/overpass.ts` |
| L18 | OpenTopography uses 8 samples, concurrency 4; sparse DEM | `SAMPLE_COUNT = 8` |
| L19 | Live search results often lack origin/destination names | `searchTrains` mapping |
| L20 | Independent project; not affiliated with Indian Railways / IRCTC | README / this docs set |
| L21 | No in-repo production URL, Dockerfile, or `render.yaml` | repository |
| L22 | PWA is manifest-only (no service worker file in the scanned tree) | `public/manifest.json` |
| L23 | `LiveJourney.status` type includes `delayed` and `on_time`, but `normaliseStatus` never returns them | `lib/railradar.ts`, `types/train.ts` |
| L24 | Live normaliser sets `speedSource: 'unknown'` and does not copy a live speed | `normaliseLiveResponse` |
| L25 | Weather rejects coordinates when `lat` or `lng` parse to a falsy number (including 0) | `app/api/weather/route.ts` |
| L26 | Weather tab issues three `/api/weather` requests (current, next, destination), each counting toward the IP rate limit | `WeatherPanel.tsx` |

---

## 2. Risks

| Risk | Impact | Current control |
| --- | --- | --- |
| Provider quota | Tracking stops | Budget, cache 30 s, local search, 429 honesty |
| Redis outage | Split-brain limits across instances | Memory fallback (weaker) |
| Schema change at RailRadar | Normaliser wrong | Unit fixtures; no live contract test |
| Students sharing one API key | Budget exhausts quickly | Default 50; auto-refresh pause |
| Examiners treating fallback as GPS | Wrong conclusions | `DataSourceBadge`, this document |

---

## 3. Future scope (proposed only)

These items would require new code, keys, or research. **Do not demonstrate them as present.**

1. Align homepage numeric search with `/api/search` (live lookup on catalogue miss).
2. Expand or generate `TRAINS_DB` from a licensed timetable dump.
3. Light map style bound to theme.
4. Playwright journey smoke tests in CI (still without leaking secrets).
5. Cluster-wide inflight locks in Redis.
6. Service worker / offline catalogue.
7. Authentication if favorites must sync across devices.
8. Dockerfile / render.yaml for reproducible hosting.
9. Align `package.json` version with git tags.
10. Optional second Overpass mirror.
11. Persist anonymised metrics (only with an ethics/privacy design—not present now).
12. Accessibility audit (WCAG)—not completed for this submission.

**Explicitly not claimed as future ML:** nothing in the current stack suggests a trained delay predictor; adding one would be a new project.

---

## 4. Conclusion

Evaluate RailGaadi on quota-aware engineering and labelled data, not on national timetable completeness or operator affiliation.
