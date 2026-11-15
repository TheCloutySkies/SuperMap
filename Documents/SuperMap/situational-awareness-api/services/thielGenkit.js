/**
 * ThielBot's Genkit front end.
 * Gemini answers first. Callers fall back to Groq when this returns null.
 */

const { genkit } = require('genkit')
const { googleAI } = require('@genkit-ai/google-genai')

const MODEL = process.env.GENKIT_MODEL || 'gemini-2.5-flash'

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

async function generateText(prompt, { maxTokens = 800 } = {}) {
  const run = getFlow()
  if (!run || !prompt) return null
  try {
    const text = await run({ prompt: String(prompt), maxTokens })
    return text || null
  } catch (_) {
    return null
  }
}

function hasGenkit() {
  return Boolean(apiKey())
}

module.exports = { generateText, hasGenkit }
