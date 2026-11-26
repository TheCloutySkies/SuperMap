/**
 * ISW / Critical Threats daily assessments.
 *
 * Their own feeds answer 403 and 404, so this reads the same publications
 * through Google News' RSS search, which is keyless and stable.
 */
const { fetchWithEtag } = require('../snapshotHttp')

const QUERY = encodeURIComponent('"Institute for the Study of War" OR "Critical Threats" OR "Russian Offensive Campaign Assessment" OR "Iran Update"')
const ENDPOINT = `https://news.google.com/rss/search?q=${QUERY}&hl=en-US&gl=US&ceid=US:en`

function textOf(block) {
  return String(block || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function itemOf(entry) {
  const title = textOf(entry.querySelector('title')?.textContent || '')
  const link = textOf(entry.querySelector('link')?.textContent || '')
  const published = textOf(entry.querySelector('pubDate')?.textContent || '')
  const summary = textOf(entry.querySelector('description')?.textContent || '').slice(0, 400)
  const source = textOf(entry.querySelector('source')?.textContent || '')
  return {
    title,
    link,
    published,
    publishedMs: published ? Date.parse(published) : null,
    summary,
    source,
  }
}

async function fetchIswBriefs({ etag = null, lastModified = null } = {}) {
  const res = await fetchWithEtag(ENDPOINT, {
    timeoutMs: 25000,
    responseType: 'text',
    etag,
    lastModified,
    headers: { Accept: 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8' },
  })
  if (res.notModified) return res

  const xml = String(res.data || '')
  const blocks = xml.split(/<item[\s>]/i).slice(1)
  const items = []
  for (const block of blocks) {
    const item = itemOf({
      querySelector: (selector) => {
        const tag = selector.replace(/[<>]/g, '')
        const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block)
        return match ? { textContent: match[1].replace(/^<!\[CDATA\[|\]\]>$/g, '') } : null
      },
    })
    if (!item.title) continue
    // Only keep the assessments themselves, not every mention of the institute.
    if (!/isw|institute for the study of war|critical threats|offensive campaign|iran update/i.test(`${item.title} ${item.source}`)) continue
    items.push(item)
    if (items.length >= 12) break
  }

  return {
    ...res,
    data: { items, count: items.length, fetchedAt: new Date().toISOString(), source: 'news.google.com' },
  }
}

module.exports = { fetchIswBriefs }
