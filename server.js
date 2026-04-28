const express = require('express')
const webpush = require('web-push')
const cron = require('node-cron')
const cors = require('cors')

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const CONTACT = process.env.VAPID_CONTACT ?? 'mailto:headripper666@gmail.com'

webpush.setVapidDetails(CONTACT, PUBLIC_KEY, PRIVATE_KEY)

// Stockage en mémoire (suffisant pour usage familial)
const subscriptions = new Map() // endpoint → subscription object
const reminders = new Map()     // id → { endpoint, title, body, at }

const app = express()
app.use(cors({ origin: '*' }))
app.use(express.json())

app.get('/vapid-public-key', (req, res) => {
  res.json({ key: PUBLIC_KEY })
})

app.post('/subscribe', (req, res) => {
  const sub = req.body
  if (!sub?.endpoint) return res.status(400).json({ error: 'invalid subscription' })
  subscriptions.set(sub.endpoint, sub)
  res.json({ ok: true })
})

app.post('/schedule', (req, res) => {
  const { id, endpoint, title, body, at } = req.body
  if (!id || !endpoint || !title || !at) return res.status(400).json({ error: 'missing fields' })
  reminders.set(id, { endpoint, title, body: body ?? '', at })
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

    const sub = subscriptions.get(reminder.endpoint)
    reminders.delete(id)
    if (!sub) continue

    try {
      await webpush.sendNotification(
        sub,
        JSON.stringify({ title: reminder.title, body: reminder.body, tag: id })
      )
    } catch (err) {
      if (err.statusCode === 410) subscriptions.delete(reminder.endpoint)
      else console.error('Push failed:', err.message)
    }
  }
})

const PORT = process.env.PORT ?? 3005
app.listen(PORT, () => console.log(`Push server running on port ${PORT}`))
