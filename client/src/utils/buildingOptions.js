// The official campus-map picker list is shared by the visitor and admin
// forms. Keeping the rules here prevents the two dropdowns from drifting.
const NOT_ON_OFFICIAL_MAP = new Set(['b283040780'])

export function selectableBuildings(buildings) {
  return [...buildings]
    .filter((building) => building.officialCode && !NOT_ON_OFFICIAL_MAP.has(building.id))
    .sort((a, b) => {
      if (a.tier === b.tier) return a.nameZh.localeCompare(b.nameZh, 'zh-Hant')
      return a.tier === 'full' ? -1 : 1
    })
}

export function buildingOptionLabel(building) {
  return `${building.officialCode}｜${building.nameZh}`
}
