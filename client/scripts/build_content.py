# -*- coding: utf-8 -*-
"""
Merge the geo-accurate building/POI data (from parse_osm.py) with the
hand-transcribed facility data sourced from the user's real campus documents:
  - 大樓與教室代碼.png            -> building abbreviation codes / room numbering example
  - 飲水機位置與休憩空間.pdf p1   -> per-building drinking-water location description
  - 飲水機位置與休憩空間.pdf p2   -> public rest-area list (location, hours)
  - AED.pdf                        -> 8 AED locations with description
  - fcu_routing.osm (elevator tags) -> named elevators (忠勤樓 x4, 圖書館 x1, + unnamed)

Produces src/data/buildings.json — the single source of truth the Vue app reads.
Every building not explicitly curated below is emitted with tier="partial"
(no fabricated facility data — just name/location/routing).
"""
import json
import os

BASE = os.path.dirname(__file__)
OUT = os.path.join(BASE, "..", "src", "data")

buildings_raw = json.load(open(os.path.join(BASE, "buildings_raw.json"), encoding="utf-8"))
by_name = {b["name_zh"]: b for b in buildings_raw}


def sane_footprint(footprint):
    """Safety net independent of the name-based exclusion in parse_osm.py:
    if a "building" polygon's bounding box is bigger than any real single
    building on this campus could plausibly be (a bad OSM tag catching a
    multi-building compound or boundary way), drop the footprint and let the
    frontend fall back to a dot marker instead of a map-swallowing blob."""
    if not footprint:
        return []
    lats = [p[0] for p in footprint]
    lons = [p[1] for p in footprint]
    lat_span_m = (max(lats) - min(lats)) * 111000
    lon_span_m = (max(lons) - min(lons)) * 102000  # ~cos(24.18°) * 111000
    if lat_span_m > 200 or lon_span_m > 200:
        return []
    return footprint

# ---------------------------------------------------------------------------
# Curated facility content, transcribed directly from the source documents.
# Keyed by the exact name_zh used in the OSM survey (`by_name` above).
# ---------------------------------------------------------------------------
CURATED = {
    "商學大樓": {
        "code": "商", "aliases": [],
        "water": ["每層樓南北兩側走廊底端、洗手間旁（高容量配置）", "8樓（水質檢測點：商8F-1）"],
        "restrooms": ["各樓層南北兩側走廊底端"],
        "elevators": [],
        "aed": ["地資中心(GIS) 商學大樓6F"],
        "rest": ["1樓課間停留空間：進駐「帕哩帕哩小餐館」，設有販賣機與飲水機，依大樓與店家營業時間為準"],
    },
    "資訊電機館": {
        "code": "資電", "aliases": ["資電樓"],
        "water": ["各樓層大電梯旁，或各系所辦公室旁的洗手間走廊", "2樓西右（資電2F-1）、4樓東（資電4F-1）"],
        "restrooms": ["各樓層大電梯旁洗手間"],
        "elevators": [],
        "aed": [],
        "rest": [],
    },
    "人言大樓": {
        "code": "人", "aliases": [],
        "water": ["各樓層兩側洗手間旁茶水間；B1晨曦廳與夕暉廳；1樓東西兩側交誼空間週邊", "5樓東（人言5F-1）、B1西（人言B1-1）"],
        "restrooms": ["各樓層兩側洗手間"],
        "elevators": [],
        "aed": ["人言大樓1F（一樓中間門口進來後靠中間電梯處）"],
        "rest": [
            "B1 晨曦廳（東側）／夕暉廳（西側）：大型地下美食街，校內最主要的指標飲食與聚會場地，依校方各階段開放公告為準",
            "1樓公共用餐休憩區：東西兩側皆有桌椅，方便課間用餐與短暫休息",
            "4至7樓公共走廊特定座位區：僅限走廊指定座位可飲食與休息，教室內一律嚴禁飲食",
        ],
    },
    "逢甲大學圖書館": {
        "display": "圖書館", "code": "圖", "aliases": ["圖書館"],
        "water": ["3樓右（圖3F-1）、B1F南（圖B1-2）"],
        "restrooms": ["各樓層"],
        "elevators": ["圖書館電梯"],
        "aed": [],
        "rest": ["1樓正門右側：路易莎咖啡（逢甲店），指標性連鎖咖啡廳，具備讀書與輕食休憩機能。週一至週五07:30–20:30，週六至週日08:00–16:00"],
    },
    "學思樓": {
        "code": "學", "aliases": [],
        "water": ["各樓層中央中庭電梯旁，或靠近洗手間的走廊盡頭", "7樓（學7F）"],
        "restrooms": ["各樓層中央中庭電梯旁"],
        "elevators": [],
        "aed": [],
        "rest": [],
    },
    "忠勤樓": {
        "code": "忠", "aliases": ["忠勤館"],
        "water": ["各樓層川堂兩側樓梯旁或洗手間走廊", "4樓東（忠4F-01）"],
        "restrooms": ["各樓層川堂兩側"],
        "elevators": ["忠勤樓電梯1", "忠勤樓電梯2", "忠勤樓電梯3", "忠勤樓電梯4"],
        "aed": [],
        "rest": [],
    },
    "工學館": {
        "code": "工", "aliases": [],
        "water": ["各樓層中庭走廊電梯口或洗手間旁", "2樓（工2F-01）"],
        "restrooms": ["各樓層中庭走廊電梯口旁"],
        "elevators": [],
        "aed": [],
        "rest": ["1樓工學館一樓休息區"],
    },
    "理學大樓": {
        "code": "理", "aliases": ["理學樓"],
        "water": ["各樓層兩側樓梯轉角或洗手間旁", "4樓左（理學4F-2）"],
        "restrooms": ["各樓層兩側樓梯轉角"],
        "elevators": [],
        "aed": [],
        "rest": [],
    },
    "土木水利館": {
        "code": "土", "aliases": ["土木館"],
        "water": ["各樓層實驗室集中區的走廊盡頭或洗手間旁", "2樓（土水2F）、5樓（土水5F）"],
        "restrooms": ["各樓層實驗室集中區走廊盡頭"],
        "elevators": [],
        "aed": [],
        "rest": [],
    },
    "語文大樓": {
        "code": "語", "aliases": ["語文樓"],
        "water": ["各樓層洗手間外的公共走廊"],
        "restrooms": ["各樓層洗手間外走廊"],
        "elevators": [],
        "aed": [],
        "rest": [],
    },
    "電子通訊館": {
        "code": "電通", "aliases": ["電通樓"],
        "water": ["各樓層靠近實驗室走廊的茶水間", "5樓（電通5F）"],
        "restrooms": ["各樓層靠近實驗室走廊"],
        "elevators": [],
        "aed": [],
        "rest": [],
    },
    "丘逢甲紀念館": {
        "display": "丘逢甲紀念館", "code": "紀", "aliases": ["紀念館"],
        "water": ["各樓層行政單位辦公室旁的走廊茶水間", "2樓（紀念2F）、5樓（紀念5F）"],
        "restrooms": ["各樓層行政單位辦公室旁"],
        "elevators": [],
        "aed": [],
        "rest": [],
    },
    "科學與航太館": {
        "code": "科航", "aliases": ["科航館"],
        "water": ["各樓層中央洗手間外側走廊", "1樓東（科航1F-2）、7樓（科航7F）"],
        "restrooms": ["各樓層中央洗手間"],
        "elevators": [],
        "aed": [],
        "rest": [],
    },
    "建築館": {
        "code": "建", "aliases": [],
        "water": ["3樓右（建築3F-2）"],
        "restrooms": ["各樓層"],
        "elevators": [],
        "aed": [],
        "rest": [],
    },
    "行政大樓": {
        "code": "行", "aliases": ["行政一館"],
        "water": ["各樓層樓梯口或主管辦公室旁的茶水間"],
        "restrooms": ["各樓層樓梯口旁"],
        "elevators": [],
        "aed": ["大門警衛室（行政大樓旁）"],
        "rest": ["1樓學生用餐休憩區：右側明亮用餐區、左側舒適沙發座與自由展演舞台，附設充電機能。開學期間每日08:00–22:30"],
    },
    "人文社會館": {
        "code": None, "aliases": ["人社館"],
        "water": ["1樓（人社1F）"],
        "restrooms": ["1樓"],
        "elevators": [],
        "aed": [],
        "rest": ["B1（共善學園內）新愉園：校內教職員生專屬，規劃沙發區、高腳椅輕食區與團體餐桌。週一至週五07:30–19:00（週末與國定假日不開放）"],
    },
    "體育館": {
        "code": None, "aliases": [],
        "water": ["1樓、3樓、4樓的球場看台入口周邊及洗手間旁", "403跑道（體4F-1）"],
        "restrooms": ["1樓、3樓、4樓球場看台入口周邊"],
        "elevators": [],
        "aed": ["體育館1F"],
        "rest": [],
    },
    "育樂館": {
        "code": None, "aliases": [],
        "water": ["1樓後方後台休息區及洗手間旁"],
        "restrooms": ["1樓後方後台休息區旁"],
        "elevators": [],
        "aed": ["健康中心 育114室（育樂館）"],
        "rest": [],
    },
    "共善樓": {
        "code": "V", "aliases": ["共善園"],
        "water": ["B1西右（共善B1-02）、1F回收室附近（共善1F-04）"],
        "restrooms": ["1F、B1F（詳見無障礙及性別友善平面圖）"],
        "elevators": ["共善樓電梯（V102/V103）"],
        "aed": ["共善樓1F櫃台右側（EMBA櫃台旁）"],
        "rest": ["B1（共善學園）新愉園，與人文社會館共用空間"],
    },
}

FULL_TIER_NAMES = set(CURATED.keys())

# ---------------------------------------------------------------------------
# Official campus map building code/name table, transcribed directly from the
# CN/EN signboard photo the user took on campus (建築照片/校園地圖中英對照.HEIC).
# This is a DIFFERENT code system from CURATED's "code" field above (which is
# the classroom-numbering prefix, e.g. 商205) — `officialCode` here is the
# short English map-legend code (ADB/BB/LIB/...) printed on the real overview
# map board at the campus gate, used so the app's map/dropdown labels match
# what a visitor sees on the physical signboard. Where this table's English
# name differs from what OSM had, this table wins (it's the authoritative,
# on-the-ground source). Matched by the OSM name_zh (see buildings_raw.json).
# ---------------------------------------------------------------------------
# Third tuple element is the "編號 No." on the official map legend
# (fcu map buildings.jpg) — used to order the building dropdown the same way
# a visitor would scan the physical signboard.
OFFICIAL_CODES = {
    "行政大樓": ("ADB", "Administration Building", 1),
    "行政二館": ("ADB(II)", "Administration Building II", 2),
    "丘逢甲紀念館": ("CMB", "Chiu Feng-Chia Memorial Hall", 3),
    "科學與航太館": ("SAB", "Science and Aeronautical Engineering Building", 4),
    "商學大樓": ("BB", "Business Building", 5),
    "逢甲大學圖書館": ("LIB", "Library", 6),
    "忠勤樓": ("JCB", "Jong-Chin Building", 7),
    "工學館": ("EGB", "Engineering Building", 8),
    "資訊電機館": ("IEB", "Information/Electrical Engineering Building", 9),
    "建築館": ("AB", "Architecture Building", 10),
    "語文大樓": ("LB", "Language Building", 11),
    "第一招待所": ("HH", "History House", 12),
    "人言大樓": ("RYB", "Renyan Building", 13),
    "人文社會館": ("HSB", "Humanities/Social Sciences Building", 14),
    "電子通訊館": ("ECB", "Electronic/Communications Engineering Building", 15),
    "育樂館": ("RB", "Recreation Building", 16),
    "土木水利館": ("CHB", "Civil/Hydraulic Engineering Building", 17),
    "理學大樓": ("SB", "Sciences Building", 18),
    "文華創意中心": ("WIC", "Wenhwa Innovation Center", 19),
    "學思樓": ("XSB", "Xuesi Building", 20),
    "學思園": ("XSG", "Xuesi Garden", 21),
    "體育館": ("SC", "Sports Center", 22),
    "逢甲智慧創新港": ("IH", "i-Hub Intelligent Innovation Harbor", 23),
    "逢甲大學游泳池": ("SP", "Swimming Pool", 24),
    "綜合運動場": ("AF", "Athletic Field", 25),
    "網球場": ("TC", "Tennis Court", 26),
    "籃球場": ("BC", "Basketball Court", 27),
    "排球場": ("VC", "Volleyball Court", 28),
    "共善樓": ("VH", "Virtuosi Hall", 29),
}

# Real on-campus photos the user took, shipped as static files in public/
# buildings/ (root-relative URL, NOT src/assets — Vite doesn't serve files
# under src/ as-is, they'd need a JS import to get a resolved URL, and a
# plain data-driven <img :src> string like this needs a real static path).
# Matched by the OSM name_zh. Everything else keeps photo=None -> frontend
# shows a "照片準備中" placeholder rather than a fabricated/AI image.
PHOTOS = {
    "丘逢甲紀念館": "buildings/chiu-fengchia-memorial.jpg",
    "逢甲大學圖書館": "buildings/library.jpg",
    "忠勤樓": "buildings/jongchin.jpg",
    "科學與航太館": "buildings/science-aeronautical.jpg",
    "行政二館": "buildings/administration-2.jpg",
    "工學館": "buildings/engineering.jpg",
    "商學大樓": "buildings/business.jpg",
    "資訊電機館": "buildings/information-electrical.jpg",
    "人言大樓": "buildings/renyan.jpg",
    "學思樓": "buildings/xuesi.jpg",
    "理學大樓": "buildings/sciences.jpg",
    "土木水利館": "buildings/civil-hydraulic.jpg",
    "體育館": "buildings/sports-center.jpg",
    "建築館": "buildings/architecture.jpg",
    "電子通訊館": "buildings/electronic-communications.jpg",
    "人文社會館": "buildings/humanities-social.jpg",
    "語文大樓": "buildings/language.jpg",
    "育樂館": "buildings/recreation.jpg",
    "共善樓": "buildings/virtuosi.jpg",
    "學思園": "buildings/xuesi-garden.jpg",
    "文華創意中心": "buildings/wenhwa-innovation.jpg",
    "第一招待所": "buildings/history-house.jpg",
    "逢甲智慧創新港": "buildings/ihub-innovation.jpg",
    "逢甲大學游泳池": "buildings/swimming-pool.jpg",
    "綜合運動場": "buildings/stadium.jpg",
    "網球場": "buildings/tennis-court.jpg",
    "籃球場": "buildings/basketball-court.jpg",
    "排球場": "buildings/volleyball-court.jpg",
}

# Short access/parking notes shown on the facility page regardless of tier
# (e.g. an entrance that's easy to miss from the main campus, or which
# parking lot to route drivers to) — user-provided, not fabricated. Keyed by
# name_zh; translated into all locales in facilityContentI18n.js.
ACCESS_NOTES = {
    "逢甲智慧創新港": "智慧創新港入口在西安街，開車請導航至凱旋路停車場。",
}

buildings_out = []
for b in buildings_raw:
    name = b["name_zh"]
    if name not in OFFICIAL_CODES:
        # Not one of the 29 numbered entries on the official FCU campus map
        # signboard (fcu map no.jpg / fcu map buildings.jpg) — e.g. a
        # neighboring non-campus building, a shop, or a POI OSM mistagged as
        # a building. Excluded entirely so the app only ever shows buildings
        # a visitor can actually match against the physical map.
        continue
    curated = CURATED.get(name)
    official = OFFICIAL_CODES.get(name)
    entry = {
        "id": b["id"],
        "nameZh": curated.get("display", name) if curated else name,
        # Prefer the official signboard's English name (authoritative, matches
        # the physical sign a visitor sees) over the raw OSM name:en tag.
        "nameEn": (official[1] if official else None) or b.get("name_en") or "",
        "lat": b["lat"],
        "lon": b["lon"],
        "entranceNode": b["entranceNode"],
        # Real building polygon ring [[lat,lon], ...] for drawing a filled
        # shape on the map (schematic-map style redesign) — [] if the source
        # data had no surveyed polygon for this building.
        "footprint": sane_footprint(b.get("footprint")),
        "roomCode": (curated or {}).get("code"),
        # Short map-legend code from the official CN/EN signboard (ADB/BB/LIB/...)
        # — used on the redesigned map + dropdown labels so they match the real
        # board at the campus gate. Distinct from roomCode (classroom prefix).
        "officialCode": official[0] if official else None,
        # Position on the official map legend (1-29) — drives dropdown order.
        "mapNumber": official[2] if official else None,
        "tier": "full" if curated else "partial",
        # Shown on the facility page regardless of tier — see ACCESS_NOTES above.
        "accessNote": ACCESS_NOTES.get(name),
        "facilities": {
            "water": (curated or {}).get("water", []),
            "restrooms": (curated or {}).get("restrooms", []),
            "elevators": (curated or {}).get("elevators", []),
            "aed": (curated or {}).get("aed", []),
            "rest": (curated or {}).get("rest", []),
        } if curated else None,
        # Real on-campus photos only (src/assets/buildings/) — never AI-generated
        # or stock substitutes. None -> frontend shows a "照片準備中" placeholder.
        "photo": PHOTOS.get(name),
    }
    buildings_out.append(entry)

# sort: full-tier first (alphabetical-ish by code), then partial
buildings_out.sort(key=lambda b: (b["tier"] != "full", b["nameZh"]))

with open(os.path.join(OUT, "buildings.json"), "w", encoding="utf-8") as f:
    json.dump(buildings_out, f, ensure_ascii=False, indent=1)

print(f"wrote {len(buildings_out)} buildings ({sum(1 for b in buildings_out if b['tier']=='full')} full-tier)")
for b in buildings_out:
    if b["tier"] == "full":
        print(" full:", b["nameZh"], b["roomCode"])
