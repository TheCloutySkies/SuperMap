/**
 * Disappearing photos for direct messages.
 *
 * A photo is uploaded under `chat_media/{conversationId}/{messageId}` with both
 * members stamped into the object's metadata, because Storage rules have to check
 * membership without reading Firestore and there is no `split` in their language.
 * The object is deleted when the message expires (best effort) and by the
 * `firebase-sweeper` workflow, which is the guarantee.
 */
import { ref, uploadBytes, deleteObject, getDownloadURL } from 'firebase/storage'
import { getAccountsFirebase } from './firebaseClient'

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024

export function chatMediaPath(conversationId, messageId) {
  return `chat_media/${conversationId}/${messageId}`
}

export async function uploadChatMedia({ conversationId, messageId, file, memberUids }) {
  if (!conversationId || !messageId || !file) return { ok: false, error: 'Pick a photo first.' }
  if (!/^image\//i.test(String(file.type || ''))) return { ok: false, error: 'Photos only.' }
  if (file.size > MAX_MEDIA_BYTES) {
    return { ok: false, error: `Keep the photo under ${Math.round(MAX_MEDIA_BYTES / 1048576)} MB.` }
  }
  const firebase = getAccountsFirebase()
  if (!firebase?.storage) return { ok: false, error: 'Photos need the live account database.' }
  const [memberA, memberB] = [...(memberUids || [])].sort()
  const path = chatMediaPath(conversationId, messageId)
  const objectRef = ref(firebase.storage, path)
  try {
    await uploadBytes(objectRef, file, {
      contentType: file.type,
      customMetadata: { memberA: memberA || '', memberB: memberB || '', messageId },
    })
  } catch (error) {
    return { ok: false, error: error.message || 'Could not upload the photo' }
  }
  const url = await getDownloadURL(objectRef).catch(() => null)
  return { ok: true, media: { path, mime: file.type, size: file.size, ...(url ? { url } : {}) } }
}

export async function deleteChatMedia(path) {
  const firebase = getAccountsFirebase()
  if (!firebase?.storage || !path) return false
  await deleteObject(ref(firebase.storage, path)).catch(() => {})
  return true
}
