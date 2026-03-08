const axios = require('axios')
const ffmpeg = require('fluent-ffmpeg')

function detectType(url = '') {
  const u = String(url).toLowerCase()
  if (u.startsWith('rtsp://')) return 'rtsp'
  if (u.includes('.m3u8')) return 'hls'
  if (u.includes('.mjpg') || u.includes('mjpeg')) return 'mjpeg'
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'jpeg'
  return 'unknown'
}

async function validateHttp(url) {
  try {
    const res = await axios.get(url, { timeout: 10000, maxRedirects: 5, validateStatus: (s) => s >= 200 && s < 400 })
    const ct = String(res.headers?.['content-type'] || '').toLowerCase()
    return { ok: true, contentType: ct }
  } catch {
    return { ok: false, contentType: '' }
  }
}

function validateRtsp(url) {
  return new Promise((resolve) => {
    let done = false
    const timer = setTimeout(() => {
      if (!done) {
        done = true
        resolve(false)
      }
    }, 8000)
    try {
      ffmpeg(url)
        .inputOptions(['-rtsp_transport', 'tcp', '-stimeout', '5000000'])
        .outputOptions(['-frames:v', '1', '-f', 'null'])
        .on('start', () => {})
        .on('error', () => {
          if (done) return
          done = true
          clearTimeout(timer)
          resolve(false)
        })
        .on('end', () => {
          if (done) return
          done = true
          clearTimeout(timer)
          resolve(true)
        })
        .save('/dev/null')
    } catch {
      clearTimeout(timer)
      resolve(false)
    }
  })
}

async function validateStream(url) {
  const type = detectType(url)
  if (type === 'rtsp') {
    const ok = await validateRtsp(url)
    return { ok, type }
  }
  const info = await validateHttp(url)
  if (!info.ok) return { ok: false, type }
  if (type === 'hls') return { ok: info.contentType.includes('mpegurl') || info.contentType.includes('application/vnd.apple.mpegurl') || true, type: 'hls' }
  if (type === 'mjpeg') return { ok: info.contentType.includes('multipart') || info.contentType.includes('image/'), type: 'mjpeg' }
  if (type === 'jpeg') return { ok: info.contentType.includes('image/'), type: 'jpeg' }
  return { ok: true, type: detectType(url) }
}

module.exports = {
  validateStream,
  detectType,
}

