/**
 * High-resolution print renderer (mpetroff/print-maps pattern, MapLibre, no Mapbox).
 * Hidden map at Letter CSS size × pixelRatio, then collar composited on a 2D canvas.
 */

import maplibregl from 'maplibre-gl'
import { isGeckoEngine } from './mapPerf'
import { buildPrintStyle } from './printMapStyle'
import {
  LETTER_IN,
  MAP_FRAME_MM,
  frameMm,
  getScale,
  pageGeometry,
  scaleBarGroundM,
  zoomForScale,
} from './printScale'
import { formatMgrsPretty, latLngToMgrs, latLngToUtm } from './utmMgrs'

const MM_PER_IN = 25.4
/** Soft cap: more pages need an explicit confirm (LibreWolf / Firefox). */
export const PRINT_PAGE_WARN_CAP = 12
const JPEG_QUALITY = 0.92

export const PRINT_QUALITIES = [
  { id: 'draft', label: 'Draft', dpi: 120, jpeg: 0.82 },
  { id: 'standard', label: 'Standard', dpi: 220, jpeg: 0.92 },
  { id: 'high', label: 'High', dpi: 300, jpeg: 0.95 },
]
const HIDDEN_CHROME_LAYERS = [
  'print-pages-fill',
  'print-pages-line',
  'print-pages-label',
  'print-ghost-fill',
  'print-ghost-line',
  'print-box-fill',
  'print-box-line',
  'print-grid-line',
  'print-mgrs-label',
]

function capDpiToGpu(dpi) {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    const max = gl ? gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) : 4096
    const letterPx = 11 * dpi
    if (letterPx > max * 0.92) return Math.max(96, Math.floor((max * 0.92) / 11))
  } catch {
    /* keep requested dpi */
  }
  return dpi
}

/** Resolve a user quality preset to DPI + JPEG quality. High stays sharp; Firefox/LibreWolf stays a step below High unless the user picks High. */
export function resolvePrintQuality(qualityId) {
  const preset = PRINT_QUALITIES.find((q) => q.id === qualityId) || PRINT_QUALITIES[1]
  let dpi = preset.dpi
  if (isGeckoEngine() && preset.id === 'standard') dpi = 180
  if (isGeckoEngine() && preset.id === 'draft') dpi = 120
  return { ...preset, dpi: capDpiToGpu(dpi) }
}

export function pickPrintDpi() {
  return resolvePrintQuality('standard').dpi
}

function yieldUi() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function waitIdle(map, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Map render timed out')), timeoutMs)
    const done = () => {
      clearTimeout(t)
      resolve()
    }
    if (map.loaded() && !map.isMoving()) {
      map.once('idle', done)
      map.triggerRepaint()
      return
    }
    map.once('idle', done)
  })
}

function drawScaleBar(ctx, x, y, widthPx, label, color = '#111') {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + widthPx, y)
  ctx.moveTo(x, y - 8)
  ctx.lineTo(x, y + 8)
  ctx.moveTo(x + widthPx, y - 8)
  ctx.lineTo(x + widthPx, y + 8)
  ctx.stroke()
  ctx.font = '11px "Trebuchet MS", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('0', x, y + 20)
  ctx.fillText(label, x + widthPx, y + 20)
  ctx.restore()
}

function drawCollar(ctx, page, dpi, mapBitmap, attribution, mapTitle) {
  const scale = getScale(page.scaleId)
  const landscape = page.orientation === 'landscape'
  const pageW = (landscape ? LETTER_IN.height : LETTER_IN.width) * dpi
  const pageH = (landscape ? LETTER_IN.width : LETTER_IN.height) * dpi
  const frame = frameMm(page.orientation)
  const mapW = (frame.width / MM_PER_IN) * dpi
  const mapH = (frame.height / MM_PER_IN) * dpi
  const ox = (pageW - mapW) / 2
  const oy = ((MAP_FRAME_MM.height === frame.height ? 18 : 14) / MM_PER_IN) * dpi

  ctx.fillStyle = '#f4f1ea'
  ctx.fillRect(0, 0, pageW, pageH)
  ctx.fillStyle = '#111'
  ctx.strokeStyle = '#111'
  ctx.lineWidth = 1
  ctx.strokeRect(ox - 1, oy - 1, mapW + 2, mapH + 2)
  ctx.drawImage(mapBitmap, ox, oy, mapW, mapH)

  const geo = pageGeometry(page.lng, page.lat, scale.ratio, page.orientation)
  const utm = latLngToUtm(page.lat, page.lng)
  const mgrs = formatMgrsPretty(latLngToMgrs(page.lat, page.lng, 5))
  const barMm = 100
  const barPx = (barMm / MM_PER_IN) * dpi
  const barM = scaleBarGroundM(scale.ratio)
  const barLabel = barM >= 1000 ? `${barM / 1000} km` : `${Math.round(barM)} m`

  const title = String(mapTitle || 'Good Palantir').trim().slice(0, 64) || 'Good Palantir'
  ctx.fillStyle = '#111'
  ctx.font = `bold ${Math.round(dpi * 0.13)}px "Trebuchet MS", sans-serif`
  ctx.textAlign = 'left'
  ctx.fillText(title, ox, oy - 8)
  ctx.font = `${Math.round(dpi * 0.11)}px "Trebuchet MS", sans-serif`
  ctx.textAlign = 'right'
  ctx.fillText(scale.short, ox + mapW, oy - 8)

  const footY = oy + mapH + (12 / MM_PER_IN) * dpi
  drawScaleBar(ctx, ox, footY, barPx, barLabel)
  ctx.font = `${Math.round(dpi * 0.09)}px "Trebuchet MS", sans-serif`
  ctx.textAlign = 'left'
  ctx.fillText(`100 mm at ${scale.short}  ·  print Actual size / 100%`, ox, footY + (10 / MM_PER_IN) * dpi)
  ctx.textAlign = 'right'
  const gridLine = `UTM ${utm.zone}${utm.north ? 'N' : 'S'}  ${Math.round(utm.easting)}E ${Math.round(utm.northing)}N`
  ctx.fillText(gridLine, ox + mapW, footY)
  ctx.fillText(mgrs, ox + mapW, footY + (8 / MM_PER_IN) * dpi)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#444'
  ctx.font = `${Math.round(dpi * 0.08)}px "Trebuchet MS", sans-serif`
  ctx.fillText(
    `${geo.widthM / 1000} × ${geo.heightM / 1000} km  ·  ${attribution || 'OpenStreetMap, Esri'}`,
    ox,
    pageH - (8 / MM_PER_IN) * dpi,
  )
  return { pageW, pageH }
}

function applyPreviewPaint(map, ink, hillshade, contours, labels) {
  const canvas = map.getCanvas()
  canvas.style.filter = ink === 'bw' ? 'grayscale(1) contrast(1.15)' : ''
  const hillOp = hillshade === 'sharp' ? 0.55 : hillshade === 'soft' ? 0.32 : 0
  const contOp = contours === 'full' ? 0.72 : contours === 'sparse' ? 0.38 : 0
  if (map.getLayer('print-hillshade')) {
    map.setLayoutProperty('print-hillshade', 'visibility', hillOp ? 'visible' : 'none')
    if (hillOp) map.setPaintProperty('print-hillshade', 'raster-opacity', hillOp)
  }
  if (map.getLayer('print-contours')) {
    map.setLayoutProperty('print-contours', 'visibility', contOp ? 'visible' : 'none')
    if (contOp) map.setPaintProperty('print-contours', 'raster-opacity', contOp)
  }
  if (map.getLayer('print-labels')) {
    map.setLayoutProperty('print-labels', 'visibility', labels === 'full' ? 'visible' : 'none')
  }
  if (map.getLayer('basemap_labels')) {
    map.setLayoutProperty('basemap_labels', 'visibility', labels === 'full' ? 'visible' : 'none')
  }
}

function pageCssSize(page) {
  const frame = frameMm(page.orientation)
  return {
    cssW: (frame.width / MM_PER_IN) * 96,
    cssH: (frame.height / MM_PER_IN) * 96,
  }
}

function createHiddenPrintMap(basemapId, pixelRatio, cssW, cssH) {
  const hidden = document.createElement('div')
  hidden.className = 'print-hidden-map'
  hidden.style.cssText = 'position:fixed;left:-20000px;top:0;width:0;height:0;overflow:hidden;'
  const container = document.createElement('div')
  container.style.width = `${cssW}px`
  container.style.height = `${cssH}px`
  hidden.appendChild(container)
  document.body.appendChild(hidden)
  const map = new maplibregl.Map({
    container,
    style: buildPrintStyle(basemapId),
    center: [0, 0],
    zoom: 2,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    preserveDrawingBuffer: true,
    pixelRatio,
    pitch: 0,
    bearing: 0,
  })
  return { hidden, container, map }
}

function destroyHiddenPrintMap(session) {
  if (!session) return
  try {
    session.map.remove()
  } catch {
    /* ignore */
  }
  session.hidden?.remove()
}

async function waitMapLoad(map) {
  if (map.loaded()) return
  await new Promise((resolve) => {
    map.once('load', resolve)
    setTimeout(resolve, 12000)
  })
}

function hideChromeLayers(map) {
  HIDDEN_CHROME_LAYERS.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
  })
}

function snapshotMapCanvas(map, ink) {
  const srcCanvas = map.getCanvas()
  const bmp = document.createElement('canvas')
  bmp.width = srcCanvas.width
  bmp.height = srcCanvas.height
  const bctx = bmp.getContext('2d')
  if (ink === 'bw') bctx.filter = 'grayscale(1) contrast(1.15)'
  bctx.drawImage(srcCanvas, 0, 0)
  return bmp
}

async function capturePageOnMap(session, page, options) {
  const { dpi, ink, hillshade, contours, labels, extraVisibility } = options
  const { map, container } = session
  const scale = getScale(page.scaleId)
  const { cssW, cssH } = pageCssSize(page)
  const canvasW = (frameMm(page.orientation).width / MM_PER_IN) * dpi
  if (container.style.width !== `${cssW}px` || container.style.height !== `${cssH}px`) {
    container.style.width = `${cssW}px`
    container.style.height = `${cssH}px`
    map.resize()
  }
  map.jumpTo({
    center: [page.lng, page.lat],
    zoom: zoomForScale(page.lat, pageGeometry(page.lng, page.lat, scale.ratio, page.orientation).widthM, canvasW),
    pitch: 0,
    bearing: 0,
  })
  applyPreviewPaint(map, ink, hillshade, contours, labels)
  Object.entries(extraVisibility || {}).forEach(([layerId, on]) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', on ? 'visible' : 'none')
    }
  })
  hideChromeLayers(map)
  await waitIdle(map)
  return snapshotMapCanvas(map, ink)
}

function canvasToJpegBlob(canvas, quality = JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error('Could not encode page'))
        else resolve(blob)
      }, 'image/jpeg', quality)
      return
    }
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      const b64 = dataUrl.split(',')[1]
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
      resolve(new Blob([bytes], { type: 'image/jpeg' }))
    } catch (err) {
      reject(err)
    }
  })
}

function buildJpegPdf(pages) {
  const encoder = new TextEncoder()
  const chunks = []
  let pos = 0
  const push = (strOrBytes) => {
    const bytes = typeof strOrBytes === 'string' ? encoder.encode(strOrBytes) : strOrBytes
    chunks.push(bytes)
    pos += bytes.length
  }

  push('%PDF-1.4\n')
  const objStarts = []
  const objects = []

  pages.forEach((p, i) => {
    const imgId = 3 + i * 2
    const pageId = 4 + i * 2
    objects.push({
      id: imgId,
      body: () => {
        const header = `<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`
        const footer = '\nendstream\n'
        return { header, stream: p.bytes, footer }
      },
    })
    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.ptW} ${p.ptH}] /Resources << /XObject << /Im${i} ${imgId} 0 R >> >> /Contents ${1000 + i} 0 R >>`,
    })
    objects.push({
      id: 1000 + i,
      body: `<< /Length ${`q ${p.ptW} 0 0 ${p.ptH} 0 0 cm /Im${i} Do Q`.length} >>\nstream\nq ${p.ptW} 0 0 ${p.ptH} 0 0 cm /Im${i} Do Q\nendstream`,
    })
  })

  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')
  const catalog = '<< /Type /Catalog /Pages 2 0 R >>'
  const pagesObj = `<< /Type /Pages /Count ${pages.length} /Kids [ ${kids} ] >>`

  const writeObj = (id, body) => {
    objStarts[id] = pos
    if (typeof body === 'function') {
      const { header, stream, footer } = body()
      push(`${id} 0 obj\n${header}`)
      push(stream)
      push(`${footer}endobj\n`)
    } else {
      push(`${id} 0 obj\n${body}\nendobj\n`)
    }
  }

  writeObj(1, catalog)
  writeObj(2, pagesObj)
  objects.forEach((o) => writeObj(o.id, o.body))

  const xrefPos = pos
  const maxId = Math.max(...objStarts.map((_, i) => i).filter((i) => objStarts[i] != null))
  let xref = `xref\n0 ${maxId + 1}\n`
  xref += '0000000000 65535 f \n'
  for (let i = 1; i <= maxId; i += 1) {
    const off = objStarts[i]
    if (off == null) xref += '0000000000 65535 f \n'
    else xref += `${String(off).padStart(10, '0')} 00000 n \n`
  }
  push(xref)
  push(`trailer << /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`)

  let total = 0
  chunks.forEach((c) => {
    total += c.length
  })
  const out = new Uint8Array(total)
  let o = 0
  chunks.forEach((c) => {
    out.set(c, o)
    o += c.length
  })
  return out
}

export async function renderPrintPages(pages, options, onProgress) {
  const quality = resolvePrintQuality(options.qualityId || (options.dpi ? null : 'standard'))
  const dpi = options.dpi || quality.dpi
  const jpegQuality = options.jpegQuality || quality.jpeg || JPEG_QUALITY
  const pixelRatio = dpi / 96
  const sheets = []
  let session = null
  try {
    for (let i = 0; i < pages.length; i += 1) {
      onProgress?.({
        index: i,
        total: pages.length,
        message: `Rendering page ${i + 1} of ${pages.length}… keep this tab open.`,
      })
      if (i > 0) await yieldUi()
      const page = pages[i]
      const { cssW, cssH } = pageCssSize(page)
      if (!session) {
        session = createHiddenPrintMap(options.basemapId, pixelRatio, cssW, cssH)
        await waitMapLoad(session.map)
      }
      const bmp = await capturePageOnMap(session, page, { ...options, dpi })
      const landscape = page.orientation === 'landscape'
      const pageW = (landscape ? LETTER_IN.height : LETTER_IN.width) * dpi
      const pageH = (landscape ? LETTER_IN.width : LETTER_IN.height) * dpi
      const sheet = document.createElement('canvas')
      sheet.width = Math.round(pageW)
      sheet.height = Math.round(pageH)
      const ctx = sheet.getContext('2d')
      drawCollar(ctx, page, dpi, bmp, options.attribution, options.title)
      const jpegBlob = await canvasToJpegBlob(sheet, jpegQuality)
      sheets.push({
        canvas: sheet,
        jpegBlob,
        orientation: page.orientation,
        w: sheet.width,
        h: sheet.height,
      })
    }
  } finally {
    destroyHiddenPrintMap(session)
  }
  return sheets
}

export async function sheetsToPdfBlob(sheets) {
  const pages = []
  for (const s of sheets) {
    const landscape = s.orientation === 'landscape'
    const ptW = (landscape ? LETTER_IN.height : LETTER_IN.width) * 72
    const ptH = (landscape ? LETTER_IN.width : LETTER_IN.height) * 72
    const buf = await s.jpegBlob.arrayBuffer()
    pages.push({
      bytes: new Uint8Array(buf),
      w: s.w,
      h: s.h,
      ptW,
      ptH,
    })
  }
  const bytes = buildJpegPdf(pages)
  return new Blob([bytes], { type: 'application/pdf' })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function printSheets(sheets) {
  const w = window.open('', '_blank')
  if (!w) throw new Error('Popup blocked — allow popups to print.')
  const urls = sheets.map((s) => URL.createObjectURL(s.jpegBlob))
  const imgs = urls
    .map(
      (url, i) =>
        `<div class="sheet ${sheets[i].orientation}"><img src="${url}" alt="print page" /></div>`,
    )
    .join('')
  w.document.write(`<!doctype html><html><head><title>Print map</title>
    <style>
      @page { size: letter; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; }
      .sheet { page-break-after: always; width: 8.5in; height: 11in; }
      .sheet.landscape { width: 11in; height: 8.5in; }
      img { width: 100%; height: 100%; display: block; }
    </style></head><body>${imgs}</body></html>`)
  w.document.close()
  w.focus()
  const revoke = () => {
    urls.forEach((url) => {
      try {
        URL.revokeObjectURL(url)
      } catch {
        /* ignore */
      }
    })
  }
  const onAfter = () => {
    w.removeEventListener('afterprint', onAfter)
    revoke()
  }
  w.addEventListener('afterprint', onAfter)
  setTimeout(() => {
    try {
      w.print()
    } catch {
      revoke()
    }
  }, 500)
  setTimeout(revoke, 120000)
}
