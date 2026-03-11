import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { useAuth } from '../contexts/AuthContext'
import { useSavedArticles } from '../contexts/SavedArticlesContext'
import { useSavedXPosts } from '../contexts/SavedXPostsContext'
import { supabase } from '../lib/supabase'
import './CommunityView.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

function useRichEditor(content, onChange) {
  return useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })
}

function EditorToolbar({ editor }) {
  if (!editor) return null
  return (
    <div className="community-toolbar">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}>Bold</button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}>Italic</button>
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}>List</button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}>Numbered</button>
      <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}>Quote</button>
      <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>Code</button>
      <button
        type="button"
        onClick={() => {
          const url = window.prompt('Paste URL:')
          if (!url) return
          editor.chain().focus().setLink({ href: url }).run()
        }}
      >
        Link
      </button>
    </div>
  )
}

function parseHashRoute() {
  const hash = window.location.hash || '#/community'
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'community' && parts[1]) return { kind: 'community-detail', id: parts[1] }
  if (parts[0] === 'post' && parts[1]) return { kind: 'post-thread', id: parts[1] }
  return { kind: 'community-list', id: null }
}

async function authHeaders() {
  if (!supabase) return {}
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export default function CommunityView({ onSignInRequired }) {
  const { user } = useAuth()
  const { saved } = useSavedArticles()
  const { savedPosts } = useSavedXPosts()
  const [route, setRoute] = useState(() => parseHashRoute())
  const [categories, setCategories] = useState([])
  const [communities, setCommunities] = useState([])
  const [posts, setPosts] = useState([])
  const [thread, setThread] = useState({ post: null, comments: [], links: [] })
  const [selectedCategory, setSelectedCategory] = useState('')
  const [communityName, setCommunityName] = useState('')
  const [communityDescription, setCommunityDescription] = useState('')
  const [postCommunityId, setPostCommunityId] = useState('')
  const [postTitle, setPostTitle] = useState('')
  const [postHtml, setPostHtml] = useState('<p></p>')
  const [commentHtml, setCommentHtml] = useState('<p></p>')
  const [categoryRequestName, setCategoryRequestName] = useState('')
  const [categoryRequestDescription, setCategoryRequestDescription] = useState('')
  const [selectedSavedLinks, setSelectedSavedLinks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const postEditor = useRichEditor(postHtml, setPostHtml)
  const commentEditor = useRichEditor(commentHtml, setCommentHtml)

  const savedLinkOptions = useMemo(() => {
    const articleLinks = (saved || []).map((a) => ({
      id: `article:${a.id || a.url}`,
      label: `Article: ${a.title || a.url}`,
    }))
    const xLinks = (savedPosts || []).map((p) => ({
      id: `x:${p.id || p.url}`,
      label: `X post: ${p.title || p.url}`,
    }))
    return [...articleLinks, ...xLinks]
  }, [saved, savedPosts])

  useEffect(() => {
    const handler = () => setRoute(parseHashRoute())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  const loadBase = async () => {
    setLoading(true)
    setError('')
    try {
      const [catRes, commRes] = await Promise.all([
        axios.get(`${API_BASE}/api/forum/categories`, { timeout: 12000 }),
        axios.get(`${API_BASE}/api/forum/communities`, { timeout: 12000 }),
      ])
      setCategories(Array.isArray(catRes.data) ? catRes.data : [])
      setCommunities(Array.isArray(commRes.data) ? commRes.data : [])
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not load forum')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBase()
  }, [])

  useEffect(() => {
    if (route.kind !== 'community-detail') return
    setLoading(true)
    axios.get(`${API_BASE}/api/forum/posts`, {
      params: { community_id: route.id },
      timeout: 12000,
    })
      .then((res) => setPosts(Array.isArray(res.data) ? res.data : []))
      .catch((err) => setError(err?.response?.data?.error || err?.message || 'Could not load posts'))
      .finally(() => setLoading(false))
  }, [route.kind, route.id])

  useEffect(() => {
    if (route.kind !== 'post-thread') return
    setLoading(true)
    axios.get(`${API_BASE}/api/forum/post/${route.id}`, { timeout: 12000 })
      .then((res) => setThread(res.data || { post: null, comments: [], links: [] }))
      .catch((err) => setError(err?.response?.data?.error || err?.message || 'Could not load thread'))
      .finally(() => setLoading(false))
  }, [route.kind, route.id])

  const createCommunity = async () => {
    if (!user) return onSignInRequired?.()
    if (!selectedCategory || !communityName.trim()) return
    try {
      setError('')
      const headers = await authHeaders()
      await axios.post(`${API_BASE}/api/forum/community`, {
        name: communityName.trim(),
        description: communityDescription.trim(),
        category_id: selectedCategory,
      }, { headers, timeout: 12000 })
      setCommunityName('')
      setCommunityDescription('')
      await loadBase()
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not create community')
    }
  }

  const createPost = async () => {
    if (!user) return onSignInRequired?.()
    const targetCommunityId = route.kind === 'community-detail' ? route.id : postCommunityId
    if (!postTitle.trim() || !targetCommunityId) return
    try {
      setError('')
      const headers = await authHeaders()
      const res = await axios.post(`${API_BASE}/api/forum/post`, {
        community_id: targetCommunityId,
        title: postTitle.trim(),
        content: postHtml,
        linked_saved_post_ids: selectedSavedLinks,
      }, { headers, timeout: 15000 })
      setPostTitle('')
      setPostHtml('<p></p>')
      setPostCommunityId('')
      setSelectedSavedLinks([])
      window.location.hash = `#/post/${res.data.id}`
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not create post')
    }
  }

  const createComment = async (parentId = null) => {
    if (!user) return onSignInRequired?.()
    try {
      setError('')
      const headers = await authHeaders()
      await axios.post(`${API_BASE}/api/forum/comment`, {
        post_id: route.id,
        content: commentHtml,
        parent_id: parentId,
      }, { headers, timeout: 12000 })
      setCommentHtml('<p></p>')
      const refreshed = await axios.get(`${API_BASE}/api/forum/post/${route.id}`, { timeout: 12000 })
      setThread(refreshed.data || { post: null, comments: [], links: [] })
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not create comment')
    }
  }

  const requestCategory = async () => {
    if (!user) return onSignInRequired?.()
    if (!categoryRequestName.trim()) return
    try {
      setError('')
      const headers = await authHeaders()
      await axios.post(`${API_BASE}/api/category-request`, {
        category_name: categoryRequestName.trim(),
        description: categoryRequestDescription.trim(),
      }, { headers, timeout: 12000 })
      setCategoryRequestName('')
      setCategoryRequestDescription('')
      window.alert('Category request sent to admin.')
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not submit category request')
    }
  }

  if (route.kind === 'community-detail') {
    const community = communities.find((c) => c.id === route.id)
    return (
      <div className="community-view">
        <button type="button" onClick={() => { window.location.hash = '#/community' }}>← Back to Communities</button>
        <h2>{community?.name || 'Community'}</h2>
        <p>{community?.description || ''}</p>
        {error && <p className="community-error">{error}</p>}
        <div className="community-list">
          {posts.length === 0 ? (
            <div className="community-card">
              <p>No posts yet. Be the first to post in this community.</p>
            </div>
          ) : (
            posts.map((p) => (
              <button key={p.id} type="button" className="community-row" onClick={() => { window.location.hash = `#/post/${p.id}` }}>
                <strong>{p.title}</strong>
                <span>{new Date(p.created_at).toLocaleString()}</span>
              </button>
            ))
          )}
        </div>
        <div className="community-card">
          <h3>Create Post</h3>
          <input value={postTitle} onChange={(e) => setPostTitle(e.target.value)} placeholder="Post title" />
          <EditorToolbar editor={postEditor} />
          <EditorContent editor={postEditor} className="community-editor" />
          <label>Link saved posts</label>
          <select
            multiple
            value={selectedSavedLinks}
            onChange={(e) => {
              const values = Array.from(e.target.selectedOptions).map((o) => o.value)
              setSelectedSavedLinks(values)
            }}
          >
            {savedLinkOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
          </select>
          <button type="button" onClick={createPost}>Publish post</button>
        </div>
      </div>
    )
  }

  if (route.kind === 'post-thread') {
    return (
      <div className="community-view">
        <button type="button" onClick={() => { window.location.hash = `#/community/${thread.post?.community_id || ''}` }}>← Back to Community</button>
        <h2>{thread.post?.title || 'Post thread'}</h2>
        {error && <p className="community-error">{error}</p>}
        <article className="community-card" dangerouslySetInnerHTML={{ __html: thread.post?.content || '' }} />
        <div className="community-card">
          <h3>Comments</h3>
          <EditorToolbar editor={commentEditor} />
          <EditorContent editor={commentEditor} className="community-editor" />
          <button type="button" onClick={() => createComment(null)}>Add comment</button>
          <ul className="community-comments">
            {(thread.comments || []).map((c) => (
              <li key={c.id}>
                <div dangerouslySetInnerHTML={{ __html: c.content }} />
                <small>{new Date(c.created_at).toLocaleString()}</small>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div className="community-view">
      <h2>Community</h2>
      {error && <p className="community-error">{error}</p>}
      {loading ? <p>Loading…</p> : (
        <div className="community-list">
          {communities.map((c) => (
            <button key={c.id} type="button" className="community-row" onClick={() => { window.location.hash = `#/community/${c.id}` }}>
              <strong>{c.name}</strong>
              <span>{c.description || 'No description'}</span>
            </button>
          ))}
        </div>
      )}
      <div className="community-card">
        <h3>Create post</h3>
        <select value={postCommunityId} onChange={(e) => setPostCommunityId(e.target.value)}>
          <option value="">Select community</option>
          {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input value={postTitle} onChange={(e) => setPostTitle(e.target.value)} placeholder="Post title" />
        <EditorToolbar editor={postEditor} />
        <EditorContent editor={postEditor} className="community-editor" />
        <label>Link saved posts</label>
        <select
          multiple
          value={selectedSavedLinks}
          onChange={(e) => {
            const values = Array.from(e.target.selectedOptions).map((o) => o.value)
            setSelectedSavedLinks(values)
          }}
        >
          {savedLinkOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
        </select>
        <button type="button" onClick={createPost} disabled={!postCommunityId || !postTitle.trim()}>
          Publish post
        </button>
      </div>
      <div className="community-card">
        <h3>Create community</h3>
        <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
          <option value="">Select category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input value={communityName} onChange={(e) => setCommunityName(e.target.value)} placeholder="Community name" />
        <textarea value={communityDescription} onChange={(e) => setCommunityDescription(e.target.value)} placeholder="Description" rows={3} />
        <button type="button" onClick={createCommunity}>Create community</button>
      </div>
      <div className="community-card">
        <h3>Request new category</h3>
        <input value={categoryRequestName} onChange={(e) => setCategoryRequestName(e.target.value)} placeholder="Category name request" />
        <textarea value={categoryRequestDescription} onChange={(e) => setCategoryRequestDescription(e.target.value)} placeholder="Why this category?" rows={3} />
        <button type="button" onClick={requestCategory}>Submit category request</button>
      </div>
    </div>
  )
}

