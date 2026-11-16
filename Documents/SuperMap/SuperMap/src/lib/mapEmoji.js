export function emojiToImageData(emoji, size = 64) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, size, size)
  ctx.font = `${Math.floor(size * 0.72)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04)
  return ctx.getImageData(0, 0, size, size)
}

export function pinIconImageId(emoji) {
  const text = String(emoji || '📍')
  const codes = [...text].map((ch) => ch.codePointAt(0).toString(16)).join('-')
  return `pin-emoji-${codes || 'pin'}`
}

export function ensurePinEmoji(map, emoji) {
  const id = pinIconImageId(emoji)
  if (!map || typeof map.hasImage !== 'function') return id
  if (!map.hasImage(id)) {
    const data = emojiToImageData(emoji || '📍', 64)
    if (data) {
      try { map.addImage(id, data, { pixelRatio: 2 }) } catch (_) { /* already added */ }
    }
  }
  return id
}

export function stampPinIcons(map, featureCollection) {
  const features = (featureCollection?.features || []).map((feature) => {
    if (feature?.geometry?.type !== 'Point') return feature
    const emoji = feature.properties?.icon || '📍'
    const iconImage = ensurePinEmoji(map, emoji)
    return {
      ...feature,
      properties: { ...(feature.properties || {}), icon: emoji, iconImage },
    }
  })
  return { type: 'FeatureCollection', features }
}
