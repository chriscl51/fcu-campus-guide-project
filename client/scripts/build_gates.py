# -*- coding: utf-8 -*-
"""
Campus gates selectable as an origin point (spec: "從哪個門...出發").
3 gates (西門/東門/北門), each with a real surveyed node in the OSM data.
南門 (south gate) has been permanently closed and removed from campus, so it
is no longer included here. Produces src/data/gates.json.
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
]

for g in GATES:
    g["entranceNode"] = nearest_node(g["lat"], g["lon"])

with open(os.path.join(OUT, "gates.json"), "w", encoding="utf-8") as f:
    json.dump(GATES, f, ensure_ascii=False, indent=1)

print(f"wrote {len(GATES)} gates")
