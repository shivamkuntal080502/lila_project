# Architecture

## What it's built with, and why

**Offline Python preprocessing (`pandas` + `pyarrow`) → static JSON → vanilla
JS/Canvas frontend.** No backend, no database, no build tool.

Rationale: the raw data (1,243 parquet files, ~89k rows, 34MB) is static —
it doesn't change while a Level Designer is browsing it. Parsing parquet in
the browser (via a WASM DuckDB/Arrow build) would add real load latency and
a large JS bundle for no benefit, since the whole dataset comfortably fits
in a few MB of JSON once decoded. So all the "hard" parsing happens once,
offline, in Python; the deployed app just fetches pre-shaped JSON and draws
it. This also means the hosted app has zero server cost and zero cold starts
— any static host works.

Vanilla JS instead of React: the app is one view with a handful of controls
(three dropdowns, some toggles, a scrubber, a canvas). A framework would add
a build step and dependency surface without changing what's actually hard
about this problem (coordinate mapping, event modeling, playback timing).

## Data flow

```
player_data/<Day>/*.nakama-0   (raw parquet, one file = one player in one match)
        │
        ▼  data_prep/build_data.py
   for each file:
     - decode `event` column (bytes -> str)
     - map (x, z) -> (pixel_x, pixel_y) per the map's scale/origin
     - split rows into `path` (Position/BotPosition) and `events`
       (Kill/Killed/BotKill/BotKilled/KilledByStorm/Loot)
     - group by match_id
        │
        ▼
public/data/manifest.json        # match list: map, date, humans, bots, kills,
                                  # deaths, storm_deaths, loot_events, duration
public/data/matches/<id>.json    # per match: all players' paths + events,
                                  # already in minimap pixel space
        │
        ▼  app.js (browser)
   fetch manifest -> populate Map/Date/Match dropdowns
   fetch matches/<id>.json on selection -> draw on <canvas> over the
   minimap <img>, filtered by the current scrub time and toggles
```

## Coordinate mapping (world → minimap pixel)

This is the part the README flagged as tricky, so here's the exact approach:

1. The provided README gives, per map, a `scale` and an `(origin_x, origin_z)`
   in world space, calibrated against a **1024×1024** minimap image.
2. For every event/position row:
   ```
   u = (x - origin_x) / scale
   v = (z - origin_z) / scale
   pixel_x = u * 1024
   pixel_y = (1 - v) * 1024        # v is flipped: image Y grows downward, world Z (as given) grows the other way
   ```
3. **`y` (world elevation) is discarded** for 2D plotting — only `x`/`z` feed
   the minimap. This matches the README's note that `y` is height, not a
   map axis.
4. These pixel coordinates are computed **once, in the Python step**, and
   baked into the JSON in the canonical 1024×1024 space. The frontend's
   `<canvas>` is also 1024×1024 internally and is scaled down responsively
   with CSS (`width: 100%`), so a marker at `(px, py)` always lands in the
   right spot on the minimap regardless of screen size, and the actual
   minimap image files can be any resolution (I downscaled the originals —
   which were 2160²–9000², not 1024² as documented — to 1024×1024 JPGs so
   the pixel math the README specifies lines up exactly, and so they load
   fast).

## Assumptions made where the data was ambiguous

| Ambiguity | Assumption / handling |
|---|---|
| Provided minimap images are not actually 1024×1024 (2160², 4320², 9000²) despite the README stating they are | Resized all three to 1024×1024 so the documented UV→pixel formula applies unmodified; source images are otherwise a plain top-down crop, so resizing doesn't distort the coordinate mapping. |
| `ts` is match-relative but each file's own first timestamp differs slightly (players connect a beat apart) | Rebase each player's `ts` to *that player's own first row* (`t=0` = when their telemetry starts). Good enough for "watch this player's path evolve"; noted here as a simplification rather than syncing all players in a match to one shared clock, since the README doesn't specify a match-start marker to sync against. |
| Some matches' recorded span (`ts` range) is well under a second even though the brief describes matches lasting "several minutes" | Treated as a property of this (evidently down-sampled/synthetic) dataset rather than a bug to "fix" — the playback UI shows real elapsed `ts`, however short, rather than inventing a duration. |
| No explicit "match duration" field | Derived per match as `max(ts) - min(ts)` across all its player files. |
| Bot vs human | Exactly as documented: numeric `user_id` = bot, UUID = human. Verified against the `event` column (`BotPosition`/`BotKill`/`BotKilled` only ever appear on numeric IDs) — no exceptions found in the dataset. |
| Unreadable files / unknown `map_id` | Skipped and counted (0 occurred in this dataset — all 1,243 files parsed cleanly into 796 matches). |

## Major tradeoffs

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| Where parsing happens | Offline (Python, build step) | In-browser (DuckDB-WASM / Arrow.js) | Data is static; offline parsing = smaller, faster, simpler client. Tradeoff: adding new raw data requires re-running a script, not just uploading a file. |
| Frontend framework | Vanilla JS + Canvas | React + a charting lib | Single view, no component reuse to justify the overhead; canvas gives full control over playback redraw performance at 89k+ points. Tradeoff: less structure if the tool grows many more views. |
| Heatmap technique | Additive radial-gradient accumulation on an offscreen canvas, recolored | A proper KDE / binned density (e.g. d3-hexbin, server-computed) | Cheap, dependency-free, fast enough client-side for this data volume, and recomputes instantly when switching Deaths/Kills/Traffic. Tradeoff: less statistically rigorous than a true density estimate. |
| Match sync clock | Per-player, rebased to that player's own first event | A single per-match clock (e.g. earliest event across all players) | Simpler and robust to a player's telemetry starting a moment later than others; the visual difference is sub-second and not meaningful at this data's timescale. |
| Granularity of "player journey" | One player-file = one path+event-set, joined into a match by `match_id` | Pre-merging all players into one giant per-match timeline server-side | Done client-side on load instead (cheap at ≤50 players/match) — keeps the JSON files small and independently cacheable per player if the dataset grows. |
