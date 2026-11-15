import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Stripe from 'stripe'

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
const isProduction = process.env.NODE_ENV === 'production'
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null

fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(uploadDir, { recursive: true })

if (isProduction) {
  const missing = ['DATA_DIR', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'SESSION_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'].filter(key => !process.env[key])
  if (missing.length) throw new Error(`Missing production environment variables: ${missing.join(', ')}`)
  if (!path.isAbsolute(dataDir)) throw new Error('DATA_DIR must be an absolute persistent storage path in production.')
  if (adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters in production.')
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters in production.')
}

const seedCategories = [
  { id: 'woody', nameEn: 'Woody', nameAr: 'خشبي' },
  { id: 'floral', nameEn: 'Floral', nameAr: 'زهري' },
  { id: 'fresh', nameEn: 'Fresh', nameAr: 'منعش' },
  { id: 'oriental', nameEn: 'Oriental', nameAr: 'شرقي' },
]

const seedProducts = [
  ['santal-21', 'Santal 21', 'A warm, polished signature', 'Woody', 148, 18, ['Sandalwood', 'Cardamom', 'Amber'], 'A quiet statement of warm sandalwood, bright cardamom and a skin-like amber dry down. Designed to linger close and leave a memorable trail.', 'https://images.unsplash.com/photo-1547887538-e3a2f32cb1cc?auto=format&fit=crop&w=1200&q=85', '#c8753c', [50, 75, 100]],
  ['orange-blossom', 'Orange Blossom', 'Sunlit citrus, soft petals', 'Floral', 122, 24, ['Neroli', 'Orange blossom', 'Musk'], 'A luminous floral built around fresh neroli and orange blossom, softened with clean musk and a hint of green leaves.', 'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=1200&q=85', '#efaa62', [50, 75, 100]],
  ['velvet-oud', 'Velvet Oud', 'Deep, smoky and magnetic', 'Oriental', 176, 9, ['Oud', 'Rose', 'Saffron'], 'An enveloping composition where smoky oud meets crimson rose and a thread of saffron. Bold, velvety and made for evening.', 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=1200&q=85', '#722e2a', [50, 75]],
  ['fig-leaf', 'Fig Leaf', 'Green, creamy, effortless', 'Fresh', 118, 32, ['Fig leaf', 'Cedar', 'Coconut'], 'The softness of ripe fig with crisp green leaves and a creamy cedar base. An easy, everyday veil for warm days.', 'https://images.unsplash.com/photo-1588405748880-12d1d2a0c2e4?auto=format&fit=crop&w=1200&q=85', '#8b9867', [50, 75, 100]],
  ['iris-noir', 'Iris Noir', 'Powdered elegance, reimagined', 'Floral', 154, 14, ['Iris', 'Violet', 'Tonka'], 'A modern iris with the coolness of violet and the soft warmth of tonka bean. Powdery, poised, and never predictable.', 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=1200&q=85', '#82739d', [50, 75, 100]],
  ['sea-salt', 'Sea Salt', 'Air, mineral and light', 'Fresh', 106, 27, ['Sea salt', 'Bergamot', 'Driftwood'], 'A clean mineral scent that opens with sparkling bergamot before settling into sun-warmed driftwood and salt-kissed skin.', 'https://images.unsplash.com/photo-1610461888750-10bfc601b8a5?auto=format&fit=crop&w=1200&q=85', '#7e9aa5', [50, 75, 100]],
]

function initialStore() {
  return {
    categories: seedCategories.map(category => ({ ...category })),
    products: seedProducts.map(([id, name, subtitle, category, price, stock, notes, description, image, accent, sizes]) => ({ id, name, subtitle, category: String(category).toLowerCase(), price, stock, notes, description, images: [image, image], sizes, active: true, accent })),
    orders: [],
    pendingCheckouts: [],
  }
}

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
  store.products = Array.isArray(store.products) ? store.products : []
  store.orders = Array.isArray(store.orders) ? store.orders : []
  store.pendingCheckouts = Array.isArray(store.pendingCheckouts) ? store.pendingCheckouts : []
  return store
}

function readStore() {
  if (!fs.existsSync(storePath)) {
    const fresh = initialStore()
    fs.writeFileSync(storePath, JSON.stringify(fresh, null, 2))
    return fresh
  }
  try {
    const store = JSON.parse(fs.readFileSync(storePath, 'utf8'))
    store.pendingCheckouts = Array.isArray(store.pendingCheckouts) ? store.pendingCheckouts : []
    return migrateStore(store)
  } catch { return initialStore() }
}

function writeStore(store) { fs.writeFileSync(storePath, JSON.stringify(store, null, 2)) }
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
    notes: String(input?.notes || '').trim().slice(0, 1000),
  }
  if (!customer.name || !customer.phone || !customer.address || !/^\S+@\S+\.\S+$/.test(customer.email)) throw new Error('Complete valid customer details before checkout.')
  return customer
}
function orderLinesForStore(store, inputLines) {
  if (!Array.isArray(inputLines) || !inputLines.length || inputLines.length > 50) throw new Error('Add at least one product to the cart.')
  return inputLines.map(line => {
    const product = store.products.find(item => item.id === line.productId && item.active)
    if (!product) throw new Error('One of the selected products is unavailable.')
    const quantity = Number(line.quantity)
    const size = Number(line.size || product.sizes[0])
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('Product quantity is invalid.')
    if (!product.sizes.includes(size)) throw new Error('Product size is invalid.')
    if (quantity > product.stock) throw new Error(`${product.name} does not have enough stock.`)
    return { productId: product.id, size, quantity, price: product.price }
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
function safeImage(dataUrl) {
  if (!dataUrl?.startsWith('data:image/')) return dataUrl
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/)
  if (!match) throw new Error('Unsupported image format.')
  const extension = match[1] === 'jpeg' ? 'jpg' : match[1]
  const file = `${crypto.randomUUID()}.${extension}`
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length > 5 * 1024 * 1024) throw new Error('Product images must be 5 MB or smaller.')
  fs.writeFileSync(path.join(uploadDir, file), buffer)
  return `/uploads/${file}`
}
function normalizeProduct(input, existing = {}, categories = []) {
  const image = safeImage(input.images?.[0] || existing.images?.[0])
  if (!image) throw new Error('A product image is required.')
  if (!/^https?:\/\//i.test(image) && !image.startsWith('/uploads/')) throw new Error('Product image must be an HTTPS URL or an uploaded image.')
  const name = String(input.name ?? existing.name ?? '').trim().slice(0, 120)
  const subtitle = String(input.subtitle ?? existing.subtitle ?? '').trim().slice(0, 180)
  const description = String(input.description ?? existing.description ?? '').trim().slice(0, 2000)
  const price = Number(input.price ?? existing.price)
  const stock = Number(input.stock ?? existing.stock)
  const sizes = Array.isArray(input.sizes) && input.sizes.length ? input.sizes.map(Number) : (existing.sizes || [50, 75, 100])
  const category = String(input.category || existing.category || 'woody')
  if (!name || !subtitle || !description) throw new Error('Product name, short description, and description are required.')
  if (!Number.isFinite(price) || price <= 0 || price > 1000000) throw new Error('Product price must be greater than 0.')
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) throw new Error('Product stock must be a whole number from 0 upward.')
  if (!categories.some(item => item.id === category)) throw new Error('Choose a valid category.')
  if (!sizes.length || sizes.some(size => !Number.isInteger(size) || size <= 0 || size > 10000)) throw new Error('Product sizes must be positive whole numbers.')
  return {
    ...existing,
    ...input,
    id: existing.id || input.id || `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now()}`,
    name, subtitle, description, price, stock, notes: Array.isArray(input.notes) ? input.notes.map(note => String(note).trim().slice(0, 80)).filter(Boolean).slice(0, 20) : [],
    category, sizes, images: [image, image], active: input.active !== false,
  }
}
function checkoutOrigin(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${port}`
  return `${protocol}://${host}`
}
function createPaidOrder(store, draft, sessionId) {
  if (store.orders.some(order => order.paymentSessionId === sessionId)) return null
  for (const line of draft.lines) {
    const product = store.products.find(item => item.id === line.productId)
    if (product) product.stock = Math.max(0, product.stock - line.quantity)
  }
  const order = { id: `FL-${Date.now().toString().slice(-8)}`, date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), customer: draft.customer, lines: draft.lines, total: draft.total, status: 'Pending', paymentStatus: 'Paid', paymentSessionId: sessionId }
  store.orders.unshift(order)
  store.pendingCheckouts = store.pendingCheckouts.filter(item => item.id !== draft.id)
  writeStore(store)
  return order
}
function serveFile(req, res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) { res.writeHead(404); res.end('Not found'); return }
  const ext = path.extname(filePath).toLowerCase()
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' }
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable' }); fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const route = requestUrl.pathname
  try {
    if (route === '/api/health') return json(res, 200, { ok: true, service: 'fragrance-land', time: new Date().toISOString() })
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
        if (isPaid) {
          const store = readStore()
          const draft = store.pendingCheckouts.find(item => item.id === session.metadata?.draftId)
          if (draft) createPaidOrder(store, draft, session.id)
          else console.warn('Stripe payment received without a matching checkout draft:', session.id)
        }
      }
      return json(res, 200, { received: true })
    }
    const store = readStore()
    if (route === '/api/categories' && req.method === 'GET') return json(res, 200, store.categories)
    if (route === '/api/categories/all' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return json(res, 200, store.categories) }
    if (route === '/api/categories' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return
      const category = normalizeCategory(await body(req))
      if (store.categories.some(item => item.id === category.id)) return json(res, 409, { error: 'A category with this name already exists.' })
      store.categories.push(category); writeStore(store); return json(res, 201, category)
    }
    const categoryMatch = route.match(/^\/api\/categories\/([^/]+)$/)
    if (categoryMatch && req.method === 'PUT') {
      if (!requireAdmin(req, res)) return
      const index = store.categories.findIndex(category => category.id === categoryMatch[1])
      if (index < 0) return json(res, 404, { error: 'Category not found.' })
      const category = normalizeCategory(await body(req), store.categories[index])
      store.categories[index] = category; writeStore(store); return json(res, 200, category)
    }
    if (categoryMatch && req.method === 'DELETE') {
      if (!requireAdmin(req, res)) return
      if (store.products.some(product => product.category === categoryMatch[1])) return json(res, 409, { error: 'This category is used by a product. Reassign those products before deleting it.' })
      store.categories = store.categories.filter(category => category.id !== categoryMatch[1]); writeStore(store); return noContent(res)
    }
    if (route === '/api/products' && req.method === 'GET') return json(res, 200, store.products.filter(product => product.active))
    if (route === '/api/products/all' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return json(res, 200, store.products) }
    if (route === '/api/products' && req.method === 'POST') { if (!requireAdmin(req, res)) return; const input = await body(req); const product = normalizeProduct(input, {}, store.categories); store.products.push(product); writeStore(store); return json(res, 201, product) }
    const productMatch = route.match(/^\/api\/products\/([^/]+)$/)
    if (productMatch && req.method === 'PUT') { if (!requireAdmin(req, res)) return; const index = store.products.findIndex(product => product.id === productMatch[1]); if (index < 0) return json(res, 404, { error: 'Product not found.' }); const input = await body(req); const product = normalizeProduct(input, store.products[index], store.categories); store.products[index] = product; writeStore(store); return json(res, 200, product) }
    if (productMatch && req.method === 'DELETE') { if (!requireAdmin(req, res)) return; store.products = store.products.filter(product => product.id !== productMatch[1]); writeStore(store); return noContent(res) }
    if (route === '/api/checkout/session' && req.method === 'POST') {
      if (!stripe) return json(res, 503, { error: 'Stripe payments are not configured yet.' })
      const input = await body(req)
      const customer = normalizeCustomer(input.customer)
      const lines = orderLinesForStore(store, input.lines)
      const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
      const draft = { id: crypto.randomUUID(), customer, lines, total, createdAt: new Date().toISOString() }
      store.pendingCheckouts.unshift(draft)
      writeStore(store)
      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          line_items: lines.map(line => { const product = store.products.find(item => item.id === line.productId); return { price_data: { currency: 'aed', product_data: { name: `${product.name} · ${line.size} ml`, description: product.subtitle }, unit_amount: Math.round(line.price * 100) }, quantity: line.quantity } }),
          customer_email: input.customer.email,
          phone_number_collection: { enabled: true },
          billing_address_collection: 'required',
          metadata: { draftId: draft.id },
          success_url: `${checkoutOrigin(req)}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${checkoutOrigin(req)}/cart?payment=cancelled`,
        })
        draft.sessionId = session.id
        writeStore(store)
        return json(res, 200, { url: session.url })
      } catch (error) {
        store.pendingCheckouts = store.pendingCheckouts.filter(item => item.id !== draft.id)
        writeStore(store)
        throw error
      }
    }
    if (route === '/api/orders' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return json(res, 200, store.orders) }
    const orderMatch = route.match(/^\/api\/orders\/([^/]+)$/)
    if (orderMatch && req.method === 'PATCH') { if (!requireAdmin(req, res)) return; const input = await body(req); const order = store.orders.find(item => item.id === orderMatch[1]); if (!order) return json(res, 404, { error: 'Order not found.' }); if (!['Pending', 'Processing', 'Shipped', 'Completed', 'Cancelled'].includes(input.status)) return json(res, 400, { error: 'Invalid order status.' }); order.status = input.status; writeStore(store); return json(res, 200, order) }
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

