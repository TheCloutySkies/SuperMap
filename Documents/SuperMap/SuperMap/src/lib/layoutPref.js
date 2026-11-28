/**
 * Which shell this device gets: the XP desktop, the phone app, or auto.
 *
 * Phones default to the phone shell; a pointer device gets the desktop. The
 * choice is remembered, and either shell can ask for the other.
 */
import { useEffect, useState } from 'react'

const KEY = 'supermap.layout.v1'
const PHONE_QUERY = '(max-width: 900px), (pointer: coarse)'

const listeners = new Set()
let pref = read()

function read() {
  if (typeof window === 'undefined') return 'auto'
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw === 'desktop' || raw === 'mobile' ? raw : 'auto'
  } catch {
    return 'auto'
  }
}

export function getLayoutPref() {
  return pref
}

export function setLayoutPref(next) {
  pref = next === 'desktop' || next === 'mobile' ? next : 'auto'
  try {
    window.localStorage.setItem(KEY, pref)
  } catch { /* private mode */ }
  for (const listener of listeners) listener(pref)
}

export function subscribeLayoutPref(listener) {
  // The reader starts from getLayoutPref(); this only hears about changes.
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** A phone is a narrow screen or a finger, whichever comes first. */
export function isPhoneDevice() {
  if (typeof window === 'undefined') return false
  return window.matchMedia(PHONE_QUERY).matches
}

export function useLayoutPref() {
  const [value, setValue] = useState(pref)
  useEffect(() => subscribeLayoutPref(setValue), [])
  return value
}

/** True when this render belongs to the phone shell. */
export function usePhoneShell() {
  const choice = useLayoutPref()
  const [phone, setPhone] = useState(() => isPhoneDevice())
  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY)
    const onChange = (event) => setPhone(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  if (choice === 'mobile') return true
  if (choice === 'desktop') return false
  return phone
}
