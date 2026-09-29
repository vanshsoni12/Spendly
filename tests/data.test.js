import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import * as utils from '../src/utils.js'

// Test storage record selection with a deterministic database adapter.
async function loadDataModule({ failFirstOpen = false } = {}) {
  const stats = { opens: 0, writes: 0, options: null }
  const records = new Map()
  const database = {
    get: async (_store, id) => structuredClone(records.get(id)),
    put: async (_store, record) => { stats.writes += 1; records.set(record.id, structuredClone(record)) },
    close: () => {},
  }
  const module = new SourceTextModule(await readFile(new URL('../src/data.js', import.meta.url), 'utf8'))
  await module.link((specifier) => {
    const exports = specifier === 'idb' ? { openDB: async (_name, _version, options) => {
      stats.opens += 1
      stats.options = options
      if (failFirstOpen && stats.opens === 1) throw new Error('Database unavailable')
      return database
    } } : utils
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    })
  })
  await module.evaluate()
  return { data: module.namespace, records, stats }
}

test('accounts read and write separate records; legacy data is preserved and opt-in', async () => {
  const { data, records } = await loadDataModule()
  const legacy = data.emptyAppData()
  legacy.settings.name = 'Legacy owner'
  records.set('primary', { id: 'primary', data: legacy })
  const first = await data.readAppData('alice')
  assert.equal(first.settings.name, '')
  first.settings.name = 'Alice'
  await data.writeAppData(first, 'alice')
  assert.equal((await data.readAppData('bob')).settings.name, '')
  assert.equal((await data.readAppData('alice')).settings.name, 'Alice')
  assert.equal((await data.readLegacyAppData()).settings.name, 'Legacy owner')
  await assert.rejects(data.readAppData(), /Sign in/)
  await assert.rejects(data.writeAppData(first), /Sign in/)
})

test('legacy group recurring rules remain group expenses after migration', async () => {
  const { data } = await loadDataModule()
  const migrated = data.migrateAppData({ ...data.emptyAppData(),
    groups: [{ id: 'g', members: [], expenses: [] }],
    recurringExpenses: [{ id: 'r', groupId: 'g', active: true, startDate: '2026-09-01',
      frequency: 'monthly', amount: 100, category: 'food', participantIds: ['m'], paidById: 'm', splitType: 'equal' }],
  })
  const result = data.applyRecurringExpenses(migrated, new Date(2026, 8, 2))
  assert.equal(result.expenses.length, 0)
  assert.equal(result.groups[0].expenses.length, 1)
})

test('queued recurring creation preserves an expense saved immediately before it', async () => {
  const { createSaveQueue } = await import('../src/saveQueue.js')
  const { data } = await loadDataModule()
  let current = data.emptyAppData()
  const save = createSaveQueue({
    read: () => current,
    write: async () => { await new Promise((resolve) => setTimeout(resolve, 5)) },
    commit: (next) => { current = next },
    onError: (error) => { throw error },
  })
  const recurring = { id: 'rent', scope: 'personal', active: true, startDate: '2026-09-01',
    frequency: 'monthly', amount: 1000, category: 'bills', note: 'Rent' }
  const results = await Promise.all([
    save((latest) => ({ ...latest, expenses: [...latest.expenses, { id: 'coffee', amount: 100 }] })),
    save((latest) => data.addRecurringRule(latest, recurring, new Date(2026, 8, 2))),
  ])
  assert.deepEqual(results, [true, true])
  assert.equal(current.expenses.length, 2)
  assert.equal(current.expenses[0].id, 'coffee')
  assert.equal(current.expenses[1].recurringId, 'rent')
  assert.equal(current.recurringExpenses.length, 1)
})


test('loads reuse one connection and skip writes when recurring expenses are unchanged', async () => {
  const { data, records, stats } = await loadDataModule()
  records.set('account:alice', { id: 'account:alice', data: data.emptyAppData() })
  await Promise.all([data.loadAppData('alice'), data.loadAppData('alice')])
  assert.equal(stats.opens, 1)
  assert.equal(stats.writes, 0)
  stats.options.terminated()
  await data.loadAppData('alice')
  assert.equal(stats.opens, 2)
})

test('a failed connection can be retried', async () => {
  const { data, stats } = await loadDataModule({ failFirstOpen: true })
  await assert.rejects(data.loadAppData('alice'), /Database unavailable/)
  await data.loadAppData('alice')
  assert.equal(stats.opens, 2)
})

test('loading persists new recurring expenses only once', async () => {
  const { data, records, stats } = await loadDataModule()
  const stored = data.emptyAppData()
  stored.recurringExpenses.push({ id: 'rent', scope: 'personal', active: true,
    startDate: '2026-09-01', frequency: 'monthly', amount: 1000, category: 'bills' })
  records.set('account:alice', { id: 'account:alice', data: stored })
  await data.loadAppData('alice', new Date(2026, 8, 2))
  await data.loadAppData('alice', new Date(2026, 8, 2))
  assert.equal(stats.writes, 1)
  assert.equal(records.get('account:alice').data.expenses.length, 1)
})
