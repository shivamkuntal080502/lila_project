# Insights

Derived from all 1,243 files / 796 matches / ~89k events (Feb 10–14, 2026),
using the tool's own filtering and heatmap views.

## 1. Players almost never fight other players — combat is overwhelmingly human-vs-bot

Across the whole dataset: **2,415 `BotKill` + 700 `BotKilled`** events
(humans killing/dying to bots) vs. just **3 `Kill` + 3 `Killed`** events
(human-vs-human). Human-vs-bot combat outnumbers human-vs-human combat
**~520 to 1**.

- **Metric affected:** PvP encounter rate / "tension" per match, currently ~0.
- **Actionable items:** either bot density is currently doing all the work
  of creating danger (worth confirming that's intentional for this
  difficulty tier), or human players are spatially avoiding each other —
  worth cross-checking match player-count vs. map size, and possibly
  shrinking safe space or nudging spawn points closer together if
  more human PvP is a design goal.
- **Why a Level Designer should care:** if the goal is player-vs-player
  tension, the current map/spawn/loot layout isn't producing it — bots are
  the entire threat model right now, which changes what "balance" even
  means for tuning.

## 2. The storm barely kills anyone — it's a soft deadline, not a real threat

Of 742 total deaths, only **39 (5.3%)** are `KilledByStorm`. The rest are
combat deaths, almost all against bots. Storm lethality also varies a lot
by map: **9.6% of deaths on GrandRift**, **9.2% on Lockdown**, but only
**3.4% on AmbroseValley**.

- **Metric affected:** storm-death rate, average time-to-extract, "danger
  from zone" as a pacing lever.
- **Actionable items:** on AmbroseValley specifically, either the storm
  moves too slowly / gives too much runway relative to the map's size, or
  players are extracting well before it becomes a factor — worth checking
  storm-phase timing against AmbroseValley's (larger) footprint. If the
  intent is for the storm to be a real pressure mechanic on the primary
  map, this is the map to retune first.
- **Why a Level Designer should care:** the storm is a core pacing tool
  (it's literally what's supposed to force movement/extraction per the
  brief) — if it's rarely the thing that ends a player's run, it isn't
  doing its job on the primary map, and encounter design is compensating
  for it via bots instead.

## 3. Deaths cluster hard around a small part of each map

Binning each map into an 8×8 grid (128px cells on the 1024px minimap):
- **AmbroseValley:** the top 3 cells (out of 64) account for **48%** of all
  505 deaths on that map, clustered around the center/center-west of the
  minimap.
- **GrandRift:** even more concentrated — a *single* cell accounts for
  **32.7%** of that map's 52 deaths.

Use the tool's Heatmap → Deaths view on either map to see this directly —
it's a tight, unmissable hot patch rather than a diffuse spread.

- **Metric affected:** death-location variance / "map usage" — right now a
  small fraction of each map's geometry is doing most of the work.
- **Actionable items:** check what's driving the cluster (a loot hotspot,
  a chokepoint in the terrain, or bot patrol routing that funnels players
  through that zone) and consider spreading high-value loot or opening
  an alternate route to pull fights into the rest of the map — otherwise
  the areas outside that cluster are effectively unused, which the brief
  flagged as exactly the kind of thing this tool should surface.
- **Why a Level Designer should care:** this is the clearest signal in the
  data that a large fraction of each map's design budget (terrain,
  cover, sightlines elsewhere on the map) isn't being exercised by real
  play — the tool's per-map heatmap is the fastest way to find where.
