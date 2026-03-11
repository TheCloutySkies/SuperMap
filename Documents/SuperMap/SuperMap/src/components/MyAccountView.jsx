import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSavedPlaces } from '../contexts/SavedPlacesContext'
import { useSavedReports } from '../contexts/SavedReportsContext'
import { useSavedArticles } from '../contexts/SavedArticlesContext'
import { getConfigProfile } from '../constants'
import { supabase } from '../lib/supabase'
import './MyAccountView.css'

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function MyAccountView({ onNavigateSection, onSignInRequired }) {
  const { user, deleteAccount } = useAuth()
  const { places, lists, listMeta, refresh: refreshPlaces } = useSavedPlaces()
  const { reports, refresh: refreshReports } = useSavedReports()
  const { saved: savedArticles, refresh: refreshSavedArticles } = useSavedArticles()
  const [comments, setComments] = useState([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [contribLoading, setContribLoading] = useState(false)
  const [contributions, setContributions] = useState({
    categoryRequests: [],
    forumCommunities: [],
    forumPosts: [],
    forumComments: [],
  })
  const [exporting, setExporting] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')

  const profile = useMemo(() => getConfigProfile() || {}, [])

  const fetchComments = useCallback(async () => {
    if (!supabase || !user?.id) {
      setComments([])
      return
    }
    setCommentsLoading(true)
    const { data } = await supabase
      .from('user_updates')
      .select('id,content,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1000)
    setComments(data || [])
    setCommentsLoading(false)
  }, [user?.id])

  const fetchContributions = useCallback(async () => {
    if (!supabase || !user?.id) {
      setContributions({
        categoryRequests: [],
        forumCommunities: [],
        forumPosts: [],
        forumComments: [],
      })
      return
    }
    setContribLoading(true)
    const [reqRes, communitiesRes, postsRes, commentsRes] = await Promise.all([
      supabase
        .from('category_requests')
        .select('id,category_name,status,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('forum_communities')
        .select('id,name,created_at')
        .eq('creator_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('forum_posts')
        .select('id,title,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('forum_comments')
        .select('id,content,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
    ])
    setContributions({
      categoryRequests: reqRes.data || [],
      forumCommunities: communitiesRes.data || [],
      forumPosts: postsRes.data || [],
      forumComments: commentsRes.data || [],
    })
    setContribLoading(false)
  }, [user?.id])

  useEffect(() => {
    refreshPlaces?.()
    refreshReports?.()
    refreshSavedArticles?.()
    fetchComments()
    fetchContributions()
  }, [refreshPlaces, refreshReports, refreshSavedArticles, fetchComments, fetchContributions])

  useEffect(() => {
    if (!supabase || !user?.id) return
    let cancelled = false
    setProfileLoading(true)
    supabase
      .from('user_profiles')
      .select('display_name,bio,avatar_url')
      .eq('user_id', user.id)
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return
        const row = data?.[0]
        setDisplayName(row?.display_name || profile?.name || '')
        setBio(row?.bio || '')
        setAvatarUrl(row?.avatar_url || '')
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false)
      })
    return () => { cancelled = true }
  }, [user?.id, profile?.name])

  const handleExportAll = async () => {
    if (!user) {
      onSignInRequired?.()
      return
    }
    setExporting(true)
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        user: {
          id: user.id,
          email: user.email || '',
          name: profile?.name || '',
          createdAt: user.created_at || null,
          provider: user?.app_metadata?.provider || 'email',
        },
        places: places || [],
        placeLists: listMeta || lists || [],
        savedArticles: savedArticles || [],
        reports: reports || [],
        comments: comments || [],
        contributions,
      }
      const stamp = new Date().toISOString().slice(0, 10)
      downloadJson(`supermap-account-export-${stamp}.json`, payload)
    } finally {
      setExporting(false)
    }
  }

  const saveProfile = async () => {
    if (!supabase || !user?.id) return
    setProfileSaving(true)
    const { error } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: user.id,
        display_name: displayName.trim(),
        bio: bio.trim(),
        avatar_url: avatarUrl || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    setProfileSaving(false)
    if (error) window.alert(error.message || 'Could not save profile')
    else window.alert('Profile updated')
  }

  const uploadAvatar = async (file) => {
    if (!supabase || !user?.id || !file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      window.alert('Only jpg, png, and webp are allowed.')
      return
    }
    if (file.size > 200 * 1024) {
      window.alert('Please compress your image before uploading. Try https://squoosh.app')
      return
    }
    setAvatarUploading(true)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const path = `${user.id}/${Date.now()}-${safeName}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })
    if (uploadError) {
      setAvatarUploading(false)
      window.alert(uploadError.message || 'Avatar upload failed')
      return
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    setAvatarUrl(data?.publicUrl || '')
    setAvatarUploading(false)
  }

  if (!user) {
    return (
      <div className="my-account-view">
        <h2>My Account</h2>
        <p>Sign in to access your profile and account exports.</p>
        <button type="button" onClick={onSignInRequired}>Sign in</button>
      </div>
    )
  }

  return (
    <div className="my-account-view">
      <h2>My Account</h2>
      <div className="my-account-card">
        <p><strong>Name:</strong> {profile?.name || user.email?.split('@')?.[0] || 'User'}</p>
        <p><strong>Email:</strong> {user.email || 'Unknown'}</p>
        <p><strong>Provider:</strong> {user?.app_metadata?.provider || 'email'}</p>
        <p><strong>Joined:</strong> {user.created_at ? new Date(user.created_at).toLocaleString() : 'Unknown'}</p>
      </div>

      <div className="my-account-card">
        <h3>Profile</h3>
        {profileLoading ? <p>Loading profile…</p> : (
          <>
            {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="my-account-avatar" /> : null}
            <label>Display name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" />
            <label>Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Bio (optional)" />
            <label>Avatar (max 200KB, jpg/png/webp)</label>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadAvatar(e.target.files?.[0])} />
            <button type="button" onClick={saveProfile} disabled={profileSaving || avatarUploading}>
              {profileSaving ? 'Saving…' : avatarUploading ? 'Uploading…' : 'Save profile'}
            </button>
          </>
        )}
      </div>

      <div className="my-account-card">
        <h3>Your Content</h3>
        <p>Places: {places.length}</p>
        <p>Saved articles: {savedArticles.length}</p>
        <p>Reports: {reports.length}</p>
        <p>Comments: {commentsLoading ? 'Loading…' : comments.length}</p>
      </div>

      <div className="my-account-card">
        <h3>My Contributions</h3>
        <p>Category requests: {contribLoading ? 'Loading…' : contributions.categoryRequests.length}</p>
        <p>Communities created: {contribLoading ? 'Loading…' : contributions.forumCommunities.length}</p>
        <p>Forum posts: {contribLoading ? 'Loading…' : contributions.forumPosts.length}</p>
        <p>Forum comments: {contribLoading ? 'Loading…' : contributions.forumComments.length}</p>
        {!!contributions.categoryRequests.length && (
          <div className="my-account-sublist">
            <strong>Recent category requests</strong>
            <ul>
              {contributions.categoryRequests.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <span>{r.category_name}</span>
                  <small>{r.status}</small>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="my-account-actions">
        <button type="button" onClick={() => onNavigateSection?.('my-places')}>Open My Places</button>
        <button type="button" onClick={() => onNavigateSection?.('saved')}>Open Saved Articles</button>
        <button type="button" onClick={() => onNavigateSection?.('my-reports')}>Open My Reports</button>
        <button type="button" onClick={() => onNavigateSection?.('my-comments')}>Open My Comments</button>
        <button type="button" onClick={() => onNavigateSection?.('community')}>Open Community</button>
        <button type="button" className="my-account-export" disabled={exporting} onClick={handleExportAll}>
          {exporting ? 'Exporting…' : 'Export all account data'}
        </button>
        <button
          type="button"
          className="my-account-delete"
          disabled={deletingAccount}
          onClick={async () => {
            const ok = window.confirm('Delete your account and wipe all your data from Supabase? This cannot be undone.')
            if (!ok) return
            setDeletingAccount(true)
            try {
              await deleteAccount()
              window.location.reload()
            } catch (err) {
              window.alert(err?.message || 'Could not delete account')
            } finally {
              setDeletingAccount(false)
            }
          }}
        >
          {deletingAccount ? 'Deleting account…' : 'Delete account (wipe data)'}
        </button>
      </div>
    </div>
  )
}

