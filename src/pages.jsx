import { useMemo, useRef, useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Filter,
  HandCoins,
  History,
  Landmark,
  PiggyBank,
  Plus,
  Repeat,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  CategoryIcon,
  CategorySelect,
  EmptyState,
  PageHeading,
  ReceiptField,
  ReceiptThumbnail,
} from './components'
import { applyRecurringExpenses, CATEGORIES, getNextRecurringDate, getRecurringDatesBetween } from './data'
import { currentMonth, formatDate, formatMoney, formatMonth, todayISO } from './utils'
import { parseBankStatement } from './statements'

const expenseDateOrder = (a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')

function monthExpenses(expenses, month) {
  return expenses.filter((expense) => expense.date.slice(0, 7) === month)
}

function monthSpending(expenses, month) {
  return monthExpenses(expenses, month).reduce((sum, expense) => sum + expense.amount, 0)
}

function availableMonths(data, selectedMonth) {
  const months = new Set([
    selectedMonth,
    ...Object.keys(data.budgets),
    ...Object.keys(data.categoryBudgets ?? {}),
    ...(data.recurringExpenses ?? []).map((rule) => rule.startMonth),
  ])
  data.expenses.forEach((expense) => months.add(expense.date.slice(0, 7)))
  data.income?.forEach((item) => months.add(item.date.slice(0, 7)))
  return [...months].sort((a, b) => b.localeCompare(a))
}

function MonthControl({ month, onChange, months }) {
  const moveMonth = (offset) => {
    const [year, monthNumber] = month.split('-').map(Number)
    const date = new Date(year, monthNumber - 1 + offset, 1)
    onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="month-control">
      <button className="icon-button" type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}>
        <ChevronLeft size={18} />
      </button>
      <label className="month-picker">
        <CalendarDays size={17} aria-hidden="true" />
        <span className="visually-hidden">Choose month</span>
        <select value={month} onChange={(event) => onChange(event.target.value)}>
          {!months.includes(month) && <option value={month}>{formatMonth(month)}</option>}
          {months.map((availableMonth) => (
            <option value={availableMonth} key={availableMonth}>{formatMonth(availableMonth)}</option>
          ))}
        </select>
      </label>
      <button
        className="icon-button"
        type="button"
        aria-label="Next month"
        onClick={() => moveMonth(1)}
        disabled={month >= `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}

function ExpenseRow({ expense, onEdit, onDelete }) {
  return (
    <li className="expense-row">
      <CategoryIcon category={expense.category} />
      <div className="expense-description">
        <span className="expense-name">{expense.note?.trim() || expense.category[0].toUpperCase() + expense.category.slice(1)}</span>
        <span className="expense-meta">{expense.category[0].toUpperCase() + expense.category.slice(1)} <span aria-hidden="true">·</span> {formatDate(expense.date, { short: true })}</span>
      </div>
      <ReceiptThumbnail receipt={expense.receipt} />
      <span className="expense-amount">{formatMoney(expense.amount, { decimals: true })}</span>
      {(onEdit || onDelete) && (
        <div className="expense-actions">
          {onEdit && <button className="icon-button small" type="button" onClick={() => onEdit(expense)} aria-label={`Edit ${expense.note || expense.category} expense`}><span aria-hidden="true">✎</span></button>}
          {onDelete && <button className="icon-button small delete-button" type="button" onClick={() => onDelete(expense)} aria-label={`Delete ${expense.note || expense.category} expense`}><X size={15} /></button>}
        </div>
      )}
    </li>
  )
}

function ExpenseList({ expenses, onEdit, onDelete, emptyTitle = 'Nothing here yet' }) {
  if (!expenses.length) {
    return (
      <EmptyState icon={Wallet} title={emptyTitle}>
        Your expenses will show up here as you add them.
      </EmptyState>
    )
  }
  return (
    <ul className="expense-list">
      {expenses.map((expense) => (
        <ExpenseRow key={expense.id} expense={expense} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </ul>
  )
}

function BudgetStatus({ budget, spent, hasBudget = budget > 0, compact = false }) {
  const difference = budget - spent
  const overBudget = hasBudget && difference < 0
  const percentage = hasBudget && budget > 0 ? (spent / budget) * 100 : 0
  const displayedPercentage = budget === 0 && overBudget ? 100 : percentage
  const usedWidth = Math.min(Math.max(displayedPercentage, 0), 100)

  return (
    <div className={`budget-status ${overBudget ? 'is-over' : ''} ${compact ? 'is-compact' : ''}`}>
      <div className="budget-primary">
        <div>
          <p className="stat-caption">{!hasBudget ? 'Monthly budget' : overBudget ? 'Over budget' : 'Safe to spend'}</p>
          <p className="budget-amount">{!hasBudget ? '—' : formatMoney(difference, { decimals: true })}</p>
          <p className="budget-message">
            {!hasBudget
              ? 'Set a budget to see your safe-to-spend amount'
              : overBudget
              ? `${formatMoney(Math.abs(difference))} over budget this month`
              : 'You’re right on track'}
          </p>
        </div>
        <div className="budget-ring" aria-label={budget > 0 ? `${Math.round(percentage)}% of monthly budget used` : 'No positive monthly budget'}>
          <svg viewBox="0 0 64 64" role="img" aria-hidden="true">
            <circle className="ring-track" cx="32" cy="32" r="26" />
            <circle className="ring-value" cx="32" cy="32" r="26" style={{ strokeDasharray: `${Math.min(percentage, 100) * 1.634} 163.4` }} />
          </svg>
          <span>{budget > 0 ? Math.round(percentage) : '—'}{budget > 0 && <small>%</small>}</span>
        </div>
      </div>
      <div className="budget-progress" role="progressbar" aria-label="Monthly budget spent" aria-valuenow={Math.min(Math.round(displayedPercentage), 100)} aria-valuemin="0" aria-valuemax="100">
        <span style={{ width: `${usedWidth}%` }} />
      </div>
      <div className="budget-foot">
        <span>{formatMoney(spent)} spent</span>
        <span>{formatMoney(budget)} budget</span>
      </div>
    </div>
  )
}

export function HomePage({ data, setExpenseDialog, onAddExpense, onDeleteExpense }) {
  const month = currentMonth()
  const thisMonth = monthExpenses(data.expenses, month)
  const spent = thisMonth.reduce((sum, expense) => sum + expense.amount, 0)
  const budget = data.budgets[month] ?? 0
  const hasBudget = Object.hasOwn(data.budgets, month)
  const monthlyIncome = data.income.filter((item) => item.date.slice(0, 7) === month).reduce((sum, item) => sum + item.amount, 0)
  const now = new Date()
  const daysRemaining = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1
  const dailySafeToSpend = hasBudget ? Math.max(0, budget - spent) / daysRemaining : null
  const recentExpenses = [...data.expenses].sort(expenseDateOrder).slice(0, 5)
  const categoryTotals = CATEGORIES
    .map((category) => ({
      category,
      total: thisMonth.filter((expense) => expense.category === category).reduce((sum, expense) => sum + expense.amount, 0),
    }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 4)
  const largestCategory = categoryTotals[0]?.total ?? 0
  const firstName = data.settings.name.trim().split(/\s+/)[0]

  return (
    <>
      <PageHeading
        eyebrow={new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
        title={firstName ? `A little more clarity, ${firstName}.` : 'A little more clarity.'}
        description="Your money, thoughtfully in view."
        action={<button className="button button-primary" onClick={onAddExpense} type="button"><Plus size={18} /> Add expense</button>}
      />

      <section className="dashboard-grid" aria-label="Monthly spending overview">
        <article className={`hero-card ${hasBudget && spent > budget ? 'hero-over' : ''}`}>
          <div className="hero-card-top">
            <span className="hero-month"><CalendarDays size={15} /> {formatMonth(month)}</span>
            <span className="hero-orb" aria-hidden="true"><Sparkles size={18} /></span>
          </div>
          <BudgetStatus budget={budget} spent={spent} hasBudget={hasBudget} />
          <div className="hero-separator" />
          <div className="hero-totals">
            <div><span>Monthly budget</span><strong>{formatMoney(budget)}</strong></div>
            <div><span>Total spent</span><strong>{formatMoney(spent)}</strong></div>
          </div>
          <div className="hero-decoration hero-decoration-one" aria-hidden="true" />
          <div className="hero-decoration hero-decoration-two" aria-hidden="true" />
        </article>

        <article className="card category-card">
          <div className="card-heading">
            <div><p className="eyebrow">Where it goes</p><h2>Spending by category</h2></div>
            <span className="soft-icon"><Filter size={17} /></span>
          </div>
          {categoryTotals.length ? (
            <ul className="category-breakdown">
              {categoryTotals.map(({ category, total }) => (
                <li className="category-breakdown-row" key={category}>
                  <CategoryIcon category={category} size={18} />
                  <span className="category-breakdown-name">{category[0].toUpperCase() + category.slice(1)}</span>
                  <div className="category-track"><span style={{ width: `${Math.max((total / largestCategory) * 100, 4)}%` }} /></div>
                  <strong>{formatMoney(total)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Sparkles} title="A fresh start">Add an expense to see your spending patterns.</EmptyState>
          )}
        </article>
      </section>

      <section className="quick-insight-grid" aria-label="Daily spending and cash flow">
        <article className="card quick-insight-card daily-insight">
          <span className="insight-icon"><CalendarDays size={18} /></span>
          <div><p className="eyebrow">A gentle daily guide</p><h2>{dailySafeToSpend === null ? 'Set a budget to begin' : `${formatMoney(dailySafeToSpend)} / day`}</h2><p>Safe to spend each day for the rest of {formatMonth(month)}.</p></div>
        </article>
        <article className="card quick-insight-card cashflow-insight">
          <span className="insight-icon"><TrendingUp size={18} /></span>
          <div><p className="eyebrow">Monthly cash flow</p><h2 className={monthlyIncome - spent < 0 ? 'cashflow-negative' : ''}>{formatMoney(monthlyIncome - spent)}</h2><p>{formatMoney(monthlyIncome)} income <span aria-hidden="true">·</span> {formatMoney(spent)} spending</p></div>
          <Link className="text-link" to="/analytics">See analytics <ArrowRight size={14} /></Link>
        </article>
      </section>

      <section className="card recent-card">
        <div className="card-heading">
          <div><p className="eyebrow">The latest</p><h2>Recent expenses</h2></div>
          <Link className="text-link" to="/history">See all <ArrowRight size={15} /></Link>
        </div>
        <ExpenseList expenses={recentExpenses} onEdit={setExpenseDialog} onDelete={onDeleteExpense} emptyTitle="Your story starts here" />
      </section>

      <section className="note-strip">
        <span className="soft-icon"><ShieldCheck size={19} /></span>
        <p><strong>Just for your eyes.</strong> All your financial data stays safely on this device.</p>
      </section>
      <div className="mobile-quick-add"><button type="button" className="button button-primary" onClick={onAddExpense}><Plus size={19} /> Add expense</button></div>
      <span className="visually-hidden">A total of {thisMonth.length} expenses this month.</span>
    </>
  )
}

export function HistoryPage({ data, setExpenseDialog, onDeleteExpense }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const filteredExpenses = useMemo(() => [...data.expenses]
    .sort(expenseDateOrder)
    .filter((expense) => category === 'all' || expense.category === category)
    .filter((expense) => `${expense.note ?? ''} ${expense.category} ${expense.date}`.toLowerCase().includes(query.trim().toLowerCase())), [data.expenses, category, query])
  const total = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const categoryId = 'history-category'

  return (
    <>
      <PageHeading eyebrow="Your money, remembered" title="Expense history" description="Every little thing, in one tidy place." />
      <section className="card history-card">
        <div className="history-toolbar">
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <span className="visually-hidden">Search expenses</span>
            <input type="search" placeholder="Search expenses…" value={query} onChange={(event) => setQuery(event.target.value)} />
            {query && <button className="clear-search" type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}
          </label>
          <label className="filter-field" htmlFor={categoryId}>
            <Filter size={16} aria-hidden="true" />
            <span className="visually-hidden">Filter by category</span>
            <select id={categoryId} value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">All categories</option>
              {CATEGORIES.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}
            </select>
          </label>
        </div>
        <div className="history-summary">
          <span>{filteredExpenses.length} {filteredExpenses.length === 1 ? 'expense' : 'expenses'}</span>
          <span>Total <strong>{formatMoney(total)}</strong></span>
        </div>
        {filteredExpenses.length ? (
          <ExpenseList expenses={filteredExpenses} onEdit={setExpenseDialog} onDelete={onDeleteExpense} />
        ) : (
          <EmptyState icon={History} title={data.expenses.length ? 'No matching expenses' : 'Nothing to see just yet'}>
            {data.expenses.length ? 'Try a different search or category.' : 'Once you add a little something, it’ll be right here.'}
          </EmptyState>
        )}
      </section>
    </>
  )
}

export function BudgetPage({ data, saveData }) {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [draft, setDraft] = useState('')
  const months = availableMonths(data, selectedMonth)
  const budget = data.budgets[selectedMonth] ?? 0
  const spent = monthSpending(data.expenses, selectedMonth)
  const percentage = budget > 0 ? (spent / budget) * 100 : 0
  const hasBudget = Object.hasOwn(data.budgets, selectedMonth)
  const overBudget = hasBudget && spent > budget
  const budgetMonths = Object.entries(data.budgets)
    .filter(([monthKey]) => monthKey <= currentMonth())
    .sort(([a], [b]) => b.localeCompare(a))
  const withinCount = budgetMonths.filter(([monthKey, amount]) => monthSpending(data.expenses, monthKey) <= amount).length
  const overCount = budgetMonths.length - withinCount

  const handleBudgetSave = (event) => {
    event.preventDefault()
    const amount = Number(draft)
    if (!Number.isFinite(amount) || amount < 0) return
    saveData((current) => ({ ...current, budgets: { ...current.budgets, [selectedMonth]: amount } }))
    setDraft('')
  }

  const changeMonth = (month) => {
    setSelectedMonth(month)
    setDraft('')
  }

  return (
    <>
      <PageHeading eyebrow="A plan that moves with you" title="Monthly budget" description="A little intention goes a long way." action={<MonthControl month={selectedMonth} onChange={changeMonth} months={months} />} />
      <section className={`budget-overview card ${overBudget ? 'budget-overview-over' : ''}`}>
        <div className="budget-overview-heading">
          <div><p className="eyebrow">{formatMonth(selectedMonth)}</p><h2>{overBudget ? 'A gentle heads-up' : 'Your monthly snapshot'}</h2></div>
          <span className={`budget-status-icon ${overBudget ? 'warning' : ''}`}>{overBudget ? <ArrowUpRight size={19} /> : <Wallet size={19} />}</span>
        </div>
        <BudgetStatus budget={budget} spent={spent} hasBudget={hasBudget} compact />
        {overBudget && <p className="over-budget-callout" role="status"><ArrowUpRight size={16} /> You’re {formatMoney(spent - budget)} over your {formatMonth(selectedMonth)} budget.</p>}
        <div className="budget-detail-grid">
          <div className="budget-detail"><span>Monthly budget</span><strong>{formatMoney(budget)}</strong></div>
          <div className="budget-detail"><span>Total spent</span><strong>{formatMoney(spent)}</strong></div>
          <div className={`budget-detail ${overBudget ? 'detail-over' : ''}`}><span>{overBudget ? 'Amount over' : 'Still available'}</span><strong>{formatMoney(Math.abs(budget - spent))}</strong></div>
        </div>
        {budget > 0
          ? <p className="budget-percentage">{percentage.toFixed(percentage % 1 ? 1 : 0)}% of your budget used</p>
          : hasBudget
            ? <p className="budget-percentage">Percentage unavailable because the budget is ₹0.</p>
            : null}
      </section>

      <section className="budget-lower-grid">
        <article className="card set-budget-card">
          <div className="card-heading"><div><p className="eyebrow">Make a little plan</p><h2>Set your budget</h2></div><span className="soft-icon"><Landmark size={18} /></span></div>
          <p className="supporting-copy">Choose a budget for {formatMonth(selectedMonth)}. Each month has its own independent plan.</p>
          <form className="budget-form" onSubmit={handleBudgetSave}>
            <label className="field">
              <span>Monthly budget amount</span>
              <span className="amount-input-wrap"><span aria-hidden="true">₹</span><input type="number" inputMode="decimal" min="0" step="0.01" placeholder="e.g. 25,000" value={draft} onChange={(event) => setDraft(event.target.value)} required aria-label="Monthly budget in rupees" /></span>
            </label>
            <button className="button button-primary" type="submit">{budget > 0 ? 'Update budget' : 'Set monthly budget'}</button>
          </form>
        </article>
        <article className="card budget-summary-card">
          <div className="card-heading"><div><p className="eyebrow">Your bigger picture</p><h2>Budget check-ins</h2></div><span className="soft-icon"><Sparkles size={18} /></span></div>
          <div className="budget-counts">
            <div className="budget-count within"><span className="count-icon"><Check size={16} /></span><strong>{withinCount}</strong><span>{withinCount === 1 ? 'month' : 'months'} within budget</span></div>
            <div className="budget-count over"><span className="count-icon"><ArrowUpRight size={16} /></span><strong>{overCount}</strong><span>{overCount === 1 ? 'month' : 'months'} over budget</span></div>
          </div>
          <p className="budget-count-note">Each month counts once a budget has been set. Small steps still count.</p>
        </article>
      </section>

      <section className="card monthly-history-card">
        <div className="card-heading"><div><p className="eyebrow">One month at a time</p><h2>Monthly budget history</h2></div><span className="soft-icon"><History size={18} /></span></div>
        {budgetMonths.length ? (
          <div className="month-history-list">
            {budgetMonths.map(([monthKey, amount]) => {
              const monthTotal = monthSpending(data.expenses, monthKey)
              const isOver = monthTotal > amount
              const percent = amount > 0 ? (monthTotal / amount) * 100 : null
              return (
                <button className={`month-history-row ${isOver ? 'month-history-over' : ''} ${monthKey === selectedMonth ? 'month-history-selected' : ''}`} key={monthKey} type="button" onClick={() => changeMonth(monthKey)}>
                  <span className="month-history-name">{formatMonth(monthKey)}</span>
                  <span className="month-history-bar"><span style={{ width: `${percent === null ? (isOver ? 100 : 0) : Math.min(percent, 100)}%` }} /></span>
                  <span className="month-history-percent">{percent === null ? 'N/A' : `${percent.toFixed(percent % 1 ? 1 : 0)}%`}</span>
                  <span className="month-history-remaining">{isOver ? <><ArrowUpRight size={14} /> {formatMoney(monthTotal - amount)} over</> : <><ArrowDownRight size={14} /> {formatMoney(amount - monthTotal)} left</>}</span>
                  <ChevronRight className="month-history-arrow" size={16} />
                </button>
              )
            })}
          </div>
        ) : (
          <EmptyState icon={CalendarDays} title="Your monthly story starts here">
            Set a budget for this month and you’ll see how every month adds up.
          </EmptyState>
        )}
      </section>
      <CategoryBudgetSection key={selectedMonth} data={data} saveData={saveData} month={selectedMonth} />
    </>
  )
}

function CategoryBudgetSection({ data, saveData, month }) {
  const [drafts, setDrafts] = useState({})
  const limits = data.categoryBudgets[month] ?? {}
  const expenses = monthExpenses(data.expenses, month)
  const submit = (event) => {
    event.preventDefault()
    const nextLimits = { ...limits }
    for (const category of CATEGORIES) {
      if (!(category in drafts)) continue
      const amount = Number(drafts[category])
      if (Number.isFinite(amount) && amount >= 0) {
        if (amount === 0) delete nextLimits[category]
        else nextLimits[category] = amount
      }
    }
    saveData((current) => ({ ...current, categoryBudgets: { ...current.categoryBudgets, [month]: nextLimits } }))
    setDrafts({})
  }

  return (
    <section className="card category-budget-card">
      <div className="card-heading"><div><p className="eyebrow">Little guardrails</p><h2>Category budgets</h2></div><span className="soft-icon"><Filter size={18} /></span></div>
      <p className="supporting-copy">Set an optional cap for each category in {formatMonth(month)}. These limits are separate from your overall monthly budget.</p>
      <form onSubmit={submit}>
        <div className="category-budget-list">
          {CATEGORIES.map((category) => {
            const spent = expenses.filter((expense) => expense.category === category).reduce((sum, expense) => sum + expense.amount, 0)
            const limit = limits[category] ?? 0
            const percent = limit > 0 ? (spent / limit) * 100 : 0
            const over = limit > 0 && spent > limit
            return (
              <div className={`category-budget-row ${over ? 'category-budget-over' : ''}`} key={category}>
                <CategoryIcon category={category} size={17} />
                <span className="category-budget-name">{category[0].toUpperCase() + category.slice(1)}</span>
                <div className="category-budget-progress" role="progressbar" aria-label={`${category} budget used`} aria-valuenow={Math.min(100, Math.round(percent))} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${limit > 0 ? Math.min(percent, 100) : 0}%` }} /></div>
                <span className="category-budget-spent">{formatMoney(spent)}{limit > 0 && <small> / {formatMoney(limit)}</small>}</span>
                <label className="visually-hidden" htmlFor={`category-budget-${category}`}>{category} monthly budget</label>
                <span className="category-limit-input"><span>₹</span><input id={`category-budget-${category}`} type="number" inputMode="decimal" min="0" step="0.01" placeholder="No limit" value={drafts[category] ?? (limit ? String(limit) : '')} onChange={(event) => setDrafts((current) => ({ ...current, [category]: event.target.value }))} /></span>
              </div>
            )
          })}
        </div>
        <div className="category-budget-footer"><span>Progress updates as expenses are added or edited.</span><button className="button button-secondary" type="submit">Save category limits</button></div>
      </form>
    </section>
  )
}

function calculateGroupBalances(group) {
  const balances = new Map(group.members.map((member) => [member.id, 0]))
  for (const expense of group.expenses) {
    const participants = [...new Set(expense.participantIds)].filter((id) => balances.has(id))
    if (!participants.length || !balances.has(expense.paidById)) continue
    balances.set(expense.paidById, balances.get(expense.paidById) + expense.amount)
    for (const id of participants) {
      const share = expense.splitType === 'custom'
        ? expense.participantShares?.[id] ?? 0
        : expense.amount / participants.length
      balances.set(id, balances.get(id) - share)
    }
  }
  return balances
}

function settleUpSuggestions(group) {
  const balances = calculateGroupBalances(group)
  const debtors = [...balances.entries()].filter(([, amount]) => amount < -0.005).map(([id, amount]) => ({ id, amount: -amount }))
  const creditors = [...balances.entries()].filter(([, amount]) => amount > 0.005).map(([id, amount]) => ({ id, amount }))
  const suggestions = []
  let debtorIndex = 0
  let creditorIndex = 0
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const amount = Math.min(debtors[debtorIndex].amount, creditors[creditorIndex].amount)
    suggestions.push({ from: debtors[debtorIndex].id, to: creditors[creditorIndex].id, amount })
    debtors[debtorIndex].amount -= amount
    creditors[creditorIndex].amount -= amount
    if (debtors[debtorIndex].amount < 0.005) debtorIndex += 1
    if (creditors[creditorIndex].amount < 0.005) creditorIndex += 1
  }
  return suggestions
}

function GroupCard({ group, saveData, onAddExpense }) {
  const [memberName, setMemberName] = useState('')
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [expenseTitle, setExpenseTitle] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(todayISO)
  const [splitType, setSplitType] = useState('equal')
  const [participantShares, setParticipantShares] = useState({})
  const [receipt, setReceipt] = useState(null)
  const [receiptError, setReceiptError] = useState('')
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [paidById, setPaidById] = useState(group.members[0]?.id ?? '')
  const [participantIds, setParticipantIds] = useState(group.members.map((member) => member.id))
  const balances = calculateGroupBalances(group)
  const suggestions = settleUpSuggestions(group)

  const updateGroup = (mutate) => saveData((current) => ({
    ...current,
    groups: current.groups.map((item) => item.id === group.id ? mutate(item) : item),
  }))

  const addMember = (event) => {
    event.preventDefault()
    const name = memberName.trim()
    if (!name) return
    const member = { id: crypto.randomUUID(), name }
    updateGroup((item) => ({ ...item, members: [...item.members, member] }))
    setMemberName('')
  }

  const saveSharedExpense = async (event) => {
    event.preventDefault()
    const amount = Number(expenseAmount)
    const participants = participantIds.filter((id) => group.members.some((member) => member.id === id))
    if (!expenseTitle.trim() || !Number.isFinite(amount) || amount <= 0 || !expenseDate || !participants.length || !group.members.some((member) => member.id === paidById)) {
      setFormError('Add a title, a valid amount and date, a payer, and at least one participant.')
      return
    }
    let shares
    if (splitType === 'custom') {
      shares = Object.fromEntries(participants.map((id) => [id, Number(participantShares[id])]))
      const validShares = Object.values(shares).every((share) => Number.isFinite(share) && share >= 0)
      const totalCents = Math.round(amount * 100)
      const sharesCents = Object.values(shares).reduce((sum, share) => sum + Math.round(share * 100), 0)
      if (!validShares || sharesCents !== totalCents) {
        setFormError('Custom shares must be valid amounts that add up to the full expense.')
        return
      }
    }
    const expense = {
      id: editingExpense?.id ?? crypto.randomUUID(),
      title: expenseTitle.trim(),
      amount,
      date: expenseDate,
      paidById,
      participantIds: participants,
      splitType,
      ...(splitType === 'custom' ? { participantShares: shares } : {}),
      ...(receipt ? { receipt } : {}),
    }
    const saved = await updateGroup((item) => ({
      ...item,
      expenses: editingExpense
        ? item.expenses.map((entry) => entry.id === editingExpense.id ? expense : entry)
        : [...item.expenses, expense],
    }))
    if (!saved) {
      setFormError('Could not save this shared expense to this device.')
      return
    }
    setExpenseTitle('')
    setExpenseAmount('')
    setExpenseDate(todayISO())
    setSplitType('equal')
    setParticipantShares({})
    setReceipt(null)
    setReceiptError('')
    setFormError('')
    setEditingExpense(null)
    setShowExpenseForm(false)
  }

  const beginEditingExpense = (expense) => {
    setEditingExpense(expense)
    setExpenseTitle(expense.title)
    setExpenseAmount(String(expense.amount))
    setExpenseDate(expense.date)
    setPaidById(expense.paidById)
    setParticipantIds([...expense.participantIds])
    setSplitType(expense.splitType ?? 'equal')
    setParticipantShares(Object.fromEntries(expense.participantIds.map((id) => [
      id,
      String(expense.participantShares?.[id] ?? expense.amount / expense.participantIds.length),
    ])))
    setReceipt(expense.receipt ?? null)
    setFormError('')
    setShowExpenseForm(true)
  }

  const deleteSharedExpense = async (expense) => {
    if (!window.confirm(`Delete “${expense.title}” for ${formatMoney(expense.amount)}?`)) return
    const saved = await updateGroup((item) => ({ ...item, expenses: item.expenses.filter((entry) => entry.id !== expense.id) }))
    setActionError(saved ? '' : 'Could not delete this shared expense from this device.')
  }

  const toggleParticipant = (id) => {
    setParticipantIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
    setParticipantShares((current) => ({ ...current, [id]: current[id] ?? '' }))
  }

  return (
    <article className="card group-card">
      <div className="group-card-heading">
        <span className="group-avatar"><Users size={19} /></span>
        <div><h2>{group.name}</h2><p>{group.members.length} {group.members.length === 1 ? 'member' : 'members'} <span aria-hidden="true">·</span> {group.expenses.length} shared {group.expenses.length === 1 ? 'expense' : 'expenses'}</p></div>
      </div>
      <div className="group-members">
        {group.members.map((member) => {
          const balance = balances.get(member.id) ?? 0
          return (
            <div className="group-member-row" key={member.id}>
              <span className="member-initial">{member.name.trim().charAt(0).toUpperCase()}</span>
              <span className="member-name">{member.name}</span>
              <span className={`member-balance ${balance > 0.005 ? 'balance-credit' : balance < -0.005 ? 'balance-debt' : ''}`}>
                {balance > 0.005 ? `gets ${formatMoney(balance)}` : balance < -0.005 ? `owes ${formatMoney(Math.abs(balance))}` : 'all settled'}
              </span>
            </div>
          )
        })}
        {!group.members.length && <p className="supporting-copy">Add your first person to start sharing.</p>}
      </div>

      <form className="add-member-form" onSubmit={addMember}>
        <label className="visually-hidden" htmlFor={`member-${group.id}`}>New member name</label>
        <input id={`member-${group.id}`} type="text" placeholder="Add someone to the group…" value={memberName} onChange={(event) => setMemberName(event.target.value)} maxLength={50} required />
        <button className="button button-secondary button-small" type="submit"><Plus size={15} /> Add member</button>
      </form>

      {suggestions.length > 0 && (
        <div className="settle-suggestions">
          <p className="mini-heading"><HandCoins size={15} /> Simple settle up</p>
          {suggestions.map((suggestion, index) => (
            <p className="settle-row" key={`${suggestion.from}-${suggestion.to}-${index}`}>
              <strong>{group.members.find((member) => member.id === suggestion.from)?.name}</strong>
              <ArrowRight size={14} aria-label="pays" />
              <strong>{group.members.find((member) => member.id === suggestion.to)?.name}</strong>
              <span>{formatMoney(suggestion.amount)}</span>
            </p>
          ))}
        </div>
      )}

      <div className="group-expense-actions">
        <button type="button" className="text-link" onClick={() => {
          if (showExpenseForm) {
            setShowExpenseForm(false)
            return
          }
          onAddExpense()
        }} disabled={group.members.length === 0}>
          <Plus size={15} /> {showExpenseForm ? 'Close' : 'Add shared expense'}
        </button>
        {group.expenses.length > 0 && <span>Total shared {formatMoney(group.expenses.reduce((sum, expense) => sum + expense.amount, 0))}</span>}
      </div>
      {actionError && <p className="field-error" role="alert">{actionError}</p>}

      {showExpenseForm && (
        <form className="shared-expense-form" onSubmit={saveSharedExpense}>
          <div className="form-grid">
            <label className="field"><span>What was it for?</span><input type="text" placeholder="e.g. Dinner out" value={expenseTitle} onChange={(event) => setExpenseTitle(event.target.value)} maxLength={80} required /></label>
            <label className="field"><span>Amount (₹)</span><input type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} required /></label>
          </div>
          <label className="field"><span>When was it?</span><input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required /></label>
          <label className="field"><span>Who paid?</span><select value={paidById} onChange={(event) => setPaidById(event.target.value)} required>{group.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
          <fieldset className="participants-field">
            <legend>Who took part?</legend>
            <div className="participant-options">{group.members.map((member) => <label className="participant-option" key={member.id}><input type="checkbox" checked={participantIds.includes(member.id)} onChange={() => toggleParticipant(member.id)} /><span>{member.name}</span></label>)}</div>
            {!participantIds.length && <p className="field-error">Select at least one person to split this expense.</p>}
          </fieldset>
          <fieldset className="participants-field">
            <legend>How should it be split?</legend>
            <div className="participant-options">
              <label className="participant-option"><input type="radio" name={`split-${group.id}`} checked={splitType === 'equal'} onChange={() => setSplitType('equal')} /><span>Split equally</span></label>
              <label className="participant-option"><input type="radio" name={`split-${group.id}`} checked={splitType === 'custom'} onChange={() => setSplitType('custom')} /><span>Custom amounts</span></label>
            </div>
          </fieldset>
          {splitType === 'custom' && <div className="custom-share-fields">{group.members.filter((member) => participantIds.includes(member.id)).map((member) => <label className="field" key={member.id}><span>{member.name}’s share</span><span className="amount-input-wrap"><span>₹</span><input type="number" min="0" step="0.01" inputMode="decimal" value={participantShares[member.id] ?? ''} onChange={(event) => setParticipantShares((current) => ({ ...current, [member.id]: event.target.value }))} required /></span></label>)}<p className="split-hint">Custom shares must add up to {formatMoney(Number(expenseAmount) || 0)}.</p></div>}
          <div className="field"><span>Receipt photo <span className="optional">(optional)</span></span><ReceiptField receipt={receipt} onChange={setReceipt} onError={setReceiptError} />{receiptError && <p className="field-error" role="alert">{receiptError}</p>}</div>
          {formError && <p className="field-error" role="alert">{formError}</p>}
          {splitType === 'equal' && <p className="split-hint">Each selected person’s equal share is calculated automatically.</p>}
          <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={() => { setShowExpenseForm(false); setEditingExpense(null) }}>Cancel</button><button className="button button-primary button-small" type="submit">{editingExpense ? 'Save changes' : 'Save shared expense'}</button></div>
        </form>
      )}

      {group.expenses.length > 0 && (
        <details className="shared-expense-history">
          <summary>See shared expenses</summary>
          <ul>{[...group.expenses].sort((a, b) => b.date.localeCompare(a.date)).map((expense) => <li key={expense.id}><span><strong>{expense.title}</strong><small>{formatDate(expense.date, { short: true })} · paid by {group.members.find((member) => member.id === expense.paidById)?.name} · {expense.splitType === 'custom' ? 'custom split' : 'equal split'}</small><div className="shared-participant-shares">{expense.participantIds.map((id) => { const member = group.members.find((item) => item.id === id); const share = expense.splitType === 'custom' ? expense.participantShares?.[id] ?? 0 : expense.amount / expense.participantIds.length; return <span key={id}>{member?.name}: {formatMoney(share)}</span> })}</div><ReceiptThumbnail receipt={expense.receipt} /></span><strong>{formatMoney(expense.amount)}</strong><div className="expense-actions"><button className="icon-button small" type="button" onClick={() => beginEditingExpense(expense)} aria-label={`Edit ${expense.title}`}><span aria-hidden="true">✎</span></button><button className="icon-button small delete-button" type="button" onClick={() => deleteSharedExpense(expense)} aria-label={`Delete ${expense.title}`}><X size={15} /></button></div></li>)}</ul>
        </details>
      )}
    </article>
  )
}

export function GroupsPage({ data, saveData, onAddExpense }) {
  const [name, setName] = useState('')
  const handleCreateGroup = (event) => {
    event.preventDefault()
    const groupName = name.trim()
    if (!groupName) return
    saveData((current) => ({ ...current, groups: [...current.groups, { id: crypto.randomUUID(), name: groupName, members: [], expenses: [] }] }))
    setName('')
  }

  return (
    <>
      <PageHeading eyebrow="Better together" title="Shared groups" description="Split the little things, and keep it easy." action={<span className="soft-icon"><Users size={18} /></span>} />
      <form className="card create-group-form" onSubmit={handleCreateGroup}>
        <div><p className="eyebrow">Start a little group</p><h2>Who are you sharing with?</h2><p className="supporting-copy">Trips, roommates, family — create a group and keep shared spending fair.</p></div>
        <div className="create-group-controls">
          <label className="visually-hidden" htmlFor="new-group-name">Group name</label>
          <input id="new-group-name" type="text" placeholder="e.g. Goa getaway" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required />
          <button className="button button-primary" type="submit"><Plus size={17} /> Create group</button>
        </div>
      </form>
      {data.groups.length ? (
        <section className="groups-grid" aria-label="Your shared groups">
          {data.groups.map((group) => <GroupCard key={group.id} group={group} saveData={saveData} onAddExpense={onAddExpense} />)}
        </section>
      ) : (
        <section className="card"><EmptyState icon={Users} title="Make sharing feel simple">Create your first group above to add people, log a shared expense, and see an easy settle-up plan.</EmptyState></section>
      )}
    </>
  )
}

export function SettingsPage({ data, saveData, onExport, onImport }) {
  const [nameDraft, setNameDraft] = useState(null)
  const [saved, setSaved] = useState(false)
  const importInputRef = useRef(null)
  const displayName = nameDraft?.initialName === data.settings.name ? nameDraft.value : data.settings.name
  const totalExpenses = data.expenses.length
  const saveName = async (event) => {
    event.preventDefault()
    const success = await saveData((current) => ({ ...current, settings: { ...current.settings, name: displayName.trim() } }))
    setNameDraft(null)
    setSaved(success)
    if (success) window.setTimeout(() => setSaved(false), 2400)
  }

  return (
    <>
      <PageHeading eyebrow="Your app, your way" title="Settings" description="A few thoughtful details, all yours." />
      <section className="card settings-tools-card">
        <div className="card-heading"><div><p className="eyebrow">Make more room</p><h2>Your money tools</h2><p className="supporting-copy">Income, savings goals, calendars, recurring plans, and statement imports are all here when you need them.</p></div><span className="soft-icon"><Wallet size={18} /></span></div>
        <div className="settings-tool-links">
          <Link className="button button-secondary" to="/analytics"><TrendingUp size={16} /> Income & savings</Link>
          <Link className="button button-secondary" to="/calendar"><CalendarDays size={16} /> Spending calendar</Link>
          <Link className="button button-secondary" to="/recurring"><Repeat size={16} /> Recurring expenses</Link>
        </div>
      </section>
      <section className="settings-grid">
        <article className="card settings-card">
          <div className="card-heading"><div><p className="eyebrow">Make yourself at home</p><h2>Your details</h2></div><span className="soft-icon"><Sparkles size={18} /></span></div>
          <form className="settings-name-form" onSubmit={saveName}>
            <label className="field"><span>What should we call you?</span><input type="text" placeholder="Your first name" maxLength={60} value={displayName} onChange={(event) => setNameDraft({ initialName: data.settings.name, value: event.target.value })} /></label>
            <button className="button button-secondary" type="submit">{saved ? <><Check size={16} /> Saved</> : 'Save name'}</button>
          </form>
          <div className="settings-info-row"><span>Currency</span><strong>₹ Indian rupee (INR)</strong></div>
          <div className="settings-info-row"><span>Expense categories</span><strong>{CATEGORIES.length} included</strong></div>
        </article>

        <article className="card settings-card backup-card">
          <div className="card-heading"><div><p className="eyebrow">Yours to keep</p><h2>Import &amp; backup</h2></div><span className="soft-icon"><Download size={18} /></span></div>
          <p className="supporting-copy">Save or restore a JSON copy of your expenses and receipts, recurring rules, statement-import history, income, budgets, savings goals, groups, and settings. Nothing is sent anywhere.</p>
          <div className="backup-actions">
            <button className="button button-primary" type="button" onClick={onExport}><Download size={17} /> Export backup</button>
            <button className="button button-secondary" type="button" onClick={() => importInputRef.current?.click()}>Import backup</button>
            <input ref={importInputRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={onImport} aria-label="Choose a JSON backup file" />
          </div>
          <p className="backup-count">{totalExpenses} {totalExpenses === 1 ? 'expense' : 'expenses'} · {data.income.length} {data.income.length === 1 ? 'income record' : 'income records'} · {data.recurringExpenses.length} {data.recurringExpenses.length === 1 ? 'recurring rule' : 'recurring rules'} · {data.savingsGoals.length} {data.savingsGoals.length === 1 ? 'savings goal' : 'savings goals'}</p>
          <StatementImporter data={data} saveData={saveData} />
        </article>

        <article className="card settings-card privacy-card">
          <div className="card-heading"><div><p className="eyebrow">No funny business</p><h2>Your privacy</h2></div><span className="privacy-icon"><ShieldCheck size={19} /></span></div>
          <ul className="privacy-list">
            <li><Check size={16} /><span>Your financial data and compressed receipt photos live in this browser’s local IndexedDB storage.</span></li>
            <li><Check size={16} /><span>Statement files are read locally for your review; Rupee Wise never connects to your bank or uploads transaction data.</span></li>
            <li><Check size={16} /><span>JSON backups include your receipts and can be large. Export a backup any time, or clear your browser data to remove it.</span></li>
          </ul>
        </article>

        <article className="card settings-card about-card">
          <div className="card-heading"><div><p className="eyebrow">A little about us</p><h2>Money, made mindful.</h2></div><span className="soft-icon"><CircleHelp size={18} /></span></div>
          <p className="supporting-copy">Rupee Wise is a quiet little space to understand your spending, make a monthly plan, and share group expenses without the fuss.</p>
          <div className="about-mark"><span className="brand-mark small">₹</span> <span>Made for your everyday.</span></div>
        </article>
      </section>
    </>
  )
}

function StatementImporter({ data, saveData }) {
  const [rows, setRows] = useState([])
  const [skipped, setSkipped] = useState(0)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const duplicates = new Set(data.statementImports ?? [])
  const importableRows = rows.filter((row) => !duplicates.has(row.fingerprint))

  const readStatement = async (event) => {
    const fileInput = event.currentTarget
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await parseBankStatement(file)
      setRows(result.transactions.map((transaction) => ({ ...transaction, category: CATEGORIES[CATEGORIES.length - 1] })))
      setSkipped(result.skipped)
      setFileName(file.name)
    } catch (parseError) {
      setRows([])
      setFileName('')
      setError(parseError instanceof Error ? parseError.message : 'This statement could not be read.')
    } finally {
      setBusy(false)
    }
  }

  const updateRow = (fingerprint, change) => {
    setRows((current) => current.map((row) => row.fingerprint === fingerprint ? { ...row, ...change } : row))
  }

  const importRows = async () => {
    if (!importableRows.length) return
    setBusy(true)
    setError('')
    const success = await saveData((current) => {
      const previouslyImported = new Set(current.statementImports ?? [])
      const selected = rows.filter((row) => !previouslyImported.has(row.fingerprint))
      return {
        ...current,
        expenses: [
          ...current.expenses,
          ...selected.filter((row) => row.type === 'expense').map((row) => ({
            id: crypto.randomUUID(),
            amount: row.amount,
            category: row.category,
            date: row.date,
            note: row.description.slice(0, 120),
            createdAt: new Date().toISOString(),
            importedTransactionId: row.fingerprint,
          })),
        ],
        income: [
          ...current.income,
          ...selected.filter((row) => row.type === 'income').map((row) => ({
            id: crypto.randomUUID(),
            amount: row.amount,
            date: row.date,
            source: row.description.slice(0, 80),
            note: '',
            importedTransactionId: row.fingerprint,
          })),
        ],
        statementImports: [...new Set([...(current.statementImports ?? []), ...selected.map((row) => row.fingerprint)])],
      }
    })
    setBusy(false)
    if (success) {
      setNotice(`${importableRows.length} transactions imported to this device.`)
      setRows([])
      setFileName('')
    } else {
      setError('Could not save these transactions to this device. Your statement has not been imported.')
    }
  }

  return (
    <section className="statement-import-card" aria-labelledby="statement-import-title">
    <div className="card-heading"><div><p className="eyebrow">Bring in a statement</p><h3 id="statement-import-title">Import a bank statement</h3><p className="supporting-copy">Choose a CSV, OFX, or QFX file stored on this device. Nothing is uploaded or connected to your bank.</p></div><span className="soft-icon"><Landmark size={18} /></span></div>
      <label className="statement-file-button">
        <input type="file" accept=".csv,.ofx,.qfx,text/csv,application/x-ofx" onChange={readStatement} disabled={busy} />
        <Download size={17} /><span>{busy ? 'Working…' : 'Choose a statement file'}</span>
        <small>CSV, OFX, QFX · up to 10 MB</small>
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
      {notice && <p className="statement-notice" role="status">{notice}</p>}
      {rows.length > 0 && (
        <div className="statement-preview">
          <div className="statement-preview-heading"><div><strong>{fileName}</strong><small>{importableRows.length} ready · {rows.length - importableRows.length} already imported · {skipped} skipped</small></div><button className="text-link" type="button" onClick={() => { setRows([]); setFileName(''); setError('') }}>Clear preview</button></div>
          <div className="statement-table-wrap"><table className="statement-table"><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Type</th><th>Category</th></tr></thead><tbody>
            {rows.map((row) => {
              const duplicate = duplicates.has(row.fingerprint)
              return <tr key={row.fingerprint} className={duplicate ? 'statement-duplicate' : ''}>
                <td>{formatDate(row.date, { short: true })}</td>
                <td>{row.description}</td>
                <td>{formatMoney(row.amount)}</td>
                <td><label className="visually-hidden" htmlFor={`statement-type-${row.fingerprint}`}>Transaction type for {row.description}</label><select id={`statement-type-${row.fingerprint}`} value={row.type} disabled={duplicate} onChange={(event) => updateRow(row.fingerprint, { type: event.target.value })}><option value="expense">Expense</option><option value="income">Income</option></select></td>
                <td>{row.type === 'expense' ? <><label className="visually-hidden" htmlFor={`statement-category-${row.fingerprint}`}>Category for {row.description}</label><select id={`statement-category-${row.fingerprint}`} value={row.category} disabled={duplicate} onChange={(event) => updateRow(row.fingerprint, { category: event.target.value })}>{CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}</select></> : <span>—</span>}</td>
              </tr>
            })}
          </tbody></table></div>
          <p className="split-hint">Check each transaction type before importing. Positive amounts in a single Amount column may be labelled as income; you can change them here.</p>
          <button className="button button-primary" type="button" disabled={busy || !importableRows.length} onClick={importRows}>{busy ? 'Saving…' : `Import ${importableRows.length} transactions`}</button>
        </div>
      )}
    </section>
  )
}

export function AnalyticsPage({ data, saveData }) {
  const [month, setMonth] = useState(currentMonth)
  const [incomeAmount, setIncomeAmount] = useState('')
  const [incomeSource, setIncomeSource] = useState('')
  const [incomeDate, setIncomeDate] = useState(todayISO)
  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [goalDeadline, setGoalDeadline] = useState('')
  const [contributions, setContributions] = useState({})
  const months = availableMonths(data, month)
  const incomeItems = data.income.filter((item) => item.date.slice(0, 7) === month)
  const incomeTotal = incomeItems.reduce((sum, item) => sum + item.amount, 0)
  const spendingTotal = monthSpending(data.expenses, month)
  const netCashFlow = incomeTotal - spendingTotal
  const trendMonths = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 6 + index, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
  const maxTrend = Math.max(1, ...trendMonths.flatMap((trendMonth) => [
    data.income.filter((item) => item.date.slice(0, 7) === trendMonth).reduce((sum, item) => sum + item.amount, 0),
    monthSpending(data.expenses, trendMonth),
  ]))

  const submitIncome = async (event) => {
    event.preventDefault()
    const amount = Number(incomeAmount)
    if (!Number.isFinite(amount) || amount <= 0 || !incomeDate) return
    const item = { id: crypto.randomUUID(), amount, date: incomeDate, source: incomeSource.trim() || 'Income', note: '' }
    if (await saveData((current) => ({ ...current, income: [...current.income, item] }))) {
      setIncomeAmount('')
      setIncomeSource('')
    }
  }

  const deleteIncome = async (id) => {
    if (!window.confirm('Delete this income record?')) return
    await saveData((current) => ({ ...current, income: current.income.filter((item) => item.id !== id) }))
  }

  const submitGoal = async (event) => {
    event.preventDefault()
    const target = Number(goalTarget)
    if (!goalName.trim() || !Number.isFinite(target) || target <= 0) return
    const goal = { id: crypto.randomUUID(), name: goalName.trim(), target, saved: 0, deadline: goalDeadline || '' }
    if (await saveData((current) => ({ ...current, savingsGoals: [...current.savingsGoals, goal] }))) {
      setGoalName('')
      setGoalTarget('')
      setGoalDeadline('')
    }
  }

  const contribute = async (goal) => {
    const amount = Number(contributions[goal.id])
    if (!Number.isFinite(amount) || amount <= 0) return
    if (await saveData((current) => ({
      ...current,
      savingsGoals: current.savingsGoals.map((item) => item.id === goal.id ? { ...item, saved: item.saved + amount } : item),
    }))) setContributions((current) => ({ ...current, [goal.id]: '' }))
  }

  const deleteGoal = async (id) => {
    if (!window.confirm('Remove this savings goal?')) return
    await saveData((current) => ({ ...current, savingsGoals: current.savingsGoals.filter((goal) => goal.id !== id) }))
  }

  return (
    <>
      <PageHeading eyebrow="The bigger picture" title="Income & analytics" description="See what comes in, what goes out, and the progress you’re making." action={<MonthControl month={month} onChange={setMonth} months={months} />} />
      <section className="analytics-metrics" aria-label={`${formatMonth(month)} cash flow`}>
        <article className="card analytics-metric income-metric"><span className="analytics-metric-icon"><TrendingUp size={19} /></span><p className="eyebrow">Income</p><strong>{formatMoney(incomeTotal)}</strong><span>{incomeItems.length} {incomeItems.length === 1 ? 'record' : 'records'}</span></article>
        <article className="card analytics-metric spending-metric"><span className="analytics-metric-icon"><TrendingDown size={19} /></span><p className="eyebrow">Spending</p><strong>{formatMoney(spendingTotal)}</strong><span>{monthExpenses(data.expenses, month).length} expenses</span></article>
        <article className={`card analytics-metric net-metric ${netCashFlow < 0 ? 'net-negative' : ''}`}><span className="analytics-metric-icon"><Wallet size={19} /></span><p className="eyebrow">Net cash flow</p><strong>{netCashFlow < 0 ? `−${formatMoney(Math.abs(netCashFlow))}` : formatMoney(netCashFlow)}</strong><span>{netCashFlow < 0 ? 'Spending is above income' : 'Income minus spending'}</span></article>
      </section>

      <section className="analytics-content-grid">
        <article className="card cashflow-chart-card">
          <div className="card-heading"><div><p className="eyebrow">Six-month view</p><h2>Income & spending</h2></div><span className="chart-legend"><i className="legend-income" /> Income <i className="legend-spend" /> Spending</span></div>
          <div className="cashflow-chart" role="img" aria-label="Monthly income and spending comparison for the last six months">
            {trendMonths.map((trendMonth) => {
              const income = data.income.filter((item) => item.date.slice(0, 7) === trendMonth).reduce((sum, item) => sum + item.amount, 0)
              const spent = monthSpending(data.expenses, trendMonth)
              return (
                <div className="cashflow-chart-month" key={trendMonth}>
                  <div className="cashflow-chart-bars">
                    <span className="chart-income-bar" style={{ height: `${Math.max(income / maxTrend * 100, income ? 4 : 0)}%` }} title={`Income ${formatMoney(income)}`} />
                    <span className="chart-spend-bar" style={{ height: `${Math.max(spent / maxTrend * 100, spent ? 4 : 0)}%` }} title={`Spending ${formatMoney(spent)}`} />
                  </div>
                  <span>{formatMonth(trendMonth).split(' ')[0].slice(0, 3)}</span>
                </div>
              )
            })}
          </div>
        </article>
        <article className="card add-income-card">
          <div className="card-heading"><div><p className="eyebrow">Money coming in</p><h2>Record income</h2></div><span className="soft-icon"><TrendingUp size={18} /></span></div>
          <form className="income-form" onSubmit={submitIncome}>
            <label className="field"><span>Amount</span><span className="amount-input-wrap"><span>₹</span><input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="e.g. 45,000" value={incomeAmount} onChange={(event) => setIncomeAmount(event.target.value)} required /></span></label>
            <label className="field"><span>Source</span><input type="text" placeholder="Salary, freelance…" value={incomeSource} onChange={(event) => setIncomeSource(event.target.value)} maxLength={80} /></label>
            <label className="field"><span>Date received</span><input type="date" value={incomeDate} onChange={(event) => setIncomeDate(event.target.value)} required /></label>
            <button className="button button-primary" type="submit"><Plus size={16} /> Add income</button>
          </form>
        </article>
      </section>

      <section className="card income-history-card">
        <div className="card-heading"><div><p className="eyebrow">{formatMonth(month)}</p><h2>Income records</h2></div><span className="soft-icon"><History size={18} /></span></div>
        {incomeItems.length ? <ul className="income-list">{[...incomeItems].sort(expenseDateOrder).map((item) => <li key={item.id}><span className="income-record-icon"><TrendingUp size={16} /></span><span className="income-record-name">{item.source || 'Income'}<small>{formatDate(item.date, { short: true })}</small></span><strong>{formatMoney(item.amount)}</strong><button type="button" className="icon-button small delete-button" onClick={() => deleteIncome(item.id)} aria-label={`Delete ${item.source || 'income'} record`}><X size={15} /></button></li>)}</ul> : <EmptyState icon={TrendingUp} title="No income recorded for this month">Add a record above to see your monthly cash flow.</EmptyState>}
      </section>

      <section className="card savings-goals-card">
        <div className="card-heading"><div><p className="eyebrow">A little at a time</p><h2>Savings goals</h2></div><span className="soft-icon"><PiggyBank size={18} /></span></div>
        <form className="savings-goal-form" onSubmit={submitGoal}>
          <label className="field"><span>What are you saving for?</span><input type="text" placeholder="e.g. A little getaway" maxLength={80} value={goalName} onChange={(event) => setGoalName(event.target.value)} required /></label>
          <label className="field"><span>Target amount</span><span className="amount-input-wrap"><span>₹</span><input type="number" min="1" step="0.01" inputMode="decimal" placeholder="50,000" value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} required /></span></label>
          <label className="field"><span>Target date <span className="optional">(optional)</span></span><input type="date" min={todayISO()} value={goalDeadline} onChange={(event) => setGoalDeadline(event.target.value)} /></label>
          <button className="button button-primary" type="submit"><Plus size={16} /> Create goal</button>
        </form>
        {data.savingsGoals.length ? <div className="savings-goals-list">{data.savingsGoals.map((goal) => {
          const progress = Math.min(goal.saved / goal.target * 100, 100)
          return (
            <article className="savings-goal-row" key={goal.id}>
              <div className="savings-goal-top"><span className="goal-icon"><PiggyBank size={17} /></span><div className="savings-goal-name"><strong>{goal.name}</strong><small>{goal.deadline ? `Target ${formatDate(goal.deadline, { short: true })}` : 'Whenever you get there'}</small></div><strong className="savings-goal-amount">{formatMoney(goal.saved)} <small>of {formatMoney(goal.target)}</small></strong><button className="icon-button small delete-button" type="button" onClick={() => deleteGoal(goal.id)} aria-label={`Remove ${goal.name} savings goal`}><X size={15} /></button></div>
              <div className="savings-goal-progress" role="progressbar" aria-label={`${goal.name} savings progress`} aria-valuenow={Math.round(progress)} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${progress}%` }} /></div>
              <div className="savings-goal-bottom"><span>{progress >= 100 ? 'Goal reached — lovely work!' : `${Math.round(progress)}% saved`}</span>{progress < 100 && <form className="goal-contribution-form" onSubmit={(event) => { event.preventDefault(); contribute(goal) }}><label className="visually-hidden" htmlFor={`contribution-${goal.id}`}>Add to {goal.name}</label><span className="contribution-input"><span>₹</span><input id={`contribution-${goal.id}`} type="number" min="0.01" step="0.01" placeholder="Add savings" value={contributions[goal.id] ?? ''} onChange={(event) => setContributions((current) => ({ ...current, [goal.id]: event.target.value }))} required /></span><button className="button button-secondary button-small" type="submit">Add savings</button></form>}</div>
            </article>
          )
        })}</div> : <EmptyState icon={PiggyBank} title="Give a future plan a name">Create your first savings goal and watch every little contribution add up.</EmptyState>}
      </section>
    </>
  )
}

export function RecurringPage({ data, saveData }) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(CATEGORIES[3])
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO)
  const [frequency, setFrequency] = useState('monthly')
  const [customInterval, setCustomInterval] = useState('2')
  const [customUnit, setCustomUnit] = useState('week')
  const [endDate, setEndDate] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    const numericAmount = Number(amount)
    const interval = frequency === 'weekly' ? 1
      : frequency === 'monthly' ? 1
        : frequency === 'quarterly' ? 3
          : frequency === 'yearly' ? 12 : Number(customInterval)
    const intervalUnit = frequency === 'weekly' ? 'week'
      : frequency === 'custom' ? customUnit : 'month'
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !date || (frequency === 'custom' && (!Number.isInteger(interval) || interval < 1 || interval > 365)) || (endDate && endDate < date)) return
    const recurring = {
      id: crypto.randomUUID(),
      amount: numericAmount,
      category,
      note: note.trim(),
      day: Number(date.slice(8, 10)),
      startMonth: date.slice(0, 7),
      startDate: date,
      endDate,
      frequency,
      interval,
      intervalUnit,
      active: true,
    }
    const nextData = applyRecurringExpenses({ ...data, recurringExpenses: [...data.recurringExpenses, recurring] })
    if (await saveData(() => nextData)) {
      setAmount('')
      setNote('')
      setDate(todayISO())
      setFrequency('monthly')
      setCustomInterval('2')
      setCustomUnit('week')
      setEndDate('')
    }
  }

  const toggle = (id) => saveData((current) => applyRecurringExpenses({
    ...current,
    recurringExpenses: current.recurringExpenses.map((item) => {
      if (item.id !== id) return item
      if (item.active) return { ...item, active: false, pausedAt: todayISO() }
      const pausedDates = item.pausedAt
        ? getRecurringDatesBetween(item, item.pausedAt, todayISO())
        : []
      return { ...item, active: true, pausedAt: '', skippedDates: [...new Set([...(item.skippedDates ?? []), ...pausedDates])] }
    }),
  }))

  const remove = async (item) => {
    if (!window.confirm(`Remove the recurring rule for “${item.note || item.category}”? Already-created expenses will stay in your history.`)) return
    await saveData((current) => ({ ...current, recurringExpenses: current.recurringExpenses.filter((entry) => entry.id !== item.id) }))
  }

  const frequencyLabel = (item) => item.frequency === 'custom'
    ? `every ${item.interval} ${item.intervalUnit}${item.interval === 1 ? '' : 's'}`
    : item.frequency === 'quarterly' ? 'quarterly'
      : item.frequency === 'yearly' ? 'yearly'
        : item.frequency

  return (
    <>
      <PageHeading eyebrow="The little things, on repeat" title="Recurring expenses" description="Choose a schedule and end date. Rupee Wise adds each due occurrence to your local expense history." />
      <section className="recurring-layout">
        <article className="card recurring-form-card">
          <div className="card-heading"><div><p className="eyebrow">Your schedule</p><h2>Set up a recurring expense</h2></div><span className="soft-icon"><Repeat size={18} /></span></div>
          <form className="recurring-form" onSubmit={submit}>
            <label className="field"><span>Amount each time</span><span className="amount-input-wrap"><span>₹</span><input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="e.g. 1,200" value={amount} onChange={(event) => setAmount(event.target.value)} required /></span></label>
            <CategorySelect value={category} onChange={setCategory} id="recurring-category" />
            <label className="field"><span>What is it?</span><input type="text" placeholder="e.g. Internet bill" maxLength={120} value={note} onChange={(event) => setNote(event.target.value)} required /></label>
            <label className="field"><span>Frequency</span><select value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option><option value="custom">Custom interval</option></select></label>
            {frequency === 'custom' && <div className="form-grid"><label className="field"><span>Repeat every</span><input type="number" min="1" max="365" step="1" value={customInterval} onChange={(event) => setCustomInterval(event.target.value)} required /></label><label className="field"><span>Interval unit</span><select value={customUnit} onChange={(event) => setCustomUnit(event.target.value)}><option value="day">Days</option><option value="week">Weeks</option><option value="month">Months</option></select></label></div>}
            <label className="field"><span>First occurrence</span><input type="date" min={todayISO()} value={date} onChange={(event) => setDate(event.target.value)} required /></label>
            <label className="field"><span>End date <span className="optional">(optional)</span></span><input type="date" min={date} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
            <p className="split-hint">A monthly occurrence stays on the same calendar day; short months use their last day.</p>
            <button className="button button-primary" type="submit"><Plus size={16} /> Create recurring expense</button>
          </form>
        </article>
        <article className="card recurring-list-card">
          <div className="card-heading"><div><p className="eyebrow">Your standing plans</p><h2>Monthly rules</h2></div><span className="soft-icon"><CalendarDays size={18} /></span></div>
          {data.recurringExpenses.length ? <ul className="recurring-list">{data.recurringExpenses.map((item) => (
            <li className={`recurring-item ${!item.active ? 'recurring-paused' : ''}`} key={item.id}>
              <CategoryIcon category={item.category} />
              <span className="recurring-description"><strong>{item.note || item.category}</strong><small>{item.category} · {frequencyLabel(item)}{item.active ? (() => { const next = getNextRecurringDate(item, data.expenses); return next ? ` · next ${formatDate(next, { short: true })}` : ' · complete' })() : ' · paused'}{item.endDate ? ` · ends ${formatDate(item.endDate, { short: true })}` : ''}</small></span>
              <strong className="expense-amount">{formatMoney(item.amount)}</strong>
              <button className={`button button-small ${item.active ? 'button-secondary' : 'button-primary'}`} type="button" onClick={() => toggle(item.id)}>{item.active ? 'Pause' : 'Resume'}</button>
              <button className="icon-button small delete-button" type="button" onClick={() => remove(item)} aria-label={`Remove ${item.note || item.category} recurring expense`}><X size={15} /></button>
            </li>
          ))}</ul> : <EmptyState icon={Repeat} title="Nothing on repeat yet">Rent, subscriptions, and those regular bills can all be added here.</EmptyState>}
          <p className="recurring-note"><ShieldCheck size={15} /> Occurrences are saved in your local expense history and never duplicated.</p>
        </article>
      </section>
    </>
  )
}

export function CalendarPage({ data, onAddExpense }) {
  const [month, setMonth] = useState(currentMonth)
  const [selectedDate, setSelectedDate] = useState(todayISO)
  const months = availableMonths(data, month)
  const [year, monthNumber] = month.split('-').map(Number)
  const dayCount = new Date(year, monthNumber, 0).getDate()
  const firstDayOffset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7
  const days = [...Array(firstDayOffset).fill(null), ...Array.from({ length: dayCount }, (_, index) => index + 1)]
  const monthKey = `${year}-${String(monthNumber).padStart(2, '0')}`
  const expenseTotals = new Map()
  const incomeTotals = new Map()
  for (const expense of data.expenses) if (expense.date.slice(0, 7) === monthKey) expenseTotals.set(expense.date, (expenseTotals.get(expense.date) ?? 0) + expense.amount)
  for (const item of data.income) if (item.date.slice(0, 7) === monthKey) incomeTotals.set(item.date, (incomeTotals.get(item.date) ?? 0) + item.amount)
  const selectedExpenses = data.expenses.filter((expense) => expense.date === selectedDate).sort(expenseDateOrder)
  const selectedIncome = data.income.filter((item) => item.date === selectedDate)
  const activeMonth = selectedDate.slice(0, 7) === monthKey

  const chooseMonth = (nextMonth) => {
    setMonth(nextMonth)
    setSelectedDate(`${nextMonth}-01`)
  }

  return (
    <>
      <PageHeading eyebrow="Every day, in view" title="Spending calendar" description="A month at a glance, with the little details close by." action={<MonthControl month={month} onChange={chooseMonth} months={months} />} />
      <section className="calendar-layout">
        <article className="card calendar-card">
          <div className="calendar-month-heading"><strong>{formatMonth(month)}</strong><span><i className="calendar-dot calendar-expense-dot" /> Spending <i className="calendar-dot calendar-income-dot" /> Income</span></div>
          <div className="calendar-grid calendar-weekdays" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid calendar-days">
            {days.map((day, index) => {
              if (day === null) return <span className="calendar-blank" key={`blank-${index}`} />
              const dateKey = `${monthKey}-${String(day).padStart(2, '0')}`
              const expense = expenseTotals.get(dateKey) ?? 0
              const income = incomeTotals.get(dateKey) ?? 0
              const isToday = dateKey === todayISO()
              return <button className={`calendar-day ${dateKey === selectedDate ? 'calendar-day-selected' : ''} ${isToday ? 'calendar-day-today' : ''}`} type="button" key={dateKey} onClick={() => setSelectedDate(dateKey)} aria-label={`${formatDate(dateKey, { short: true })}${expense ? `, spent ${formatMoney(expense)}` : ''}${income ? `, income ${formatMoney(income)}` : ''}`}>
                <span className="calendar-day-number">{day}</span>
                {(expense > 0 || income > 0) && <span className="calendar-markers">{expense > 0 && <i className="calendar-dot calendar-expense-dot" />}{income > 0 && <i className="calendar-dot calendar-income-dot" />}</span>}
                {expense > 0 && <small className="calendar-day-spend">−{formatMoney(expense)}</small>}
                {income > 0 && <small className="calendar-day-income">+{formatMoney(income)}</small>}
              </button>
            })}
          </div>
        </article>
        <article className="card calendar-detail-card">
          <div className="card-heading"><div><p className="eyebrow">A closer look</p><h2>{activeMonth ? formatDate(selectedDate, { short: true }) : 'Choose a day'}</h2></div><span className="soft-icon"><CalendarDays size={18} /></span></div>
          <div className="calendar-day-totals"><div><span>Spent</span><strong>{formatMoney(selectedExpenses.reduce((sum, expense) => sum + expense.amount, 0))}</strong></div><div><span>Income</span><strong>{formatMoney(selectedIncome.reduce((sum, item) => sum + item.amount, 0))}</strong></div></div>
          {selectedExpenses.length > 0 && <><p className="mini-heading calendar-section-label"><TrendingDown size={14} /> Expenses</p><ul className="calendar-record-list">{selectedExpenses.map((expense) => <li key={expense.id}><CategoryIcon category={expense.category} size={17} /><span>{expense.note || expense.category}</span><strong>−{formatMoney(expense.amount)}</strong></li>)}</ul></>}
          {selectedIncome.length > 0 && <><p className="mini-heading calendar-section-label calendar-income-label"><TrendingUp size={14} /> Income</p><ul className="calendar-record-list">{selectedIncome.map((item) => <li key={item.id}><span className="income-record-icon"><TrendingUp size={15} /></span><span>{item.source || 'Income'}</span><strong>+{formatMoney(item.amount)}</strong></li>)}</ul></>}
          {selectedExpenses.length === 0 && selectedIncome.length === 0 && <EmptyState icon={CalendarDays} title="A clear day">No expenses or income recorded for this date.</EmptyState>}
          <button className="button button-secondary calendar-add-expense" type="button" onClick={onAddExpense}><Plus size={15} /> Add an expense</button>
        </article>
      </section>
    </>
  )
}
