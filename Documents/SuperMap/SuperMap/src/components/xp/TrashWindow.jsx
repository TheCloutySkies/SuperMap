/** Recycle Bin: cases removed from Batman Mode, restorable until emptied. */
import { useState } from 'react'
import { emptyTrash, listTrash, restoreTrash } from '../../features/batman/caseStore'
import XpListview from './XpListview'

export default function TrashWindow() {
  const [rows, setRows] = useState(() => listTrash())

  const columns = [
    { key: 'title', label: 'Case' },
    { key: 'deletedAtMs', label: 'Deleted', mono: true, width: '140px', render: (row) => (row.deletedAtMs ? new Date(row.deletedAtMs).toLocaleDateString('en-CA') : '—') },
    { key: 'nodes', label: 'Items', mono: true, width: '70px', render: (row) => (row.nodes || []).length },
  ]

  return (
    <div className="xp-trash">
      <p className="xp-note">A case deleted in Batman Mode lands here. Restore it, or empty the bin for good.</p>
      <XpListview
        label="Recycle Bin"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        emptyLabel="The bin is empty"
        onOpen={(row) => { restoreTrash(row.id); setRows(listTrash()) }}
      />
      <div className="field-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          type="button"
          onClick={() => {
            const first = rows[0]
            if (!first) return
            restoreTrash(first.id)
            setRows(listTrash())
          }}
          disabled={!rows.length}
        >
          Restore selected
        </button>
        <button
          type="button"
          onClick={() => { emptyTrash(); setRows(listTrash()) }}
          disabled={!rows.length}
        >
          Empty the bin
        </button>
      </div>
    </div>
  )
}
