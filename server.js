const express = require('express')
const cron = require('node-cron')
const cors = require('cors')

const GOTIFY_URL = process.env.GOTIFY_URL ?? 'https://renaud-quawks.tailb0d68d.ts.net'
const GOTIFY_TOKEN = process.env.GOTIFY_TOKEN ?? 'ApxKtfigDwA0dWa'

const reminders = new Map() // id → { title, body, at }

const app = express()
app.use(cors({ origin: '*' }))
app.use(express.json())

async function sendGotify(title, body) {
  await fetch(`${GOTIFY_URL}/message?token=${GOTIFY_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, message: body, priority: 5 }),
  })
}

// Endpoints de compatibilité — le front React ne change pas
app.get('/vapid-public-key', (_req, res) => res.json({ key: 'gotify' }))
app.post('/subscribe', (_req, res) => res.json({ ok: true }))

app.post('/schedule', (req, res) => {
  const { id, title, body, at } = req.body
  if (!id || !title || !at) return res.status(400).json({ error: 'missing fields' })
  reminders.set(id, { title, body: body ?? '', at })
  res.json({ ok: true })
})

app.delete('/schedule/:id', (req, res) => {
  reminders.delete(req.params.id)
  res.json({ ok: true })
})

app.delete('/schedule-prefix/:prefix', (req, res) => {
  for (const id of reminders.keys()) {
    if (id.startsWith(req.params.prefix)) reminders.delete(id)
  }
  res.json({ ok: true })
})

cron.schedule('* * * * *', async () => {
  const now = Date.now()
  for (const [id, reminder] of reminders.entries()) {
    if (reminder.at > now) continue
    reminders.delete(id)
    try {
      await sendGotify(reminder.title, reminder.body)
    } catch (err) {
      console.error('Gotify push failed:', err.message)
    }
  }
})

const PORT = process.env.PORT ?? 3005
app.listen(PORT, () => console.log(`Push server (Gotify) running on port ${PORT}`))
