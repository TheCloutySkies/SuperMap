const express = require('express')
const { locateHeadline } = require('../services/pinLocate')

const router = express.Router()

router.post('/locate', async (req, res) => {
  const title = String(req.body?.title || '').trim()
  if (!title) return res.status(400).json({ error: 'A headline is required.' })
  try {
    const located = await locateHeadline({
      title,
      summary: req.body?.summary || req.body?.description || '',
      url: req.body?.url || '',
      image: req.body?.image || '',
      kind: req.body?.kind || req.body?.mediaKind || '',
    })
    return res.json(located)
  } catch (error) {
    console.warn('[API /pins/locate]', error.message)
    return res.status(502).json({ error: 'The headline could not be placed.' })
  }
})

module.exports = router
