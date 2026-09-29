import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import * as utils from '../src/utils.js'

// Test storage record selection with a deterministic database adapter.
async function loadDataModule() {
  const records = new Map()
  const database = {
    get: async (_store, id) => structuredClone(records.get(id)),
    put: async (_store, record) => records.set(record.id, structuredClone(record)),
  }
  const module = new SourceTextModule(await readFile(new URL('../src/data.js', import.meta.url), 'utf8'))
  await module.link((specifier) => {
    const exports = specifier === 'idb' ? { openDB: async () => database } : utils
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    })
  })
  await module.evaluate()
  return { data: module.namespace, records }
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
