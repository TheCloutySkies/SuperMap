import { useEffect, useRef } from 'react'
import Hls from 'hls.js'
import './StreamPlayer.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

export default function StreamPlayer({ streamUrl, referer = '', name = 'Live stream', onError }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)

  useEffect(() => {
    if (!streamUrl || !videoRef.current) return
    const proxyUrl = `${API_BASE}/api/stream/proxy?url=${encodeURIComponent(streamUrl)}${referer ? '&referer=' + encodeURIComponent(referer) : ''}`

    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup(xhr) {
          xhr.withCredentials = false
        },
      })
      hlsRef.current = hls
      hls.loadSource(proxyUrl)
      hls.attachMedia(videoRef.current)
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          onError?.(data.type + ': ' + (data.details || ''))
        }
      })
      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    }
    if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = proxyUrl
      return () => {
        videoRef.current.src = ''
      }
    }
    onError?.('HLS not supported')
  }, [streamUrl, referer, onError])

  return (
    <div className="stream-player">
      <video
        ref={videoRef}
        className="stream-player-video"
        controls
        autoPlay
        playsInline
        muted={false}
      />
      <span className="stream-player-label">{name}</span>
    </div>
  )
}
