import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const SavedXPostsContext = createContext({
  savedPosts: [],
  savedPostIds: new Set(),
  addPost: async () => {},
  removePost: async () => {},
  isSavedPost: () => false,
  loading: false,
})

export function SavedXPostsProvider({ children }) {
  const { user } = useAuth()
  const [savedPosts, setSavedPosts] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchSavedPosts = useCallback(async () => {
    if (!supabase || !user?.id) {
      setSavedPosts([])
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('saved_x_posts')
      .select('*')
      .eq('user_id', user.id)
      .order('saved_at', { ascending: false })
    if (error) setSavedPosts([])
    else setSavedPosts(data || [])
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    fetchSavedPosts()
  }, [fetchSavedPosts])

  const addPost = useCallback(async (post) => {
    if (!supabase || !user?.id) throw new Error('Sign in to save posts')
    const url = String(post?.url || post?.link || '').trim()
    if (!url) throw new Error('Post URL missing')
    const row = {
      user_id: user.id,
      url,
      account: post?.account || '',
      title: post?.title || '',
      content: (post?.content || '').slice(0, 1200),
      posted_at: post?.timestamp ? new Date(post.timestamp).toISOString() : null,
    }
    const { error } = await supabase.from('saved_x_posts').upsert(row, {
      onConflict: 'user_id,url',
      ignoreDuplicates: false,
    })
    if (error) throw error
    await fetchSavedPosts()
  }, [user?.id, fetchSavedPosts])

  const removePost = useCallback(async (url) => {
    if (!supabase || !user?.id) return
    await supabase.from('saved_x_posts').delete().eq('user_id', user.id).eq('url', url)
    await fetchSavedPosts()
  }, [user?.id, fetchSavedPosts])

  const isSavedPost = useCallback((url) => savedPosts.some((p) => (p.url || '') === (url || '')), [savedPosts])
  const savedPostIds = new Set(savedPosts.map((p) => p.url).filter(Boolean))

  return (
    <SavedXPostsContext.Provider value={{ savedPosts, savedPostIds, addPost, removePost, isSavedPost, loading, refresh: fetchSavedPosts }}>
      {children}
    </SavedXPostsContext.Provider>
  )
}

export function useSavedXPosts() {
  const ctx = useContext(SavedXPostsContext)
  if (!ctx) throw new Error('useSavedXPosts must be used within SavedXPostsProvider')
  return ctx
}

