const express = require('express')
const webpush = require('web-push')
const cron = require('node-cron')
const cors = require('cors')

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const CONTACT = process.env.VAPID_CONTACT ?? 'mailto:headripper666@gmail.com'

webpush.setVapidDetails(CONTACT, PUBLIC_KEY, PRIVATE_KEY)

// userId → Map<endpoint, subscription>
const userSubscriptions = new Map()
// id → { userId, title, body, at }
const reminders = new Map()

const app = express()
app.use(cors({ origin: '*' }))
app.use(express.json())

app.get('/vapid-public-key', (req, res) => {
  res.json({ key: PUBLIC_KEY })
})

app.post('/subscribe', (req, res) => {
  const { userId, ...sub } = req.body
  if (!sub?.endpoint || !userId) return res.status(400).json({ error: 'invalid subscription' })

  if (!userSubscriptions.has(userId)) userSubscriptions.set(userId, new Map())
  userSubscriptions.get(userId).set(sub.endpoint, sub)

  res.json({ ok: true })
})

app.post('/schedule', (req, res) => {
  const { id, userId, title, body, at } = req.body
  if (!id || !userId || !title || !at) return res.status(400).json({ error: 'missing fields' })
  reminders.set(id, { userId, title, body: body ?? '', at })
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

    const subs = userSubscriptions.get(reminder.userId)
    if (!subs || subs.size === 0) continue

    for (const [endpoint, sub] of subs.entries()) {
      try {
        await webpush.sendNotification(
          sub,
          JSON.stringify({ title: reminder.title, body: reminder.body, tag: id })
        )
      } catch (err) {
        if (err.statusCode === 410) subs.delete(endpoint)
        else console.error('Push failed:', err.message)
      }
    }
  }
})

const PORT = process.env.PORT ?? 3005
app.listen(PORT, () => console.log(`Push server running on port ${PORT}`))
