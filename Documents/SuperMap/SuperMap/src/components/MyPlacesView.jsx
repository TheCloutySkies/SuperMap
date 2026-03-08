import { useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSavedPlaces } from '../contexts/SavedPlacesContext'
import './MyPlacesView.css'

const ICON_OPTIONS = ['📍', '⭐', '⚠️', '🔥', '🚨', '🛰️', '🛡️', '📡', '🏠', '🏥']

export default function MyPlacesView({ onFlyTo, onSignInRequired }) {
  const { user } = useAuth()
  const { places, lists, loading, addPlace, removePlace, createList, renameList, deleteList, movePlacesToList } = useSavedPlaces()
  const [title, setTitle] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [icon, setIcon] = useState('📍')
  const [listName, setListName] = useState('General')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkTargetList, setBulkTargetList] = useState('General')

  const grouped = useMemo(() => {
    const map = new Map()
    places.forEach((p) => {
      const key = p.list_name || 'General'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    })
    return Array.from(map.entries())
  }, [places])

  const submit = async () => {
    if (!user) {
      onSignInRequired?.()
      return
    }
    setSaving(true)
    try {
      await addPlace({
        title: title || 'Pinned place',
        lat: Number(lat),
        lon: Number(lon),
        icon,
        listName: listName || 'General',
        notes,
      })
      setTitle('')
      setLat('')
      setLon('')
      setNotes('')
    } finally {
      setSaving(false)
    }
  }

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreateList = async () => {
    const name = newListName.trim()
    if (!name) return
    await createList(name)
    setNewListName('')
  }

  const handleRenameList = async (fromName) => {
    const toName = window.prompt(`Rename list "${fromName}" to:`, fromName) || ''
    if (!toName.trim() || toName.trim() === fromName) return
    await renameList(fromName, toName.trim())
  }

  const handleDeleteList = async (name) => {
    if (name === 'General') return
    const ok = window.confirm(`Delete list "${name}"? Places will move to General.`)
    if (!ok) return
    await deleteList(name)
  }

  const handleBulkMove = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length || !bulkTargetList) return
    await movePlacesToList(ids, bulkTargetList)
    setSelectedIds(new Set())
  }

  if (!user) {
    return (
      <div className="my-places-view">
        <h2>My Places</h2>
        <p>Sign in to create pinned places with custom icons and lists.</p>
        <button type="button" onClick={onSignInRequired}>Sign in</button>
      </div>
    )
  }

  return (
    <div className="my-places-view">
      <h2>My Places</h2>
      <p className="my-places-hint">Framework for account-bound pins/lists (Google Maps style).</p>
      <div className="my-places-lists-admin">
        <input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="Create new list" />
        <button type="button" onClick={handleCreateList} disabled={!newListName.trim()}>Create list</button>
      </div>
      <div className="my-places-bulk">
        <select value={bulkTargetList} onChange={(e) => setBulkTargetList(e.target.value)}>
          {lists.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <button type="button" onClick={handleBulkMove} disabled={selectedIds.size === 0}>Move selected ({selectedIds.size})</button>
      </div>
      <div className="my-places-form">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pin title" />
        <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" />
        <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="Longitude" />
        <input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="List name (e.g. Watchlist)" />
        <select value={icon} onChange={(e) => setIcon(e.target.value)}>
          {ICON_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={3} />
        <button type="button" onClick={submit} disabled={saving || !lat || !lon}>{saving ? 'Saving…' : 'Save pin'}</button>
      </div>
      {loading ? <p>Loading…</p> : (
        <div className="my-places-groups">
          {grouped.map(([name, rows]) => (
            <section key={name} className="my-places-group">
              <div className="my-places-group-head">
                <h3>{name} ({rows.length})</h3>
                <div className="my-places-group-actions">
                  <button type="button" onClick={() => handleRenameList(name)}>Rename</button>
                  {name !== 'General' && <button type="button" onClick={() => handleDeleteList(name)}>Delete</button>}
                </div>
              </div>
              <ul>
                {rows.map((p) => (
                  <li key={p.id}>
                    <label className="my-places-select">
                      <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelected(p.id)} />
                    </label>
                    <button type="button" onClick={() => onFlyTo?.({ lng: Number(p.lon), lat: Number(p.lat), zoom: 13, properties: { title: p.title } })}>
                      {p.icon || '📍'} {p.title}
                    </button>
                    <span>{Number(p.lat).toFixed(4)}, {Number(p.lon).toFixed(4)}</span>
                    <button type="button" onClick={() => removePlace(p.id)}>Remove</button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

