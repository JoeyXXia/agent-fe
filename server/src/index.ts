import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import { initDB } from './db'
import { errorHandler } from './middleware'
import authRoutes from './routes/auth'
import noteRoutes from './routes/notes'
import agentRoutes from './routes/agent'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

app.use('/api/auth', authRoutes)
app.use('/api/notes', noteRoutes)
app.use('/api/agent', agentRoutes)

app.use(errorHandler)

async function main() {
  await initDB()
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`)
  })
}

main().catch(console.error)
