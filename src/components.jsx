import { useRef, useState } from 'react'
import {
  BookOpen,
  BusFront,
  Clapperboard,
  Ellipsis,
  HeartPulse,
  HandCoins,
  ReceiptIndianRupee,
  ImagePlus,
  Plus,
  ShoppingBag,
  Utensils,
  Users,
  X,
} from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { CATEGORIES } from './data'
import { formatDate, formatMoney, compressReceipt } from './utils'

const categoryIcons = {
  food: Utensils,
  travel: BusFront,
  shopping: ShoppingBag,
  bills: ReceiptIndianRupee,
  entertainment: Clapperboard,
  education: BookOpen,
  health: HeartPulse,
  other: Ellipsis,
}

const categoryColors = {
  food: 'peach',
  travel: 'blue',
  shopping: 'pink',
  bills: 'lavender',
  entertainment: 'yellow',
  education: 'mint',
  health: 'rose',
  other: 'slate',
}

export function CategoryIcon({ category, size = 20 }) {
  const Icon = categoryIcons[category] ?? Ellipsis
  return (
    <span className={`category-icon category-${categoryColors[category] ?? 'slate'}`}>
      <Icon size={size} strokeWidth={1.8} aria-hidden="true" />
    </span>
  )
}

export function CategorySelect({ value, onChange, id = 'expense-category' }) {
  return (
    <label className="field">
      <span>Category</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {CATEGORIES.map((category) => (
          <option value={category} key={category}>
            {category[0].toUpperCase() + category.slice(1)}
          </option>
        ))}
      </select>
    </label>
  )
}

export function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  )
}

export function BottomNavigation({ items }) {
  const { pathname } = useLocation()
  const isPersonalRoute = ['/personal', '/history', '/budget', '/analytics', '/calendar', '/recurring'].includes(pathname)
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink className={({ isActive }) => `bottom-nav-link ${(label === 'Personal' ? isPersonalRoute : isActive) ? 'bottom-nav-active' : ''}`} key={to} to={to} end={end} aria-label={label}>
          <Icon size={19} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function FloatingAddExpense({ onClick }) {
  return (
    <button className="floating-add-expense" type="button" onClick={onClick}>
      <Plus size={21} strokeWidth={2.4} /><span>Add expense</span>
    </button>
  )
}

export function BalanceSummary({ balance = null, label = 'Overall group balance', hint }) {
  const known = balance != null
  const owed = balance > 0.005
  const owes = balance < -0.005
  return (
    <section className={`balance-summary ${owed ? 'balance-summary-owed' : owes ? 'balance-summary-owes' : ''}`} aria-label={label}>
      <span className="balance-summary-icon"><HandCoins size={19} /></span>
      <div>
        <p>{label}</p>
        <strong>{known ? owed ? 'You are owed' : owes ? 'You owe' : 'All settled' : 'Set your name to see your balance'}</strong>
        {known && <b>{formatMoney(Math.abs(balance))}</b>}
        {hint && <small>{hint}</small>}
      </div>
    </section>
  )
}

export function GroupListItem({ group, balance = null, memberBalances = [] }) {
  const known = balance != null
  const owing = balance < -0.005
  const owed = balance > 0.005
  return (
    <Link className="group-list-item" to={`/groups/${group.id}`}>
      <span className="group-list-avatar"><Users size={19} /></span>
      <span className="group-list-main">
        <strong>{group.name}</strong>
        <small>{group.members.length} {group.members.length === 1 ? 'member' : 'members'} · {group.expenses.length} {group.expenses.length === 1 ? 'expense' : 'expenses'}</small>
        {memberBalances.length > 0 && <span className="group-list-members">{memberBalances.slice(0, 3).map(({ member, balance: memberBalance }) => <span key={member.id}>{member.name}: {memberBalance > 0.005 ? 'gets ' : memberBalance < -0.005 ? 'owes ' : ''}{formatMoney(Math.abs(memberBalance))}</span>)}</span>}
      </span>
      <span className={`group-list-balance ${owed ? 'balance-credit' : owing ? 'balance-debt' : ''}`}>
        <strong>{known ? owed ? 'You are owed' : owing ? 'You owe' : 'All settled' : 'Balance unavailable'}</strong>
        {known && <b>{formatMoney(Math.abs(balance))}</b>}
      </span>
    </Link>
  )
}

export function MemberBalance({ member, balance }) {
  const gets = balance > 0.005
  const owes = balance < -0.005
  return (
    <div className="member-balance-item">
      <span className="member-initial">{member.name.trim().charAt(0).toUpperCase()}</span>
      <span className="member-balance-name">{member.name}</span>
      <span className={`member-balance ${gets ? 'balance-credit' : owes ? 'balance-debt' : ''}`}>
        {gets ? 'gets ' : owes ? 'owes ' : ''}{formatMoney(Math.abs(balance))}
      </span>
    </div>
  )
}

export function TransactionItem({ date, category = 'other', title, subtitle, amount, result, receipt, actions }) {
  return (
    <article className="transaction-item">
      <span className="transaction-date">{formatDate(date, { short: true })}</span>
      <CategoryIcon category={category} size={19} />
      <span className="transaction-copy"><strong>{title}</strong><small>{subtitle}</small>{receipt && <ReceiptThumbnail receipt={receipt} />}</span>
      <span className="transaction-value"><strong>{formatMoney(amount)}</strong>{result && <small>{result}</small>}</span>
      {actions && <span className="transaction-actions">{actions}</span>}
    </article>
  )
}

export function ActivityItem({ date, createdAt, category = 'other', title, detail, amount, tone = 'neutral' }) {
  const eventTime = createdAt && Number.isFinite(new Date(createdAt).getTime())
    ? new Date(createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : ''
  return (
    <article className="activity-item">
      <time className="activity-date" dateTime={eventTime ? createdAt : date}>{formatDate(date, { short: true })}{eventTime && <small>{eventTime}</small>}</time>
      <CategoryIcon category={category} size={18} />
      <span className="activity-copy"><strong>{title}</strong><small>{detail}</small></span>
      {amount != null && <strong className={`activity-amount activity-${tone}`}>{formatMoney(Math.abs(amount))}</strong>}
    </article>
  )
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{Icon && <Icon size={24} aria-hidden="true" />}</span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function ReceiptField({ receipt, onChange, onError }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const chooseFile = async (event) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setBusy(true)
    try {
      onChange(await compressReceipt(file))
      onError('')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'The receipt image could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="receipt-field">
      <input ref={inputRef} className="visually-hidden" type="file" accept="image/*" onChange={chooseFile} aria-label="Choose a receipt image" />
      {receipt ? (
        <div className="receipt-preview">
          <a href={receipt.dataUrl} target="_blank" rel="noreferrer" aria-label={`View receipt image ${receipt.name}`}>
            <img src={receipt.dataUrl} alt={`Receipt: ${receipt.name}`} />
          </a>
          <div><strong>Receipt attached</strong><small>{receipt.name}</small></div>
          <div className="receipt-field-actions">
            <button className="receipt-action-button" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>Replace</button>
            <button className="icon-button small delete-button" type="button" onClick={() => { onChange(null); onError('') }} aria-label="Remove receipt image"><X size={15} /></button>
          </div>
        </div>
      ) : (
        <button className="receipt-upload-button" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          <ImagePlus size={17} />
          <span>{busy ? 'Preparing image…' : 'Attach receipt photo'}</span>
          <small>Private on this device</small>
        </button>
      )}
    </div>
  )
}

export function ReceiptThumbnail({ receipt }) {
  if (!receipt?.dataUrl) return null
  return (
    <a className="receipt-thumbnail" href={receipt.dataUrl} target="_blank" rel="noreferrer" aria-label={`View receipt: ${receipt.name}`}>
      <img src={receipt.dataUrl} alt={`Receipt: ${receipt.name}`} />
    </a>
  )
}
