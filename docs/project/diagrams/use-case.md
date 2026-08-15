# Use-case diagram

Actors: unauthenticated **Traveller** and **Deployer** (configures env). No login use cases exist.

```mermaid
flowchart LR
  Traveller((Traveller))
  Deployer((Deployer))

  Traveller --> UC1[Search TRAINS_DB / live lookup]
  Traveller --> UC2[Open journey /train/id]
  Traveller --> UC3[Toggle auto-refresh 30s]
  Traveller --> UC4[Follow train / select halt]
  Traveller --> UC5[View weather tab]
  Traveller --> UC6[View terrain and analytics]
  Traveller --> UC7[Share /share/id]
  Traveller --> UC8[Save favorites in browser]
  Traveller --> UC9[Toggle light/dark theme]
  Traveller --> UC10[Use PWA shortcuts if installed]

  Deployer --> UC11[Set .env keys]
  Deployer --> UC12[Run pnpm build and start]
  Deployer --> UC13[Optional Upstash Redis]
```

| Use case | Primary implementation |
| --- | --- |
| Search | `app/page.tsx`, `useTrainSearch`, `/api/search` |
| Journey | `app/train/[id]/page.tsx`, `useLiveJourney` |
| Auto-refresh | `AutoRefreshToggle`, `useJourneyStore.autoRefresh` |
| Map follow | `MapView`, `followTrainMode` |
| Weather | `WeatherPanel`, `/api/weather` |
| Analytics | `AnalyticsDashboard`, `/api/analytics/[id]`, `/api/terrain` |
| Share | `app/share/[id]/page.tsx` |
| Favorites | `store/favorites.ts` |
| Theme | `ThemeToggle`, `lib/theme.ts` |
| Deploy | `07-deployment-and-configuration.md` |
