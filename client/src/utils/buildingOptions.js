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
