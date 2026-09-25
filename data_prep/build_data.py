"""
LILA BLACK - Player Journey data preprocessor.

Reads every raw parquet (.nakama-0) file under player_data/<Day>/, decodes it,
maps world (x,z) -> minimap pixel coords, and emits a compact JSON bundle per
match plus a manifest the frontend can load instantly (no parquet parsing in
the browser).

Usage:
    python build_data.py /path/to/player_data ./public/data
"""
import sys, os, json, glob
from collections import defaultdict
import pyarrow.parquet as pq
import pandas as pd

MAP_CONFIG = {
    "AmbroseValley": {"scale": 900,  "origin_x": -370, "origin_z": -473},
    "GrandRift":     {"scale": 581,  "origin_x": -290, "origin_z": -290},
    "Lockdown":      {"scale": 1000, "origin_x": -500, "origin_z": -500},
}
IMG_SIZE = 1024

COMBAT = {"Kill", "Killed", "BotKill", "BotKilled"}
DEATH_EVENTS = {"Killed", "BotKilled", "KilledByStorm"}
KILL_EVENTS = {"Kill", "BotKill"}
LOOT = {"Loot"}
POS_EVENTS = {"Position", "BotPosition"}


def to_px(x, z, cfg):
    u = (x - cfg["origin_x"]) / cfg["scale"]
    v = (z - cfg["origin_z"]) / cfg["scale"]
    px = u * IMG_SIZE
    py = (1 - v) * IMG_SIZE
    return round(px, 1), round(py, 1)


def is_bot(user_id: str) -> bool:
    return user_id.isdigit()


def load_file(path):
    try:
        df = pq.read_table(path).to_pandas()
    except Exception as e:
        print(f"  ! skip {path}: {e}")
        return None
    df["event"] = df["event"].apply(lambda x: x.decode("utf-8") if isinstance(x, bytes) else x)
    return df


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "player_data"
    out = sys.argv[2] if len(sys.argv) > 2 else "public/data"
    matches_dir = os.path.join(out, "matches")
    os.makedirs(matches_dir, exist_ok=True)

    day_dirs = sorted([d for d in glob.glob(os.path.join(src, "February_*")) if os.path.isdir(d)])

    # match_id -> { map_id, date, players: {user_id: {is_bot, path:[[px,py,ts]], events:[...]}} }
    matches = {}
    skipped = 0

    for day_dir in day_dirs:
        day = os.path.basename(day_dir)
        files = [f for f in os.listdir(day_dir) if not f.startswith(".")]
        print(f"{day}: {len(files)} files")
        for fname in files:
            df = load_file(os.path.join(day_dir, fname))
            if df is None or df.empty:
                skipped += 1
                continue

            map_id = df["map_id"].iloc[0]
            cfg = MAP_CONFIG.get(map_id)
            if cfg is None:
                skipped += 1
                continue

            match_id = df["match_id"].iloc[0]
            user_id = df["user_id"].iloc[0]
            bot = is_bot(user_id)

            m = matches.setdefault(match_id, {
                "match_id": match_id, "map_id": map_id, "date": day,
                "players": {}, "start_ts": None, "end_ts": None,
            })

            df = df.sort_values("ts")
            ts0 = int(df["ts"].iloc[0].value // 1_000_000)  # ms epoch within match clock
            path = []
            events = []
            for row in df.itertuples(index=False):
                px, py = to_px(row.x, row.z, cfg)
                t_ms = int(row.ts.value // 1_000_000) - ts0
                ev = row.event
                if ev in POS_EVENTS:
                    path.append([px, py, t_ms])
                else:
                    events.append({"t": t_ms, "type": ev, "x": px, "y": py})
                m["start_ts"] = t_ms if m["start_ts"] is None else min(m["start_ts"], t_ms)
                m["end_ts"] = t_ms if m["end_ts"] is None else max(m["end_ts"], t_ms)

            m["players"][user_id] = {
                "user_id": user_id, "bot": bot,
                "path": path, "events": events,
            }

    print(f"Parsed {len(matches)} matches, skipped {skipped} unreadable/unknown-map files")

    manifest = {"maps": {}, "dates": sorted(day_dirs and [os.path.basename(d) for d in day_dirs]),
                "matches": []}

    for match_id, m in matches.items():
        players = list(m["players"].values())
        n_human = sum(1 for p in players if not p["bot"])
        n_bot = sum(1 for p in players if p["bot"])
        kills = sum(1 for p in players for e in p["events"] if e["type"] in KILL_EVENTS)
        deaths = sum(1 for p in players for e in p["events"] if e["type"] in DEATH_EVENTS)
        storm_deaths = sum(1 for p in players for e in p["events"] if e["type"] == "KilledByStorm")
        loot = sum(1 for p in players for e in p["events"] if e["type"] in LOOT)

        manifest["maps"].setdefault(m["map_id"], 0)
        manifest["maps"][m["map_id"]] += 1

        manifest["matches"].append({
            "match_id": match_id,
            "map_id": m["map_id"],
            "date": m["date"],
            "humans": n_human,
            "bots": n_bot,
            "kills": kills,
            "deaths": deaths,
            "storm_deaths": storm_deaths,
            "loot_events": loot,
            "duration_ms": (m["end_ts"] or 0) - (m["start_ts"] or 0),
        })

        safe_id = match_id.replace("/", "_")
        with open(os.path.join(matches_dir, f"{safe_id}.json"), "w") as f:
            json.dump({
                "match_id": match_id, "map_id": m["map_id"], "date": m["date"],
                "duration_ms": (m["end_ts"] or 0) - (m["start_ts"] or 0),
                "players": players,
            }, f, separators=(",", ":"))

    manifest["matches"].sort(key=lambda x: (x["date"], x["map_id"]))
    with open(os.path.join(out, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"Wrote manifest + {len(matches)} match files to {out}")


if __name__ == "__main__":
    main()
