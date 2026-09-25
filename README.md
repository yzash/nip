# NICC — Network Intelligence Command Center (prototype)

Clickable, full-fidelity prototype of the Indosat Ooredoo Hutchison **Network Intelligence Command Center** on synthetic Indonesian network data. It covers the whole target state in the PRD: seven modules, eight role lenses, the nine-stage predict-to-validate chain, and the value ledger. Leadership validates the platform, not a single screen.

> Every number is synthetic. Baselines, thresholds and targets are placeholders for IOH calibration (PRD §3).

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
```

Needs Node 18+. The generated data is committed under `/data`, so Python is only needed to regenerate it.

```bash
pip install numpy pyyaml shapely
python3 generate.py    # rewrites /data/*.json and prints the story check
npm run build          # static site in dist/ (data copied to dist/data)
```

## What is in the box

| Path | What it is |
| --- | --- |
| `generate.py` | Seeded synthetic data generator (PRD §10). Same seed + `stories.yaml` → same data. Ends with a **story check** that asserts every PRD "Monday morning" number. |
| `stories.yaml` | Story clusters, demo clock, predicted-failure counts, persona figures. Edit this to reshape the demo without touching code. |
| `roles.json` | Eight roles (scope, decision rights, landing, Monday decision) and the approval policy (thresholds, colour thresholds, priority weights). |
| `data/*.json` | One file per entity (sites, cells, KPIs, forecast, cohorts, revenue, backbone links, CDN peers, insights, incidents, action options, approvals, programs, BOQ, POs, stock, vendors, work orders, validation, agents, agent runs, model scorecard, roles). |
| `data/geo/` | 38 provinces and 514 kabupaten/kota, built by `scripts/build_geo.py` from BPS / OCHA boundaries (CC BY 3.0 IGO) with the 2022 Papua split applied. |
| `src/data/netra.ts` | The seam to Netra. Today a static-JSON source; Phase 1 swaps in `NetraApiSource` with the same interface. |
| `src/lib/policy.ts` | Approval routing (intervention class × IDR threshold → named approver, auto-approve rules). |
| `src/lib/plan.ts` | Plan builder engine: BOQ, stock check across 8 warehouses, vendor allocation, PO draft, critical path with parallel stages 4/5/6/6b. |
| `src/store/app.ts` | Session workflow state and every action (approve, reject with reason, plan, program creation, PO release, dispatch, overrides, audit log). |
| `src/modules/*` | M1 Map, M2 Site 360, M3 Insights & Incidents, M4 Predictive Planner, M5 Program Console, M6 Value Ledger, M7 Agent Studio, plus the Field worklist. |

Stack: React 18, Vite, TypeScript, MapLibre GL (no basemap tiles or external glyphs, so it runs offline), Recharts, Tailwind, Zustand.

## The data behaves like the story

`python3 generate.py` prints this check; all rows must read OK:

- 6,000 sites (sampled from a ~60,000 target) over 38 provinces / 514 districts, density weighted by population
- **Head of Planning:** 41 sites predicted to saturate inside 8 weeks, 27 covered, 14 not (Bekasi)
- **Head of Deployment:** 12 programs in the pipeline, 3 at risk on vendor SLA, 2 waiting on tower company access
- **Head of Operations:** top of the exposure queue is the Makassar–Mandai trunk at 94% with 9 dependent sites
- **Head of CX:** postpaid 5G CNX in Surabaya −4.0 points, churn-risk cohort 6,200
- **Regional Manager (Sulawesi):** 9 open incidents, 4 work orders overdue, 2 escalation and 2 false-positive candidates
- **Field engineer (Kab. Bekasi):** 6 work orders this week
- **Procurement:** 3 SKUs below reorder point in Semarang, 2 POs pending release
- **COO:** 3 programs off track (predicted failure before RFS), 2 CapEx programs above threshold awaiting approval
- Program mix 10 on track / 12 at risk / 8 late; validation set 200 sites, 140 uplift / 40 flat / 20 worse
- Bekasi plan: Semarang holds 9 of the 14 multi-band antennas; the rest go on PO
- At W+4 on the Predicted Failure layer only Bekasi and South Sulawesi turn red

## 12-minute walkthrough

Open **Walkthrough** in the top bar. Each of the nine steps (PRD §11) sets the role, screen and map state. Steps 5 and 6 have a **Do it** button, so the Head of Network can narrate without a presenter. **Reset** (circular arrow) returns to the Monday 08:00 WIB state.

1. EXEC national map: KPI strip with revenue at risk and 8-week predicted failures
2. Predicted Failure layer, scrubber to W+4: Bekasi and South Sulawesi turn red
3. Bekasi cluster → Site 360: PRB trajectory, 14 affected sites
4. Incident: Program Match = Not covered; action ladder recommends sector add, IDR 350m per site, 5 weeks
5. Approve as Head of Planning → plan builder: BOQ, stock (Semarang 9 of 14 antennas), vendor, PO
6. DEPLOY: new program with vendor allocated and RFS in about 5 weeks
7. FIELD (Bekasi): the 14 site surveys join this week's list
8. Value Ledger: Surabaya Phase 1 (RFS ~90 days ago), realised CNX uplift vs matched control
9. Agent Studio: 30 agents + 4 proposed, last run, override rates, feedback to Netra

## Deploy for the stakeholder session

`npm run build` produces a static site in `dist/` (Vercel, Netlify or any static host). Add an SPA fallback so deep links work (`/* → /index.html`; `vercel.json` and `public/_redirects` are included).

Optional courtesy password screen: set `VITE_DEMO_PASSWORD_SHA256` (hex SHA-256 of the password) at build time. It is a client-side gate, not security. Use host-level password protection for the real session.

## Assumptions to confirm with IOH

- **Approval thresholds.** The PRD class table gives minor CapEx to the Head of Planning, while the Stage 3 gate gives decisions below IDR 200m to the Regional Manager. The prototype applies both (minor CapEx ≤ IDR 200m → Regional Manager, above → Head of Planning). Editable in Agent Studio → Policy.
- **Demo clock** is Monday 28 Sep 2026 08:00 WIB, data D-1 (27 Sep). Change `now` in `stories.yaml`.
- **Deployment vendors** are fictional (e.g. PT Karya Rollout Nusantara) until IOH names its partners. RAN OEMs and tower companies use real market names only as attributes.
- **IOH marque and palette** are placeholders (text marque; IOH Red / Yellow approximations) pending brand guidelines.
- **Region model** follows the PRD's seven regions; Jabodetabek includes DKI plus Bogor, Depok, Bekasi and Tangerang.
