/**
 * ThielBot's Genkit front end.
 * Gemini answers first. Callers fall back to Groq when this returns null.
 */

const { genkit } = require('genkit')
const { googleAI } = require('@genkit-ai/google-genai')

const MODEL = process.env.GENKIT_MODEL || 'gemini-3.1-flash-lite'
const MODEL_FALLBACKS = ['gemini-3.5-flash']

function apiKey() {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY || '').trim()
}

let flow = null

function getFlow() {
  const key = apiKey()
  if (!key) return null
  if (flow) return flow
  const ai = genkit({ plugins: [googleAI({ apiKey: key })] })
  flow = ai.defineFlow(
    { name: 'thielbot' },
    async (input) => {
      const response = await ai.generate({
        model: googleAI.model(input.model || MODEL),
        prompt: input.prompt,
        config: {
          temperature: 0.2,
          maxOutputTokens: input.maxTokens || 800,
        },
      })
      return typeof response?.text === 'string' ? response.text.trim() : ''
    },
  )
  return flow
}

function redact(error) {
  const key = apiKey()
  const text = String(error?.message || error || 'Gemini request failed')
  return (key ? text.split(key).join('[key]') : text).replace(/\s+/g, ' ').slice(0, 180)
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Gemini timed out')), ms)
    promise.then((value) => {
      clearTimeout(timer)
      resolve(value)
    }, (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function generateText(prompt, { maxTokens = 800, model, timeoutMs = 12000 } = {}) {
  const run = getFlow()
  if (!run || !prompt) return null
  const models = [...new Set([model || MODEL, ...MODEL_FALLBACKS])]
  for (const name of models) {
    try {
      const text = await withTimeout(run({
        prompt: String(prompt),
        maxTokens,
        model: name,
      }), timeoutMs)
      if (text) return text
    } catch (error) {
      console.warn('[genkit]', name, redact(error))
    }
  }
  return null
}

function parseJson(text) {
  if (!text) return null
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch (_) {
    return null
  }
}

/**
 * Ask Gemini, through the same Genkit flow, where a headline happened.
 * Returns null when no key is configured or the model does not answer.
 */
async function locatePin({ title, summary, url, kind } = {}) {
  const headline = String(title || '').trim()
  if (!headline) return null
  const prompt = [
    'You place one news post, X post, or photo on a map.',
    'The headline already names the place. Copy the most specific town, airfield, port, neighborhood, or country written in the headline or text. A country is a valid place when no town is named.',
    'Never answer that you cannot find a location. Never leave place empty when a place name is written in the headline.',
    'category must be one of: x, news, conflict, attack, planes, cars, drones, ships, explosion, outage.',
    'sidc must be a MIL-STD-2525C symbol code when one fits, otherwise an empty string. Examples: SFAPMF----- fixed wing, SFAPMFQ---- drone, SFAPMH----- helicopter, SFSPCL----- ship, SFGPUCI---- infantry, SHGPUCI---- hostile infantry, SFGPUCA---- armor, SFGPEVCA--- car, SFGPIUE---- electric power, EHIPBA---- bomb.',
    'Return only JSON: {"place":"","query":"","category":"news","sidc":"","reasoning":""}',
    'query is a short place name for a geocoder, such as "Aden, Yemen". reasoning is one sentence naming why that place is the event.',
    `kind: ${String(kind || 'news')}`,
    url ? `url: ${String(url).slice(0, 300)}` : '',
    `headline: ${headline.slice(0, 400)}`,
    summary ? `text: ${String(summary).slice(0, 1200)}` : '',
  ].filter(Boolean).join('\n')
  const text = await generateText(prompt, { maxTokens: 480, timeoutMs: 12000, model: MODEL })
  const parsed = parseJson(text)
  if (!parsed || typeof parsed !== 'object') return null
  return {
    place: String(parsed.place || '').slice(0, 180),
    query: String(parsed.query || parsed.place || '').slice(0, 180),
    category: String(parsed.category || '').toLowerCase(),
    sidc: String(parsed.sidc || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20),
    reasoning: String(parsed.reasoning || '').slice(0, 400),
  }
}

function hasGenkit() {
  return Boolean(apiKey())
}

module.exports = { generateText, locatePin, hasGenkit }
