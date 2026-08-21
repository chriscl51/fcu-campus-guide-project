"""
Parse the real FCU campus OSM data (from JOSM survey) into clean JSON used by the Vue app:
  - src/data/graph.json     : walking-path graph (nodes + edges) for Dijkstra routing
  - src/data/buildings.json : building list with real lat/lon centroid + entrance node
  - src/data/pois.json      : point-of-interest facilities (toilet/elevator/AED/water/parking/bench)

Source files (real survey data provided by the user, traced in JOSM):
  - fcu_routing.osm : hand-traced walkable paths/crossings/service roads + some POIs (elevators)
  - fcu_map.osm      : full campus survey - buildings, shops, POIs, roads
"""
import xml.etree.ElementTree as ET
import json
import math
import os

BASE = os.path.dirname(__file__)
OUT = os.path.join(BASE, "..", "src", "data")
RAW = BASE  # intermediate *_raw.json files stay in scripts/, not shipped in src/data
os.makedirs(OUT, exist_ok=True)


def load(fname):
    tree = ET.parse(os.path.join(BASE, fname))
    root = tree.getroot()
    nodes = {}
    for n in root.findall("node"):
        nid = n.get("id")
        tags = {t.get("k"): t.get("v") for t in n.findall("tag")}
        nodes[nid] = {"id": nid, "lat": float(n.get("lat")), "lon": float(n.get("lon")), "tags": tags}
    ways = []
    for w in root.findall("way"):
        tags = {t.get("k"): t.get("v") for t in w.findall("tag")}
        refs = [nd.get("ref") for nd in w.findall("nd")]
        ways.append({"id": w.get("id"), "tags": tags, "refs": refs})
    relations = []
    for r in root.findall("relation"):
        tags = {t.get("k"): t.get("v") for t in r.findall("tag")}
        members = [{"type": m.get("type"), "ref": m.get("ref"), "role": m.get("role")} for m in r.findall("member")]
        relations.append({"id": r.get("id"), "tags": tags, "members": members})
    return nodes, ways, relations


routing_nodes, routing_ways, routing_relations = load("fcu_routing.osm")
map_nodes, map_ways, map_relations = load("fcu_map.osm")

# ---------------------------------------------------------------------------
# 1. Walking graph — built from fcu_routing.osm (hand-traced for routing) plus
#    pedestrian/footway/service ways from fcu_map.osm so the graph also reaches
#    building entrances and parking aisles surveyed there.
# ---------------------------------------------------------------------------
WALKABLE = {"footway", "pedestrian", "path", "service", "steps", "residential", "living_street", "cycleway", "track"}

def haversine(a, b):
    R = 6371000.0
    lat1, lon1 = math.radians(a["lat"]), math.radians(a["lon"])
    lat2, lon2 = math.radians(b["lat"]), math.radians(b["lon"])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


all_nodes = {}
all_nodes.update(routing_nodes)
for nid, n in map_nodes.items():
    all_nodes.setdefault(nid, n)

edges = {}  # (a,b) -> dist, undirected, deduped


def add_edge(a, b):
    if a == b or a not in all_nodes or b not in all_nodes:
        return
    d = haversine(all_nodes[a], all_nodes[b])
    key = tuple(sorted((a, b)))
    if key not in edges or edges[key] > d:
        edges[key] = d


used_node_ids = set()
for way in routing_ways + [w for w in map_ways if w["tags"].get("highway") in WALKABLE]:
    hw = way["tags"].get("highway")
    if hw not in WALKABLE:
        continue
    refs = way["refs"]
    for i in range(len(refs) - 1):
        add_edge(refs[i], refs[i + 1])
        used_node_ids.add(refs[i])
        used_node_ids.add(refs[i + 1])

graph_nodes = {nid: {"id": nid, "lat": all_nodes[nid]["lat"], "lon": all_nodes[nid]["lon"]}
               for nid in used_node_ids if nid in all_nodes}

# ---------------------------------------------------------------------------
# 1b. Snap-merge: fcu_routing.osm was hand-traced as a separate JOSM layer on
#     top of fcu_map.osm, so its paths use their own local node IDs and are
#     geometrically coincident with (but not graph-connected to) the surveyed
#     map network. Union-Find + a small-radius proximity pass stitches the two
#     networks together wherever a routing node sits within SNAP_M meters of a
#     map node (path crossing a road, entering a building plaza, etc.) so
#     Dijkstra can actually find a route between any two buildings.
# ---------------------------------------------------------------------------
parent = {nid: nid for nid in graph_nodes}

def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x

def union(a, b):
    ra, rb = find(a), find(b)
    if ra != rb:
        parent[ra] = rb

for a, b in edges:
    union(a, b)

ids = list(graph_nodes.keys())
snap_edges = []


def bbox_close(ni, nj, radius_m):
    deg_margin = (radius_m / 111000.0) * 1.5
    return abs(ni["lat"] - nj["lat"]) <= deg_margin and abs(ni["lon"] - nj["lon"]) <= deg_margin


# Phase A: add EVERY nearby pair within DENSE_SNAP_M, not just enough to make
# the graph technically connected. fcu_routing.osm (hand-traced, negative
# local IDs) and fcu_map.osm (surveyed, positive OSM IDs) are two physically
# coincident but graph-disconnected layers — a first version of this script
# only bridged them at ONE point (via union-find "skip if already connected"),
# which technically connected the whole graph but left Dijkstra taking huge
# detours to that single bridge point for any route that crosses between
# layers anywhere else on campus (e.g. parking-lot-on-map-layer -> building
# entrance-on-routing-layer, a few dozen meters apart in reality, came out as
# a 2.7km route). Bridging every close pair fixes that at the cost of a few
# hundred extra short edges — trivial for the graph size here.
DENSE_SNAP_M = 12.0
for i in range(len(ids)):
    ni = graph_nodes[ids[i]]
    for j in range(i + 1, len(ids)):
        nj = graph_nodes[ids[j]]
        if not bbox_close(ni, nj, DENSE_SNAP_M):
            continue
        d = haversine(ni, nj)
        if d <= DENSE_SNAP_M:
            key = tuple(sorted((ids[i], ids[j])))
            if key not in edges:
                edges[key] = d
                snap_edges.append(key)
                union(ids[i], ids[j])

# Phase B: guarantee full connectivity for any components phase A missed, by
# widening the search radius but only between still-disconnected components.
FALLBACK_SNAP_M = 60.0
for i in range(len(ids)):
    ni = graph_nodes[ids[i]]
    for j in range(i + 1, len(ids)):
        if find(ids[i]) == find(ids[j]):
            continue
        nj = graph_nodes[ids[j]]
        if not bbox_close(ni, nj, FALLBACK_SNAP_M):
            continue
        d = haversine(ni, nj)
        if d <= FALLBACK_SNAP_M:
            key = tuple(sorted((ids[i], ids[j])))
            if key not in edges:
                edges[key] = d
                snap_edges.append(key)
                union(ids[i], ids[j])

print(f"snap-merge added {len(snap_edges)} bridging edges")

graph_edges = [{"a": a, "b": b, "d": round(d, 2)} for (a, b), d in edges.items()]

print(f"graph: {len(graph_nodes)} nodes, {len(graph_edges)} edges")

with open(os.path.join(OUT, "graph.json"), "w", encoding="utf-8") as f:
    json.dump({"nodes": list(graph_nodes.values()), "edges": graph_edges}, f, ensure_ascii=False)


# ---------------------------------------------------------------------------
# helper: nearest graph node to a lat/lon point
# ---------------------------------------------------------------------------
def nearest_graph_node(lat, lon):
    best, bestd = None, 1e18
    for nid, n in graph_nodes.items():
        d = haversine({"lat": lat, "lon": lon}, n)
        if d < bestd:
            best, bestd = nid, d
    return best


# ---------------------------------------------------------------------------
# 2. Buildings — polygons/ways tagged building=* (or campus landmarks worth
#    treating as a "building" for wayfinding purposes) from fcu_map.osm.
# ---------------------------------------------------------------------------
def way_centroid(way):
    pts = [map_nodes[r] for r in way["refs"] if r in map_nodes]
    if not pts:
        return None
    lat = sum(p["lat"] for p in pts) / len(pts)
    lon = sum(p["lon"] for p in pts) / len(pts)
    return lat, lon


def way_footprint(way):
    """The building's real polygon ring [[lat,lon], ...], for drawing a filled
    shape on the map (spec item: redesign the map to look like the official
    schematic, with solid building blocks rather than a single dot)."""
    return [[map_nodes[r]["lat"], map_nodes[r]["lon"]] for r in way["refs"] if r in map_nodes]


LANDMARK_AMENITY = {"college", "university", "library"}

# amenity=university is also tagged on the whole-campus boundary way(s) in
# this OSM extract (not just individual buildings) — those have a ~400m
# footprint spanning most of campus, which swallowed the entire map once
# footprints started being drawn as filled shapes (map redesign). These
# aren't real single "buildings" a visitor would navigate to, so they're
# excluded from the destination list rather than rendered/selected.
EXCLUDE_CAMPUS_BOUNDARY_NAMES = {"逢甲大學", "逢甲大學水湳校區"}

buildings = []
seen_names = set()
for way in map_ways:
    tags = way["tags"]
    is_building = "building" in tags
    is_landmark = tags.get("amenity") in LANDMARK_AMENITY or tags.get("leisure") == "sports_centre"
    if not (is_building or is_landmark):
        continue
    name = tags.get("name") or tags.get("name:zh")
    if not name or name in EXCLUDE_CAMPUS_BOUNDARY_NAMES:
        continue
    c = way_centroid(way)
    if not c:
        continue
    lat, lon = c
    key = name
    if key in seen_names:
        continue
    seen_names.add(key)
    buildings.append({
        "id": f"b{way['id']}",
        "osmId": way["id"],
        "name_zh": name,
        "name_en": tags.get("name:en", ""),
        "lat": lat,
        "lon": lon,
        "entranceNode": nearest_graph_node(lat, lon),
        "footprint": way_footprint(way),
    })

# ---------------------------------------------------------------------------
# 2b. Buildings stored as `relation` (multipolygon) instead of a single tagged
#     `way` — fcu_map.osm records some buildings (e.g. 工學館, 行政二館) as a
#     relation with an "outer" way member plus an "inner" courtyard/hole way.
#     The way-only loop above misses these entirely; extract them here using
#     the outer way ring(s) for the centroid. This was a real gap found while
#     reconciling against the official building signboard — 行政二館 has no
#     `building=*` way at all in this extract, only this relation form.
# ---------------------------------------------------------------------------
way_by_id = {w["id"]: w for w in map_ways}
for rel in map_relations:
    tags = rel["tags"]
    if "building" not in tags:
        continue
    name = tags.get("name") or tags.get("name:zh")
    if not name or name in seen_names:
        continue
    outer_refs = []
    outer_ways = []
    for m in rel["members"]:
        if m["type"] == "way" and m["role"] == "outer" and m["ref"] in way_by_id:
            outer_refs.extend(way_by_id[m["ref"]]["refs"])
            outer_ways.append(way_by_id[m["ref"]])
    pts = [map_nodes[r] for r in outer_refs if r in map_nodes]
    if not pts:
        continue
    lat = sum(p["lat"] for p in pts) / len(pts)
    lon = sum(p["lon"] for p in pts) / len(pts)
    seen_names.add(name)
    # A relation can have multiple disjoint "outer" rings (rare here) — use the
    # largest one as the drawable footprint polygon.
    footprint = max((way_footprint(w) for w in outer_ways), key=len, default=[])
    buildings.append({
        "id": f"r{rel['id']}",
        "osmId": rel["id"],
        "name_zh": name,
        "name_en": tags.get("name:en", ""),
        "lat": lat,
        "lon": lon,
        "entranceNode": nearest_graph_node(lat, lon),
        "footprint": footprint,
    })
    print(f"  + relation building: {name} (relation {rel['id']})")

# Manual patches for real campus buildings that exist on official maps/facility
# lists but weren't tagged `building=*` or captured by any relation in this
# OSM extract (tagged `area=yes` instead, or not surveyed as a way at all):
if "405974391" in way_by_id and "工學館" not in seen_names:
    c = way_centroid(way_by_id["405974391"])
    if c:
        buildings.append({
            "id": "b405974391", "osmId": "405974391", "name_zh": "工學館", "name_en": "Engineering Building",
            "lat": c[0], "lon": c[1], "entranceNode": nearest_graph_node(*c),
            "footprint": way_footprint(way_by_id["405974391"]),
        })
        seen_names.add("工學館")

# 共善樓 (Gongshan Building / EMBA complex): fallback if no relation/way match
# above — only an AED point recorded inside it, no polygon, so no footprint.
if "13353672109" in map_nodes and "共善樓" not in seen_names:
    n = map_nodes["13353672109"]
    buildings.append({
        "id": "gongshan-manual", "osmId": None, "name_zh": "共善樓", "name_en": "Gongshan Building",
        "lat": n["lat"], "lon": n["lon"], "entranceNode": nearest_graph_node(n["lat"], n["lon"]),
        "footprint": [],
    })
    seen_names.add("共善樓")

print(f"buildings: {len(buildings)}")
with open(os.path.join(RAW, "buildings_raw.json"), "w", encoding="utf-8") as f:
    json.dump(buildings, f, ensure_ascii=False, indent=1)


# ---------------------------------------------------------------------------
# 3. POIs — toilets / drinking_water / elevators / AED / parking / bench
# ---------------------------------------------------------------------------
POI_AMENITY = {"toilets", "drinking_water", "parking", "bench", "parking_space"}

pois = []
for nid, n in list(map_nodes.items()) + list(routing_nodes.items()):
    tags = n["tags"]
    if not tags:
        continue
    kind = None
    if tags.get("highway") == "elevator":
        kind = "elevator"
    elif tags.get("emergency") == "defibrillator":
        kind = "aed"
    elif tags.get("amenity") in POI_AMENITY:
        kind = tags.get("amenity")
    if not kind:
        continue
    pois.append({
        "id": nid,
        "kind": kind,
        "name": tags.get("name", ""),
        "lat": n["lat"],
        "lon": n["lon"],
        "wheelchair": tags.get("wheelchair", ""),
    })

for way in map_ways:
    tags = way["tags"]
    kind = None
    if tags.get("amenity") == "parking":
        kind = "parking"
    elif tags.get("amenity") == "parking_space":
        kind = "parking"
    if not kind:
        continue
    c = way_centroid(way)
    if not c:
        continue
    pois.append({
        "id": f"w{way['id']}",
        "kind": kind,
        "name": tags.get("name", ""),
        "lat": c[0],
        "lon": c[1],
        "wheelchair": tags.get("wheelchair", ""),
    })

print(f"pois: {len(pois)}")
with open(os.path.join(RAW, "pois_raw.json"), "w", encoding="utf-8") as f:
    json.dump(pois, f, ensure_ascii=False, indent=1)

# ---------------------------------------------------------------------------
# 4. Campus bounds (for the local equirectangular projection used by the SVG map)
# ---------------------------------------------------------------------------
lats = [n["lat"] for n in graph_nodes.values()]
lons = [n["lon"] for n in graph_nodes.values()]
bounds = {"minLat": min(lats), "maxLat": max(lats), "minLon": min(lons), "maxLon": max(lons)}
print("bounds:", bounds)
with open(os.path.join(OUT, "bounds.json"), "w", encoding="utf-8") as f:
    json.dump(bounds, f)
