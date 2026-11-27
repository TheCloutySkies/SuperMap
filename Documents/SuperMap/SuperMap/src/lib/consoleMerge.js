/**
 * Payload merge for the console store, kept free of browser imports so it can be
 * unit-tested in Node.
 *
 * A payload already in hand is never replaced by a thinner one, and a failed
 * source keeps its last copy: the desk never blanks a panel it already painted.
 */
export function mergeConsolePayloads(previous = {}, incoming = {}) {
  const next = { ...previous }
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value == null) continue
    next[key] = value
  }
  return next
}
