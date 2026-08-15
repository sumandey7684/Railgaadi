# Journey-state flow

From RailRadar `RRLiveResponse` to timeline and map views.

```mermaid
flowchart TD
  RAW[RRLiveResponse + optional route GeoJSON]
  N[normaliseLiveResponse]
  RAW --> N
  N --> H[Filter/map route stops to Station]
  H --> C[collapseStationStatuses]
  C --> P[markPassengerHalts]
  P --> T[assignTimeSources actual expected scheduled]
  T --> D[applyExpectedDelay delayEstimated]
  D --> POS{currentLocation coords and isActualPosition}
  POS -->|yes| GPS[source gps]
  POS -->|no| ST[station or interpolateAlongRoute or fallback]
  GPS --> LJ[LiveJourney]
  ST --> LJ
  LJ --> JS[lib/journey-state.ts]
  JS --> TL[Timeline: haltStations arrival/departure delayLabel]
  JS --> MP[MapView: mapPosition followTrain]
  JS --> JC[JourneyCard progress ETA]
```

Time preference for display (`stationArrivalView`):

1. `arrivalSource === actual` → actual clock, label ACT  
2. `expected` → expected (or actual field if used), label EXP  
3. else scheduled, label SCH  

Position sources on `LiveLocation.source`: `gps | station | interpolated | fallback`.  
Progress: `gps | station | estimated`.
