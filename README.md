# LILA BLACK — Player Journey Visualizer

A browser tool that turns raw LILA BLACK match telemetry into an interactive
map view for Level Designers — player paths, kills/deaths/loot/storm events,
match playback, and heatmaps — with zero backend.

## Tech stack

- **Preprocessing:** Python (`pandas` + `pyarrow`) — parses the raw `.nakama-0`
  parquet files once and emits compact JSON.
- **Frontend:** Vanilla HTML/CSS/JS + `<canvas>`. No framework, no build step —
  chosen so the whole thing ships and deploys in minutes and any teammate can
  open `app.js` and read it top to bottom.
- **Hosting:** Any static host (Vercel / Netlify / GitHub Pages) — the `public/`
  folder *is* the deployable site.

## Project structure

```
lila-player-journey/
├── data_prep/
│   └── build_data.py       # parquet -> JSON, run once (or whenever data updates)
├── public/                 # <-- this whole folder is the deployed site
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── minimaps/            # 1024x1024 compressed minimap JPGs
│   └── data/
│       ├── manifest.json    # match list + summary stats (map/date/match filters)
│       └── matches/*.json   # one file per match: player paths + events
├── ARCHITECTURE.md
├── INSIGHTS.md
└── README.md
```

## Setup (local)

Data is already preprocessed and committed under `public/data/` and
`public/minimaps/`, so you can run the site immediately:

```bash
cd public
python3 -m http.server 8000
# open http://localhost:8000
```

(A plain `file://` open won't work because the browser blocks `fetch()` on
local files — you need any static server.)

### Re-running the preprocessor (only if the raw data changes)

```bash
cd data_prep
pip install pandas pyarrow
python3 build_data.py /path/to/player_data ../public/data
cp /path/to/player_data/minimaps/*.{png,jpg} ../public/minimaps/   # then re-resize, see script comments
```

## Deploy

No env vars, no server. Point any static host at `public/` as the root:

**Vercel**
```bash
cd public
npx vercel --prod
```

**Netlify**
```bash
cd public
npx netlify deploy --prod --dir=.
```

Or just drag-and-drop the `public/` folder onto vercel.com/new or
app.netlify.com/drop.

## Using the tool

1. Pick a **Map**, then optionally a **Date**, then a **Match** — the match
   dropdown is sorted by player count (biggest matches first).
2. Toggle **Humans / Bots / Paths / Events** to declutter the view.
3. Use the **playback bar** to scrub or auto-play the match — paths and
   events draw progressively up to the current time.
4. Turn on **Heatmap** and switch between Deaths / Kills / Traffic to see
   hot zones.
5. Hover any marker for details; click a player in the sidebar to
   hide/show just that player.
