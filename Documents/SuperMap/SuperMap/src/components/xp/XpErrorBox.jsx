import { useEffect, useState } from 'react'
import XpDialog from './XpDialog'
import { clearError, subscribeErrors } from '../../lib/xpErrors'

/** The XP error box: a title, the reason, and one OK. */
export default function XpErrorBox() {
  const [error, setError] = useState(null)

  useEffect(() => subscribeErrors(setError), [])

  if (!error) return null

  return (
    <XpDialog
      title={error.title}
      width={430}
      onClose={clearError}
      actions={<button type="button" onClick={clearError}>OK</button>}
    >
      <p className="xp-error-text">{error.message}</p>
    </XpDialog>
  )
}
