import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Activity,
  CalendarDays,
  Check,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Plus,
  PiggyBank,
  Repeat,
  Settings,
  ShieldCheck,
  Users,
  UserRound,
  Wallet,
  X,
} from 'lucide-react'
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { BottomNavigation, CategorySelect, FloatingAddExpense, ReceiptField } from './components'
import { applyRecurringExpenses, CATEGORIES, emptyAppData, loadAppData, validateBackup, writeAppData } from './data'
import { formatDate, formatMoney, makeId, todayISO } from './utils'
const AccountPage = lazy(() => import('./pages').then((pages) => ({ default: pages.AccountPage })))
const ActivityPage = lazy(() => import('./pages').then((pages) => ({ default: pages.ActivityPage })))
const AnalyticsPage = lazy(() => import('./pages').then((pages) => ({ default: pages.AnalyticsPage })))
const BudgetPage = lazy(() => import('./pages').then((pages) => ({ default: pages.BudgetPage })))
const CalendarPage = lazy(() => import('./pages').then((pages) => ({ default: pages.CalendarPage })))
const GroupDetailPage = lazy(() => import('./pages').then((pages) => ({ default: pages.GroupDetailPage })))
const GroupsPage = lazy(() => import('./pages').then((pages) => ({ default: pages.GroupsPage })))
const HistoryPage = lazy(() => import('./pages').then((pages) => ({ default: pages.HistoryPage })))
const HomePage = lazy(() => import('./pages').then((pages) => ({ default: pages.HomePage })))
const PersonalPage = lazy(() => import('./pages').then((pages) => ({ default: pages.PersonalPage })))
const RecurringPage = lazy(() => import('./pages').then((pages) => ({ default: pages.RecurringPage })))
const SettingsPage = lazy(() => import('./pages').then((pages) => ({ default: pages.SettingsPage })))
import { createSaveQueue } from './saveQueue'
import './App.css'

const AuthPage = lazy(() => import('./AuthPage'))

const navigation = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/personal', label: 'Personal', icon: UserRound },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const bottomNavigation = navigation

const advancedNavigation = [
  { to: '/analytics', label: 'Income & saving goals', icon: PiggyBank, description: 'Set income and track your goals' },
  { to: '/recurring', label: 'Recurring payments', icon: Repeat, description: 'Manage regular payments' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, description: 'Explore spending by date' },
  { to: '/settings#backup-tools', label: 'Import & backup', icon: ShieldCheck, description: 'Save or restore your Spendly data' },
  { to: '/settings#bank-statement-import', label: 'Bank statement import', icon: Wallet, description: 'Import transactions from a statement file' },
]

function AppShell({ data, saveData, storageError, clearStorageError, session, children }) {
  const [expenseDialog, setExpenseDialog] = useState(undefined)
  const [notice, setNotice] = useState(null)
  const [expenseDialogTrigger, setExpenseDialogTrigger] = useState(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const advancedTrigger = useRef(null)
  const location = useLocation()
  const isHome = location.pathname === '/'
  const showExpenseDialog = (dialog) => {
    const activeElement = document.activeElement
    setExpenseDialogTrigger(activeElement instanceof HTMLElement ? activeElement : null)
    setExpenseDialog(dialog)
  }
  const openAddExpense = () => showExpenseDialog('choose')
  const closeExpenseDialog = () => {
    setExpenseDialog(undefined)
    window.requestAnimationFrame(() => expenseDialogTrigger?.focus())
  }
  const openAdvancedTools = () => {
    advancedTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setAdvancedOpen(true)
  }
  const closeAdvancedTools = () => {
    setAdvancedOpen(false)
    window.requestAnimationFrame(() => advancedTrigger.current?.focus())
  }
  const handleToolsKeyDown = (event) => {
    if (event.key === 'Escape') {
      closeAdvancedTools()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...event.currentTarget.querySelectorAll('a[href], button:not(:disabled)')]
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  useEffect(() => {
    const groupId = location.pathname.startsWith('/groups/') ? location.pathname.slice('/groups/'.length) : ''
    const currentPage = groupId
      ? data.groups.find((group) => group.id === groupId)?.name ?? 'Group'
      : navigation.find((item) => item.to === location.pathname)?.label
    document.title = `${currentPage ? `${currentPage} · ` : ''}Spendly`
  }, [data.groups, location.pathname])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(null), 3800)
    return () => window.clearTimeout(timer)
  }, [notice])

  const deleteExpense = async (expense) => {
    const label = expense.note?.trim() || expense.category
    if (!window.confirm(`Delete “${label}” for ${formatMoney(expense.amount)}?`)) return
    const success = await saveData((current) => ({
      ...current,
      expenses: current.expenses.filter((item) => item.id !== expense.id),
      recurringExpenses: expense.recurringId
        ? current.recurringExpenses.map((item) => item.id === expense.recurringId
          ? { ...item, skippedDates: [...new Set([...(item.skippedDates ?? []), expense.date])] }
          : item)
        : current.recurringExpenses,
    }))
    if (success) setNotice({ type: 'success', text: 'Expense deleted. Your monthly totals are up to date.' })
  }

  const exportCsv = () => {
    try {
      const rows = [
        ['Type', 'Date', 'Description', 'Category', 'Amount (INR)', 'Group'],
        ...data.expenses.map((expense) => ['Expense', expense.date, expense.note || expense.category, expense.category, expense.amount, 'Personal']),
        ...data.income.map((item) => ['Income', item.date, item.source || 'Income', '', item.amount, 'Personal']),
        ...data.groups.flatMap((group) => group.expenses.map((expense) => [
          'Group expense',
          expense.date,
          expense.title || expense.note || expense.category || 'Shared expense',
          expense.category || '',
          expense.amount,
          group.name,
        ])),
      ]
      const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `spendly-transactions-${todayISO()}.csv`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setNotice({ type: 'error', text: 'Your CSV could not be created. Please try again.' })
    }
  }

  const exportPdf = () => {
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character])
    const rows = [
      ...data.expenses.map((expense) => ({ date: expense.date, label: expense.note || expense.category, category: expense.category, amount: expense.amount, group: 'Personal', type: 'Expense' })),
      ...data.income.map((item) => ({ date: item.date, label: item.source || 'Income', category: 'Income', amount: item.amount, group: 'Personal', type: 'Income' })),
      ...data.groups.flatMap((group) => group.expenses.map((expense) => ({
        date: expense.date,
        label: expense.title || expense.note || expense.category || 'Shared expense',
        category: expense.category || 'Shared',
        amount: expense.amount,
        group: group.name,
        type: 'Group expense',
      }))),
    ].sort((a, b) => b.date.localeCompare(a.date))
    const tableRows = rows.map((row) => `<tr><td>${escapeHtml(formatDate(row.date, { short: true }))}</td><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.group)}</td><td>${escapeHtml(row.type)}</td><td class="amount">${escapeHtml(formatMoney(row.amount, { decimals: true }))}</td></tr>`).join('')
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) {
      setNotice({ type: 'error', text: 'Allow pop-ups to print or save your report as a PDF.' })
      return
    }
    reportWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Spendly transaction report</title><style>
      body{font:14px Arial,sans-serif;color:#342f32;margin:36px}h1{font-size:24px;margin:0 0 6px}.meta{color:#756c70;margin:0 0 22px}
      table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:9px 7px;border-bottom:1px solid #eadfe1;text-align:left}th{background:#fff3f1;color:#5c4347}
      .amount{text-align:right;white-space:nowrap}@media print{body{margin:15mm}}
      </style></head><body><h1>Spendly transaction report</h1><p class="meta">Generated ${escapeHtml(formatDate(todayISO(), { short: true }))} · ${rows.length} records · Stored on this device</p>
      <table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th>Type</th><th class="amount">Amount</th></tr></thead><tbody>${tableRows || '<tr><td colspan="6">No transactions to report.</td></tr>'}</tbody></table>
      <script>window.addEventListener('load',()=>window.print())</script></body></html>`)
    reportWindow.document.close()
    reportWindow.addEventListener('afterprint', () => reportWindow.close(), { once: true })
  }

  const exportBackup = () => {
    try {
      const backup = {
        ...data,
        exportedAt: new Date().toISOString(),
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `spendly-backup-${todayISO()}.json`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice({ type: 'success', text: 'Your backup is ready to save.' })
    } catch {
      setNotice({ type: 'error', text: 'Your backup could not be created. Please try again.' })
    }
  }

  const importBackup = async (event) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      const restoredData = applyRecurringExpenses(validateBackup(parsed))
      if (!window.confirm('Import this backup and replace all Spendly data currently saved on this device?')) return
      const success = await saveData(() => restoredData)
      if (success) setNotice({ type: 'success', text: 'Your backup is restored. Everything is right where it belongs.' })
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'The backup could not be read.' })
    } finally {
      input.value = ''
    }
  }

  return (
    <div className="app-shell">
      <div className="app-main">
        <header className="topbar">
          <span className="topbar-context">{isHome ? 'YOUR PERSONAL MONEY SPACE' : 'YOUR FINANCIAL OVERVIEW'}</span>
          <div className="topbar-right">
            <span className="local-badge"><span /> All data stored locally</span>
            <button className="topbar-tools" type="button" onClick={openAdvancedTools} aria-label="Open advanced tools"><Menu size={17} /><span>Tools</span></button>
            <span className="topbar-avatar" aria-hidden="true">
              {data.settings.name.trim() ? data.settings.name.trim().charAt(0).toUpperCase() : <Wallet size={18} />}
            </span>
          </div>
        </header>

        {storageError && <div className="storage-alert" role="alert"><ShieldCheck size={18} /><span><strong>Your latest changes aren’t backed up.</strong> {storageError}</span><button type="button" aria-label="Dismiss storage warning" onClick={clearStorageError}><X size={17} /></button></div>}
        {notice && <div className={`toast toast-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}><span>{notice.type === 'success' ? <Check size={17} /> : <X size={17} />}</span>{notice.text}<button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={15} /></button></div>}

        <main className="page-content" id="main-content">
          {typeof children === 'function' ? children({ data, saveData, setExpenseDialog: showExpenseDialog, onAddExpense: openAddExpense, onDeleteExpense: deleteExpense, onExport: exportBackup, onExportCsv: exportCsv, onExportPdf: exportPdf, onImport: importBackup }) : children}
        </main>

        <footer className="app-footer"><span>₹</span> A little more ease with your money, every day.</footer>
      </div>

      <BottomNavigation items={bottomNavigation} />
      {expenseDialog === undefined && <FloatingAddExpense onClick={openAddExpense} />}

      {advancedOpen && (
        <div className="tools-backdrop" onClick={closeAdvancedTools}>
          <aside className="tools-drawer" role="dialog" aria-modal="true" aria-labelledby="tools-drawer-title" onClick={(event) => event.stopPropagation()} onKeyDown={handleToolsKeyDown}>
            <div className="tools-drawer-heading">
              <div><p className="eyebrow">Your money toolkit</p><h2 id="tools-drawer-title">More from Spendly</h2></div>
              <button autoFocus className="icon-button" type="button" aria-label="Close tools" onClick={closeAdvancedTools}><X size={19} /></button>
            </div>
            <nav className="tools-drawer-links" aria-label="Advanced features">
              {advancedNavigation.map(({ to, label, description, icon: Icon }) => (
                <NavLink className="tools-drawer-link" to={to} key={to} onClick={() => setAdvancedOpen(false)}>
                  <span className="tools-drawer-icon"><Icon size={18} /></span>
                  <span><strong>{label}</strong><small>{description}</small></span>
                  <ArrowRight size={16} />
                </NavLink>
              ))}
              <button className="tools-drawer-link" type="button" onClick={() => { window.print(); closeAdvancedTools() }}>
                <span className="tools-drawer-icon"><ClipboardList size={18} /></span>
                <span><strong>Export as PDF</strong><small>Print or save a PDF from your browser</small></span>
                <ArrowRight size={16} />
              </button>
            </nav>
            <div className="tools-drawer-note"><ShieldCheck size={17} /><span>Your data stays private on this device.</span></div>
          </aside>
        </div>
      )}

      {expenseDialog === 'choose' && (
        <ExpenseTypeDialog
          groups={data.groups}
          onPersonal={() => setExpenseDialog(null)}
          onGroup={() => setExpenseDialog('group')}
          onClose={closeExpenseDialog}
        />
      )}

      {expenseDialog === 'group' && (
        <GroupExpenseDialog
          groups={data.groups}
          onClose={closeExpenseDialog}
          onSave={async (groupExpense) => {
            const targetGroup = data.groups.find((group) => group.id === groupExpense.groupId)
            if (!targetGroup || !groupExpense.expense.participantIds.length ||
              !targetGroup.members.some((member) => member.id === groupExpense.expense.paidById) ||
              groupExpense.expense.participantIds.some((id) => !targetGroup.members.some((member) => member.id === id))) {
              return false
            }
            const success = await saveData((current) => ({
              ...current,
              groups: current.groups.map((group) => group.id === groupExpense.groupId
                ? { ...group, expenses: [...group.expenses, { ...groupExpense.expense, createdByUserId: session.user.id }] }
                : group),
            }))
            if (success) {
              closeExpenseDialog()
              setNotice({ type: 'success', text: 'Shared expense added. Group balances are up to date.' })
            }
            return success
          }}
        />
      )}

      {expenseDialog !== undefined && expenseDialog !== 'choose' && expenseDialog !== 'group' && (
        <ExpenseDialog
          expense={expenseDialog}
          onClose={closeExpenseDialog}
          onSave={async (expense) => {
            const success = await saveData((current) => ({
              ...current,
              expenses: expenseDialog
                ? current.expenses.map((item) => item.id === expense.id ? expense : item)
                : [expense, ...current.expenses],
              recurringExpenses: expenseDialog?.recurringId && expenseDialog.date !== expense.date
                ? current.recurringExpenses.map((item) => item.id === expenseDialog.recurringId
                  ? { ...item, skippedDates: [...new Set([...(item.skippedDates ?? []), expenseDialog.date])] }
                  : item)
                : current.recurringExpenses,
            }))
            if (success) {
              closeExpenseDialog()
              setNotice({ type: 'success', text: expenseDialog ? 'Your expense was updated.' : 'Expense added. Your budget is up to date.' })
            }
            return success
          }}
        />
      )}
    </div>
  )
}

function ExpenseTypeDialog({ groups, onPersonal, onGroup, onClose }) {
  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')]
      .filter((element) => element.type !== 'hidden' && element.type !== 'file')
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section className="expense-dialog expense-type-dialog" role="dialog" aria-modal="true" aria-labelledby="expense-type-title" onClick={(event) => event.stopPropagation()} onKeyDown={handleDialogKeyDown}>
        <div className="dialog-heading">
          <div><p className="eyebrow">First, choose its place</p><h2 id="expense-type-title">Is this personal or group?</h2></div>
          <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button>
        </div>
        <p className="supporting-copy">Personal expenses stay in your own finances. Shared expenses are recorded in a group and split between its members.</p>
        <div className="expense-type-options">
          <button autoFocus type="button" className="expense-type-option" onClick={onPersonal}>
            <span className="soft-icon"><Wallet size={19} /></span>
            <span><strong>Personal</strong><small>Just for your finances</small></span>
            <ArrowRight size={17} />
          </button>
          <button type="button" className="expense-type-option" onClick={onGroup}>
            <span className="soft-icon"><Users size={19} /></span>
            <span><strong>Group</strong><small>{groups.length ? 'Share with group members' : 'Create a group to get started'}</small></span>
            <ArrowRight size={17} />
          </button>
        </div>
      </section>
    </div>
  )
}

function GroupExpenseDialog({ groups, onClose, onSave }) {
  const [groupId, setGroupId] = useState('')
  const group = groups.find((item) => item.id === groupId)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [date, setDate] = useState(todayISO())
  const [paidById, setPaidById] = useState('')
  const [participants, setParticipants] = useState([])
  const [splitType, setSplitType] = useState('equal')
  const [participantShares, setParticipantShares] = useState({})
  const [receipt, setReceipt] = useState(null)
  const [receiptError, setReceiptError] = useState('')
  const [error, setError] = useState('')

  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')]
      .filter((element) => element.type !== 'hidden' && element.type !== 'file')
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  const selectGroup = (nextGroupId) => {
    const nextGroup = groups.find((item) => item.id === nextGroupId)
    setGroupId(nextGroupId)
    setPaidById('')
    setParticipants(nextGroup?.members.map((member) => member.id) ?? [])
    setParticipantShares({})
    setError('')
  }

  const submit = async (event) => {
    event.preventDefault()
    const numericAmount = Number(amount)
    if (!group || !group.members.length) {
      setError('Choose a group with at least one member.')
      return
    }
    if (!title.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0 || !date ||
      !group.members.some((member) => member.id === paidById) || !participants.length) {
      setError('Enter the expense details, choose who paid, and select at least one participant.')
      return
    }

    const shares = splitType === 'custom'
      ? Object.fromEntries(participants.map((id) => [id, Number(participantShares[id])]))
      : undefined
    if (shares) {
      const valid = Object.values(shares).every((share) => Number.isFinite(share) && share >= 0)
      const sharesCents = Object.values(shares).reduce((sum, share) => sum + Math.round(share * 100), 0)
      if (!valid || sharesCents !== Math.round(numericAmount * 100)) {
        setError('Custom shares must be valid amounts that add up to the full expense.')
        return
      }
    }

    const expense = {
      id: makeId(),
      title: title.trim(),
      amount: numericAmount,
      category,
      date,
      paidById,
      participantIds: participants,
      splitType,
      ...(shares ? { participantShares: shares } : {}),
      ...(receipt ? { receipt } : {}),
    }
    const saved = await onSave({ groupId, expense })
    if (!saved) setError('Could not save this shared expense to this device. Try again.')
  }

  const toggleParticipant = (memberId) => {
    setParticipants((current) => current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId])
    setParticipantShares((current) => ({ ...current, [memberId]: current[memberId] ?? '' }))
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section className="expense-dialog group-expense-dialog" role="dialog" aria-modal="true" aria-labelledby="group-expense-title" onClick={(event) => event.stopPropagation()} onKeyDown={handleDialogKeyDown}>
        <div className="dialog-heading">
          <div><p className="eyebrow">Shared spending</p><h2 id="group-expense-title">Add a group expense</h2></div>
          <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button>
        </div>
        {groups.length === 0 ? (
          <div className="empty-group-expense">
            <p>You don’t have a group yet. Create one in Groups, add members, then come back to record a shared expense.</p>
            <div className="dialog-actions"><button autoFocus className="button button-secondary" type="button" onClick={onClose}>Cancel</button><NavLink className="button button-primary" to="/groups" onClick={onClose}>Go to Groups</NavLink></div>
          </div>
        ) : (
          <form className="dialog-form group-expense-form" onSubmit={submit}>
            <label className="field"><span>Choose a group</span><select autoFocus value={groupId} onChange={(event) => selectGroup(event.target.value)} required><option value="">Select a group…</option>{groups.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            {group && <>
              {!group.members.length ? <p className="supporting-copy">Add members to this group before recording a shared expense.</p> : <>
                <label className="field"><span>What was it for?</span><input type="text" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required /></label>
                <CategorySelect value={category} onChange={setCategory} id="group-expense-category" />
                <div className="form-grid">
                  <label className="field"><span>Amount (₹)</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
                  <label className="field"><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
                </div>
                <label className="field"><span>Who paid?</span><select value={paidById} onChange={(event) => setPaidById(event.target.value)} required><option value="">Choose a member…</option>{group.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
                <fieldset className="participants-field"><legend>Who took part?</legend><div className="participant-options">{group.members.map((member) => <label className="participant-option" key={member.id}><input type="checkbox" checked={participants.includes(member.id)} onChange={() => toggleParticipant(member.id)} /><span>{member.name}</span></label>)}</div></fieldset>
                <fieldset className="participants-field"><legend>How should it be split?</legend><div className="participant-options"><label className="participant-option"><input type="radio" name="new-group-split" checked={splitType === 'equal'} onChange={() => setSplitType('equal')} /><span>Split equally</span></label><label className="participant-option"><input type="radio" name="new-group-split" checked={splitType === 'custom'} onChange={() => setSplitType('custom')} /><span>Custom amounts</span></label></div></fieldset>
                {splitType === 'custom' && <div className="custom-share-fields">{group.members.filter((member) => participants.includes(member.id)).map((member) => <label className="field" key={member.id}><span>{member.name}’s share</span><span className="amount-input-wrap"><span>₹</span><input type="number" min="0" step="0.01" value={participantShares[member.id] ?? ''} onChange={(event) => setParticipantShares((current) => ({ ...current, [member.id]: event.target.value }))} required /></span></label>)}<p className="split-hint">Shares must add up to {formatMoney(Number(amount) || 0)}.</p></div>}
                <div className="field"><span>Receipt photo <span className="optional">(optional)</span></span><ReceiptField receipt={receipt} onChange={setReceipt} onError={setReceiptError} />{receiptError && <p className="field-error" role="alert">{receiptError}</p>}</div>
                {error && <p className="field-error" role="alert">{error}</p>}
              </>}
            </>}
            {!group && error && <p className="field-error" role="alert">{error}</p>}
            <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!group || !group.members.length}><Plus size={16} /> Add group expense</button></div>
          </form>
        )}
      </section>
    </div>
  )
}

function ExpenseDialog({ expense, onClose, onSave }) {
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
  const [category, setCategory] = useState(expense?.category ?? CATEGORIES[0])
  const [date, setDate] = useState(expense?.date ?? todayISO())
  const [note, setNote] = useState(expense?.note ?? '')
  const [receipt, setReceipt] = useState(expense?.receipt ?? null)
  const [receiptError, setReceiptError] = useState('')
  const [formError, setFormError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError('Enter an amount greater than zero.')
      return
    }
    if (!date) {
      setFormError('Choose the date this expense happened.')
      return
    }
    const saved = await onSave({
      id: expense?.id ?? makeId(),
      amount: numericAmount,
      category,
      date,
      note: note.trim(),
      createdAt: expense?.createdAt ?? new Date().toISOString(),
      ...(expense?.recurringId ? { recurringId: expense.recurringId } : {}),
      ...(expense?.importedTransactionId ? { importedTransactionId: expense.importedTransactionId } : {}),
      ...(receipt ? { receipt } : {}),
    })
    if (!saved) setFormError('Could not save your expense to this device. Check the storage warning and try again.')
  }

  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')]
      .filter((element) => element.type !== 'hidden' && element.type !== 'file')
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section className="expense-dialog" role="dialog" aria-modal="true" aria-labelledby="expense-dialog-title" onClick={(event) => event.stopPropagation()} onKeyDown={handleDialogKeyDown}>
        <div className="dialog-heading">
          <div><p className="eyebrow">{expense ? 'A quick little update' : 'Keep it in the picture'}</p><h2 id="expense-dialog-title">{expense ? 'Edit expense' : 'Add an expense'}</h2></div>
          <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button>
        </div>
        <form className="dialog-form" onSubmit={submit}>
          <label className="field amount-field">
            <span>How much was it?</span>
            <span className="amount-input-wrap"><span aria-hidden="true">₹</span><input autoFocus type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} required /></span>
          </label>
          <CategorySelect value={category} onChange={setCategory} />
          <label className="field"><span>When did it happen?</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
          <label className="field"><span>A little note <span className="optional">(optional)</span></span><input type="text" placeholder="e.g. Coffee with a friend" value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} /></label>
          <div className="field"><span>Receipt photo <span className="optional">(optional)</span></span><ReceiptField receipt={receipt} onChange={setReceipt} onError={setReceiptError} />{receiptError && <p className="field-error" role="alert">{receiptError}</p>}</div>
          {formError && <p className="field-error" role="alert">{formError}</p>}
          <div className="dialog-actions">
            <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button button-primary" type="submit">{expense ? 'Save changes' : <><Plus size={17} /> Add expense</>}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function PageRoutes({ data, saveData, storageError, clearStorageError, session, onSignOut }) {
  return (
    <AppShell data={data} saveData={saveData} storageError={storageError} clearStorageError={clearStorageError} session={session}>
      {({ data: appData, saveData: persist, setExpenseDialog, onDeleteExpense, onExport, onExportCsv, onExportPdf, onImport }) => (
        <Suspense fallback={<p role="status">Loading page…</p>}>
        <Routes>
          <Route path="/" element={<HomePage data={appData} setExpenseDialog={setExpenseDialog} onDeleteExpense={onDeleteExpense} />} />
          <Route path="/groups" element={<GroupsPage data={appData} saveData={persist} userId={session.user.id} />} />
          <Route path="/groups/:groupId" element={<GroupDetailPage data={appData} saveData={persist} userId={session.user.id} />} />
          <Route path="/activity" element={<ActivityPage data={appData} />} />
          <Route path="/personal" element={<PersonalPage data={appData} setExpenseDialog={setExpenseDialog} onDeleteExpense={onDeleteExpense} />} />
          <Route path="/history" element={<HistoryPage data={appData} setExpenseDialog={setExpenseDialog} onDeleteExpense={onDeleteExpense} />} />
          <Route path="/budget" element={<BudgetPage data={appData} saveData={persist} />} />
          <Route path="/analytics" element={<AnalyticsPage data={appData} saveData={persist} />} />
          <Route path="/calendar" element={<CalendarPage data={appData} />} />
          <Route path="/recurring" element={<RecurringPage data={appData} saveData={persist} userId={session.user.id} />} />
          <Route path="/settings" element={<SettingsPage data={appData} saveData={persist} onExport={onExport} onExportCsv={onExportCsv} onExportPdf={onExportPdf} onImport={onImport} />} />
          <Route path="/account" element={<AccountPage user={session.user} onSignOut={onSignOut} />} />
          <Route path="*" element={<HomePage data={appData} setExpenseDialog={setExpenseDialog} onDeleteExpense={onDeleteExpense} />} />
        </Routes>
        </Suspense>
      )}
    </AppShell>
  )
}

function AuthenticatedRoutes({ data, saveData, storageError, clearStorageError, session, onSignOut, authError }) {
  const location = useLocation()
  if (location.pathname === '/reset-password') return <Suspense fallback={<div className="loading-screen"><span className="loading-mark">₹</span><p>Preparing password reset…</p></div>}><AuthPage key={location.pathname} initialMode="reset" initialError={authError} /></Suspense>
  if (!session) return <Suspense fallback={<div className="loading-screen"><span className="loading-mark">₹</span><p>Preparing your account…</p></div>}><AuthPage key={location.pathname} initialError={authError} /></Suspense>
  return <PageRoutes data={data} saveData={saveData} storageError={storageError} clearStorageError={clearStorageError} session={session} onSignOut={onSignOut} />
}

function AccountApp({ session, onSignOut }) {
  const [data, setData] = useState(null)
  const [storageError, setStorageError] = useState('')
  const dataRef = useRef(null)
  const saveQueue = useRef(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const storedData = await loadAppData(session.user.id)
      dataRef.current = storedData
      setData(storedData)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Your browser could not open local storage.')
    } finally {
      setLoading(false)
    }
  }, [session.user.id])

  useEffect(() => {
    let active = true
    loadAppData(session.user.id)
      .then((storedData) => {
        if (!active) return
        dataRef.current = storedData
        setData(storedData)
      })
      .catch((error) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Your browser could not open local storage.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [session.user.id])

  const saveData = (updater) => {
    if (!saveQueue.current) {
      saveQueue.current = createSaveQueue({
        read: () => dataRef.current,
        write: (next) => writeAppData(next, session.user.id),
        commit: (next) => {
          dataRef.current = next
          setData(next)
          setStorageError('')
        },
        onError: (error) => setStorageError(error.message),
      })
    }
    return saveQueue.current(updater)
  }

  if (loading) {
    return <div className="loading-screen"><span className="loading-mark">₹</span><p>Making room for a little more clarity…</p></div>
  }

  if (loadError) {
    return (
      <main className="storage-error-screen">
        <span className="privacy-icon"><ShieldCheck size={22} /></span>
        <h1>Your data is still yours.</h1>
        <p>Spendly needs permission to use this browser’s local storage to open your information.</p>
        <p className="field-error">{loadError}</p>
        <button className="button button-primary" type="button" onClick={loadData}>Try again <ArrowRight size={17} /></button>
      </main>
    )
  }

  return <AuthenticatedRoutes data={data ?? emptyAppData()} saveData={saveData}
    storageError={storageError} clearStorageError={() => setStorageError('')}
    session={session} onSignOut={onSignOut} />
}

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let authEventSeen = false
    let active = true
    let unsubscribe = () => {}
    import('./lib/supabase').then(({ supabase, supabaseConfigurationError }) => {
      if (!active) return
      if (!supabase) {
        setAuthError(supabaseConfigurationError)
        setAuthLoading(false)
        return
      }
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        authEventSeen = true
        if (active) {
          setSession(nextSession)
          setAuthError('')
          setAuthLoading(false)
        }
      })
      unsubscribe = () => subscription.unsubscribe()
      return supabase.auth.getSession().then(({ data: sessionData, error }) => {
        if (!active || authEventSeen) return
        if (error) {
          setAuthError(error.message)
        } else {
          setSession(sessionData.session)
        }
        setAuthLoading(false)
      })
    }).catch((error) => {
      if (!active || authEventSeen) return
      setAuthError(error instanceof Error ? error.message : 'Could not check your sign-in status.')
      setAuthLoading(false)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const signOut = async () => {
    const { supabase } = await import('./lib/supabase')
    if (!supabase) throw new Error('Authentication is not configured.')
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return <BrowserRouter>
    {authLoading ? <div className="loading-screen"><p>Checking your account…</p></div>
      : session ? <AccountApp key={session.user.id} session={session} onSignOut={signOut} />
        : <AuthenticatedRoutes session={null} authError={authError} />}
  </BrowserRouter>
}

export default App
