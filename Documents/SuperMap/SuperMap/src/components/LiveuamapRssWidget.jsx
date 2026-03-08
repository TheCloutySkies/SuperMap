import { useState, useEffect } from 'react'
import { fetchLiveuamapRss } from '../services/layerServices'
import './LiveuamapRssWidget.css'

export default function LiveuamapRssWidget() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchLiveuamapRss()
      .then((data) => {
        if (!cancelled) setItems(data)
      })
      .catch(() => setItems([]))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    const interval = setInterval(() => {
      fetchLiveuamapRss().then((data) => {
        if (!cancelled) setItems(data)
      })
    }, 300000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return (
    <section className="liveuamap-widget">
      <h3>Liveuamap RSS</h3>
      {loading ? (
        <p className="liveuamap-loading">Loading…</p>
      ) : items.length === 0 ? (
        <p className="liveuamap-empty">No items</p>
      ) : (
        <ul className="liveuamap-list">
          {items.slice(0, 10).map((item, i) => (
            <li key={i}>
              <a href={item.link} target="_blank" rel="noopener noreferrer">
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
