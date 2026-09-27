export function formatMoney(amount, options = {}) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: options.decimals ? 2 : 0,
    minimumFractionDigits: 0,
  }).format(amount)
}

export function formatMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  })
}

export function formatDate(date, options = {}) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: options.short ? 'short' : 'long',
    year: options.year === false ? undefined : 'numeric',
  })
}

export function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function todayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function makeId() {
  return crypto.randomUUID()
}

export function validateReceipt(receipt) {
  if (receipt == null) return true
  return (
    typeof receipt === 'object' &&
    typeof receipt.name === 'string' &&
    typeof receipt.dataUrl === 'string' &&
    receipt.dataUrl.length <= 2_000_000 &&
    /^data:image\/(?:jpeg|png|webp);base64,/.test(receipt.dataUrl)
  )
}

export async function compressReceipt(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Choose an image file for the receipt.')
  if (file.size > 12 * 1024 * 1024) throw new Error('Receipt images must be smaller than 12 MB.')

  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') reject(new Error('The receipt image could not be read.'))
      else resolve(reader.result)
    }
    reader.onerror = () => reject(new Error('The receipt image could not be read.'))
    reader.readAsDataURL(file)
  })

  const image = await new Promise((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('The selected file is not a valid image.'))
    element.src = source
  })

  const scale = Math.min(1, 1600 / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot process the receipt image.')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const compressed = await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The receipt image could not be compressed.'))
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result !== 'string') reject(new Error('The compressed image could not be saved.'))
        else resolve(reader.result)
      }
      reader.onerror = () => reject(new Error('The compressed image could not be saved.'))
      reader.readAsDataURL(blob)
    }, 'image/jpeg', 0.78)
  })

  if (compressed.length > 2_000_000) throw new Error('This image is too detailed to store. Choose a smaller receipt image.')
  return { name: file.name, dataUrl: compressed }
}
