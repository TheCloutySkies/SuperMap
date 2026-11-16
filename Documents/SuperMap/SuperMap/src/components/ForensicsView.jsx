import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import exifr from 'exifr'
import './ForensicsView.css'

const IMAGE_TOOLS = [
  ['magnifier', 'Magnifier'],
  ['clone', 'Clone map'],
  ['ela', 'Error level'],
  ['noise', 'Noise residual'],
  ['histogram', 'Histogram'],
  ['metadata', 'Metadata'],
  ['jpeg', 'JPEG structure'],
]

const AUDIO_TOOLS = [
  ['waveform', 'Waveform'],
  ['spectrogram', 'Spectrogram'],
]

const JPEG_NAMES = {
  0xc0: 'SOF0 Baseline',
  0xc1: 'SOF1 Extended',
  0xc2: 'SOF2 Progressive',
  0xc4: 'DHT Huffman',
  0xd8: 'SOI Start',
  0xd9: 'EOI End',
  0xda: 'SOS Scan',
  0xdb: 'DQT Quantization',
  0xdd: 'DRI Restart interval',
  0xe0: 'APP0 JFIF',
  0xe1: 'APP1 EXIF / XMP',
  0xe2: 'APP2 ICC',
  0xed: 'APP13 IPTC',
  0xee: 'APP14 Adobe',
  0xfe: 'COM Comment',
}

function readAscii(bytes) {
  const out = []
  let start = -1
  let run = ''
  for (let i = 0; i < bytes.length && out.length < 50; i += 1) {
    const byte = bytes[i]
    if (byte >= 32 && byte <= 126) {
      if (start < 0) start = i
      run += String.fromCharCode(byte)
    } else {
      if (run.length >= 8) out.push({ offset: start, text: run.slice(0, 160) })
      run = ''
      start = -1
    }
  }
  if (run.length >= 8) out.push({ offset: start, text: run.slice(0, 160) })
  return out
}

function jpegMarkers(bytes) {
  const markers = []
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return markers
  markers.push({ code: 0xd8, name: JPEG_NAMES[0xd8], offset: 0, size: 0 })
  let i = 2
  while (i < bytes.length - 1 && markers.length < 100) {
    if (bytes[i] !== 0xff) {
      i += 1
      continue
    }
    while (i < bytes.length && bytes[i] === 0xff) i += 1
    if (i >= bytes.length) break
    const code = bytes[i]
    const offset = i - 1
    i += 1
    if (code === 0xd9) {
      markers.push({ code, name: JPEG_NAMES[0xd9], offset, size: 0 })
      break
    }
    if (code === 0x00 || (code >= 0xd0 && code <= 0xd7)) continue
    if (i + 1 >= bytes.length) break
    const size = (bytes[i] << 8) | bytes[i + 1]
    const entry = { code, name: JPEG_NAMES[code] || `Marker ${code.toString(16).toUpperCase()}`, offset, size }
    if (code >= 0xc0 && code <= 0xc3 && size >= 8 && i + 7 < bytes.length) {
      entry.width = (bytes[i + 5] << 8) | bytes[i + 6]
      entry.height = (bytes[i + 3] << 8) | bytes[i + 4]
      entry.components = bytes[i + 7]
    }
    if (code === 0xfe) {
      let comment = ''
      for (let p = i + 2; p < i + size && p < bytes.length; p += 1) {
        const byte = bytes[p]
        if (byte >= 32 && byte <= 126) comment += String.fromCharCode(byte)
      }
      entry.comment = comment.slice(0, 180)
    }
    markers.push(entry)
    if (code === 0xda || size < 2) break
    i += size
  }
  return markers
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('That image could not be opened.'))
    image.src = url
  })
}

function imageDataOf(image, maxEdge = 900) {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0, width, height)
  return { canvas, ctx, width, height, data: ctx.getImageData(0, 0, width, height) }
}

function paintGray(canvas, pixels, width, height) {
  const ctx = canvas.getContext('2d')
  const out = ctx.createImageData(width, height)
  for (let i = 0; i < pixels.length; i += 1) {
    const value = pixels[i]
    const pixel = i * 4
    out.data[pixel] = Math.min(255, Math.round(value * 1.15))
    out.data[pixel + 1] = Math.round(value * 0.72)
    out.data[pixel + 2] = Math.round(value * 0.38)
    out.data[pixel + 3] = 255
  }
  canvas.width = width
  canvas.height = height
  ctx.putImageData(out, 0, 0)
}

function elaPixels(original, recompressed) {
  const out = new Uint8ClampedArray(original.width * original.height)
  let max = 1
  let sum = 0
  for (let i = 0, p = 0; i < original.data.length; i += 4, p += 1) {
    const diff = Math.abs(original.data[i] - recompressed.data[i])
      + Math.abs(original.data[i + 1] - recompressed.data[i + 1])
      + Math.abs(original.data[i + 2] - recompressed.data[i + 2])
    out[p] = diff
    sum += diff
    if (diff > max) max = diff
  }
  return { pixels: out, max, mean: sum / out.length }
}

function noisePixels(image) {
  const { data, width, height } = image
  const gray = new Float32Array(width * height)
  for (let p = 0, i = 0; p < gray.length; p += 1, i += 4) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
  }
  const out = new Uint8ClampedArray(gray.length)
  let max = 1
  let sum = 0
  let count = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      const blur = (
        gray[i - width - 1] + gray[i - width] + gray[i - width + 1]
        + gray[i - 1] + gray[i] + gray[i + 1]
        + gray[i + width - 1] + gray[i + width] + gray[i + width + 1]
      ) / 9
      const value = Math.abs(gray[i] - blur)
      out[i] = value
      sum += value
      count += 1
      if (value > max) max = value
    }
  }
  return { pixels: out, max, mean: count ? sum / count : 0 }
}

function cloneBoxes(image, block) {
  const { data, width, height } = image
  const groups = new Map()
  for (let y = 0; y + block <= height; y += block) {
    for (let x = 0; x + block <= width; x += block) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let yy = 0; yy < block; yy += 2) {
        for (let xx = 0; xx < block; xx += 2) {
          const i = ((y + yy) * width + (x + xx)) * 4
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          n += 1
        }
      }
      const key = `${Math.round(r / n / 6)}-${Math.round(g / n / 6)}-${Math.round(b / n / 6)}`
      const list = groups.get(key) || []
      list.push({ x, y })
      groups.set(key, list)
    }
  }
  const hits = []
  let clusters = 0
  let largest = 0
  groups.forEach((list) => {
    if (list.length < 2 || list.length > 16) return
    clusters += 1
    largest = Math.max(largest, list.length)
    hits.push(...list)
  })
  return { hits: hits.slice(0, 500), clusters, largest }
}

function drawMagnifier(source, canvas, point, zoom) {
  const ctx = canvas.getContext('2d')
  const size = 280
  canvas.width = size
  canvas.height = size
  const focus = point || { x: source.width / 2, y: source.height / 2 }
  const crop = size / zoom
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#0e0c0a'
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(source, focus.x - crop / 2, focus.y - crop / 2, crop, crop, 0, 0, size, size)
  ctx.strokeStyle = '#e39a45'
  ctx.lineWidth = 1
  ctx.strokeRect(size / 2 - 0.5, 0, 1, size)
  ctx.strokeRect(0, size / 2 - 0.5, size, 1)
}

function drawHistogram(canvas, image) {
  const bins = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
  const { data, width, height } = image
  let luma = 0
  for (let i = 0; i < data.length; i += 4) {
    bins[0][data[i]] += 1
    bins[1][data[i + 1]] += 1
    bins[2][data[i + 2]] += 1
    luma += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
  }
  let max = 1
  bins.forEach((channel) => {
    channel.forEach((count) => { if (count > max) max = count })
  })
  const ctx = canvas.getContext('2d')
  canvas.width = 640
  canvas.height = 280
  ctx.fillStyle = '#0e0c0a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const colors = ['rgba(212,101,74,0.85)', 'rgba(156,186,164,0.8)', 'rgba(227,154,69,0.8)']
  const ceiling = Math.log1p(max)
  bins.forEach((channel, index) => {
    ctx.beginPath()
    channel.forEach((count, x) => {
      const px = (x / 255) * canvas.width
      const py = canvas.height - (Math.log1p(count) / ceiling) * (canvas.height - 16)
      if (x === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.strokeStyle = colors[index]
    ctx.lineWidth = 1.4
    ctx.stroke()
  })
  return { meanLuma: luma / (width * height) }
}

function fftMag(samples) {
  const n = samples.length
  const real = Float64Array.from(samples)
  const imag = new Float64Array(n)
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const swap = real[i]
      real[i] = real[j]
      real[j] = swap
    }
  }
  for (let len = 2; len <= n; len *= 2) {
    const half = len / 2
    const angle = -2 * Math.PI / len
    const wLenRe = Math.cos(angle)
    const wLenIm = Math.sin(angle)
    for (let i = 0; i < n; i += len) {
      let wRe = 1
      let wIm = 0
      for (let j = 0; j < half; j += 1) {
        const a = i + j
        const b = a + half
        const tr = real[b] * wRe - imag[b] * wIm
        const ti = real[b] * wIm + imag[b] * wRe
        real[b] = real[a] - tr
        imag[b] = imag[a] - ti
        real[a] += tr
        imag[a] += ti
        const nextRe = wRe * wLenRe - wIm * wLenIm
        wIm = wRe * wLenIm + wIm * wLenRe
        wRe = nextRe
      }
    }
  }
  const mag = new Float64Array(n / 2)
  for (let i = 0; i < mag.length; i += 1) mag[i] = Math.hypot(real[i], imag[i])
  return mag
}

function pcmSampleRate(bytes) {
  if (bytes.length < 28) return 0
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'RIFF') return 0
  return bytes[24] | (bytes[25] << 8) | (bytes[26] << 16) | (bytes[27] << 24)
}

function audioStats(channel) {
  let peak = 0
  let sum = 0
  let square = 0
  let clips = 0
  for (let i = 0; i < channel.length; i += 1) {
    const sample = channel[i]
    const abs = Math.abs(sample)
    peak = Math.max(peak, abs)
    sum += sample
    square += sample * sample
    if (abs >= 0.99) clips += 1
  }
  return {
    peak,
    dc: sum / channel.length,
    rms: Math.sqrt(square / channel.length),
    clips,
  }
}

function drawWaveform(canvas, channel) {
  const ctx = canvas.getContext('2d')
  const width = 720
  const height = 260
  canvas.width = width
  canvas.height = height
  ctx.fillStyle = '#0e0c0a'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#e39a45'
  ctx.beginPath()
  const step = Math.max(1, Math.floor(channel.length / width))
  for (let x = 0; x < width; x += 1) {
    let min = 1
    let max = -1
    const start = x * step
    for (let i = 0; i < step; i += 1) {
      const sample = channel[start + i] || 0
      min = Math.min(min, sample)
      max = Math.max(max, sample)
    }
    ctx.moveTo(x, (1 - max) * height / 2)
    ctx.lineTo(x, (1 - min) * height / 2)
  }
  ctx.stroke()
}

function drawSpectrogram(canvas, channel, sampleRate) {
  const ctx = canvas.getContext('2d')
  const width = 720
  const height = 280
  const size = 256
  const freqBins = size / 2
  canvas.width = width
  canvas.height = height
  const usable = Math.max(1, channel.length - size)
  const columns = Math.min(width, Math.max(1, Math.floor(usable / (size / 4))))
  const hop = Math.max(1, Math.floor(usable / columns))
  const columnsMag = []
  let peak = 1
  for (let x = 0; x < columns; x += 1) {
    const start = x * hop
    const windowed = new Float64Array(size)
    for (let i = 0; i < size; i += 1) {
      const sample = channel[start + i] || 0
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))
      windowed[i] = sample * hann
    }
    const mag = fftMag(windowed)
    columnsMag.push(mag)
    for (let bin = 0; bin < freqBins; bin += 1) peak = Math.max(peak, mag[bin] || 0)
  }
  const image = ctx.createImageData(width, height)
  for (let x = 0; x < width; x += 1) {
    const mag = columnsMag[Math.min(columns - 1, Math.floor((x / width) * columns))]
    for (let y = 0; y < height; y += 1) {
      const bin = Math.min(freqBins - 1, Math.floor((1 - y / (height - 1)) * (freqBins - 1)))
      const shade = Math.max(0, Math.min(255, Math.round((Math.log1p(mag[bin] || 0) / Math.log1p(peak)) * 255)))
      const pixel = (y * width + x) * 4
      image.data[pixel] = Math.round(shade * 0.95)
      image.data[pixel + 1] = Math.round(shade * 0.58)
      image.data[pixel + 2] = Math.round(shade * 0.22)
      image.data[pixel + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return { nyquist: sampleRate / 2 }
}

function flattenMeta(value, prefix = '', out = []) {
  if (out.length > 70 || value == null || value === '') return out
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    out.push([prefix, String(value).slice(0, 240)])
    return out
  }
  if (value instanceof Date) {
    out.push([prefix, value.toISOString()])
    return out
  }
  if (ArrayBuffer.isView(value)) return out
  if (Array.isArray(value)) {
    if (value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) {
      out.push([prefix, value.slice(0, 8).join(', ')])
    }
    return out
  }
  if (typeof value === 'object') {
    if (typeof value.latitude === 'number' && typeof value.longitude === 'number') {
      out.push([prefix || 'GPS', `${Number(value.latitude).toFixed(5)}, ${Number(value.longitude).toFixed(5)}`])
      return out
    }
    Object.entries(value).forEach(([key, child]) => {
      flattenMeta(child, prefix ? `${prefix} · ${key}` : key, out)
    })
  }
  return out
}

function hexByte(value) {
  return value.toString(16).padStart(2, '0')
}

export default function ForensicsView() {
  const [params] = useSearchParams()
  const [tool, setTool] = useState('magnifier')
  const [status, setStatus] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [kind, setKind] = useState('')
  const [byteLength, setByteLength] = useState(0)
  const [metaRows, setMetaRows] = useState([])
  const [jpeg, setJpeg] = useState([])
  const [strings, setStrings] = useState([])
  const [audioInfo, setAudioInfo] = useState(null)
  const [readout, setReadout] = useState(null)
  const [zoom, setZoom] = useState(8)
  const [elaQuality, setElaQuality] = useState(75)
  const [cloneBlock, setCloneBlock] = useState(16)
  const [stats, setStats] = useState({})
  const [urlInput, setUrlInput] = useState(params.get('url') || '')
  const [dragOver, setDragOver] = useState(false)
  const [playing, setPlaying] = useState(false)
  const sourceRef = useRef(null)
  const workRef = useRef(null)
  const audioRef = useRef(null)
  const playRef = useRef(null)
  const pointRef = useRef(null)
  const fileUrlRef = useRef('')

  const imageTool = IMAGE_TOOLS.some(([id]) => id === tool)
  const visualTool = ['magnifier', 'clone', 'ela', 'noise', 'histogram', 'waveform', 'spectrogram'].includes(tool)

  async function openBuffer(buffer, type, name) {
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current)
    stopPlayback()
    const blob = new Blob([buffer], { type: type || 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    fileUrlRef.current = url
    const data = new Uint8Array(buffer)
    setFileUrl(url)
    setFileName(name || 'file')
    setByteLength(data.byteLength)
    setReadout(null)
    setStats({})
    setStrings(readAscii(data))
    const mime = String(type || '').toLowerCase()
    setJpeg(mime.includes('jpeg') || mime.includes('jpg') || (data[0] === 0xff && data[1] === 0xd8) ? jpegMarkers(data) : [])
    if (mime.startsWith('audio/')) {
      setKind('audio')
      setTool('waveform')
      setMetaRows([])
      const hinted = pcmSampleRate(data)
      const context = hinted >= 8000 && hinted <= 192000
        ? new OfflineAudioContext(1, 1, hinted)
        : new AudioContext()
      const decoded = await context.decodeAudioData(buffer.slice(0))
      context.close?.()
      audioRef.current = decoded
      const channel = decoded.getChannelData(0)
      const measured = audioStats(channel)
      setAudioInfo({
        duration: decoded.duration,
        sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels,
        ...measured,
      })
      return
    }
    setKind('image')
    setTool((current) => (AUDIO_TOOLS.some(([id]) => id === current) ? 'magnifier' : current))
    audioRef.current = null
    setAudioInfo(null)
    try {
      const parsed = await exifr.parse(buffer, { reviveValues: true, translateValues: false })
      setMetaRows(flattenMeta(parsed || {}))
    } catch {
      setMetaRows([])
    }
  }

  async function openFile(file) {
    if (!file) return
    setStatus('Reading the file in this browser.')
    try {
      await openBuffer(await file.arrayBuffer(), file.type, file.name)
      setStatus('')
    } catch (error) {
      setStatus(error.message || 'That file could not be opened.')
    }
  }

  async function loadUrl(raw) {
    const target = String(raw || '').trim()
    if (!target) return
    setStatus('Fetching one capped copy. It is not stored.')
    try {
      const response = await fetch(`/api/forensics/fetch?url=${encodeURIComponent(target)}`)
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'That URL could not be loaded.')
      }
      const leaf = target.split('/').pop()?.split('?')[0] || 'remote file'
      await openBuffer(await response.arrayBuffer(), response.headers.get('content-type') || '', leaf)
      setStatus('')
    } catch (error) {
      setStatus(error.message || 'That URL could not be loaded.')
    }
  }

  function stopPlayback() {
    try { playRef.current?.stop?.() } catch { /* already ended */ }
    playRef.current = null
    setPlaying(false)
  }

  async function togglePlayback() {
    if (!audioRef.current) return
    if (playing) {
      stopPlayback()
      return
    }
    const context = new AudioContext()
    const source = context.createBufferSource()
    source.buffer = audioRef.current
    source.connect(context.destination)
    source.onended = () => setPlaying(false)
    source.start()
    playRef.current = source
    setPlaying(true)
  }

  useEffect(() => {
    const initial = params.get('url')
    if (initial) loadUrl(initial)
    return () => {
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current)
    }
    // Load a linked file once when the bench opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (kind !== 'image' || !fileUrl || !visualTool || !imageTool) return undefined
    let cancelled = false
    loadImage(fileUrl).then(async (image) => {
      if (cancelled) return
      sourceRef.current = image
      const original = imageDataOf(image)
      const canvas = workRef.current
      if (!canvas) return
      if (tool === 'magnifier') {
        const point = pointRef.current || { x: image.width / 2, y: image.height / 2 }
        pointRef.current = point
        drawMagnifier(image, canvas, point, zoom)
        const sample = document.createElement('canvas')
        sample.width = 1
        sample.height = 1
        const sampleCtx = sample.getContext('2d', { willReadFrequently: true })
        sampleCtx.drawImage(image, point.x, point.y, 1, 1, 0, 0, 1, 1)
        const [r, g, b] = sampleCtx.getImageData(0, 0, 1, 1).data
        setReadout({ x: Math.round(point.x), y: Math.round(point.y), r, g, b })
        setStats({ width: image.width, height: image.height, zoom: `${zoom}×` })
      }
      if (tool === 'histogram') {
        const measured = drawHistogram(canvas, original.data)
        setStats({
          width: image.width,
          height: image.height,
          'mean luma': measured.meanLuma.toFixed(1),
        })
      }
      if (tool === 'ela') {
        const quality = elaQuality / 100
        const blob = await new Promise((resolve) => original.canvas.toBlob(resolve, 'image/jpeg', quality))
        if (!blob) throw new Error('Could not recompress that image.')
        const recompressedUrl = URL.createObjectURL(blob)
        const recompressed = imageDataOf(await loadImage(recompressedUrl))
        URL.revokeObjectURL(recompressedUrl)
        if (cancelled) return
        const measured = elaPixels(original.data, recompressed.data)
        const scaled = measured.pixels.map((value) => Math.min(255, Math.round((value / measured.max) * 255)))
        paintGray(canvas, scaled, original.width, original.height)
        setStats({
          quality: elaQuality,
          'mean error': measured.mean.toFixed(2),
          'peak error': measured.max,
        })
      }
      if (tool === 'noise') {
        const measured = noisePixels(original.data)
        const scaled = measured.pixels.map((value) => Math.min(255, Math.round((value / measured.max) * 255)))
        paintGray(canvas, scaled, original.width, original.height)
        setStats({
          'mean residual': measured.mean.toFixed(2),
          'peak residual': measured.max.toFixed(1),
        })
      }
      if (tool === 'clone') {
        const measured = cloneBoxes(original.data, cloneBlock)
        canvas.width = original.width
        canvas.height = original.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(original.canvas, 0, 0)
        ctx.strokeStyle = '#e39a45'
        ctx.lineWidth = 1
        measured.hits.forEach((box) => ctx.strokeRect(box.x, box.y, cloneBlock, cloneBlock))
        setStats({
          block: `${cloneBlock}px`,
          clusters: measured.clusters,
          'largest cluster': measured.largest,
        })
      }
    }).catch((error) => setStatus(error.message))
    return () => { cancelled = true }
  }, [tool, kind, fileUrl, visualTool, imageTool, zoom, elaQuality, cloneBlock])

  useEffect(() => {
    if (kind !== 'audio' || !audioRef.current || !workRef.current) return
    const channel = audioRef.current.getChannelData(0)
    if (tool === 'waveform') drawWaveform(workRef.current, channel)
    if (tool === 'spectrogram') {
      const measured = drawSpectrogram(workRef.current, channel, audioRef.current.sampleRate)
      setStats((prev) => ({ ...prev, nyquist: `${Math.round(measured.nyquist)} Hz` }))
    }
  }, [tool, kind, audioInfo])

  function sampleAt(event) {
    const image = sourceRef.current
    const plate = event.currentTarget.querySelector('img')
    if (!image || !plate) return
    const rect = plate.getBoundingClientRect()
    const x = Math.max(0, Math.min(image.width - 1, ((event.clientX - rect.left) / rect.width) * image.width))
    const y = Math.max(0, Math.min(image.height - 1, ((event.clientY - rect.top) / rect.height) * image.height))
    pointRef.current = { x, y }
    const sample = document.createElement('canvas')
    sample.width = 1
    sample.height = 1
    const ctx = sample.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(image, x, y, 1, 1, 0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    setReadout({ x: Math.round(x), y: Math.round(y), r, g, b })
    if (workRef.current) drawMagnifier(image, workRef.current, pointRef.current, zoom)
  }

  const ledger = useMemo(() => {
    const rows = []
    if (fileName) rows.push(['file', fileName], ['bytes', byteLength.toLocaleString()])
    if (kind === 'image' && tool === 'metadata') return metaRows.length ? metaRows : [['metadata', 'No EXIF tags were found.']]
    if (tool === 'jpeg') {
      if (!jpeg.length) return [['jpeg', 'This file has no JPEG markers.']]
      return jpeg.slice(0, 24).map((marker) => [
        marker.name,
        [`@ ${marker.offset}`, marker.size ? `${marker.size} bytes` : '', marker.width ? `${marker.width}×${marker.height}` : '', marker.components ? `${marker.components} components` : '', marker.comment || ''].filter(Boolean).join(' · '),
      ])
    }
    Object.entries(stats).forEach(([key, value]) => rows.push([key, String(value)]))
    if (readout && tool === 'magnifier') {
      rows.push(
        ['pixel', `${readout.x}, ${readout.y}`],
        ['rgb', `${readout.r} ${readout.g} ${readout.b}`],
        ['hex', `#${hexByte(readout.r)}${hexByte(readout.g)}${hexByte(readout.b)}`],
      )
    }
    if (audioInfo && kind === 'audio') {
      rows.push(
        ['duration', `${audioInfo.duration.toFixed(2)} s`],
        ['rate', `${audioInfo.sampleRate} Hz`],
        ['channels', String(audioInfo.channels)],
        ['peak', audioInfo.peak.toFixed(3)],
        ['rms', audioInfo.rms.toFixed(3)],
        ['dc', audioInfo.dc.toFixed(4)],
        ['clipped samples', String(audioInfo.clips)],
      )
    }
    return rows
  }, [audioInfo, byteLength, fileName, jpeg, kind, metaRows, readout, stats, tool])

  const toolTitle = [...IMAGE_TOOLS, ...AUDIO_TOOLS].find(([id]) => id === tool)?.[1] || 'Bench'

  return (
    <div
      className={`bench ${dragOver ? 'is-drag' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        openFile(event.dataTransfer.files?.[0])
      }}
    >
      <header className="bench-bar">
        <div>
          <p className="bench-kicker">On this machine</p>
          <h1 className="bench-title">Media bench</h1>
        </div>
        <form className="bench-intake" onSubmit={(event) => {
          event.preventDefault()
          const value = event.currentTarget.querySelector('input[type="url"]').value
          setUrlInput(value)
          loadUrl(value)
        }}>
          <label className="bench-file">
            Open file
            <input type="file" accept="image/*,audio/*" onChange={(event) => openFile(event.target.files?.[0])} />
          </label>
          <input
            type="url"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            placeholder="Image or audio URL"
            aria-label="Image or audio URL"
          />
          <button type="submit">Fetch</button>
        </form>
        <p className="bench-note">
          The file is decoded in this browser. A URL is fetched once through a 25 MB cap and is not kept on the server. These plates are measurements, not a real or fake verdict.
        </p>
      </header>
      <div className="bench-work">
        <nav className="bench-rail" aria-label="Instruments">
          <p>Image</p>
          {IMAGE_TOOLS.map(([id, label]) => (
            <button key={id} type="button" className={tool === id ? 'is-on' : ''} disabled={kind === 'audio'} onClick={() => setTool(id)}>{label}</button>
          ))}
          <p>Audio</p>
          {AUDIO_TOOLS.map(([id, label]) => (
            <button key={id} type="button" className={tool === id ? 'is-on' : ''} disabled={kind === 'image'} onClick={() => setTool(id)}>{label}</button>
          ))}
        </nav>
        <section className="bench-stage">
          {status ? <p className="bench-status">{status}</p> : null}
          {!kind ? (
            <div className="bench-empty">
              <strong>Drop a file on the bench.</strong>
              <span>Image or audio. Nothing is uploaded for analysis.</span>
            </div>
          ) : (
            <div className="bench-plates">
              {kind === 'image' ? (
                <figure className="bench-plate" onMouseMove={tool === 'magnifier' ? sampleAt : undefined}>
                  <figcaption>Original</figcaption>
                  <img src={fileUrl} alt="" />
                </figure>
              ) : null}
              {visualTool ? (
                <figure className="bench-plate">
                  <figcaption>{toolTitle}</figcaption>
                  <canvas ref={workRef} className={tool === 'magnifier' ? 'bench-loupe' : 'bench-canvas'} data-fit={['histogram', 'waveform', 'spectrogram'].includes(tool) ? 'fill' : 'contain'} />
                </figure>
              ) : null}
            </div>
          )}
        </section>
        <aside className="bench-ledger">
          <h3>{toolTitle}</h3>
          {tool === 'magnifier' ? (
            <div className="bench-sliders">
              <label>Zoom <span>{zoom}×</span></label>
              <input type="range" min="4" max="16" step="4" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
            </div>
          ) : null}
          {tool === 'ela' ? (
            <div className="bench-sliders">
              <label>JPEG quality <span>{elaQuality}</span></label>
              <input type="range" min="50" max="95" step="5" value={elaQuality} onChange={(event) => setElaQuality(Number(event.target.value))} />
            </div>
          ) : null}
          {tool === 'clone' ? (
            <div className="bench-sliders">
              <label>Block <span>{cloneBlock}px</span></label>
              <input type="range" min="8" max="32" step="8" value={cloneBlock} onChange={(event) => setCloneBlock(Number(event.target.value))} />
            </div>
          ) : null}
          {kind === 'audio' ? (
            <button type="button" onClick={togglePlayback}>{playing ? 'Stop' : 'Play'}</button>
          ) : null}
          <dl>
            {ledger.map(([key, value], index) => (
              <div key={`${key}-${index}`}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {tool === 'metadata' && strings.length ? (
            <div className="bench-strings">
              <h2>Strings</h2>
              {strings.map((row) => (
                <p key={`${row.offset}-${row.text}`}><em>{row.offset}</em> {row.text}</p>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
