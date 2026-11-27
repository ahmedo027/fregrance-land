import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { createAccountantService } from './accountant-service.js'
import { roundAed, shippingFeeForCountry } from './src/pricing.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(root, 'public')
const distDir = path.join(root, 'dist')
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'))
const uploadDir = path.join(dataDir, 'uploads')
const legacyUploadDir = path.join(publicDir, 'uploads')
const storePath = path.join(dataDir, 'store.json')
const port = Number(process.env.PORT || 3012)
const adminEmail = process.env.ADMIN_EMAIL || 'admin@fragranceland.local'
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
const sessionSecret = process.env.SESSION_SECRET || 'fragrance-land-local-secret-change-me'
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || ''
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
const openAiApiKey = String(process.env.OPENAI_API_KEY || '').trim()
const openAiModel = String(process.env.OPENAI_MODEL || 'gpt-5-mini').trim()
const accountantEnabled = !['false', '0', 'no', 'off'].includes(String(process.env.ACCOUNTANT_ENABLED ?? 'true').trim().toLowerCase())
const isProduction = process.env.NODE_ENV === 'production'
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null
const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
const supabaseSecretKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const supabaseStorageBucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'fragrance-products').trim() || 'fragrance-products'
const supabase = supabaseUrl && supabaseSecretKey
  ? createClient(supabaseUrl, supabaseSecretKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null
let memoryStore = null

fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(uploadDir, { recursive: true })

if (isProduction) {
  const missing = ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'SESSION_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SUPABASE_URL'].filter(key => !process.env[key])
  if (!supabaseSecretKey) missing.push('SUPABASE_SECRET_KEY')
  if (missing.length) throw new Error(`Missing production environment variables: ${missing.join(', ')}`)
  if (adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters in production.')
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters in production.')
}

const seedCategories = [
  { id: 'woody', nameEn: 'Woody', nameAr: 'خشبي' },
  { id: 'floral', nameEn: 'Floral', nameAr: 'زهري' },
  { id: 'fresh', nameEn: 'Fresh', nameAr: 'منعش' },
  { id: 'oriental', nameEn: 'Oriental', nameAr: 'شرقي' },
]

const demoProductIds = new Set(['santal-21', 'orange-blossom', 'velvet-oud', 'fig-leaf', 'iris-noir', 'sea-salt'])

function initialStore() {
  return {
    categories: seedCategories.map(category => ({ ...category })),
    products: [],
    orders: [],
    pendingCheckouts: [],
    externalSales: [],
  }
}

function normalizeSizeOption(size) {
  if (size && typeof size === 'object') return { value: Number(size.value), unit: size.unit === 'g' ? 'g' : 'ml' }
  return { value: Number(size), unit: 'ml' }
}

function normalizeSizes(input, fallback = [50, 75, 100]) {
  const source = Array.isArray(input) && input.length ? input : fallback
  const seen = new Set()
  return source.map(normalizeSizeOption).filter(size => Number.isInteger(size.value) && size.value > 0 && size.value <= 10000).filter(size => { const key = `${size.value}-${size.unit}`; if (seen.has(key)) return false; seen.add(key); return true })
}

function sizeKey(size) { const normalized = normalizeSizeOption(size); return `${normalized.value}-${normalized.unit}` }
function sizeLabel(size) { const normalized = normalizeSizeOption(size); return `${normalized.value} ${normalized.unit}` }
function normalizeDiscount(value) { const discount = Number(value || 0); return Number.isFinite(discount) ? Math.min(99, Math.max(0, Math.round(discount))) : 0 }
function normalizeMoney(value) { const amount = Number(value || 0); return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : 0 }
function productPrice(product) { return Number((Number(product.price) * (1 - normalizeDiscount(product.discountPercent) / 100)).toFixed(2)) }
function productUnitCost(product) { return normalizeMoney(product.productionCost) + normalizeMoney(product.packagingCost) }

function normalizeExternalSale(input, store) {
  const productId = String(input?.productId || '').trim()
  const product = store.products.find(item => item.id === productId)
  if (!product) throw new Error('Choose a valid product for the outside sale.')
  const quantity = Number(input?.quantity)
  const unitPrice = Number(input?.unitPrice)
  const date = String(input?.date || new Date().toISOString().slice(0, 10)).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error('Sale date is invalid.')
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) throw new Error('Sale quantity must be a whole number from 1 upward.')
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000) throw new Error('Sale price must be zero or greater.')
  const size = normalizeSizeOption(input?.size || product.sizes[0])
  if (!product.sizes.some(option => sizeKey(option) === sizeKey(size))) throw new Error('Choose a valid product size.')
  return {
    id: String(input?.id || crypto.randomUUID()),
    date,
    productId,
    size,
    quantity,
    unitPrice: normalizeMoney(unitPrice),
    total: normalizeMoney(unitPrice * quantity),
    notes: String(input?.notes || '').trim().slice(0, 500),
  }
}

function calculateAccountantSummary(store) {
  const products = store.products.map(product => ({
    id: product.id,
    name: product.name,
    image: product.images?.[0] || '',
    productionCost: normalizeMoney(product.productionCost),
    packagingCost: normalizeMoney(product.packagingCost),
    unitCost: normalizeMoney(productUnitCost(product)),
    websiteUnits: 0,
    externalUnits: 0,
    websiteRevenue: 0,
    externalRevenue: 0,
  }))
  const byId = new Map(products.map(product => [product.id, product]))
  let websiteOrderCount = 0
  let websiteProductRevenue = 0
  let shippingRevenue = 0
  for (const order of store.orders) {
    if (order.status === 'Cancelled' || (order.paymentStatus && order.paymentStatus !== 'Paid')) continue
    websiteOrderCount += 1
    shippingRevenue += normalizeMoney(order.shippingFee)
    for (const line of Array.isArray(order.lines) ? order.lines : []) {
      const product = byId.get(line.productId)
      if (!product) continue
      const quantity = Number(line.quantity) || 0
      const revenue = normalizeMoney((Number(line.price) || 0) * quantity)
      product.websiteUnits += quantity
      product.websiteRevenue += revenue
      websiteProductRevenue += revenue
    }
  }
  const externalSales = (Array.isArray(store.externalSales) ? store.externalSales : []).map(sale => {
    const product = byId.get(sale.productId)
    return {
      ...sale,
      quantity: Number(sale.quantity) || 0,
      unitPrice: normalizeMoney(sale.unitPrice),
      total: normalizeMoney(sale.total ?? (Number(sale.unitPrice) || 0) * (Number(sale.quantity) || 0)),
      productName: product?.name || 'Deleted product',
    }
  })
  let externalProductRevenue = 0
  let externalUnits = 0
  for (const sale of externalSales) {
    const product = byId.get(sale.productId)
    if (!product) continue
    product.externalUnits += sale.quantity
    product.externalRevenue += sale.total
    externalProductRevenue += sale.total
    externalUnits += sale.quantity
  }
  const productRows = products.map(product => {
    const totalUnits = product.websiteUnits + product.externalUnits
    const totalRevenue = normalizeMoney(product.websiteRevenue + product.externalRevenue)
    const estimatedCost = normalizeMoney(totalUnits * product.unitCost)
    return { ...product, totalUnits, totalRevenue, estimatedCost, estimatedProfit: normalizeMoney(totalRevenue - estimatedCost) }
  })
  const collectedRevenue = normalizeMoney(websiteProductRevenue + shippingRevenue + externalProductRevenue)
  const estimatedCost = normalizeMoney(productRows.reduce((sum, product) => sum + product.estimatedCost, 0))
  return {
    currency: 'AED',
    generatedAt: new Date().toISOString(),
    website: { orderCount: websiteOrderCount, units: productRows.reduce((sum, product) => sum + product.websiteUnits, 0), productRevenue: normalizeMoney(websiteProductRevenue), shippingRevenue, collectedRevenue: normalizeMoney(websiteProductRevenue + shippingRevenue) },
    external: { saleCount: externalSales.length, units: externalUnits, productRevenue: normalizeMoney(externalProductRevenue) },
    totals: { units: productRows.reduce((sum, product) => sum + product.totalUnits, 0), productRevenue: normalizeMoney(websiteProductRevenue + externalProductRevenue), shippingRevenue, collectedRevenue, estimatedCost, estimatedProfit: normalizeMoney(websiteProductRevenue + externalProductRevenue - estimatedCost) },
    products: productRows,
    externalSales,
  }
}

function openAiText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim()
  return (payload?.output || []).flatMap(item => item.content || []).map(item => item.text || '').filter(Boolean).join('\n').trim()
}

async function askAccountant(question, summary) {
  if (!openAiApiKey) throw new Error('OpenAI is not configured. Add OPENAI_API_KEY in Render environment variables.')
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiApiKey}` },
    body: JSON.stringify({
      model: openAiModel,
      instructions: 'You are the financial assistant for a small UAE fragrance and incense shop. Analyze only the supplied summary. Do not invent numbers. Use AED, explain that profit is estimated from entered product and packaging costs, and keep the answer concise with practical observations. Do not mention or request customer personal data.',
      input: `The shop owner asks: ${String(question || '').trim().slice(0, 2000)}\n\nAccountant summary:\n${JSON.stringify(summary)}`,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message || 'OpenAI request failed.')
  const answer = openAiText(payload)
  if (!answer) throw new Error('OpenAI returned an empty answer.')
  return answer
}

function parseAiJson(value) {
  const raw = String(value || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  try { return JSON.parse(raw) } catch {
    const start = raw.indexOf('{'); const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1))
    throw new Error('The AI action draft was not valid JSON.')
  }
}

async function prepareAccountantAction(question, summary) {
  if (!openAiApiKey) throw new Error('OpenAI is not configured. Add OPENAI_API_KEY in Render environment variables.')
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiApiKey}` },
    body: JSON.stringify({
      model: openAiModel,
      instructions: 'You are a bilingual Arabic/English financial assistant for a UAE fragrance shop. Never execute actions. Return only JSON with keys answer (string) and action (null or an object). Allowed action types are expense, outside_sale, material_purchase, production_batch. If the request is not an explicit record/create request, action must be null. Use only IDs and values supplied in the context; never invent missing IDs, quantities, prices or dates. If required details are missing, explain them in answer and return action null. All currency is AED.',
      input: `Owner request: ${String(question || '').trim().slice(0, 2000)}\n\nAvailable products and materials plus financial summary:\n${JSON.stringify({ products: summary.products.map(item => ({ id: item.id, name: item.name })), materials: summary.materials.map(item => ({ id: item.id, name: item.name, unit: item.unit, quantity: item.quantity })), summary })}`,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message || 'OpenAI request failed.')
  const parsed = parseAiJson(openAiText(payload))
  if (parsed.action && !['expense', 'outside_sale', 'material_purchase', 'production_batch'].includes(parsed.action.type)) parsed.action = null
  return { answer: textValue(parsed.answer || 'Review the draft before confirming.', 4000), action: parsed.action || null, model: openAiModel }
}

function textValue(value, max = 2000) { return String(value || '').trim().slice(0, max) }

function slugify(value) {
  return String(value || 'category').trim().toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') || `category-${Date.now()}`
}

function normalizeCategory(input, existing = {}) {
  const nameEn = String(input?.nameEn ?? existing.nameEn ?? '').trim().slice(0, 80)
  const nameAr = String(input?.nameAr ?? existing.nameAr ?? '').trim().slice(0, 80)
  if (!nameEn || !nameAr) throw new Error('Category needs both an English name and an Arabic name.')
  return { ...existing, ...input, id: existing.id || input.id || slugify(nameEn), nameEn, nameAr }
}

function migrateStore(store) {
  const categories = Array.isArray(store.categories) && store.categories.length ? store.categories : seedCategories.map(category => ({ ...category }))
  const byId = new Map(categories.map(category => [String(category.id), category]))
  const byName = new Map(categories.flatMap(category => [[String(category.nameEn).toLowerCase(), category.id], [String(category.nameAr), category.id]]))
  for (const product of store.products || []) {
    const current = String(product.category || '')
    if (byId.has(current)) continue
    const matchedId = byName.get(current.toLowerCase()) || byName.get(current)
    if (matchedId) { product.category = matchedId; continue }
    const custom = normalizeCategory({ nameEn: current || 'Uncategorized', nameAr: current || 'غير مصنف' })
    if (!byId.has(custom.id)) { categories.push(custom); byId.set(custom.id, custom); byName.set(custom.nameEn.toLowerCase(), custom.id); byName.set(custom.nameAr, custom.id) }
    product.category = custom.id
  }
  store.categories = categories.map(category => normalizeCategory(category))
  store.products = Array.isArray(store.products) ? store.products.filter(product => !demoProductIds.has(product.id)).map(product => ({ ...product, sizes: normalizeSizes(product.sizes), discountPercent: normalizeDiscount(product.discountPercent), productionCost: normalizeMoney(product.productionCost), packagingCost: normalizeMoney(product.packagingCost) })) : []
  store.orders = Array.isArray(store.orders) ? store.orders.map(order => ({ ...order, lines: Array.isArray(order.lines) ? order.lines.map(line => ({ ...line, size: normalizeSizeOption(line.size) })) : [] })) : []
  store.pendingCheckouts = Array.isArray(store.pendingCheckouts) ? store.pendingCheckouts : []
  store.externalSales = Array.isArray(store.externalSales) ? store.externalSales : []
  return store
}

function readFileStore() {
  if (!fs.existsSync(storePath)) {
    const fresh = initialStore()
    fs.writeFileSync(storePath, JSON.stringify(fresh, null, 2))
    return fresh
  }
  try {
    const store = JSON.parse(fs.readFileSync(storePath, 'utf8'))
    store.pendingCheckouts = Array.isArray(store.pendingCheckouts) ? store.pendingCheckouts : []
    const beforeMigration = JSON.stringify(store)
    const migrated = migrateStore(store)
    if (JSON.stringify(migrated) !== beforeMigration) fs.writeFileSync(storePath, JSON.stringify(migrated, null, 2))
    return migrated
  } catch { return initialStore() }
}

async function initializeStore() {
  if (supabase) {
    const { data, error } = await supabase.from('fragrance_land_state').select('data').eq('id', 'production').maybeSingle()
    if (error) throw new Error(`Supabase state read failed: ${error.message}`)
    const remoteStore = migrateStore(data?.data || initialStore())
    const localStore = readFileStore()
    const remoteIsBlank = !remoteStore.products.length && !remoteStore.orders.length && !remoteStore.pendingCheckouts.length
    const localHasAdminData = localStore.products.length || localStore.orders.length || localStore.pendingCheckouts.length || localStore.categories.length > seedCategories.length
    memoryStore = remoteIsBlank && localHasAdminData ? localStore : remoteStore
    if (!data || (remoteIsBlank && localHasAdminData)) await persistStore(memoryStore)
    return
  }
  memoryStore = readFileStore()
}

function readStore() { return memoryStore || readFileStore() }

async function persistStore(store) {
  const migrated = migrateStore(store)
  memoryStore = migrated
  if (supabase) {
    const { error } = await supabase.from('fragrance_land_state').upsert({ id: 'production', data: migrated, updated_at: new Date().toISOString() })
    if (error) throw new Error(`Supabase state write failed: ${error.message}`)
    return migrated
  }
  fs.writeFileSync(storePath, JSON.stringify(migrated, null, 2))
  return migrated
}

function writeStore(store) { return persistStore(store) }
const accountant = createAccountantService({ supabase, getStore: readStore, writeStore, getProducts: () => readStore().products, auditActor: adminEmail })
function json(res, status, payload) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(payload)) }
function noContent(res) { res.writeHead(204); res.end() }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(value => { const index = value.indexOf('='); return [value.slice(0, index).trim(), decodeURIComponent(value.slice(index + 1))] })) }
function tokenFor(email) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url')
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}
function currentAdmin(req) {
  const token = parseCookies(req).fl_session
  if (!token) return null
  const [payload, signature] = token.split('.')
  const expected = crypto.createHmac('sha256', sessionSecret).update(payload || '').digest('base64url')
  if (!payload || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  try { const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); return value.exp > Date.now() ? value : null } catch { return null }
}
function requireAdmin(req, res) { const admin = currentAdmin(req); if (!admin) { json(res, 401, { error: 'Admin authentication required.' }); return null } return admin }
const loginAttempts = new Map()
const preparedAiActions = new Map()
function clientAddress(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim() }
function allowLoginAttempt(req) {
  const key = clientAddress(req)
  const now = Date.now()
  const current = loginAttempts.get(key)
  if (!current || current.resetAt <= now) { loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 }); return true }
  if (current.count >= 8) return false
  current.count += 1
  return true
}
function clearLoginAttempts(req) { loginAttempts.delete(clientAddress(req)) }
function normalizeCustomer(input) {
  const customer = {
    name: String(input?.name || '').trim().slice(0, 120),
    email: String(input?.email || '').trim().toLowerCase().slice(0, 254),
    phone: String(input?.phone || '').trim().slice(0, 40),
    address: String(input?.address || '').trim().slice(0, 240),
    country: String(input?.country || '').trim(),
    countryName: String(input?.countryName || '').trim().slice(0, 100),
    notes: String(input?.notes || '').trim().slice(0, 1000),
  }
  if (!customer.name || !customer.phone || !customer.address || !['AE', 'OTHER'].includes(customer.country) || (customer.email && !/^\S+@\S+\.\S+$/.test(customer.email))) throw new Error('Complete valid customer details before checkout.')
  return customer
}
function orderLinesForStore(store, inputLines) {
  if (!Array.isArray(inputLines) || !inputLines.length || inputLines.length > 50) throw new Error('Add at least one product to the cart.')
  const requested = new Map()
  return inputLines.map(line => {
    const product = store.products.find(item => item.id === line.productId && item.active)
    if (!product) throw new Error('One of the selected products is unavailable.')
    const quantity = Number(line.quantity)
    const size = normalizeSizeOption(line.size || product.sizes[0])
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('Product quantity is invalid.')
    if (!product.sizes.some(option => sizeKey(option) === sizeKey(size))) throw new Error('Product size is invalid.')
    const totalRequested = (requested.get(product.id) || 0) + quantity
    if (totalRequested > product.stock) throw new Error(`${product.name} does not have enough stock.`)
    requested.set(product.id, totalRequested)
    return { productId: product.id, size, quantity, price: productPrice(product), unitCost: productUnitCost(product) }
  })
}
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk; if (raw.length > 12_000_000) req.destroy(new Error('Request too large.')) })
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch { reject(new Error('Invalid JSON.')) } })
    req.on('error', reject)
  })
}
function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => { size += chunk.length; if (size > 12_000_000) req.destroy(new Error('Request too large.')); else chunks.push(chunk) })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
async function safeImage(dataUrl) {
  if (!dataUrl?.startsWith('data:image/')) return dataUrl
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/)
  if (!match) throw new Error('Unsupported image format.')
  const extension = match[1] === 'jpeg' ? 'jpg' : match[1]
  const file = `${crypto.randomUUID()}.${extension}`
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length > 5 * 1024 * 1024) throw new Error('Product images must be 5 MB or smaller.')
  if (supabase) {
    const contentType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`
    const { error } = await supabase.storage.from(supabaseStorageBucket).upload(file, buffer, { contentType, upsert: false })
    if (error) throw new Error(`Supabase image upload failed: ${error.message}`)
    return supabase.storage.from(supabaseStorageBucket).getPublicUrl(file).data.publicUrl
  }
  fs.writeFileSync(path.join(uploadDir, file), buffer)
  return `/uploads/${file}`
}
async function normalizeProduct(input, existing = {}, categories = []) {
  const image = await safeImage(input.images?.[0] || existing.images?.[0])
  if (!image) throw new Error('A product image is required.')
  if (!/^https?:\/\//i.test(image) && !image.startsWith('/uploads/')) throw new Error('Product image must be an HTTPS URL or an uploaded image.')
  const name = String(input.name ?? existing.name ?? '').trim().slice(0, 120)
  const subtitle = String(input.subtitle ?? existing.subtitle ?? '').trim().slice(0, 180)
  const description = String(input.description ?? existing.description ?? '').trim().slice(0, 2000)
  const price = Number(input.price ?? existing.price)
  const stock = Number(input.stock ?? existing.stock)
  const sizes = normalizeSizes(input.sizes ?? existing.sizes)
  const discountPercent = normalizeDiscount(input.discountPercent ?? existing.discountPercent)
  const category = String(input.category || existing.category || 'woody')
  if (!name || !subtitle || !description) throw new Error('Product name, short description, and description are required.')
  if (!Number.isFinite(price) || price <= 0 || price > 1000000) throw new Error('Product price must be greater than 0.')
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) throw new Error('Product stock must be a whole number from 0 upward.')
  if (!categories.some(item => item.id === category)) throw new Error('Choose a valid category.')
  if (!sizes.length) throw new Error('Add at least one valid product size.')
  if (discountPercent < 0 || discountPercent > 99) throw new Error('Discount must be between 0 and 99 percent.')
  return {
    ...existing,
    ...input,
    id: existing.id || input.id || `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now()}`,
    name, subtitle, description, price, stock, notes: Array.isArray(input.notes) ? input.notes.map(note => String(note).trim().slice(0, 80)).filter(Boolean).slice(0, 20) : [],
    category, sizes, discountPercent, images: [image, image], active: input.active !== false,
    productionCost: normalizeMoney(input.productionCost ?? existing.productionCost), packagingCost: normalizeMoney(input.packagingCost ?? existing.packagingCost),
  }
}
function checkoutOrigin(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${port}`
  return `${protocol}://${host}`
}
async function recordWebsiteOrderMovements(order) {
  for (const [index, line] of (order.lines || []).entries()) {
    await accountant.recordMovement({ idempotencyKey: `website-order:${order.id}:${index}`, movementType: 'website_order', referenceId: order.id, inventoryKey: `product:${line.productId}`, productId: line.productId, sizeValue: line.size.value, sizeUnit: line.size.unit, quantityDelta: -line.quantity, unit: 'pieces', unitCost: 0 }).catch(error => console.error('Website inventory movement failed:', error.message))
  }
}

function newOrder(draft, paymentMethod, paymentStatus) {
  const now = new Date()
  return {
    id: `FL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    date: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' }),
    createdAt: now.toISOString(),
    customer: draft.customer,
    lines: draft.lines,
    shippingFee: draft.shippingFee,
    total: draft.total,
    status: 'Pending',
    paymentMethod,
    paymentStatus,
  }
}

async function createPaidOrder(store, draft, sessionId, paymentDetails) {
  const existing = store.orders.find(order => order.paymentSessionId === sessionId)
  if (existing) { await recordWebsiteOrderMovements(existing); return null }
  for (const line of draft.lines) {
    const product = store.products.find(item => item.id === line.productId)
    if (product) product.stock = Math.max(0, product.stock - line.quantity)
  }
  const order = { ...newOrder(draft, 'Card', 'Paid'), ...paymentDetails, paymentSessionId: sessionId }
  store.orders.unshift(order)
  store.pendingCheckouts = store.pendingCheckouts.filter(item => item.id !== draft.id)
  await writeStore(store)
  await recordWebsiteOrderMovements(order)
  return order
}
async function completeStripeSession(session) {
  const store = readStore()
  const draftId = session.metadata?.draftId
  const draft = store.pendingCheckouts.find(item => item.id === draftId || item.sessionId === session.id)
  if (!draft) {
    console.warn('Stripe payment received without a matching checkout draft:', session.id)
    return null
  }
  const paymentDetails = {}
  try {
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
    if (stripe && paymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge.balance_transaction'] })
      const charge = paymentIntent.latest_charge
      const transaction = charge?.balance_transaction
      const cardCountry = charge?.payment_method_details?.card?.country
      if (cardCountry) paymentDetails.cardCountry = cardCountry
      if (transaction?.currency === 'aed' && Number.isFinite(transaction.fee)) {
        paymentDetails.stripeFee = transaction.fee / 100
        paymentDetails.stripeFeeSource = 'actual'
      }
    }
  } catch (error) { console.warn('Stripe fee lookup unavailable:', error?.message || error) }
  return createPaidOrder(store, draft, session.id, paymentDetails)
}
function serveFile(req, res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) { res.writeHead(404); res.end('Not found'); return }
  const ext = path.extname(filePath).toLowerCase()
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' }
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable' }); fs.createReadStream(filePath).pipe(res)
}

await initializeStore()

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const route = requestUrl.pathname
  try {
    if (route === '/api/health') return json(res, 200, { ok: true, service: 'fragrance-land', accountantEnabled, time: new Date().toISOString() })
    if (route === '/api/config' && req.method === 'GET') return json(res, 200, { accountantEnabled })
    if (!accountantEnabled && (route === '/api/accountant' || route.startsWith('/api/accountant/'))) {
      return json(res, 404, { error: 'Not found.' })
    }
    if (route === '/api/auth/login' && req.method === 'POST') {
      if (!allowLoginAttempt(req)) return json(res, 429, { error: 'Too many login attempts. Try again later.' })
      const input = await body(req)
      if (input.email !== adminEmail || input.password !== adminPassword) return json(res, 401, { error: 'Incorrect admin email or password.' })
      clearLoginAttempts(req)
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `fl_session=${encodeURIComponent(tokenFor(adminEmail))}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` }); return res.end(JSON.stringify({ email: adminEmail }))
    }
    if (route === '/api/auth/logout' && req.method === 'POST') { res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'fl_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0' }); return res.end(JSON.stringify({ ok: true })) }
    if (route === '/api/auth/me' && req.method === 'GET') { const admin = currentAdmin(req); return admin ? json(res, 200, { email: admin.email }) : json(res, 401, { error: 'Not signed in.' }) }
    if (route === '/api/stripe/webhook' && req.method === 'POST') {
      if (!stripe || !stripeWebhookSecret) return json(res, 503, { error: 'Stripe webhook is not configured.' })
      const raw = await rawBody(req)
      let event
      try { event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], stripeWebhookSecret) } catch (error) { res.writeHead(400); return res.end(`Webhook Error: ${error.message}`) }
      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        const session = event.data.object
        const isPaid = event.type === 'checkout.session.async_payment_succeeded' || session.payment_status === 'paid'
        if (isPaid) await completeStripeSession(session)
      }
      return json(res, 200, { received: true })
    }
    if (route === '/api/checkout/complete' && req.method === 'GET') {
      if (!stripe) return json(res, 503, { error: 'Stripe payments are not configured yet.' })
      const sessionId = requestUrl.searchParams.get('session_id') || ''
      if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return json(res, 400, { error: 'Invalid checkout session.' })
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      if (session.payment_status !== 'paid') return json(res, 409, { error: 'Payment has not been confirmed yet.' })
      const order = await completeStripeSession(session)
      return json(res, 200, { ok: true, created: Boolean(order) })
    }
    const store = readStore()
    if (route === '/api/accountant/summary' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return
      const from = requestUrl.searchParams.get('from') || ''
      const to = requestUrl.searchParams.get('to') || ''
      return json(res, 200, await accountant.summary({ from, to }))
    }
    if (route === '/api/accountant/ask' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return
      const input = await body(req)
      const question = String(input?.question || '').trim()
      if (!question) return json(res, 400, { error: 'Ask a question about the accountant summary.' })
      const summary = await accountant.summary({ from: input?.from || '', to: input?.to || '' })
      const answer = await askAccountant(question, summary)
      return json(res, 200, { answer, model: openAiModel })
    }
    if (route === '/api/accountant/ai/prepare' && req.method === 'POST') {
      const admin = requireAdmin(req, res); if (!admin) return
      const input = await body(req)
      const question = String(input?.question || '').trim()
      if (!question) return json(res, 400, { error: 'Describe the financial action you want to prepare.' })
      const summary = await accountant.summary({ from: input?.from || '', to: input?.to || '' })
      const prepared = await prepareAccountantAction(question, summary)
      if (!prepared.action) return json(res, 200, prepared)
      const confirmationToken = crypto.randomUUID()
      preparedAiActions.set(confirmationToken, { admin: admin.email, action: prepared.action, expiresAt: Date.now() + 10 * 60 * 1000 })
      return json(res, 200, { ...prepared, confirmationToken })
    }
    if (route === '/api/accountant/ai/execute' && req.method === 'POST') {
      const admin = requireAdmin(req, res); if (!admin) return
      const input = await body(req)
      const prepared = preparedAiActions.get(String(input?.confirmationToken || ''))
      if (!prepared || prepared.expiresAt < Date.now() || prepared.admin !== admin.email) return json(res, 409, { error: 'This AI action draft expired or was not confirmed through the accountant page. Prepare it again.' })
      const action = prepared.action
      if (!action || !['expense', 'outside_sale', 'material_purchase', 'production_batch'].includes(action.type)) return json(res, 400, { error: 'Invalid accountant action.' })
      let result
      if (action.type === 'expense') result = await accountant.createExpense(action.payload || {})
      if (action.type === 'outside_sale') result = await accountant.createOutsideSale({ ...(action.payload || {}), confirmed: true, status: 'Confirmed' })
      if (action.type === 'material_purchase') result = await accountant.createMaterial(action.payload || {})
      if (action.type === 'production_batch') result = await accountant.createProductionBatch({ ...(action.payload || {}), confirmed: true })
      preparedAiActions.delete(String(input.confirmationToken))
      return json(res, 201, { ok: true, action: action.type, result })
    }
    if (route === '/api/accountant/expenses' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return json(res, 200, await accountant.expenses()) }
    if (route === '/api/accountant/expenses' && req.method === 'POST') { if (!requireAdmin(req, res)) return; return json(res, 201, await accountant.createExpense(await body(req))) }
    const accountantExpenseMatch = route.match(/^\/api\/accountant\/expenses\/([^/]+)$/)
    if (accountantExpenseMatch && req.method === 'PATCH') { if (!requireAdmin(req, res)) return; return json(res, 200, await accountant.updateExpense(decodeURIComponent(accountantExpenseMatch[1]), await body(req))) }
    if (accountantExpenseMatch && req.method === 'DELETE') { if (!requireAdmin(req, res)) return; await accountant.deleteExpense(decodeURIComponent(accountantExpenseMatch[1])); return noContent(res) }
    if (route === '/api/accountant/materials' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return json(res, 200, await accountant.materials()) }
    if (route === '/api/accountant/materials' && req.method === 'POST') { if (!requireAdmin(req, res)) return; return json(res, 201, await accountant.createMaterial(await body(req))) }
    const accountantMaterialMatch = route.match(/^\/api\/accountant\/materials\/([^/]+)$/)
    if (accountantMaterialMatch && req.method === 'PATCH') { if (!requireAdmin(req, res)) return; return json(res, 200, await accountant.updateMaterial(decodeURIComponent(accountantMaterialMatch[1]), await body(req))) }
    if (accountantMaterialMatch && req.method === 'DELETE') { if (!requireAdmin(req, res)) return; await accountant.deleteMaterial(decodeURIComponent(accountantMaterialMatch[1])); return noContent(res) }
    if (route === '/api/accountant/outside-sales' || route === '/api/accountant/sales') {
      if (!requireAdmin(req, res)) return
      if (req.method === 'GET') return json(res, 200, await accountant.outsideSales())
      if (req.method === 'POST') {
        const input = await body(req)
        return json(res, 201, await accountant.createOutsideSale({ ...input, saleDate: input.saleDate || input.date, confirmed: input.confirmed !== false, status: input.status || 'Confirmed' }))
      }
    }
    const accountantSaleMatch = route.match(/^\/api\/accountant\/(?:outside-sales|sales)\/([^/]+)$/)
    if (accountantSaleMatch && req.method === 'PATCH') { if (!requireAdmin(req, res)) return; return json(res, 200, await accountant.updateOutsideSale(decodeURIComponent(accountantSaleMatch[1]), await body(req))) }
    if (accountantSaleMatch && req.method === 'DELETE') { if (!requireAdmin(req, res)) return; await accountant.deleteOutsideSale(decodeURIComponent(accountantSaleMatch[1])); return noContent(res) }
    if (route === '/api/accountant/production/batches' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return json(res, 200, await accountant.batches()) }
    if (route === '/api/accountant/production/batches' && req.method === 'POST') { if (!requireAdmin(req, res)) return; return json(res, 201, await accountant.createProductionBatch(await body(req))) }
    if (route === '/api/accountant/inventory' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return json(res, 200, await accountant.getInventory()) }
    if (route === '/api/accountant/costs' && req.method === 'PUT') {
      if (!requireAdmin(req, res)) return
      const input = await body(req)
      const productId = decodeURIComponent(String(input?.productId || ''))
      const product = store.products.find(item => item.id === productId)
      if (!product) return json(res, 404, { error: 'Product not found.' })
      product.productionCost = normalizeMoney(input?.productionCost)
      product.packagingCost = normalizeMoney(input?.packagingCost)
      await writeStore(store)
      return json(res, 200, { id: product.id, productionCost: product.productionCost, packagingCost: product.packagingCost })
    }
    const accountantCostMatch = route.match(/^\/api\/accountant\/costs\/([^/]+)$/)
    if (accountantCostMatch && req.method === 'PUT') {
      if (!requireAdmin(req, res)) return
      const productId = decodeURIComponent(accountantCostMatch[1])
      const product = store.products.find(item => item.id === productId)
      if (!product) return json(res, 404, { error: 'Product not found.' })
      const input = await body(req)
      product.productionCost = normalizeMoney(input?.productionCost)
      product.packagingCost = normalizeMoney(input?.packagingCost)
      await writeStore(store)
      return json(res, 200, { id: product.id, productionCost: product.productionCost, packagingCost: product.packagingCost })
    }
    if (route === '/api/categories' && req.method === 'GET') return json(res, 200, store.categories)
    if (route === '/api/categories/all' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return json(res, 200, store.categories) }
    if (route === '/api/categories' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return
      const category = normalizeCategory(await body(req))
      if (store.categories.some(item => item.id === category.id)) return json(res, 409, { error: 'A category with this name already exists.' })
      store.categories.push(category); await writeStore(store); return json(res, 201, category)
    }
    const categoryMatch = route.match(/^\/api\/categories\/([^/]+)$/)
    if (categoryMatch && req.method === 'PUT') {
      if (!requireAdmin(req, res)) return
      const categoryId = decodeURIComponent(categoryMatch[1])
      const index = store.categories.findIndex(category => category.id === categoryId)
      if (index < 0) return json(res, 404, { error: 'Category not found.' })
      const category = normalizeCategory(await body(req), store.categories[index])
      store.categories[index] = category; await writeStore(store); return json(res, 200, category)
    }
    if (categoryMatch && req.method === 'DELETE') {
      if (!requireAdmin(req, res)) return
      const categoryId = decodeURIComponent(categoryMatch[1])
      if (store.products.some(product => product.category === categoryId)) return json(res, 409, { error: 'This category is used by a product. Reassign those products before deleting it.' })
      store.categories = store.categories.filter(category => category.id !== categoryId); await writeStore(store); return noContent(res)
    }
    if (route === '/api/products' && req.method === 'GET') return json(res, 200, store.products.filter(product => product.active))
    if (route === '/api/products/all' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return json(res, 200, store.products) }
    if (route === '/api/products' && req.method === 'POST') { if (!requireAdmin(req, res)) return; const input = await body(req); const product = await normalizeProduct(input, {}, store.categories); store.products.push(product); await writeStore(store); return json(res, 201, product) }
    const productMatch = route.match(/^\/api\/products\/([^/]+)$/)
    if (productMatch && req.method === 'PUT') { if (!requireAdmin(req, res)) return; const productId = decodeURIComponent(productMatch[1]); const index = store.products.findIndex(product => product.id === productId); if (index < 0) return json(res, 404, { error: 'Product not found.' }); const input = await body(req); const product = await normalizeProduct(input, store.products[index], store.categories); store.products[index] = product; await writeStore(store); return json(res, 200, product) }
    if (productMatch && req.method === 'DELETE') { if (!requireAdmin(req, res)) return; const productId = decodeURIComponent(productMatch[1]); store.products = store.products.filter(product => product.id !== productId); await writeStore(store); return noContent(res) }
    if (route === '/api/checkout/session' && req.method === 'POST') {
      const input = await body(req)
      const customer = normalizeCustomer(input.customer)
      const paymentMethod = input.paymentMethod ?? 'Card'
      if (!['Card', 'Cash'].includes(paymentMethod) || (paymentMethod === 'Cash' && customer.country !== 'OTHER')) {
        return json(res, 400, { error: 'Choose an available payment method for your delivery region.' })
      }
      if (paymentMethod === 'Card' && !stripe) return json(res, 503, { error: 'Card payments are temporarily unavailable.' })
      const lines = orderLinesForStore(store, input.lines)
      const shippingFee = shippingFeeForCountry(customer.country)
      const total = roundAed(lines.reduce((sum, line) => sum + line.price * line.quantity, 0) + shippingFee)
      const draft = { id: crypto.randomUUID(), customer, lines, shippingFee, total, createdAt: new Date().toISOString() }
      if (paymentMethod === 'Cash') {
        if (!customer.countryName) return json(res, 400, { error: 'Enter your delivery country.' })
        const order = { ...newOrder(draft, 'Cash', 'Awaiting payment'), stripeFee: 0 }
        store.orders.unshift(order)
        try {
          await writeStore(store)
        } catch (error) {
          store.orders = store.orders.filter(item => item.id !== order.id)
          throw error
        }
        return json(res, 201, { orderId: order.id })
      }
      store.pendingCheckouts.unshift(draft)
      await writeStore(store)
      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          line_items: [...lines.map(line => { const product = store.products.find(item => item.id === line.productId); return { price_data: { currency: 'aed', product_data: { name: `${product.name} · ${sizeLabel(line.size)}`, description: product.subtitle }, unit_amount: Math.round(line.price * 100) }, quantity: line.quantity } }), { price_data: { currency: 'aed', product_data: { name: customer.country === 'AE' ? 'Delivery · UAE' : 'Delivery · Outside UAE', description: 'Shipping cost' }, unit_amount: Math.round(shippingFee * 100) }, quantity: 1 }],
          customer_email: customer.email || undefined,
          metadata: { draftId: draft.id },
          success_url: `${checkoutOrigin(req)}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${checkoutOrigin(req)}/cart?payment=cancelled`,
        })
        draft.sessionId = session.id
        await writeStore(store)
        return json(res, 200, { url: session.url })
      } catch (error) {
        store.pendingCheckouts = store.pendingCheckouts.filter(item => item.id !== draft.id)
        await writeStore(store)
        throw error
      }
    }
    if (route === '/api/orders' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return json(res, 200, store.orders) }
    const orderMatch = route.match(/^\/api\/orders\/([^/]+)$/)
    if (orderMatch && req.method === 'PATCH') {
      if (!requireAdmin(req, res)) return
      const input = await body(req)
      const order = store.orders.find(item => item.id === decodeURIComponent(orderMatch[1]))
      if (!order) return json(res, 404, { error: 'Order not found.' })
      if (input.confirmCashPayment === true) {
        if (order.paymentMethod !== 'Cash' || order.status === 'Cancelled') return json(res, 409, { error: 'This order cannot be marked cash paid.' })
        if (order.paymentStatus === 'Paid') return json(res, 200, order)
        let lines
        try { lines = orderLinesForStore(store, order.lines) } catch (error) {
          return json(res, 409, { error: error.message })
        }
        for (const line of lines) store.products.find(product => product.id === line.productId).stock -= line.quantity
        order.paymentStatus = 'Paid'
        order.paidAt = new Date().toISOString()
        try {
          await writeStore(store)
        } catch (error) {
          const current = readStore()
          const currentOrder = current.orders.find(item => item.id === order.id)
          if (currentOrder) {
            currentOrder.paymentStatus = 'Awaiting payment'
            delete currentOrder.paidAt
          }
          for (const line of lines) {
            const product = current.products.find(item => item.id === line.productId)
            if (product) product.stock += line.quantity
          }
          throw error
        }
        await recordWebsiteOrderMovements(order)
        return json(res, 200, order)
      }
      if (!['Pending', 'Processing', 'Shipped', 'Completed', 'Cancelled'].includes(input.status)) return json(res, 400, { error: 'Invalid order status.' })
      if (order.paymentMethod === 'Cash' && order.paymentStatus !== 'Paid' && input.status === 'Completed') {
        return json(res, 409, { error: 'Record the cash payment before completing this order.' })
      }
      order.status = input.status
      await writeStore(store)
      return json(res, 200, order)
    }
    if (route.startsWith('/uploads/')) {
      const fileName = path.basename(route)
      const storedFile = path.join(uploadDir, fileName)
      const legacyFile = path.join(legacyUploadDir, fileName)
      return serveFile(req, res, fs.existsSync(storedFile) ? storedFile : legacyFile)
    }
    if (req.method === 'GET') {
      const requestedFile = path.join(distDir, route === '/' ? 'index.html' : route.slice(1))
      return serveFile(req, res, fs.existsSync(requestedFile) && fs.statSync(requestedFile).isFile() ? requestedFile : path.join(distDir, 'index.html'))
    }
    return json(res, 404, { error: 'Not found.' })
  } catch (error) {
    console.error('Request failed:', error?.message || error)
    return json(res, 400, { error: isProduction ? 'Request failed. Please try again.' : (error.message || 'Request failed.') })
  }
})

server.listen(port, '0.0.0.0', () => console.log(`Fragrance Land local server running at http://localhost:${port}`))
