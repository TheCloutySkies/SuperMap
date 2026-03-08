import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const SavedReportsContext = createContext({
  reports: [],
  loading: false,
  saveReport: async () => {},
  deleteReport: async () => {},
  refresh: async () => {},
})

export function SavedReportsProvider({ children }) {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchReports = useCallback(async () => {
    if (!supabase || !user?.id) {
      setReports([])
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('saved_reports')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    if (error) setReports([])
    else setReports(data || [])
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const saveReport = useCallback(async (report, existingId = null) => {
    if (!supabase || !user?.id) throw new Error('Sign in to save reports')
    const row = {
      user_id: user.id,
      title: String(report?.title || 'Untitled Report').slice(0, 180),
      body: String(report?.body || ''),
      payload: report || {},
      updated_at: new Date().toISOString(),
    }
    let error
    let savedId = existingId || null
    if (existingId) {
      const res = await supabase.from('saved_reports').update(row).eq('id', existingId).eq('user_id', user.id)
      error = res.error
    } else {
      const res = await supabase.from('saved_reports').insert(row).select('id').limit(1)
      error = res.error
      savedId = res.data?.[0]?.id || null
    }
    if (error) throw error
    await fetchReports()
    return savedId
  }, [user?.id, fetchReports])

  const deleteReport = useCallback(async (id) => {
    if (!supabase || !user?.id) return
    await supabase.from('saved_reports').delete().eq('user_id', user.id).eq('id', id)
    await fetchReports()
  }, [user?.id, fetchReports])

  return (
    <SavedReportsContext.Provider value={{ reports, loading, saveReport, deleteReport, refresh: fetchReports }}>
      {children}
    </SavedReportsContext.Provider>
  )
}

export function useSavedReports() {
  const ctx = useContext(SavedReportsContext)
  if (!ctx) throw new Error('useSavedReports must be used within SavedReportsProvider')
  return ctx
}

