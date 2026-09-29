import { openDB } from 'idb'
import { todayISO, validateReceipt } from './utils'

export const CATEGORIES = [
  'food',
  'travel',
  'shopping',
  'bills',
  'entertainment',
  'education',
  'health',
  'other',
]

const DATABASE_NAME = 'rupee-wise'
const DATABASE_VERSION = 1
const STORE_NAME = 'app-data'
function accountRecordId(userId) {
  if (typeof userId !== 'string' || !userId) throw new Error('Sign in before accessing expense data.')
  return `account:${userId}`
}

export function emptyAppData() {
  return {
    version: 4,
    expenses: [],
    budgets: {},
    categoryBudgets: {},
    categories: [...CATEGORIES],
    groups: [],
    recurringExpenses: [],
    income: [],
    savingsGoals: [],
    statementImports: [],
    settings: { currency: 'INR', name: '' },
  }
}

async function getDatabase() {
  return openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    },
  })
}

export async function readAppData(userId) {
  const recordId = accountRecordId(userId)
  const database = await getDatabase()
  const record = await database.get(STORE_NAME, recordId)
  if (record?.data) return migrateAppData(record.data)

  const initialData = emptyAppData()
  await database.put(STORE_NAME, { id: recordId, data: initialData })
  return initialData
}

export function migrateAppData(value) {
  const recurringExpenses = (value.recurringExpenses ?? []).map((rule) => {
    if (!rule || typeof rule !== 'object') return rule
    const frequency = rule.frequency ?? 'monthly'
    const [year, month] = (rule.startMonth ?? '').split('-').map(Number)
    const legacyStartDate = year && month
      ? `${rule.startMonth}-${String(Math.min(rule.day, new Date(year, month, 0).getDate())).padStart(2, '0')}`
      : ''
    return {
      ...rule,
      scope: rule.scope ?? (rule.groupId ? 'group' : 'personal'),
      frequency,
      interval: rule.interval ?? (frequency === 'quarterly' ? 3 : frequency === 'semiannual' ? 6 : frequency === 'yearly' ? 12 : 1),
      intervalUnit: rule.intervalUnit ?? (frequency === 'weekly' ? 'week' : 'month'),
      startDate: rule.startDate ?? legacyStartDate,
      endDate: rule.endDate ?? '',
    }
  })
  return {
    ...emptyAppData(),
    ...value,
    version: 4,
    categoryBudgets: value.categoryBudgets ?? {},
    recurringExpenses,
    income: value.income ?? [],
    savingsGoals: value.savingsGoals ?? [],
    statementImports: value.statementImports ?? [],
    settings: { currency: 'INR', name: '', ...value.settings },
  }
}

function scheduleStartDate(rule) {
  if (rule.startDate) return rule.startDate
  const [year, month] = rule.startMonth.split('-').map(Number)
  const day = Math.min(rule.day, new Date(year, month, 0).getDate())
  return `${rule.startMonth}-${String(day).padStart(2, '0')}`
}

function recurringDateAt(rule, occurrence) {
  const [year, month, day] = scheduleStartDate(rule).split('-').map(Number)
  const frequency = rule.frequency ?? 'monthly'
  const interval = rule.interval ?? (frequency === 'quarterly' ? 3 : frequency === 'semiannual' ? 6 : frequency === 'yearly' ? 12 : 1)
  const unit = rule.intervalUnit ?? (frequency === 'weekly' ? 'week' : 'month')

  if (frequency === 'weekly' || (frequency === 'custom' && unit !== 'month')) {
    const days = interval * (unit === 'week' ? 7 : 1) * occurrence
    const date = new Date(year, month - 1, day + days, 12)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  const monthOffset = interval * occurrence
  const date = new Date(year, month - 1 + monthOffset, 1, 12)
  const dueDay = Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate())
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
}

export function getNextRecurringDate(rule, expenses, fromDate = todayISO()) {
  const existingDates = new Set(
    expenses.filter((expense) => expense.recurringId === rule.id).map((expense) => expense.date),
  )
  const endDate = rule.endDate || '9999-12-31'
  for (let occurrence = 0; occurrence < 100_000; occurrence += 1) {
    const date = recurringDateAt(rule, occurrence)
    if (date > endDate) return null
    if (date > fromDate && !rule.skippedDates?.includes(date) && !existingDates.has(date)) return date
  }
  return null
}

export function getRecurringDatesBetween(rule, startDate, endDate) {
  const dates = []
  for (let occurrence = 0; occurrence < 100_000; occurrence += 1) {
    const date = recurringDateAt(rule, occurrence)
    if (date > endDate || date > (rule.endDate || '9999-12-31')) break
    if (date >= startDate) dates.push(date)
  }
  return dates
}

export function applyRecurringExpenses(value, now = new Date()) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const expenses = [...value.expenses]
  const groups = value.groups.map((group) => ({ ...group, expenses: [...group.expenses] }))
  const existingOccurrences = new Set(
    [
      ...expenses,
      ...groups.flatMap((group) => group.expenses),
    ].filter((expense) => expense.recurringId).map((expense) => `${expense.recurringId}:${expense.date}`),
  )

  for (const recurring of value.recurringExpenses) {
    if (!recurring.active || scheduleStartDate(recurring) > today) continue
    const group = recurring.scope === 'group' ? groups.find((item) => item.id === recurring.groupId) : null
    if (recurring.scope === 'group' && !group) continue
    for (let occurrence = 0; occurrence < 100_000; occurrence += 1) {
      const date = recurringDateAt(recurring, occurrence)
      if (date > today || date > (recurring.endDate || '9999-12-31')) break
      if (!recurring.skippedDates?.includes(date) && !existingOccurrences.has(`${recurring.id}:${date}`)) {
        if (group) {
          group.expenses.push({
            id: `recurring-${recurring.id}-${date}`,
            title: recurring.note || recurring.category,
            amount: recurring.amount,
            category: recurring.category,
            date,
            paidById: recurring.paidById,
            participantIds: [...recurring.participantIds],
            splitType: recurring.splitType,
            ...(recurring.splitType === 'custom' ? { participantShares: { ...recurring.participantShares } } : {}),
            ...(recurring.createdByUserId ? { createdByUserId: recurring.createdByUserId } : {}),
            createdAt: new Date(`${date}T12:00:00`).toISOString(),
            recurringId: recurring.id,
          })
        } else {
          expenses.push({
            id: `recurring-${recurring.id}-${date}`,
            amount: recurring.amount,
            category: recurring.category,
            date,
            note: recurring.note,
            createdAt: new Date(`${date}T12:00:00`).toISOString(),
            recurringId: recurring.id,
          })
        }
        existingOccurrences.add(`${recurring.id}:${date}`)
      }
    }
  }

  const groupsChanged = groups.some((group, index) => group.expenses.length !== value.groups[index].expenses.length)
  return expenses.length === value.expenses.length && !groupsChanged ? value : { ...value, expenses, groups }
}

export async function writeAppData(data, userId) {
  const recordId = accountRecordId(userId)
  const database = await getDatabase()
  await database.put(STORE_NAME, { id: recordId, data })
}

export function validateBackup(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![1, 2, 3, 4].includes(value.version) ||
    !Array.isArray(value.expenses) ||
    !Array.isArray(value.groups) ||
    !Array.isArray(value.categories) ||
    !value.budgets ||
    typeof value.budgets !== 'object' ||
    Array.isArray(value.budgets) ||
    !value.settings ||
    typeof value.settings !== 'object'
  ) {
    throw new Error('This file is not a supported Spendly backup.')
  }

  const validDate = (date) => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
    const parsed = new Date(`${date}T00:00:00.000Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
  }

  for (const expense of value.expenses) {
    if (
      !expense ||
      typeof expense.id !== 'string' ||
      typeof expense.amount !== 'number' ||
      !Number.isFinite(expense.amount) ||
      expense.amount <= 0 ||
      !CATEGORIES.includes(expense.category) ||
      !validDate(expense.date) ||
      (expense.note != null && typeof expense.note !== 'string') ||
      !validateReceipt(expense.receipt) ||
      (expense.importedTransactionId != null && typeof expense.importedTransactionId !== 'string')
    ) {
      throw new Error('A backup expense is missing valid details.')
    }
  }

  for (const [month, amount] of Object.entries(value.budgets)) {
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      throw new Error('A backup contains an invalid monthly budget.')
    }
  }

  const categoryBudgets = value.categoryBudgets ?? {}
  if (!categoryBudgets || typeof categoryBudgets !== 'object' || Array.isArray(categoryBudgets)) {
    throw new Error('A backup contains invalid category budgets.')
  }
  for (const [month, limits] of Object.entries(categoryBudgets)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !limits || typeof limits !== 'object' || Array.isArray(limits)) {
      throw new Error('A backup contains an invalid category budget month.')
    }
    for (const [category, amount] of Object.entries(limits)) {
      if (!CATEGORIES.includes(category) || typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        throw new Error('A backup contains an invalid category budget.')
      }
    }
  }

  const recurringExpenses = value.recurringExpenses ?? []
  if (!Array.isArray(recurringExpenses)) throw new Error('A backup contains invalid recurring expenses.')
  if (recurringExpenses.some((rule) => !rule || typeof rule !== 'object' || Array.isArray(rule))) {
    throw new Error('A backup contains an invalid recurring expense.')
  }
  const normalizedRecurringExpenses = migrateAppData({ recurringExpenses }).recurringExpenses
  for (const recurring of normalizedRecurringExpenses) {
    const skippedDates = recurring?.skippedDates ?? []
    const validFrequency = ['weekly', 'monthly', 'quarterly', 'semiannual', 'yearly', 'custom'].includes(recurring?.frequency)
    const validIntervalUnit = ['day', 'week', 'month'].includes(recurring?.intervalUnit)
    const group = recurring?.scope === 'group' ? value.groups.find((item) => item.id === recurring.groupId) : null
    const groupShares = recurring?.participantShares
    const groupCustomSharesValid = recurring?.splitType !== 'custom' || (
      groupShares &&
      typeof groupShares === 'object' &&
      !Array.isArray(groupShares) &&
      Array.isArray(recurring.participantIds) &&
      Object.keys(groupShares).length === recurring.participantIds.length &&
      recurring.participantIds.every((id) =>
        Object.hasOwn(groupShares, id) &&
        typeof groupShares[id] === 'number' &&
        Number.isFinite(groupShares[id]) &&
        groupShares[id] >= 0,
      ) &&
      Object.values(groupShares).reduce((sum, share) => sum + Math.round(share * 100), 0) === Math.round(recurring.amount * 100)
    )
    const validGroupRule = recurring?.scope !== 'group' || (
      group &&
      Array.isArray(recurring.participantIds) &&
      recurring.participantIds.length > 0 &&
      recurring.participantIds.every((id) => group.members.some((member) => member.id === id)) &&
      group.members.some((member) => member.id === recurring.paidById) &&
      ['equal', 'custom'].includes(recurring.splitType) &&
      groupCustomSharesValid &&
      (recurring.splitType === 'equal' ? recurring.participantShares == null : true)
    )
    if (
      !recurring ||
      typeof recurring.id !== 'string' ||
      typeof recurring.amount !== 'number' ||
      !Number.isFinite(recurring.amount) ||
      recurring.amount <= 0 ||
      !CATEGORIES.includes(recurring.category) ||
      !['personal', 'group'].includes(recurring.scope) ||
      !validFrequency ||
      !validIntervalUnit ||
      (recurring.frequency === 'weekly' && recurring.intervalUnit !== 'week') ||
      (recurring.frequency === 'monthly' && recurring.intervalUnit !== 'month') ||
      (recurring.frequency === 'quarterly' && (recurring.intervalUnit !== 'month' || recurring.interval !== 3)) ||
      (recurring.frequency === 'semiannual' && (recurring.intervalUnit !== 'month' || recurring.interval !== 6)) ||
      (recurring.frequency === 'yearly' && (recurring.intervalUnit !== 'month' || recurring.interval !== 12)) ||
      typeof recurring.interval !== 'number' ||
      !Number.isInteger(recurring.interval) ||
      recurring.interval < 1 ||
      recurring.interval > 365 ||
      !validDate(recurring.startDate) ||
      (recurring.endDate !== '' && (!validDate(recurring.endDate) || recurring.endDate < recurring.startDate)) ||
      (recurring.pausedAt != null && recurring.pausedAt !== '' && !validDate(recurring.pausedAt)) ||
      typeof recurring.active !== 'boolean' ||
      (recurring.note != null && typeof recurring.note !== 'string') ||
      !validGroupRule ||
      !Array.isArray(skippedDates) ||
      skippedDates.some((date) => !validDate(date))
    ) {
      throw new Error('A backup recurring expense is missing valid details.')
    }
  }

  const income = value.income ?? []
  if (!Array.isArray(income)) throw new Error('A backup contains invalid income records.')
  for (const item of income) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      typeof item.amount !== 'number' ||
      !Number.isFinite(item.amount) ||
      item.amount <= 0 ||
      !validDate(item.date) ||
      (item.source != null && typeof item.source !== 'string') ||
      (item.note != null && typeof item.note !== 'string') ||
      (item.importedTransactionId != null && typeof item.importedTransactionId !== 'string')
    ) {
      throw new Error('A backup income record is missing valid details.')
    }
  }

  const savingsGoals = value.savingsGoals ?? []
  if (!Array.isArray(savingsGoals)) throw new Error('A backup contains invalid savings goals.')
  for (const goal of savingsGoals) {
    if (
      !goal ||
      typeof goal.id !== 'string' ||
      typeof goal.name !== 'string' ||
      typeof goal.target !== 'number' ||
      !Number.isFinite(goal.target) ||
      goal.target <= 0 ||
      typeof goal.saved !== 'number' ||
      !Number.isFinite(goal.saved) ||
      goal.saved < 0 ||
      (goal.deadline != null && goal.deadline !== '' && !validDate(goal.deadline))
    ) {
      throw new Error('A backup savings goal is missing valid details.')
    }
  }

  const statementImports = value.statementImports ?? []
  if (
    !Array.isArray(statementImports) ||
    statementImports.some((id) => typeof id !== 'string' || id.length > 200)
  ) {
    throw new Error('A backup contains invalid bank-import identifiers.')
  }

  for (const group of value.groups) {
    if (
      !group ||
      typeof group.id !== 'string' ||
      typeof group.name !== 'string' ||
      !Array.isArray(group.members) ||
      !Array.isArray(group.expenses)
    ) {
      throw new Error('A backup group is missing valid details.')
    }
    const memberIds = new Set()
    for (const member of group.members) {
      if (!member || typeof member.id !== 'string' || typeof member.name !== 'string') {
        throw new Error('A backup group contains an invalid member.')
      }
      memberIds.add(member.id)
    }
    for (const expense of group.expenses) {
      const splitType = expense?.splitType ?? 'equal'
      const participantIds = expense?.participantIds
      const participantShares = expense?.participantShares
      const customSharesValid = splitType !== 'custom' || (
        participantShares &&
        typeof participantShares === 'object' &&
        !Array.isArray(participantShares) &&
        Array.isArray(participantIds) &&
        Object.keys(participantShares).length === participantIds?.length &&
        participantIds.every((id) =>
          Object.hasOwn(participantShares, id) &&
          typeof participantShares[id] === 'number' &&
          Number.isFinite(participantShares[id]) &&
          participantShares[id] >= 0,
        ) &&
        Object.values(participantShares).reduce((sum, share) => sum + Math.round(share * 100), 0) === Math.round(expense.amount * 100)
      )
      if (
        !expense ||
        typeof expense.id !== 'string' ||
        typeof expense.title !== 'string' ||
        typeof expense.amount !== 'number' ||
        !Number.isFinite(expense.amount) ||
        expense.amount <= 0 ||
        !validDate(expense.date) ||
        !validateReceipt(expense.receipt) ||
        !memberIds.has(expense.paidById) ||
        !Array.isArray(expense.participantIds) ||
        expense.participantIds.length === 0 ||
        expense.participantIds.some((id) => !memberIds.has(id)) ||
        !['equal', 'custom'].includes(splitType) ||
        !customSharesValid ||
        (splitType === 'equal' && participantShares != null)
      ) {
        throw new Error('A backup shared expense is missing valid details.')
      }
    }
  }

  return {
    version: 4,
    expenses: value.expenses,
    budgets: value.budgets,
    categoryBudgets,
    categories: [...CATEGORIES],
    groups: value.groups,
    recurringExpenses: normalizedRecurringExpenses,
    income,
    savingsGoals,
    statementImports,
    settings: {
      currency: 'INR',
      name: typeof value.settings.name === 'string' ? value.settings.name : '',
    },
  }
}

// Old versions had one unassigned device record. Never assign it automatically.
export async function readLegacyAppData() {
  const database = await getDatabase()
  const record = await database.get(STORE_NAME, 'primary')
  return record?.data ? migrateAppData(record.data) : null
}
