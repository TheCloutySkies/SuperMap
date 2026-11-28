/**
 * The XP artwork map: a name in the app becomes a slug in /xp-icons, and every
 * slug exists at 16, 32 and 48 px. Unmapped names fall back to the flat SVG.
 */
export const XP_ART = {
  dashboard: 'my-computer',
  home: 'my-computer',
  maps: 'earth',
  earth: 'earth',
  news: 'internet-properties',
  feeds: 'internet-properties',
  bulletin: 'network-computers',
  crime: 'system-properties',
  weather: 'display',
  batman: 'manage-your-server',
  tools: 'folder-open',
  resources: 'folder-closed',
  reports: 'list-file',
  accounts: 'user-accounts',
  vault: 'my-profile-folder',
  videos: 'video-file',
  webcams: 'camera',
  camera: 'camera',
  laptop: 'laptop',
  monitor: 'monitor',
  'system-properties': 'system-properties',
  'internet-properties': 'internet-properties',
  'network-computers': 'network-computers',
  'manage-your-server': 'manage-your-server',
  'folder-open': 'folder-open',
  'folder-closed': 'folder-closed',
  'list-file': 'list-file',
  'user-accounts': 'user-accounts',
  'my-profile-folder': 'my-profile-folder',
  'video-file': 'video-file',
}

export function iconArt(name, size = 16) {
  const slug = XP_ART[name]
  if (!slug) return null
  const rounded = size >= 48 ? 48 : size >= 32 ? 32 : 16
  return `/xp-icons/${slug}-${rounded}.png`
}
