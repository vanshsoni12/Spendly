import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ClipboardList,
  LayoutDashboard,
  Plus,
  Repeat,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { CategorySelect, ReceiptField } from './components'
import { applyRecurringExpenses, CATEGORIES, emptyAppData, readAppData, validateBackup, writeAppData } from './data'
import { formatMoney, makeId, todayISO } from './utils'
import { AnalyticsPage, BudgetPage, CalendarPage, GroupsPage, HistoryPage, HomePage, RecurringPage, SettingsPage } from './pages'
import './App.css'

const navigation = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/history', label: 'History', icon: ClipboardList },
  { to: '/budget', label: 'Budgets', icon: BarChart3 },
  { to: '/analytics', label: 'Analytics', icon: TrendingUp },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const bottomNavigation = navigation.filter(({ to }) =>
  ['/', '/history', '/budget', '/groups', '/settings'].includes(to),
)

function AppShell({ data, saveData, storageError, clearStorageError, children }) {
  const [expenseDialog, setExpenseDialog] = useState(undefined)
  const [notice, setNotice] = useState(null)
  const [expenseDialogTrigger, setExpenseDialogTrigger] = useState(null)
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

  useEffect(() => {
    const currentPage = navigation.find((item) => item.to === location.pathname)?.label
    document.title = `${currentPage ? `${currentPage} · ` : ''}Rupee Wise`
  }, [location.pathname])

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
      link.download = `rupee-wise-backup-${todayISO()}.json`
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
      if (!window.confirm('Import this backup and replace all Rupee Wise data currently saved on this device?')) return
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
      <aside className="sidebar">
        <NavLink className="brand" to="/" aria-label="Rupee Wise home">
          <span className="brand-mark">₹</span>
          <span className="brand-name">rupee<span>wise</span><small>money, made mindful</small></span>
        </NavLink>

        <p className="nav-label">YOUR SPACE</p>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} key={to} to={to} end={end}>
              <Icon size={19} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>{label === 'Groups' && data.groups.length > 0 && <span className="nav-count">{data.groups.length}</span>}
            </NavLink>
          ))}
        </nav>

        <button className="sidebar-add button button-primary" type="button" onClick={openAddExpense}><Plus size={17} /> Add an expense</button>
        <div className="sidebar-spacer" />
        <div className="sidebar-privacy"><span className="privacy-icon"><ShieldCheck size={17} /></span><div><strong>Private by nature</strong><span>Your money stays yours.</span></div></div>
        <div className="sidebar-footer"><span className="sidebar-footer-dot" /> Stored securely on this device</div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <span className="topbar-context">{isHome ? 'YOUR PERSONAL MONEY SPACE' : 'YOUR FINANCIAL OVERVIEW'}</span>
          <div className="topbar-right">
            <span className="local-badge"><span /> All data stored locally</span>
            <NavLink className="topbar-avatar" to="/settings" aria-label="Go to settings">
              {data.settings.name.trim() ? data.settings.name.trim().charAt(0).toUpperCase() : <Wallet size={18} />}
            </NavLink>
          </div>
        </header>

        {storageError && <div className="storage-alert" role="alert"><ShieldCheck size={18} /><span><strong>Your latest changes aren’t backed up.</strong> {storageError}</span><button type="button" aria-label="Dismiss storage warning" onClick={clearStorageError}><X size={17} /></button></div>}
        {notice && <div className={`toast toast-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}><span>{notice.type === 'success' ? <Check size={17} /> : <X size={17} />}</span>{notice.text}<button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={15} /></button></div>}

        <main className="page-content" id="main-content">
          {typeof children === 'function' ? children({ data, saveData, setExpenseDialog: showExpenseDialog, onAddExpense: openAddExpense, onDeleteExpense: deleteExpense, onExport: exportBackup, onImport: importBackup }) : children}
        </main>

        <footer className="app-footer"><span>₹</span> A little more ease with your money, every day.</footer>
      </div>

      <nav className="bottom-nav" aria-label="Main navigation">
        {bottomNavigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink className={({ isActive }) => `bottom-nav-link ${isActive ? 'bottom-nav-active' : ''}`} key={to} to={to} end={end} aria-label={label}>
            <Icon size={19} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>
          </NavLink>
        ))}
      </nav>

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
                ? { ...group, expenses: [...group.expenses, groupExpense.expense] }
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

function PageRoutes({ data, saveData, storageError, clearStorageError }) {
  return (
    <AppShell data={data} saveData={saveData} storageError={storageError} clearStorageError={clearStorageError}>
      {({ data: appData, saveData: persist, setExpenseDialog, onAddExpense, onDeleteExpense, onExport, onImport }) => (
        <Routes>
          <Route path="/" element={<HomePage data={appData} setExpenseDialog={setExpenseDialog} onAddExpense={onAddExpense} onDeleteExpense={onDeleteExpense} />} />
          <Route path="/history" element={<HistoryPage data={appData} setExpenseDialog={setExpenseDialog} onDeleteExpense={onDeleteExpense} />} />
          <Route path="/budget" element={<BudgetPage data={appData} saveData={persist} />} />
          <Route path="/analytics" element={<AnalyticsPage data={appData} saveData={persist} />} />
          <Route path="/calendar" element={<CalendarPage data={appData} onAddExpense={onAddExpense} />} />
          <Route path="/recurring" element={<RecurringPage data={appData} saveData={persist} />} />
          <Route path="/groups" element={<GroupsPage data={appData} saveData={persist} onAddExpense={onAddExpense} />} />
          <Route path="/settings" element={<SettingsPage data={appData} saveData={persist} onExport={onExport} onImport={onImport} />} />
          <Route path="*" element={<HomePage data={appData} setExpenseDialog={setExpenseDialog} onAddExpense={onAddExpense} onDeleteExpense={onDeleteExpense} />} />
        </Routes>
      )}
    </AppShell>
  )
}

function App() {
  const [data, setData] = useState(null)
  const [storageError, setStorageError] = useState('')
  const dataRef = useRef(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const storedData = applyRecurringExpenses(await readAppData())
      await writeAppData(storedData)
      dataRef.current = storedData
      setData(storedData)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Your browser could not open local storage.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    readAppData()
      .then((loadedData) => {
        const storedData = applyRecurringExpenses(loadedData)
        return writeAppData(storedData).then(() => storedData)
      })
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
  }, [])

  const saveData = async (updater) => {
    if (!dataRef.current) {
      setStorageError('Local data has not finished loading yet. Please try again.')
      return false
    }
    const updatedData = typeof updater === 'function' ? updater(dataRef.current) : updater
    dataRef.current = updatedData
    setData(updatedData)
    try {
      await writeAppData(updatedData)
      setStorageError('')
      return true
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Your browser could not save local data.'
      setStorageError(detail)
      return false
    }
  }

  if (loading) {
    return <div className="loading-screen"><span className="loading-mark">₹</span><p>Making room for a little more clarity…</p></div>
  }

  if (loadError) {
    return (
      <main className="storage-error-screen">
        <span className="privacy-icon"><ShieldCheck size={22} /></span>
        <h1>Your data is still yours.</h1>
        <p>Rupee Wise needs permission to use this browser’s local storage to open your information.</p>
        <p className="field-error">{loadError}</p>
        <button className="button button-primary" type="button" onClick={loadData}>Try again <ArrowRight size={17} /></button>
      </main>
    )
  }

  return (
    <BrowserRouter>
      <PageRoutes data={data ?? emptyAppData()} saveData={saveData} storageError={storageError} clearStorageError={() => setStorageError('')} />
    </BrowserRouter>
  )
}

export default App
