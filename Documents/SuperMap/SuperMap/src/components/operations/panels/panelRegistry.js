/** The ten homepage panels, as previews on the desktop and tiles on the dashboard. */
import {
  BatmanPreview, BulletinPreview, CrimePreview, HazardsPreview, HeadlinesPreview,
  MapPreview, MarketsPreview, OrbitalPreview, SituationPreview, XPreview,
} from './previews'

export const PANEL_PREVIEWS = [
  { id: 'situation', title: 'Situation', icon: 'system-properties', size: { w: 420, h: 300 }, component: SituationPreview, pageLabel: 'Batman Mode', pageView: 'batman-overview' },
  { id: 'map', title: 'Live map', icon: 'earth', size: { w: 520, h: 380 }, component: MapPreview, pageLabel: 'Maps', pageView: 'osint-map' },
  { id: 'headlines', title: 'Headlines', icon: 'internet-properties', size: { w: 440, h: 340 }, component: HeadlinesPreview, pageLabel: 'News', pageView: 'news-feeds' },
  { id: 'x', title: 'X / OSINT', icon: 'camera', size: { w: 460, h: 300 }, component: XPreview, pageLabel: 'X feeds', pageView: 'osint-x' },
  { id: 'markets', title: 'Markets', icon: 'display', size: { w: 420, h: 320 }, component: MarketsPreview, pageLabel: 'Markets', pageView: 'news-feeds' },
  { id: 'hazards', title: 'Hazards', icon: 'laptop', size: { w: 420, h: 300 }, component: HazardsPreview, pageLabel: 'Weather', pageView: 'weather' },
  { id: 'orbital', title: 'Orbital', icon: 'monitor', size: { w: 420, h: 300 }, component: OrbitalPreview, pageLabel: 'Batman Mode', pageView: 'batman-overview' },
  { id: 'batman', title: 'Batman Mode', icon: 'manage-your-server', size: { w: 420, h: 300 }, component: BatmanPreview, pageLabel: 'Cases', pageView: 'batman-cases' },
  { id: 'bulletin', title: 'Bulletin', icon: 'network-computers', size: { w: 420, h: 300 }, component: BulletinPreview, pageLabel: 'The Bulletin', pageView: 'bulletin' },
  { id: 'crime', title: 'Crime', icon: 'list-file', size: { w: 420, h: 260 }, component: CrimePreview, pageLabel: 'Crime Intelligence', pageView: 'crime' },
]

export function panelById(id) {
  return PANEL_PREVIEWS.find((panel) => panel.id === id) || null
}
