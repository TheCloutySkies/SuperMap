/**
 * One XP error box at a time. A failed action raises it; the box's OK clears it.
 */
let current = null
const listeners = new Set()

function emit() {
  for (const listener of listeners) listener(current)
}

export function raiseError(title, message) {
  current = {
    title: String(title || 'Good Palantir'),
    message: String(message || 'That did not work. Try again.'),
  }
  emit()
}

export function clearError() {
  current = null
  emit()
}

export function subscribeErrors(listener) {
  listeners.add(listener)
  listener(current)
  return () => listeners.delete(listener)
}
