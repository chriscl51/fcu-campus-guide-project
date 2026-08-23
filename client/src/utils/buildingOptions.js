// The official campus-map picker list is shared by the visitor and admin
// forms. Keeping the rule here (officialCode only) prevents the two
// dropdowns from drifting.
export function selectableBuildings(buildings) {
  return [...buildings]
    .filter((building) => building.officialCode)
    .sort((a, b) => {
      if (a.tier === b.tier) return a.nameEn.localeCompare(b.nameEn, 'en')
      return a.tier === 'full' ? -1 : 1
    })
}

export function buildingOptionLabel(building) {
  return `${building.officialCode}｜${building.nameZh}`
}
