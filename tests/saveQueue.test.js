import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSaveQueue } from '../src/saveQueue.js'

test('failed saves leave visible data unchanged and subsequent saves can succeed', async () => {
  let data = { expenses: [] }
  let fail = true
  const errors = []
  const save = createSaveQueue({
    read: () => data,
    write: async () => { if (fail) throw new Error('Storage full') },
    commit: (next) => { data = next },
    onError: (error) => errors.push(error.message),
  })
  const add = (current) => ({ expenses: [...current.expenses, 'coffee'] })
  assert.equal(await save(add), false)
  assert.deepEqual(data.expenses, [])
  fail = false
  assert.equal(await save(add), true)
  assert.deepEqual(data.expenses, ['coffee'])
  assert.deepEqual(errors, ['Storage full'])
})

test('concurrent saves execute in order against the latest committed data', async () => {
  let data = []
  const writes = []
  const save = createSaveQueue({
    read: () => data,
    write: async (next) => { await new Promise((resolve) => setTimeout(resolve, 5)); writes.push(next) },
    commit: (next) => { data = next },
    onError: (error) => { throw error },
  })
  assert.deepEqual(await Promise.all([save((d) => [...d, 1]), save((d) => [...d, 2])]), [true, true])
  assert.deepEqual(data, [1, 2])
  assert.deepEqual(writes, [[1], [1, 2]])
})
