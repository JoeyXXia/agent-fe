import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { app } from './index'
import { initDB, run } from './db'

describe('GET /api/notes/stats', () => {
  beforeAll(async () => {
    await initDB()
  })

  it('withAI counts notes whose summary is non-empty (not mis-parsed as column "")', async () => {
    const username = `s${Date.now()}`.slice(0, 20)
    const password = 'secret12'

    const reg = await request(app).post('/api/auth/register').send({ username, password })
    expect(reg.status).toBe(201)
    const token = reg.body.token as string

    const empty = await request(app)
      .get('/api/notes/stats')
      .set('Authorization', `Bearer ${token}`)
    expect(empty.status).toBe(200)
    expect(empty.body.withAI).toBe(0)

    const created = await request(app)
      .post('/api/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'T', content: 'body' })
    expect(created.status).toBe(201)
    const noteId = created.body.id as number

    const stillEmptySummary = await request(app)
      .get('/api/notes/stats')
      .set('Authorization', `Bearer ${token}`)
    expect(stillEmptySummary.body.withAI).toBe(0)

    run('UPDATE notes SET summary = ? WHERE id = ?', ['hello', noteId])

    const withSummary = await request(app)
      .get('/api/notes/stats')
      .set('Authorization', `Bearer ${token}`)
    expect(withSummary.status).toBe(200)
    expect(withSummary.body.withAI).toBe(1)
  })
})
