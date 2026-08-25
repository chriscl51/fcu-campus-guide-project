// The official campus-map picker list is shared by the visitor and admin
// forms. Keeping the rule here (officialCode only) prevents the two
// dropdowns from drifting. Sorted by mapNumber (the "編號 No." on the
// official signboard, 1-29) so the order matches what a visitor sees
// scanning the physical map legend, rather than alphabetical/tier order.
export function selectableBuildings(buildings) {
  return [...buildings]
    .filter((building) => building.officialCode)
    .sort((a, b) => a.mapNumber - b.mapNumber)
}

export function buildingOptionLabel(building) {
  return `${building.officialCode}｜${building.nameZh}`
}

export const POPULAR_BUILDING_IDS = [
  'b262625997', // 圖書館 (LIB)
  'b283040764', // 人言大樓 (RYB)
  'b254446750', // 商學大樓 (BB)
  'b283040778', // 體育館 (SC)
  'b260864150', // 資訊電機館 (IEB)
  'r20159319',  // 共善樓 (VH)
  'b283040788', // 行政大樓 (ADB)
]

export function getPopularBuildings(buildings) {
  return POPULAR_BUILDING_IDS.map((id) => buildings.find((b) => b.id === id)).filter(Boolean)
}
