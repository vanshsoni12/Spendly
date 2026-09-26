import { useRef, useState } from 'react'
import {
  BookOpen,
  BusFront,
  Clapperboard,
  Ellipsis,
  HeartPulse,
  ReceiptIndianRupee,
  ImagePlus,
  ShoppingBag,
  Utensils,
  X,
} from 'lucide-react'
import { CATEGORIES } from './data'
import { compressReceipt } from './utils'

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
