import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import exifr from 'exifr'
import './ForensicsView.css'

const IMAGE_TOOLS = [
  ['magnifier', 'Magnifier'],
  ['clone', 'Clone detection'],
  ['ela', 'ELA'],
  ['noise', 'Noise'],
  ['metadata', 'Metadata'],
  ['jpeg', 'JPEG structure'],
]

const AUDIO_TOOLS = [
  ['waveform', 'Waveform'],
  ['spectrogram', 'Spectrogram'],
]

function readAscii(bytes) {
  const out = []
  let run = ''
  bytes.forEach((byte) => {
    if (byte >= 32 && byte <= 126) run += String.fromCharCode(byte)
    else {
      if (run.length >= 6) out.push(run)
      run = ''
    }
  })
  if (run.length >= 6) out.push(run)
  return out.slice(0, 40)
}

function jpegMarkers(bytes) {
  const markers = []
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return markers
  let i = 2
  while (i < bytes.length - 3 && markers.length < 80) {
    if (bytes[i] !== 0xff) {
      i += 1
      continue
    }
    const code = bytes[i + 1]
    if (code === 0xd9 || code === 0xda) {
      markers.push({ code, offset: i, size: code === 0xd9 ? 0 : bytes.length - i })
      break
    }
    const size = (bytes[i + 2] << 8) | bytes[i + 3]
    markers.push({ code, offset: i, size })
    if (!size || size < 2) break
    i += 2 + size
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

function imageDataOf(image, maxEdge = 720) {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0, width, height)
  return { canvas, ctx, data: ctx.getImageData(0, 0, width, height) }
}

function paintGray(canvas, pixels, width, height) {
  const ctx = canvas.getContext('2d')
  const out = ctx.createImageData(width, height)
  for (let i = 0; i < pixels.length; i += 1) {
    const value = pixels[i]
    out.data[i * 4] = value
    out.data[i * 4 + 1] = value
    out.data[i * 4 + 2] = value
    out.data[i * 4 + 3] = 255
  }
  canvas.width = width
  canvas.height = height
  ctx.putImageData(out, 0, 0)
}

function elaPixels(original, recompressed) {
  const out = new Uint8ClampedArray(original.width * original.height)
  let max = 1
  for (let i = 0, p = 0; i < original.data.length; i += 4, p += 1) {
    const diff = Math.abs(original.data[i] - recompressed.data[i])
      + Math.abs(original.data[i + 1] - recompressed.data[i + 1])
      + Math.abs(original.data[i + 2] - recompressed.data[i + 2])
    out[p] = diff
    if (diff > max) max = diff
  }
  for (let i = 0; i < out.length; i += 1) out[i] = Math.min(255, Math.round((out[i] / max) * 255))
  return out
}

function noisePixels(image) {
  const { data, width, height } = image
  const gray = new Float32Array(width * height)
  for (let p = 0, i = 0; p < gray.length; p += 1, i += 4) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
  }
  const out = new Uint8ClampedArray(gray.length)
  let max = 1
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
      if (value > max) max = value
    }
  }
  for (let i = 0; i < out.length; i += 1) out[i] = Math.min(255, Math.round((out[i] / max) * 220))
  return out
}

function cloneBoxes(image) {
  const block = 16
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
      const key = `${Math.round(r / n / 8)}-${Math.round(g / n / 8)}-${Math.round(b / n / 8)}`
      const list = groups.get(key) || []
      list.push({ x, y })
      groups.set(key, list)
    }
  }
  const hits = []
  groups.forEach((list) => {
    if (list.length < 2 || list.length > 12) return
    hits.push(...list)
  })
  return hits.slice(0, 400)
}

function drawMagnifier(source, canvas, point) {
  const ctx = canvas.getContext('2d')
  const size = 220
  canvas.width = size
  canvas.height = size
  ctx.fillStyle = '#010409'
  ctx.fillRect(0, 0, size, size)
  if (!point) return
  const zoom = 4
  const crop = size / zoom
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(source, point.x - crop / 2, point.y - crop / 2, crop, crop, 0, 0, size, size)
  ctx.strokeStyle = '#58a6ff'
  ctx.strokeRect(size / 2 - 8, size / 2 - 8, 16, 16)
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

function drawWaveform(canvas, channel) {
  const ctx = canvas.getContext('2d')
  const width = canvas.clientWidth || 720
  const height = 180
  canvas.width = width
  canvas.height = height
  ctx.fillStyle = '#010409'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#58a6ff'
  ctx.beginPath()
  const step = Math.max(1, Math.floor(channel.length / width))
  for (let x = 0; x < width; x += 1) {
    let peak = 0
    const start = x * step
    for (let i = 0; i < step; i += 1) peak = Math.max(peak, Math.abs(channel[start + i] || 0))
    const y = (1 - peak) * (height / 2)
    ctx.moveTo(x, height / 2 - (height / 2 - y))
    ctx.lineTo(x, height / 2 + (height / 2 - y))
  }
  ctx.stroke()
}

function drawSpectrogram(canvas, channel, sampleRate) {
  const ctx = canvas.getContext('2d')
  const width = Math.min(480, canvas.clientWidth || 480)
  const bins = 128
  const size = 256
  canvas.width = width
  canvas.height = bins
  const columns = width
  const hop = Math.max(size, Math.floor(channel.length / columns))
  const image = ctx.createImageData(width, bins)
  for (let x = 0; x < columns; x += 1) {
    const start = x * hop
    const windowed = new Float64Array(size)
    for (let i = 0; i < size; i += 1) {
      const sample = channel[start + i] || 0
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))
      windowed[i] = sample * hann
    }
    const mag = fftMag(windowed)
    for (let y = 0; y < bins; y += 1) {
      const value = Math.log10(1 + (mag[y] || 0))
      const shade = Math.max(0, Math.min(255, Math.round(value * 70)))
      const pixel = ((bins - 1 - y) * width + x) * 4
      image.data[pixel] = shade
      image.data[pixel + 1] = Math.round(shade * 0.75)
      image.data[pixel + 2] = 255 - shade
      image.data[pixel + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return { duration: channel.length / sampleRate }
}

export default function ForensicsView() {
  const [params] = useSearchParams()
  const [tool, setTool] = useState('magnifier')
  const [status, setStatus] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [kind, setKind] = useState('')
  const [bytes, setBytes] = useState(null)
  const [meta, setMeta] = useState(null)
  const [jpeg, setJpeg] = useState([])
  const [strings, setStrings] = useState([])
  const [audioInfo, setAudioInfo] = useState(null)
  const sourceRef = useRef(null)
  const workRef = useRef(null)
  const audioRef = useRef(null)
  const pointRef = useRef(null)

  const tools = kind === 'audio' ? AUDIO_TOOLS : IMAGE_TOOLS

  async function openBuffer(buffer, type, name) {
    if (fileUrl) URL.revokeObjectURL(fileUrl)
    const blob = new Blob([buffer], { type: type || 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const data = new Uint8Array(buffer)
    setBytes(data)
    setFileUrl(url)
    setFileName(name || 'file')
    setMeta(null)
    setJpeg(type?.includes('jpeg') || type?.includes('jpg') ? jpegMarkers(data) : [])
    setStrings(readAscii(data))
    if (String(type || '').startsWith('audio/')) {
      setKind('audio')
      setTool('waveform')
      const audio = await new AudioContext()
      const decoded = await audio.decodeAudioData(buffer.slice(0))
      audio.close()
      audioRef.current = decoded
      setAudioInfo({
        duration: decoded.duration,
        sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels,
      })
      return
    }
    setKind('image')
    setTool('magnifier')
    audioRef.current = null
    setAudioInfo(null)
    try {
      setMeta(await exifr.parse(buffer, { pick: ['Make', 'Model', 'Software', 'DateTimeOriginal', 'LensModel', 'GPSLatitude', 'GPSLongitude', 'Orientation'] }) || {})
    } catch {
      setMeta({})
    }
  }

  async function onFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setStatus('Reading the file in this browser…')
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
    setStatus('Loading a copy through the size-capped proxy…')
    try {
      const response = await fetch(`/api/forensics/fetch?url=${encodeURIComponent(target)}`)
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'That URL could not be loaded.')
      }
      await openBuffer(await response.arrayBuffer(), response.headers.get('content-type') || '', target)
      setStatus('')
    } catch (error) {
      setStatus(error.message || 'That URL could not be loaded.')
    }
  }

  useEffect(() => {
    const initial = params.get('url')
    if (initial) loadUrl(initial)
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl)
    }
    // The page should load the linked media once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (kind !== 'image' || !fileUrl) return undefined
    let cancelled = false
    loadImage(fileUrl).then(async (image) => {
      if (cancelled) return
      sourceRef.current = image
      const original = imageDataOf(image)
      if (tool === 'magnifier') drawMagnifier(image, workRef.current, pointRef.current)
      if (tool === 'ela') {
        const blob = await new Promise((resolve) => original.canvas.toBlob(resolve, 'image/jpeg', 0.75))
        const recompressed = imageDataOf(await loadImage(URL.createObjectURL(blob)))
        paintGray(workRef.current, elaPixels(original.data, recompressed.data), original.data.width, original.data.height)
      }
      if (tool === 'noise') {
        const pixels = noisePixels(original.data)
        paintGray(workRef.current, pixels, original.data.width, original.data.height)
      }
      if (tool === 'clone') {
        const boxes = cloneBoxes(original.data)
        const canvas = workRef.current
        canvas.width = original.data.width
        canvas.height = original.data.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(original.canvas, 0, 0)
        ctx.strokeStyle = '#f85149'
        boxes.forEach((box) => ctx.strokeRect(box.x, box.y, 16, 16))
      }
    }).catch((error) => setStatus(error.message))
    return () => { cancelled = true }
  }, [tool, kind, fileUrl])

  useEffect(() => {
    if (kind !== 'audio' || !audioRef.current || !workRef.current) return
    const channel = audioRef.current.getChannelData(0)
    if (tool === 'waveform') drawWaveform(workRef.current, channel)
    if (tool === 'spectrogram') drawSpectrogram(workRef.current, channel, audioRef.current.sampleRate)
  }, [tool, kind, audioInfo])

  const metaRows = useMemo(() => Object.entries(meta || {}).filter(([, value]) => value != null && value !== ''), [meta])

  return (
    <div className="forensics-page">
      <header>
        <h1>Media forensics</h1>
        <p>Files stay in this browser. A URL load uses a size-capped proxy and is not stored. These views are measurements, not a real or fake verdict.</p>
      </header>
      <div className="forensics-load">
        <input type="file" accept="image/*,audio/*" onChange={onFile} />
        <form onSubmit={(event) => { event.preventDefault(); loadUrl(event.target.url.value) }}>
          <input name="url" defaultValue={params.get('url') || ''} placeholder="Image or audio URL" />
          <button type="submit">Load URL</button>
        </form>
      </div>
      {status ? <p className="forensics-status">{status}</p> : null}
      {fileName ? <p className="forensics-file">{fileName} · {(bytes?.length || 0).toLocaleString()} bytes</p> : null}
      {kind ? (
        <div className="forensics-tools" role="tablist">
          {tools.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tool === id} className={tool === id ? 'is-on' : ''} onClick={() => setTool(id)}>{label}</button>
          ))}
        </div>
      ) : null}
      {kind === 'image' && tool === 'magnifier' ? (
        <div
          className="forensics-stage"
          onMouseMove={(event) => {
            const image = sourceRef.current
            const rect = event.currentTarget.getBoundingClientRect()
            if (!image) return
            pointRef.current = {
              x: ((event.clientX - rect.left) / rect.width) * image.width,
              y: ((event.clientY - rect.top) / rect.height) * image.height,
            }
            drawMagnifier(image, workRef.current, pointRef.current)
          }}
        >
          {fileUrl ? <img src={fileUrl} alt="" /> : null}
          <canvas ref={workRef} />
        </div>
      ) : null}
      {kind && tool !== 'magnifier' && tool !== 'metadata' && tool !== 'jpeg' ? <canvas ref={workRef} className="forensics-canvas" /> : null}
      {tool === 'metadata' && kind === 'image' ? (
        <div className="forensics-panel">
          {metaRows.length ? metaRows.map(([key, value]) => <p key={key}><strong>{key}</strong> {String(value)}</p>) : <p>No EXIF metadata was found.</p>}
          <h2>Printable strings</h2>
          {strings.length ? strings.map((line) => <p key={line}>{line}</p>) : <p>No long text strings were found.</p>}
        </div>
      ) : null}
      {tool === 'jpeg' ? (
        <div className="forensics-panel">
          {jpeg.length ? jpeg.map((marker) => (
            <p key={`${marker.offset}-${marker.code}`}>FF{marker.code.toString(16).toUpperCase()} at {marker.offset} · {marker.size} bytes</p>
          )) : <p>This file does not look like a JPEG, so there are no JPEG markers to list.</p>}
        </div>
      ) : null}
      {kind === 'audio' && audioInfo ? (
        <p className="forensics-file">{audioInfo.duration.toFixed(1)}s · {audioInfo.sampleRate} Hz · {audioInfo.channels} channel{audioInfo.channels === 1 ? '' : 's'}</p>
      ) : null}
    </div>
  )
}
