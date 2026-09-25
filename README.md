# LILA BLACK — Player Journey Visualizer

**🔗 Live app:** https://lila-project-rho.vercel.app
**📦 Repo:** https://github.com/shivamkuntal080502/lila_project

A browser tool that turns raw LILA BLACK match telemetry into an interactive map view for Level Designers — player paths, kills/deaths/loot/storm events, match playback, and heatmaps. Zero backend, zero env vars.

---

## What it does

- Loads 5 days of production match data (Feb 10–14, 2026) — 1,243 player files across 796 matches on 3 maps.
- Plots every player's movement path on the correct minimap, with world coordinates properly mapped to image pixels.
- Distinguishes **human players** (blue) from **bots** (gray).
- Marks **kills**, **deaths**, **loot pickups**, and **storm deaths** as distinct event markers.
- Lets you filter by **map**, **date**, and **match**.
- Has a **timeline/playback bar** to watch a match unfold over time.
- Shows **heatmap overlays** for kill zones, death zones, and traffic/high-use areas.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Preprocessing | Python (pandas + pyarrow) | Parses the raw `.nakama-0` parquet files once, offline, into compact JSON — no parquet parsing in the browser. |
| Frontend | Vanilla HTML/CSS/JS + Canvas | One view, a handful of controls — no framework/build step needed. Ships and deploys in minutes, and anyone can open `app.js` and read it top to bottom. |
| Hosting | Any static host (Vercel / Netlify / GitHub Pages) | The `public/` folder *is* the deployable site — no server, no env vars. |

Full reasoning and tradeoffs are in `ARCHITECTURE.md`.

---

## Project structure

- `data_prep/build_data.py` — parquet → JSON, run once (or whenever data updates)
- `public/` — this whole folder is the deployed site
  - `index.html`, `style.css`, `app.js`
  - `minimaps/` — 1024×1024 compressed minimap JPGs
  - `data/manifest.json` — match list + summary stats (powers map/date/match filters)
  - `data/matches/*.json` — one file per match: player paths + events, pre-mapped to pixel space
- `ARCHITECTURE.md` — coordinate mapping, data flow, assumptions, tradeoffs
- `INSIGHTS.md` — 3 data-backed insights from this dataset
- `README.md`

---

## Run it locally

Data is already preprocessed and committed under `public/data/` and `public/minimaps/`, so the site runs immediately — no build step, no dependencies to install for the frontend.

    cd public
    python3 -m http.server 8000
    # open http://localhost:8000

> A plain `file://` open won't work — the browser blocks `fetch()` on local files, so you need any static server.

### Re-running the preprocessor (only needed if the raw data changes)

    cd data_prep
    pip install pandas pyarrow
    python3 build_data.py /path/to/player_data ../public/data

Then re-copy and resize the minimap images into `public/minimaps/` as 1024×1024 JPGs (see comments in `build_data.py`).

---

## Deploy

No env vars, no server — point any static host at `public/` as the root.

**Vercel**

    cd public
    npx vercel --prod

**Netlify**

    cd public
    npx netlify deploy --prod --dir=.

Or drag-and-drop the `public/` folder onto vercel.com/new or app.netlify.com/drop.

> If deploying from this GitHub repo directly via the Vercel/Netlify dashboard instead of the CLI, set **Root Directory = `public`** — otherwise the host will look for an `index.html` at the repo root and fail.

---

## Using the tool

1. Pick a **Map**, then optionally a **Date**, then a **Match** — the match dropdown is sorted by player count (biggest matches first).
2. Toggle **Humans / Bots / Paths / Events** to declutter the view.
3. Use the **playback bar** to scrub or auto-play the match — paths and events draw progressively up to the current time. Adjust speed (0.5×–8×) from the dropdown.
4. Turn on **Heatmap** and switch between **Deaths / Kills / Traffic** to see hot zones on the current map.
5. Hover any marker for a quick label (event type + player); click a player in the sidebar to hide/show just that player's path and events.

---

## Docs

- `ARCHITECTURE.md` — tech choices, data flow, the world→minimap coordinate mapping approach, assumptions made where the data was ambiguous, and major tradeoffs.
- `INSIGHTS.md` — three things learned from the data (with supporting numbers), what they mean for a Level Designer, and what's actionable.
