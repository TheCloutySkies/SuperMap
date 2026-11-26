/**
 * Single-flight for slow upstream fetches.
 *
 * A cold cache plus N visitors used to mean N upstream calls on a 0.1-CPU free
 * instance, each holding its request for tens of seconds and starving the rest.
 * One caller does the work; everyone else awaits the same promise.
 *
 * `singleFlight(key, fn)` returns fn()'s promise, shared while it runs. The entry
 * is dropped as soon as it settles, so a later miss starts a fresh fetch.
 */
const inflight = new Map()

function singleFlight(key, fn) {
  const existing = inflight.get(key)
  if (existing) return existing.promise
  const entry = {}
  entry.promise = (async () => {
    try {
      return await fn()
    } finally {
      if (inflight.get(key) === entry) inflight.delete(key)
    }
  })()
  inflight.set(key, entry)
  return entry.promise
}

/** True while a call for this key is running (useful for logs and status routes). */
function isInflight(key) {
  return inflight.has(key)
}

function inflightKeys() {
  return [...inflight.keys()]
}

module.exports = { singleFlight, isInflight, inflightKeys }
