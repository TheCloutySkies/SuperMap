import { useState, useEffect } from 'react'
import './PinEditorDialog.css'

const ICON_OPTIONS = ['📍', '⭐', '⚠️', '🔥', '🚨', '🛰️', '🛡️', '📡', '🏠', '🏥', '📌', '🎯', '✈️', '🚢', '🏭', '📷']

export default function PinEditorDialog({
  open,
  onClose,
  pin,
  isNew = false,
  listNames = [],
  onSave,
  onDelete,
  onCreateList,
}) {
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState('📍')
  const [listName, setListName] = useState('General')
  const [notes, setNotes] = useState('')
  const [newListName, setNewListName] = useState('')
  const [customLists, setCustomLists] = useState([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const pinTitle = pin?.title ?? pin?.properties?.title ?? ''
  const pinIcon = pin?.icon ?? pin?.properties?.icon ?? '📍'
  const pinList = pin?.list_name ?? pin?.properties?.source ?? 'General'
  const pinNotes = pin?.notes ?? ''

  useEffect(() => {
    if (!open) return
    setTitle(pinTitle || '')
    setIcon(pinIcon || '📍')
    setListName(pinList || 'General')
    setNotes(pinNotes || '')
  }, [open, pinTitle, pinIcon, pinList, pinNotes])

  const handleSave = async () => {
    if (!pin?.id) return
    setSaving(true)
    try {
      await onSave?.({
        title: title.trim() || 'Pinned place',
        icon: icon || '📍',
        listName: listName.trim() || 'General',
        notes: notes.trim(),
      })
      onClose?.()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!pin?.id || !window.confirm('Delete this pin?')) return
    setDeleting(true)
    try {
      await onDelete?.()
      onClose?.()
    } finally {
      setDeleting(false)
    }
  }

  const handleCreateList = () => {
    const name = (newListName || '').trim()
    if (!name) return
    if (onCreateList) {
      onCreateList(name)
    } else {
      setCustomLists((prev) => (prev.includes(name) ? prev : [...prev, name].sort()))
    }
    setListName(name)
    setNewListName('')
  }

  if (!open) return null

  const lists = [...new Set([...listNames, ...customLists, 'General'])].filter(Boolean).sort()

  return (
    <div className="pin-editor-overlay" onClick={onClose}>
      <div className="pin-editor-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="pin-editor-header">
          <h2 className="pin-editor-title">{isNew ? 'New pin' : 'Edit pin'}</h2>
          <button type="button" className="pin-editor-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="pin-editor-body">
          <label className="pin-editor-label">
            Name
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Pin name"
              className="pin-editor-input"
            />
          </label>

          <label className="pin-editor-label">
            Icon
            <div className="pin-editor-icons">
              {ICON_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`pin-editor-icon-btn ${icon === emoji ? 'active' : ''}`}
                  onClick={() => setIcon(emoji)}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </label>

          <label className="pin-editor-label">
            List
            <select
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              className="pin-editor-select"
            >
              {lists.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>

          <div className="pin-editor-new-list">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="New list name"
              className="pin-editor-input"
            />
            <button type="button" className="pin-editor-btn pin-editor-btn--secondary" onClick={handleCreateList}>
              Create list
            </button>
          </div>

          <label className="pin-editor-label">
            Notes (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="pin-editor-textarea"
              rows={2}
            />
          </label>
        </div>

        <div className="pin-editor-footer">
          <button
            type="button"
            className="pin-editor-btn pin-editor-btn--danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? '…' : 'Delete pin'}
          </button>
          <div className="pin-editor-footer-actions">
            <button type="button" className="pin-editor-btn pin-editor-btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="pin-editor-btn pin-editor-btn--primary" onClick={handleSave} disabled={saving}>
              {saving ? '…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
