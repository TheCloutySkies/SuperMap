/**
 * Linear undo/redo stack of print-page arrays.
 */

export function createHistory(initial = []) {
  return {
    stack: [clonePages(initial)],
    index: 0,
  }
}

function clonePages(pages) {
  return (pages || []).map((p) => ({ ...p }))
}

export function pushHistory(history, pages) {
  const nextStack = history.stack.slice(0, history.index + 1)
  nextStack.push(clonePages(pages))
  if (nextStack.length > 80) nextStack.shift()
  return { stack: nextStack, index: nextStack.length - 1 }
}

export function undoHistory(history) {
  if (!history || history.index <= 0) return null
  const index = history.index - 1
  return { history: { ...history, index }, pages: clonePages(history.stack[index]) }
}

export function redoHistory(history) {
  if (!history || history.index >= history.stack.length - 1) return null
  const index = history.index + 1
  return { history: { ...history, index }, pages: clonePages(history.stack[index]) }
}

export function canUndo(history) {
  return !!history && history.index > 0
}

export function canRedo(history) {
  return !!history && history.index < history.stack.length - 1
}
