import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const SavedArticlesContext = createContext({
  saved: [],
  savedIds: new Set(),
  add: async () => {},
  remove: async () => {},
  isSaved: () => false,
  loading: false,
})

export function SavedArticlesProvider({ children }) {
  const { user } = useAuth()
  const [saved, setSaved] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchSaved = useCallback(async () => {
    if (!supabase || !user?.id) {
      setSaved([])
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('saved_articles')
      .select('*')
      .eq('user_id', user.id)
      .order('saved_at', { ascending: false })
    if (!error) setSaved(data || [])
    else setSaved([])
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    fetchSaved()
  }, [fetchSaved])

  const add = useCallback(async (article) => {
    if (!supabase || !user?.id) throw new Error('Sign in to save articles')
    const row = {
      user_id: user.id,
      url: article.link || article.url || '',
      title: article.title || 'Untitled',
      source: article.source || '',
      snippet: (article.contentSnippet || article.description || '').slice(0, 500),
    }
    const { error } = await supabase.from('saved_articles').upsert(row, {
      onConflict: 'user_id,url',
      ignoreDuplicates: false,
    })
    if (error) throw error
    await fetchSaved()
  }, [user?.id, fetchSaved])

  const remove = useCallback(async (url) => {
    if (!supabase || !user?.id) return
    await supabase.from('saved_articles').delete().eq('user_id', user.id).eq('url', url)
    await fetchSaved()
  }, [user?.id, fetchSaved])

  const isSaved = useCallback((url) => saved.some((a) => (a.url || '') === (url || '')), [saved])

  const savedIds = new Set(saved.map((a) => a.url).filter(Boolean))

  return (
    <SavedArticlesContext.Provider value={{ saved, savedIds, add, remove, isSaved, loading, refresh: fetchSaved }}>
      {children}
    </SavedArticlesContext.Provider>
  )
}

export function useSavedArticles() {
  const ctx = useContext(SavedArticlesContext)
  if (!ctx) throw new Error('useSavedArticles must be used within SavedArticlesProvider')
  return ctx
}
