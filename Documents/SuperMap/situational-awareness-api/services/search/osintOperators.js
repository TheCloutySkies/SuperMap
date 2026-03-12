const BASE_TEMPLATES = {
  twitter: 'site:twitter.com',
  reddit: 'site:reddit.com',
  youtube: 'site:youtube.com',
  telegram: 'site:telegram.org',
  filetypePdf: 'filetype:pdf',
  filetypeXls: 'filetype:xls',
  intitleReport: 'intitle:\"report\"',
}

function buildOsintQuery(q, toggles = {}) {
  const bits = [String(q || '').trim()].filter(Boolean)

  Object.entries(BASE_TEMPLATES).forEach(([key, template]) => {
    if (toggles[key]) bits.push(template)
  })

  return bits.join(' ')
}

const OSINT_OPERATOR_DEFINITIONS = [
  { key: 'twitter', label: 'Twitter', template: BASE_TEMPLATES.twitter },
  { key: 'reddit', label: 'Reddit', template: BASE_TEMPLATES.reddit },
  { key: 'youtube', label: 'YouTube', template: BASE_TEMPLATES.youtube },
  { key: 'telegram', label: 'Telegram', template: BASE_TEMPLATES.telegram },
  { key: 'filetypePdf', label: 'PDF', template: BASE_TEMPLATES.filetypePdf },
  { key: 'filetypeXls', label: 'Excel', template: BASE_TEMPLATES.filetypeXls },
  { key: 'intitleReport', label: 'Title has \"report\"', template: BASE_TEMPLATES.intitleReport },
]

module.exports = {
  buildOsintQuery,
  OSINT_OPERATOR_DEFINITIONS,
}

