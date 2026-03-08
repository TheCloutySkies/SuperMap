import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const SavedPlacesContext = createContext({
  places: [],
  lists: [],
  loading: false,
  addPlace: async () => {},
  removePlace: async () => {},
  clearPlaces: async () => {},
  createList: async () => {},
  renameList: async () => {},
  deleteList: async () => {},
  movePlacesToList: async () => {},
})

export function SavedPlacesProvider({ children }) {
  const { user } = useAuth()
  const [places, setPlaces] = useState([])
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchPlaces = useCallback(async () => {
    if (!supabase || !user?.id) {
      setPlaces([])
      setLists([])
      return
    }
    setLoading(true)
    const [placesRes, listsRes] = await Promise.all([
      supabase
        .from('saved_places')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('saved_place_lists')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true }),
    ])
    if (placesRes.error) setPlaces([])
    else setPlaces(placesRes.data || [])
    if (listsRes.error) setLists([])
    else setLists(listsRes.data || [])
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    fetchPlaces()
  }, [fetchPlaces])

  const addPlace = useCallback(async (place) => {
    if (!supabase || !user?.id) throw new Error('Sign in to save places')
    const rawListName = String(place?.listName || 'General').slice(0, 80)
    let listId = place?.listId || null
    if (!listId && rawListName) {
      const { data: existing } = await supabase
        .from('saved_place_lists')
        .select('id,name')
        .eq('user_id', user.id)
        .eq('name', rawListName)
        .limit(1)
      if (existing?.[0]?.id) {
        listId = existing[0].id
      } else {
        const { data: created, error: createError } = await supabase
          .from('saved_place_lists')
          .insert({ user_id: user.id, name: rawListName })
          .select('id,name')
          .limit(1)
        if (createError) throw createError
        listId = created?.[0]?.id || null
      }
    }
    const row = {
      user_id: user.id,
      title: String(place?.title || 'Pinned place').slice(0, 120),
      lat: Number(place?.lat),
      lon: Number(place?.lon),
      icon: String(place?.icon || '📍').slice(0, 8),
      list_name: rawListName || 'General',
      list_id: listId,
      notes: String(place?.notes || '').slice(0, 1000),
    }
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) throw new Error('Invalid coordinates')
    const { error } = await supabase.from('saved_places').insert(row)
    if (error) throw error
    await fetchPlaces()
  }, [user?.id, fetchPlaces])

  const removePlace = useCallback(async (id) => {
    if (!supabase || !user?.id) return
    await supabase.from('saved_places').delete().eq('user_id', user.id).eq('id', id)
    await fetchPlaces()
  }, [user?.id, fetchPlaces])

  const clearPlaces = useCallback(async () => {
    if (!supabase || !user?.id) return
    await supabase.from('saved_places').delete().eq('user_id', user.id)
    await fetchPlaces()
  }, [user?.id, fetchPlaces])

  const createList = useCallback(async (name) => {
    if (!supabase || !user?.id) throw new Error('Sign in required')
    const listName = String(name || '').trim().slice(0, 80)
    if (!listName) throw new Error('List name required')
    const { error } = await supabase
      .from('saved_place_lists')
      .upsert({ user_id: user.id, name: listName }, { onConflict: 'user_id,name', ignoreDuplicates: true })
    if (error) throw error
    await fetchPlaces()
  }, [user?.id, fetchPlaces])

  const renameList = useCallback(async (fromName, toName) => {
    if (!supabase || !user?.id) throw new Error('Sign in required')
    const oldName = String(fromName || '').trim().slice(0, 80)
    const newName = String(toName || '').trim().slice(0, 80)
    if (!oldName || !newName) throw new Error('Both list names required')
    const { data: targetRows } = await supabase
      .from('saved_place_lists')
      .select('id,name')
      .eq('user_id', user.id)
      .eq('name', oldName)
      .limit(1)
    const targetId = targetRows?.[0]?.id || null
    let newListId = null
    const { data: existingNew } = await supabase
      .from('saved_place_lists')
      .select('id,name')
      .eq('user_id', user.id)
      .eq('name', newName)
      .limit(1)
    if (existingNew?.[0]?.id) {
      newListId = existingNew[0].id
    } else {
      const { data: created, error: createError } = await supabase
        .from('saved_place_lists')
        .insert({ user_id: user.id, name: newName })
        .select('id,name')
        .limit(1)
      if (createError) throw createError
      newListId = created?.[0]?.id || null
    }
    const updateQuery = supabase
      .from('saved_places')
      .update({ list_name: newName, list_id: newListId })
      .eq('user_id', user.id)
      .eq('list_name', oldName)
    await updateQuery
    if (targetId) {
      await supabase.from('saved_place_lists').delete().eq('user_id', user.id).eq('id', targetId)
    }
    await fetchPlaces()
  }, [user?.id, fetchPlaces])

  const deleteList = useCallback(async (name) => {
    if (!supabase || !user?.id) throw new Error('Sign in required')
    const listName = String(name || '').trim().slice(0, 80)
    if (!listName) return
    await supabase
      .from('saved_places')
      .update({ list_name: 'General', list_id: null })
      .eq('user_id', user.id)
      .eq('list_name', listName)
    await supabase
      .from('saved_place_lists')
      .delete()
      .eq('user_id', user.id)
      .eq('name', listName)
    await fetchPlaces()
  }, [user?.id, fetchPlaces])

  const movePlacesToList = useCallback(async (placeIds, destinationName) => {
    if (!supabase || !user?.id) throw new Error('Sign in required')
    const ids = Array.isArray(placeIds) ? placeIds.filter(Boolean) : []
    if (!ids.length) return
    const listName = String(destinationName || '').trim().slice(0, 80)
    if (!listName) throw new Error('Destination list required')
    let listId = null
    const { data: existing } = await supabase
      .from('saved_place_lists')
      .select('id,name')
      .eq('user_id', user.id)
      .eq('name', listName)
      .limit(1)
    if (existing?.[0]?.id) {
      listId = existing[0].id
    } else {
      const { data: created, error: createError } = await supabase
        .from('saved_place_lists')
        .insert({ user_id: user.id, name: listName })
        .select('id,name')
        .limit(1)
      if (createError) throw createError
      listId = created?.[0]?.id || null
    }
    const { error } = await supabase
      .from('saved_places')
      .update({ list_name: listName, list_id: listId })
      .eq('user_id', user.id)
      .in('id', ids)
    if (error) throw error
    await fetchPlaces()
  }, [user?.id, fetchPlaces])

  const listNames = useMemo(() => {
    const fromPlaces = places.map((p) => p.list_name || 'General')
    const fromLists = lists.map((l) => l.name || 'General')
    return [...new Set([...fromPlaces, ...fromLists, 'General'])].sort()
  }, [places, lists])

  return (
    <SavedPlacesContext.Provider value={{ places, lists: listNames, loading, addPlace, removePlace, clearPlaces, createList, renameList, deleteList, movePlacesToList, refresh: fetchPlaces }}>
      {children}
    </SavedPlacesContext.Provider>
  )
}

export function useSavedPlaces() {
  const ctx = useContext(SavedPlacesContext)
  if (!ctx) throw new Error('useSavedPlaces must be used within SavedPlacesProvider')
  return ctx
}

