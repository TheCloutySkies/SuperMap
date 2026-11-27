const express = require('express')
const axios = require('axios')
const { isPrivateHost, redirectGuard, safeUrl } = require('../services/urlSafety')

const router = express.Router()
const MAX_BYTES = 25 * 1024 * 1024
const ALLOWED = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/avif',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/flac',
  'audio/x-m4a',
  'audio/m4a',
])

function blockedHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.+$/, '')
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true
  if (host === 'metadata.google.internal' || host === 'metadata.google.com') return true
  if (host.includes(':')) return true
  const parts = host.split('.').map((part) => Number(part))
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = parts
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
  }
  return false
}

router.get('/fetch', async (req, res) => {
  const checked = safeUrl(req.query.url)
  if (!checked.ok) return res.status(400).json({ error: checked.error })
  const target = new URL(checked.url)
  if (blockedHost(target.hostname)) {
    return res.status(400).json({ error: 'That host is not allowed.' })
  }
  try {
    const response = await axios.get(target.toString(), {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxRedirects: 3,
      // Every redirect hop is checked too: an allowed host must not hand the
      // request to 127.0.0.1 or to the metadata service.
      beforeRedirect: (options) => {
        if (isPrivateHost(options.hostname || options.host)) {
          const error = new Error('Redirect target is a private address')
          error.code = 'REDIRECT_BLOCKED'
          throw error
        }
      },
      maxContentLength: MAX_BYTES,
      maxBodyLength: MAX_BYTES,
      validateStatus: (status) => status >= 200 && status < 300,
      headers: {
        Accept: 'image/*,audio/*,*/*;q=0.1',
        'User-Agent': 'SuperMapMediaForensics/1.0',
      },
    })
    const length = response.data?.byteLength || 0
    if (length > MAX_BYTES) return res.status(413).json({ error: 'That file is over 25 MB.' })
    const type = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
    if (!ALLOWED.has(type)) return res.status(415).json({ error: 'That URL is not an image or audio file.' })
    res.set('Content-Type', type)
    res.set('Cache-Control', 'no-store')
    res.set('X-Content-Type-Options', 'nosniff')
    return res.send(Buffer.from(response.data))
  } catch (error) {
    const status = error?.response?.status
    if (status === 404) return res.status(404).json({ error: 'That file was not found.' })
    return res.status(502).json({ error: 'The file could not be loaded.' })
  }
})

module.exports = router
