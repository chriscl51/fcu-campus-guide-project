# -*- coding: utf-8 -*-
"""
Recompute src/data/bounds.json from the content that's actually shown on the
map (buildings, gates, parking lots) rather than the full routing graph.

The routing graph intentionally extends into surrounding city streets (so
Dijkstra has room to route along real service/residential roads), but using
its full extent as the map's viewBox left the campus buildings squeezed into
a small corner with huge empty margins. This keeps the visible map framed
tightly on campus, padded by a fixed margin in meters.
"""
import json
import math
import os

BASE = os.path.dirname(__file__)
OUT = os.path.join(BASE, "..", "src", "data")

buildings = json.load(open(os.path.join(OUT, "buildings.json"), encoding="utf-8"))
gates = json.load(open(os.path.join(OUT, "gates.json"), encoding="utf-8"))
pois = json.load(open(os.path.join(OUT, "pois.json"), encoding="utf-8"))
parking = [p for p in pois if p["kind"] in ("parking", "parking_space")]

points = buildings + gates + parking
lats = [p["lat"] for p in points]
lons = [p["lon"] for p in points]

PAD_M = 70.0
mid_lat = (min(lats) + max(lats)) / 2
m_per_deg_lat = (math.pi / 180) * 6371000
m_per_deg_lon = (math.pi / 180) * 6371000 * math.cos(math.radians(mid_lat))
pad_lat = PAD_M / m_per_deg_lat
pad_lon = PAD_M / m_per_deg_lon

bounds = {
    "minLat": min(lats) - pad_lat,
    "maxLat": max(lats) + pad_lat,
    "minLon": min(lons) - pad_lon,
    "maxLon": max(lons) + pad_lon,
}
with open(os.path.join(OUT, "bounds.json"), "w", encoding="utf-8") as f:
    json.dump(bounds, f)
print("bounds (content-framed):", bounds)
