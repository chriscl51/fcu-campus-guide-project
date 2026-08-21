# -*- coding: utf-8 -*-
"""
Campus gates selectable as an origin point (spec: "從哪個門...出發").
3 gates (西門/東門/北門) have a real surveyed node in the OSM data. 南門
(south gate) has NO surveyed node in the source files — its position here is
ESTIMATED, not GPS-measured: solved from a 3-point affine fit (using the
other 3 gates as calibration points) between pixel coordinates read off the
official "逢甲大學校區平面圖" schematic map image and their real lat/lon, then
applied to 南門's pixel position on that same schematic. This is flagged
`approx: true` in the output and should be treated as "roughly here" — replace
with a real JOSM survey point when available. Produces src/data/gates.json.
"""
import json
import math
import os

BASE = os.path.dirname(__file__)
OUT = os.path.join(BASE, "..", "src", "data")

graph = json.load(open(os.path.join(OUT, "graph.json"), encoding="utf-8"))


def haversine(a, b):
    R = 6371000.0
    lat1, lon1 = math.radians(a["lat"]), math.radians(a["lon"])
    lat2, lon2 = math.radians(b["lat"]), math.radians(b["lon"])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def nearest_node(lat, lon):
    best, bestd = None, 1e18
    for n in graph["nodes"]:
        d = haversine({"lat": lat, "lon": lon}, n)
        if d < bestd:
            best, bestd = n["id"], d
    return best


GATES = [
    {"id": "gate-west", "nameZh": "西門（大門口）", "nameEn": "West Gate (Main Entrance)", "lat": 24.1788149, "lon": 120.6465614},
    {"id": "gate-east", "nameZh": "東門", "nameEn": "East Gate", "lat": 24.1784066, "lon": 120.6502149},
    {"id": "gate-north", "nameZh": "北門", "nameEn": "North Gate", "lat": 24.1818831, "lon": 120.648129},
    # 南門: estimated from the schematic map (see module docstring) — NOT a
    # GPS survey point. lat/lon solved via affine fit of the map image's pixel
    # grid using the other 3 gates as calibration points (west=(65,895),
    # east=(795,985), north=(468,195) px -> real lat/lon; south label at
    # roughly (65,1105) px on the same image).
    {
        "id": "gate-south", "nameZh": "南門", "nameEn": "South Gate",
        "lat": 24.177892, "lon": 120.646687, "approx": True,
    },
]

for g in GATES:
    g["entranceNode"] = nearest_node(g["lat"], g["lon"])

with open(os.path.join(OUT, "gates.json"), "w", encoding="utf-8") as f:
    json.dump(GATES, f, ensure_ascii=False, indent=1)

print(f"wrote {len(GATES)} gates")
