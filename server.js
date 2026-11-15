import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Stripe from 'stripe'

const root = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(root, 'public')
const distDir = path.join(root, 'dist')
const dataDir = path.join(root, 'data')
const uploadDir = path.join(publicDir, 'uploads')
const storePath = path.join(dataDir, 'store.json')
const port = Number(process.env.PORT || 3012)
const adminEmail = process.env.ADMIN_EMAIL || 'admin@fragranceland.local'
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
const sessionSecret = process.env.SESSION_SECRET || 'fragrance-land-local-secret-change-me'
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || ''
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null

fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(uploadDir, { recursive: true })

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
    products: seedProducts.map(([id, name, subtitle, category, price, stock, notes, description, image, accent, sizes]) => ({ id, name, subtitle, category, price, stock, notes, description, images: [image, image], sizes, active: true, accent })),
    orders: [],
    pendingCheckouts: [],
  }
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
    return store
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
  fs.writeFileSync(path.join(uploadDir, file), Buffer.from(match[2], 'base64'))
  return `/uploads/${file}`
}
function normalizeProduct(input, existing = {}) {
  const image = safeImage(input.images?.[0] || existing.images?.[0])
  if (!image) throw new Error('A product image is required.')
  return {
    ...existing,
    ...input,
    id: existing.id || input.id || `${String(input.name || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now()}`,
    price: Number(input.price || 0), stock: Number(input.stock || 0), notes: Array.isArray(input.notes) ? input.notes.filter(Boolean) : [],
    sizes: Array.isArray(input.sizes) && input.sizes.length ? input.sizes.map(Number) : [50, 75, 100], images: [image, image], active: input.active !== false,
  }
}
function checkoutOrigin(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${port}`
  return `${protocol}://${host}`
}
function createPaidOrder(store, draft, sessionId) {
  if (store.orders.some(order => order.paymentSessionId === sessionId)) return null
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
      const input = await body(req)
      if (input.email !== adminEmail || input.password !== adminPassword) return json(res, 401, { error: 'Incorrect admin email or password.' })
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
        const store = readStore()
        const draft = store.pendingCheckouts.find(item => item.id === session.metadata?.draftId)
        if (draft) createPaidOrder(store, draft, session.id)
      }
      return json(res, 200, { received: true })
    }
    const store = readStore()
    if (route === '/api/products' && req.method === 'GET') return json(res, 200, store.products.filter(product => product.active))
    if (route === '/api/products/all' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return json(res, 200, store.products) }
    if (route === '/api/products' && req.method === 'POST') { if (!requireAdmin(req, res)) return; const product = normalizeProduct(await body(req)); store.products.push(product); writeStore(store); return json(res, 201, product) }
    const productMatch = route.match(/^\/api\/products\/([^/]+)$/)
    if (productMatch && req.method === 'PUT') { if (!requireAdmin(req, res)) return; const index = store.products.findIndex(product => product.id === productMatch[1]); if (index < 0) return json(res, 404, { error: 'Product not found.' }); const product = normalizeProduct(await body(req), store.products[index]); store.products[index] = product; writeStore(store); return json(res, 200, product) }
    if (productMatch && req.method === 'DELETE') { if (!requireAdmin(req, res)) return; store.products = store.products.filter(product => product.id !== productMatch[1]); writeStore(store); return noContent(res) }
    if (route === '/api/checkout/session' && req.method === 'POST') {
      if (!stripe) return json(res, 503, { error: 'Stripe payments are not configured yet.' })
      const input = await body(req)
      if (!input.customer?.name || !input.customer?.email || !input.customer?.phone || !input.customer?.address || !Array.isArray(input.lines) || !input.lines.length) return json(res, 400, { error: 'Complete customer details and add at least one product.' })
      const lines = input.lines.map(line => { const product = store.products.find(item => item.id === line.productId && item.active); if (!product) throw new Error('One of the selected products is unavailable.'); const quantity = Math.max(1, Number(line.quantity || 1)); return { productId: product.id, size: Number(line.size || product.sizes[0]), quantity, price: product.price } })
      const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
      const draft = { id: crypto.randomUUID(), customer: input.customer, lines, total, createdAt: new Date().toISOString() }
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
    if (route === '/api/orders' && req.method === 'POST') {
      const input = await body(req)
      if (!input.customer?.name || !input.customer?.email || !input.customer?.phone || !input.customer?.address || !Array.isArray(input.lines) || !input.lines.length) return json(res, 400, { error: 'Complete customer details and add at least one product.' })
      const lines = input.lines.map(line => { const product = store.products.find(item => item.id === line.productId && item.active); if (!product) throw new Error('One of the selected products is unavailable.'); const quantity = Math.max(1, Number(line.quantity || 1)); return { productId: product.id, size: Number(line.size || product.sizes[0]), quantity, price: product.price } })
      const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
      const order = { id: `FL-${Date.now().toString().slice(-8)}`, date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), customer: input.customer, lines, total, status: 'Pending' }
      store.orders.unshift(order); writeStore(store); return json(res, 201, order)
    }
    if (route === '/api/orders' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return json(res, 200, store.orders) }
    const orderMatch = route.match(/^\/api\/orders\/([^/]+)$/)
    if (orderMatch && req.method === 'PATCH') { if (!requireAdmin(req, res)) return; const input = await body(req); const order = store.orders.find(item => item.id === orderMatch[1]); if (!order) return json(res, 404, { error: 'Order not found.' }); order.status = input.status; writeStore(store); return json(res, 200, order) }
    if (route.startsWith('/uploads/')) return serveFile(req, res, path.join(uploadDir, path.basename(route)))
    if (req.method === 'GET') {
      const requestedFile = path.join(distDir, route === '/' ? 'index.html' : route.slice(1))
      return serveFile(req, res, fs.existsSync(requestedFile) && fs.statSync(requestedFile).isFile() ? requestedFile : path.join(distDir, 'index.html'))
    }
    return json(res, 404, { error: 'Not found.' })
  } catch (error) { return json(res, 400, { error: error.message || 'Request failed.' }) }
})

server.listen(port, '0.0.0.0', () => console.log(`Fragrance Land local server running at http://localhost:${port}`))

