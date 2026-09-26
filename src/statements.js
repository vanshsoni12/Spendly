const MAX_STATEMENT_SIZE = 10 * 1024 * 1024

function parseCsvRows(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(cell.trim())
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell.trim())
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }

  if (quoted) throw new Error('The CSV has an unclosed quoted field.')
  row.push(cell.trim())
  if (row.some((value) => value !== '')) rows.push(row)
  return rows
}

function parseStatementDate(value) {
  const normalized = value.trim()
  let match = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (match) {
    const [, year, month, day] = match
    return validDateParts(Number(year), Number(month), Number(day))
  }

  match = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (match) {
    const [, day, month, year] = match
    return validDateParts(Number(year), Number(month), Number(day))
  }

  return null
}

function validDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseAmount(value) {
  const normalized = value.replace(/[₹,\s]/g, '').replace(/^\((.*)\)$/, '-$1')
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : null
}

function fingerprint(text, occurrence = 0) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `bank-${(hash >>> 0).toString(16)}-${occurrence}`
}

function parseCsv(text) {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''))
  const headerIndex = rows.findIndex((row) => row.some((cell) => /date|narration|description|particular|amount|debit|withdrawal|credit/i.test(cell)))
  if (headerIndex < 0) throw new Error('Could not find a CSV header row. Include date, description, and amount columns.')

  const headers = rows[headerIndex].map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ''))
  const column = (...aliases) => headers.findIndex((header) => aliases.some((alias) => header === alias || header.includes(alias)))
  const dateIndex = column('date', 'transactiondate', 'valuedate', 'posteddate')
  const descriptionIndex = column('description', 'narration', 'particular', 'details', 'memo', 'name')
  const amountIndex = column('amount', 'transactionamount', 'trnamt')
  const debitIndex = column('debit', 'withdrawal', 'paidout', 'moneyout')
  const creditIndex = column('credit', 'deposit', 'paidin', 'moneyin')
  if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
    throw new Error('CSV needs a date, description, and amount (or debit/credit) column.')
  }

  const rowsSeen = new Map()
  const transactions = []
  let skipped = 0
  for (const values of rows.slice(headerIndex + 1)) {
    const date = parseStatementDate(values[dateIndex] ?? '')
    const description = (values[descriptionIndex] ?? '').trim()
    let amount = null
    let type = 'expense'
    if (amountIndex >= 0 && values[amountIndex]?.trim()) {
      amount = parseAmount(values[amountIndex])
      if (amount != null && amount > 0) type = 'income'
    } else {
      const debit = debitIndex >= 0 ? parseAmount(values[debitIndex] ?? '') : null
      const credit = creditIndex >= 0 ? parseAmount(values[creditIndex] ?? '') : null
      if (debit != null && debit > 0) amount = debit
      else if (credit != null && credit > 0) {
        amount = credit
        type = 'income'
      }
    }
    if (!date || !description || amount == null || amount === 0) {
      skipped += 1
      continue
    }
    amount = Math.abs(amount)
    const raw = values.join('|')
    const occurrence = rowsSeen.get(raw) ?? 0
    rowsSeen.set(raw, occurrence + 1)
    transactions.push({ fingerprint: fingerprint(raw, occurrence), date, description, amount, type })
  }
  return { transactions, skipped }
}

function getOfxTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([^\\r\\n<]+)`, 'i'))
  return match?.[1]?.trim() ?? ''
}

function parseOfxDate(value) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!match) return null
  return validDateParts(Number(match[1]), Number(match[2]), Number(match[3]))
}

function parseOfx(text) {
  const blocks = text.match(/<STMTTRN\b[^>]*>[\s\S]*?(?=<STMTTRN\b|<\/BANKTRANLIST|$)/gi) ?? []
  if (!blocks.length) throw new Error('No bank transactions were found in this OFX/QFX file.')

  const rowsSeen = new Map()
  const transactions = []
  let skipped = 0
  for (const block of blocks) {
    const date = parseOfxDate(getOfxTag(block, 'DTPOSTED'))
    const rawAmount = parseAmount(getOfxTag(block, 'TRNAMT'))
    const description = getOfxTag(block, 'NAME') || getOfxTag(block, 'MEMO')
    if (!date || rawAmount == null || rawAmount === 0 || !description) {
      skipped += 1
      continue
    }
    const fitId = getOfxTag(block, 'FITID')
    const raw = fitId || block.replace(/\s+/g, ' ').trim()
    const occurrence = rowsSeen.get(raw) ?? 0
    rowsSeen.set(raw, occurrence + 1)
    transactions.push({
      fingerprint: fingerprint(raw, occurrence),
      date,
      description,
      amount: Math.abs(rawAmount),
      type: rawAmount < 0 ? 'expense' : 'income',
    })
  }
  return { transactions, skipped }
}

export async function parseBankStatement(file) {
  if (!file || file.size > MAX_STATEMENT_SIZE) {
    throw new Error('Choose a statement smaller than 10 MB.')
  }
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!['csv', 'ofx', 'qfx'].includes(extension)) {
    throw new Error('Choose a .csv, .ofx, or .qfx bank statement.')
  }
  const text = await file.text()
  return extension === 'csv' ? parseCsv(text) : parseOfx(text)
}
