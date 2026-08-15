# RailGaadi — academic documentation index

This folder is the **B.Tech CSE minor-project documentation pack**. It is derived from the repository source, tests, CI, and git history. It does **not** change application behaviour.

Root `README.md` remains the public GitHub overview. Use **this index** for college submission, spiral binding, and viva.

---

## How to use for submission

| Examiner / viva need | Start here |
| --- | --- |
| What is the project in 4–6 pages? | `01-project-synopsis.md` |
| Formal requirements | `02-srs.md` |
| How is it designed? | `03-sdd.md` + `diagrams/` |
| Related work / citations | `04-literature-survey.md` |
| What was tested? | `05-test-plan-and-report.md` |
| API contract | `06-api-documentation.md` |
| How to run / host | `07-deployment-and-configuration.md` |
| How to demo the UI | `08-user-manual.md` |
| Full report-style narrative (abstract through conclusion) | `09-project-architecture.md` |
| Honest “what’s missing / what’s next” | `10-future-scope-and-limitations.md` |
| Screenshots | `../screenshots/` |

**Print/PDF:** open each Markdown file in VS Code / Typora / Pandoc. Mermaid diagrams in `diagrams/` render on GitHub; for paper, export Mermaid to PNG if the college requires figures.

**Viva talking points**

1. `dataSource`: live vs cached vs fallback vs unavailable (`types/api.ts`).  
2. Production does **not** use `generateFallbackJourney`.  
3. Budget: 2 units live+route, 1 unit search; default 50/UTC day.  
4. Homepage numeric search does not call RailRadar (`useTrainSearch`).  
5. Tests: 46 Vitest cases, CI without secrets.

**Do not tell the examiner** that the system uses AI/ML, IRCTC APIs, or a project SQL database.

**Secrets:** only names from `.env.example`. Never paste `.env.local`.

---

## Document list

1. `01-project-synopsis.md` — proposal: abstract, problem, objectives, scope, feasibility.  
2. `02-srs.md` — IEEE 830-style FR/NFR/CON from implemented behaviour.  
3. `03-sdd.md` — modules, cache/quota, geo, security design.  
4. `04-literature-survey.md` — real systems and official docs only.  
5. `05-test-plan-and-report.md` — plan + **46/46 pass** local Vitest run (15 Aug 2026).  
6. `06-api-documentation.md` — `/api/search`, `train`, `weather`, `terrain`, `analytics`.  
7. `07-deployment-and-configuration.md` — env vars, pnpm, CI, ephemeral FS.  
8. `08-user-manual.md` — traveller instructions.  
9. `09-project-architecture.md` — combined report chapters.  
10. `10-future-scope-and-limitations.md` — L1–L26 current limits vs unimplemented future work.

### Diagrams

| File | Content |
| --- | --- |
| `diagrams/architecture.md` | Component/provider flowchart |
| `diagrams/use-case.md` | Traveller and deployer use cases |
| `diagrams/data-flow.md` | Context DFD + journey `dataSource` decisions |
| `diagrams/sequence-live-tracking.md` | Sequence for live GET |
| `diagrams/journey-state-flow.md` | Normalisation → UI |
| `diagrams/deployment.md` | Host + third parties + CI |

---

## Version note

`package.json` version is `0.1.0`. Git tag `v1.0.0` marks an earlier snapshot than later documentation commits. State this if asked about version numbering.
