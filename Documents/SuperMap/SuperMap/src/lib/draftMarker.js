import maplibregl from 'maplibre-gl'
import { sidcDataUrl } from './milSymbols'

export function syncDraftMarker(map, markerRef, { lng, lat, sidc, onDrag }) {
  if (!map || !Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) {
    markerRef.current?.remove()
    markerRef.current = null
    return
  }
  if (!markerRef.current) {
    const el = document.createElement('div')
    el.className = 'draft-pin-marker'
    const img = document.createElement('img')
    img.alt = ''
    el.appendChild(img)
    const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
      .setLngLat([Number(lng), Number(lat)])
      .addTo(map)
    marker.on('dragend', () => {
      const point = marker.getLngLat()
      markerRef.onDrag?.(point.lng, point.lat)
    })
    markerRef.current = marker
  } else {
    markerRef.current.setLngLat([Number(lng), Number(lat)])
  }
  markerRef.onDrag = onDrag
  const img = markerRef.current.getElement().querySelector('img')
  if (img && img.dataset.sidc !== sidc) {
    img.src = sidcDataUrl(sidc, 40)
    img.dataset.sidc = sidc
  }
}

export function clearDraftMarker(markerRef) {
  markerRef.current?.remove()
  markerRef.current = null
}
