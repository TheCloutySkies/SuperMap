/**
 * Auto-tagging for OSINT posts (X, RSS, etc.).
 * Tags are stored with the event for search and filtering.
 */

const KEYWORDS = [
  ['drone', 'drone'],
  ['missile', 'missile'],
  ['explosion', 'explosion'],
  ['blast', 'explosion'],
  ['cyber', 'cyberattack'],
  ['hack', 'cyberattack'],
  ['satellite', 'satellite'],
  ['military', 'military'],
  ['earthquake', 'earthquake'],
  ['strike', 'strike'],
  ['attack', 'attack'],
  ['conflict', 'conflict'],
  ['invasion', 'conflict'],
  ['aircraft', 'aircraft'],
  ['crash', 'aircraft'],
  ['power outage', 'power'],
  ['blackout', 'power'],
  ['grid', 'infrastructure'],
]

function tagOsintPost(post) {
  const tags = new Set()
  const text = `${post.title || ''} ${post.content || ''}`.toLowerCase()
  for (const [keyword, tag] of KEYWORDS) {
    if (text.includes(keyword)) tags.add(tag)
  }
  return Array.from(tags)
}

module.exports = { tagOsintPost }
