#!/bin/bash
# Regenerate all src/data/*.json from the raw OSM survey + curated facility data.
# Run this if fcu_routing.osm / fcu_map.osm / the CURATED dict in build_content.py change.
set -e
python3 parse_osm.py
python3 build_content.py
python3 build_gates.py
python3 build_bounds.py
