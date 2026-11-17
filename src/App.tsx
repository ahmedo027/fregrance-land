import { type CSSProperties, type FormEvent, useEffect, useState } from 'react'
import ProductsAdminV2 from './ProductsAdmin'

type View = 'shop' | 'cart' | 'orders' | 'products' | 'admin'
type OrderStatus = 'Pending' | 'Processing' | 'Shipped' | 'Completed' | 'Cancelled'

export type Category = {
  id: string
  nameEn: string
  nameAr: string
}

export type SizeOption = {
  value: number
  unit: 'ml' | 'g'
}

export type Product = {
  id: string
  name: string
  subtitle: string
  category: string
  price: number
  stock: number
  notes: string[]
  description: string
  images: string[]
  sizes: SizeOption[]
  discountPercent: number
  active: boolean
  accent: string
}

type CartLine = { productId: string; size: SizeOption; quantity: number }
type OrderLine = CartLine & { price?: number }
type Order = {
  id: string
  date: string
  customer: { name: string; email: string; phone: string; address: string; notes: string }
  lines: OrderLine[]
  total: number
  status: OrderStatus
  paymentStatus?: string
}

const logo = '/assets/fragrance-land-logo.png'
const fallbackImage = 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1200&q=85'
const starterCategories: Category[] = [
  { id: 'woody', nameEn: 'Woody', nameAr: 'خشبي' },
  { id: 'floral', nameEn: 'Floral', nameAr: 'زهري' },
  { id: 'fresh', nameEn: 'Fresh', nameAr: 'منعش' },
  { id: 'oriental', nameEn: 'Oriental', nameAr: 'شرقي' },
]

const starterProducts: Product[] = [
  {
    id: 'santal-21', name: 'Santal 21', subtitle: 'A warm, polished signature', category: 'Woody', price: 148, stock: 18,
    notes: ['Sandalwood', 'Cardamom', 'Amber'], description: 'A quiet statement of warm sandalwood, bright cardamom and a skin-like amber dry down. Designed to linger close and leave a memorable trail.',
    images: ['https://images.unsplash.com/photo-1547887538-e3a2f32cb1cc?auto=format&fit=crop&w=1200&q=85', fallbackImage], sizes: [{ value: 50, unit: 'ml' }, { value: 75, unit: 'ml' }, { value: 100, unit: 'ml' }], discountPercent: 0, active: true, accent: '#c8753c',
  },
  {
    id: 'orange-blossom', name: 'Orange Blossom', subtitle: 'Sunlit citrus, soft petals', category: 'Floral', price: 122, stock: 24,
    notes: ['Neroli', 'Orange blossom', 'Musk'], description: 'A luminous floral built around fresh neroli and orange blossom, softened with clean musk and a hint of green leaves.',
    images: ['https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=1200&q=85', fallbackImage], sizes: [{ value: 50, unit: 'ml' }, { value: 75, unit: 'ml' }, { value: 100, unit: 'ml' }], discountPercent: 0, active: true, accent: '#efaa62',
  },
  {
    id: 'velvet-oud', name: 'Velvet Oud', subtitle: 'Deep, smoky and magnetic', category: 'Oriental', price: 176, stock: 9,
    notes: ['Oud', 'Rose', 'Saffron'], description: 'An enveloping composition where smoky oud meets crimson rose and a thread of saffron. Bold, velvety and made for evening.',
    images: ['https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=1200&q=85', fallbackImage], sizes: [{ value: 50, unit: 'ml' }, { value: 75, unit: 'ml' }], discountPercent: 0, active: true, accent: '#722e2a',
  },
  {
    id: 'fig-leaf', name: 'Fig Leaf', subtitle: 'Green, creamy, effortless', category: 'Fresh', price: 118, stock: 32,
    notes: ['Fig leaf', 'Cedar', 'Coconut'], description: 'The softness of ripe fig with crisp green leaves and a creamy cedar base. An easy, everyday veil for warm days.',
    images: ['https://images.unsplash.com/photo-1588405748880-12d1d2a0c2e4?auto=format&fit=crop&w=1200&q=85', fallbackImage], sizes: [{ value: 50, unit: 'ml' }, { value: 75, unit: 'ml' }, { value: 100, unit: 'ml' }], discountPercent: 0, active: true, accent: '#8b9867',
  },
  {
    id: 'iris-noir', name: 'Iris Noir', subtitle: 'Powdered elegance, reimagined', category: 'Floral', price: 154, stock: 14,
    notes: ['Iris', 'Violet', 'Tonka'], description: 'A modern iris with the coolness of violet and the soft warmth of tonka bean. Powdery, poised, and never predictable.',
    images: ['https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=1200&q=85', fallbackImage], sizes: [{ value: 50, unit: 'ml' }, { value: 75, unit: 'ml' }, { value: 100, unit: 'ml' }], discountPercent: 0, active: true, accent: '#82739d',
  },
  {
    id: 'sea-salt', name: 'Sea Salt', subtitle: 'Air, mineral and light', category: 'Fresh', price: 106, stock: 27,
    notes: ['Sea salt', 'Bergamot', 'Driftwood'], description: 'A clean mineral scent that opens with sparkling bergamot before settling into sun-warmed driftwood and salt-kissed skin.',
    images: ['https://images.unsplash.com/photo-1610461888750-10bfc601b8a5?auto=format&fit=crop&w=1200&q=85', fallbackImage], sizes: [{ value: 50, unit: 'ml' }, { value: 75, unit: 'ml' }, { value: 100, unit: 'ml' }], discountPercent: 0, active: true, accent: '#7e9aa5',
  },
]

const sampleOrders: Order[] = [
  { id: 'FL-240816-01', date: '16 Aug 2026', customer: { name: 'Maya Al-Hadi', email: 'maya@example.com', phone: '+971 50 123 4567', address: 'Jumeirah, Dubai', notes: '' }, lines: [{ productId: 'santal-21', size: { value: 75, unit: 'ml' }, quantity: 1 }], total: 148, status: 'Processing' },
  { id: 'FL-240815-02', date: '15 Aug 2026', customer: { name: 'Omar Rahman', email: 'omar@example.com', phone: '+971 55 879 2210', address: 'Al Barsha, Dubai', notes: 'Please call on arrival.' }, lines: [{ productId: 'orange-blossom', size: { value: 50, unit: 'ml' }, quantity: 1 }, { productId: 'fig-leaf', size: { value: 50, unit: 'ml' }, quantity: 1 }], total: 240, status: 'Pending' },
  { id: 'FL-240812-03', date: '12 Aug 2026', customer: { name: 'Lina Costa', email: 'lina@example.com', phone: '+971 52 445 0076', address: 'Al Reem Island, Abu Dhabi', notes: '' }, lines: [{ productId: 'velvet-oud', size: { value: 50, unit: 'ml' }, quantity: 1 }], total: 176, status: 'Completed' },
]

function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? initial } catch { return initial }
  })
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)) }, [key, value])
  return [value, setValue] as const
}

function icon(name: 'search' | 'bag' | 'arrow' | 'plus' | 'minus' | 'close' | 'edit' | 'trash' | 'sparkle' | 'menu' | 'check') {
  const paths: Record<string, string> = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>', bag: '<path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>', arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>', edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', sparkle: '<path d="m12 3-1.4 5.6L5 10l5.6 1.4L12 17l1.4-5.6L19 10l-5.6-1.4L12 3Z"/><path d="m19 16-.7 2.3L16 19l2.3.7L19 22l.7-2.3L22 19l-2.3-.7L19 16Z"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', check: '<path d="m5 12 4 4L19 6"/>',
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: paths[name] }} />
}

function money(value: number) { return `AED ${value.toFixed(2)}` }
function asSizeOption(size: SizeOption | number): SizeOption { return typeof size === 'number' ? { value: size, unit: 'ml' } : size }
function sizeKey(size: SizeOption | number) { const option = asSizeOption(size); return `${option.value}-${option.unit}` }
function sizeLabel(size: SizeOption | number) { const option = asSizeOption(size); return `${option.value} ${option.unit}` }
function productPrice(product: Product) { return product.price * (1 - (product.discountPercent || 0) / 100) }
function priceMarkup(product: Product, quantity = 1) { const sale = productPrice(product) * quantity; return product.discountPercent > 0 ? <><del>{money(product.price * quantity)}</del> <span className="sale-price">{money(sale)}</span></> : money(sale) }
function categoryLabel(id: string, categories: Category[]) { const category = categories.find(item => item.id === id); return category ? `${category.nameEn} · ${category.nameAr}` : id }
function getView() { const path = window.location.pathname; return path === '/admin' || path === '/admin/' ? 'admin' : path.includes('cart') ? 'cart' : path.includes('orders') ? 'orders' : path.includes('products') ? 'products' : 'shop' as View }
async function apiJson<T>(url: string, options: RequestInit = {}) {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Request failed.')
  return payload as T
}

export default function App() {
  const [view, setView] = useState<View>(getView())
  const [products, setProducts] = useState<Product[]>(starterProducts)
  const [categories, setCategories] = useState<Category[]>(starterCategories)
  const [orders, setOrders] = useState<Order[]>([])
  const [cart, setCart] = usePersistentState<CartLine[]>('fl-cart', [])
  const [activeProduct, setActiveProduct] = useState<Product | null>(null)
  const [selectedSize, setSelectedSize] = useState<SizeOption>({ value: 50, unit: 'ml' })
  const [selectedQuantity, setSelectedQuantity] = useState(1)
  const [notice, setNotice] = useState('')
  const [adminMode, setAdminMode] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [authError, setAuthError] = useState('')

  const activeProducts = products.filter(product => product.active)
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const cartTotal = cart.reduce((sum, line) => {
    const product = products.find(item => item.id === line.productId)
    return sum + (product ? productPrice(product) : 0) * line.quantity
  }, 0)

  function navigate(next: View) {
    const path = next === 'shop' ? '/' : `/${next}`
    window.history.pushState({}, '', path)
    setView(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const onPopState = () => setView(getView())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    let alive = true
    Promise.all([apiJson<Product[]>('/api/products'), apiJson<Category[]>('/api/categories')]).then(([remoteProducts, remoteCategories]) => { if (alive) { setProducts(remoteProducts); setCategories(remoteCategories) } }).catch(() => undefined)
    apiJson<{ email: string }>('/api/auth/me').then(async () => {
      if (!alive) return
      setAdminMode(true)
      const [allProducts, remoteOrders, remoteCategories] = await Promise.all([apiJson<Product[]>('/api/products/all'), apiJson<Order[]>('/api/orders'), apiJson<Category[]>('/api/categories/all')])
      if (alive) {
        setProducts(allProducts); setOrders(remoteOrders); setCategories(remoteCategories)
        if (getView() === 'admin') { window.history.replaceState({}, '', '/orders'); setView('orders') }
      }
    }).catch(() => undefined)
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!adminMode || view !== 'orders') return
    let alive = true
    const refreshOrders = () => apiJson<Order[]>('/api/orders').then(remoteOrders => { if (alive) setOrders(remoteOrders) }).catch(() => undefined)
    refreshOrders()
    const interval = window.setInterval(refreshOrders, 10000)
    return () => { alive = false; window.clearInterval(interval) }
  }, [adminMode, view])

  useEffect(() => {
    const payment = new URLSearchParams(window.location.search).get('payment')
    if (payment === 'success') {
      const sessionId = new URLSearchParams(window.location.search).get('session_id')
      void (async () => {
        let confirmed = false
        try {
          if (sessionId) {
            await apiJson(`/api/checkout/complete?session_id=${encodeURIComponent(sessionId)}`)
            confirmed = true
          }
        } catch { /* Stripe webhook delivery may still be completing in the background. */ }
        setCart([])
        setNotice(confirmed ? 'Payment received — your order is on its way to the studio.' : 'Payment received — we are confirming your order with the studio.')
        window.history.replaceState({}, '', '/')
        setView('shop')
        window.setTimeout(() => setNotice(''), 4500)
      })()
    } else if (payment === 'cancelled') {
      setNotice('Payment was cancelled. Your cart is still waiting for you.')
      window.history.replaceState({}, '', '/cart')
      setView('cart')
      window.setTimeout(() => setNotice(''), 3500)
    }
  }, [setCart])

  function openProduct(product: Product) {
    setActiveProduct(product)
    setSelectedSize(product.sizes[0])
    setSelectedQuantity(1)
  }

  function addToCart(productId: string, size: SizeOption, quantity: number) {
    setCart(current => {
      const found = current.find(line => line.productId === productId && sizeKey(line.size) === sizeKey(size))
      return found ? current.map(line => line === found ? { ...line, quantity: line.quantity + quantity } : line) : [...current, { productId, size, quantity }]
    })
    setNotice('Added to your collection')
    setActiveProduct(null)
    window.setTimeout(() => setNotice(''), 2500)
  }

  function updateLine(line: CartLine, quantity: number) {
    setCart(current => quantity < 1 ? current.filter(item => item !== line) : current.map(item => item === line ? { ...item, quantity } : item))
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const customer = { name: String(form.get('name')), email: String(form.get('email')), phone: String(form.get('phone')), address: String(form.get('address')), notes: String(form.get('notes') || '') }
    try {
      const checkout = await apiJson<{ url: string }>('/api/checkout/session', { method: 'POST', body: JSON.stringify({ customer, lines: cart }) })
      window.location.assign(checkout.url)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to place the order.') }
    window.setTimeout(() => setNotice(''), 3500)
  }

  async function loginAdmin(email: string, password: string) {
    try {
      await apiJson('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      const [allProducts, remoteOrders, remoteCategories] = await Promise.all([apiJson<Product[]>('/api/products/all'), apiJson<Order[]>('/api/orders'), apiJson<Category[]>('/api/categories/all')])
      setProducts(allProducts); setOrders(remoteOrders); setCategories(remoteCategories); setAdminMode(true); setShowLogin(false); setAuthError(''); navigate('orders')
    } catch (error) { setAuthError(error instanceof Error ? error.message : 'Unable to sign in.') }
  }

  async function logoutAdmin() {
    await apiJson('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setAdminMode(false); navigate('shop')
  }

  async function saveProduct(product: Product) {
    const exists = products.some(item => item.id === product.id)
    const saved = await apiJson<Product>(exists ? `/api/products/${product.id}` : '/api/products', { method: exists ? 'PUT' : 'POST', body: JSON.stringify(product) })
    setProducts(current => exists ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved])
  }

  async function deleteProduct(id: string) {
    await apiJson(`/api/products/${id}`, { method: 'DELETE' })
    setProducts(current => current.filter(product => product.id !== id))
  }

  async function saveCategory(category: Category) {
    const exists = categories.some(item => item.id === category.id)
    const saved = await apiJson<Category>(exists ? `/api/categories/${category.id}` : '/api/categories', { method: exists ? 'PUT' : 'POST', body: JSON.stringify(category) })
    setCategories(current => exists ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved])
  }

  async function deleteCategory(id: string) {
    await apiJson(`/api/categories/${id}`, { method: 'DELETE' })
    setCategories(current => current.filter(category => category.id !== id))
  }

  async function updateOrderStatus(id: string, status: OrderStatus) {
    const updated = await apiJson<Order>(`/api/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    setOrders(current => current.map(order => order.id === updated.id ? updated : order))
  }

  return <div className="app-shell">
    <Header view={view} cartCount={cartCount} adminMode={adminMode} onNavigate={navigate} onLogout={logoutAdmin} />
    {view === 'shop' && <Shop products={activeProducts} categories={categories} onProduct={openProduct} onNavigate={navigate} />}
    {view === 'cart' && <Cart products={products} categories={categories} cart={cart} total={cartTotal} onUpdate={updateLine} onNavigate={navigate} onSubmit={submitOrder} />}
    {view === 'orders' && adminMode && <Orders orders={orders} products={products} onStatus={updateOrderStatus} />}
    {view === 'products' && adminMode && <ProductsAdminV2 products={products} categories={categories} onSave={saveProduct} onDelete={deleteProduct} onSaveCategory={saveCategory} onDeleteCategory={deleteCategory} />}
    {view === 'admin' && !adminMode && <AdminLocked onSignIn={() => { setAuthError(''); setShowLogin(true) }} />}
    {(view === 'orders' || view === 'products') && !adminMode && <AdminRouteGuard onNavigate={navigate} />}
    {showLogin && view === 'admin' && <AdminLogin onClose={() => setShowLogin(false)} onLogin={loginAdmin} error={authError} />}
    {activeProduct && <ProductModal product={activeProduct} categories={categories} selectedSize={selectedSize} selectedQuantity={selectedQuantity} onSize={setSelectedSize} onQuantity={setSelectedQuantity} onClose={() => setActiveProduct(null)} onAdd={() => addToCart(activeProduct.id, selectedSize, selectedQuantity)} />}
    {notice && <div className="toast"><span className="toast-icon">{icon('check')}</span>{notice}</div>}
  </div>
}

function Header({ view, cartCount, adminMode, onNavigate, onLogout }: { view: View; cartCount: number; adminMode: boolean; onNavigate: (view: View) => void; onLogout: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const nav = (next: View) => { onNavigate(next); setMobileOpen(false) }
  return <header className="site-header">
    <div className="header-inner">
      <button className="brand" onClick={() => nav('shop')} aria-label="Go to Fragrance Land home"><img src={logo} alt="Fragrance Land" /></button>
      <div className="mobile-actions"><button className="mobile-cart" onClick={() => nav('cart')} aria-label={`Your cart ${cartCount}`}>{icon('bag')}<span className="cart-count">{cartCount}</span></button><button className="mobile-menu" onClick={() => setMobileOpen(open => !open)} aria-label="Toggle menu">{icon('menu')}</button></div>
      <nav className={mobileOpen ? 'main-nav open' : 'main-nav'}>
        <button className={view === 'shop' ? 'nav-link active' : 'nav-link'} onClick={() => nav('shop')}>Shop perfumes</button>
        <button className={view === 'cart' ? 'nav-link cart-nav active' : 'nav-link cart-nav'} onClick={() => nav('cart')} aria-label={`Your cart ${cartCount}`}>{icon('bag')}<span className="cart-count">{cartCount}</span></button>
        {adminMode && <><span className="nav-divider" /><button className={view === 'orders' ? 'nav-link admin-link active' : 'nav-link admin-link'} onClick={() => nav('orders')}>Orders</button><button className={view === 'products' ? 'nav-link admin-link active' : 'nav-link admin-link'} onClick={() => nav('products')}>Products</button></>}
        {adminMode && <button className="admin-toggle" onClick={onLogout}>Exit admin</button>}
      </nav>
    </div>
  </header>
}

function Shop({ products, categories, onProduct, onNavigate }: { products: Product[]; categories: Category[]; onProduct: (product: Product) => void; onNavigate: (view: View) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const visibleCategories = categories.filter(item => products.some(product => product.category === item.id))
  const filtered = products.filter(product => (category === 'all' || product.category === category) && `${product.name} ${product.subtitle} ${product.notes.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  return <main>
    <section className="hero section-wrap">
      <div className="hero-copy"><p className="eyebrow">Fragrance, beautifully composed</p><h1>Find the scent<br /><em>that feels like you.</em></h1><p className="hero-description">Thoughtfully blended fragrances for every version of your day. Explore a considered collection of modern signatures.</p><button className="button button-dark" onClick={() => document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' })}>Explore the collection {icon('arrow')}</button></div>
      <div className="hero-art"><div className="hero-orb orb-one" /><div className="hero-orb orb-two" /><div className="hero-bottle"><span className="bottle-cap" /><span className="bottle-label">FL<br /><small>NO. 01</small></span></div><div className="hero-caption">A little ritual<br /><strong>for every day.</strong></div></div>
    </section>
    <section id="collection" className="collection section-wrap"><div className="section-heading"><div><p className="eyebrow">The collection</p><h2>Made to be remembered.</h2></div><button className="text-button" onClick={() => onNavigate('cart')}>View your cart {icon('arrow')}</button></div>
      <div className="catalog-tools"><div className="search-field">{icon('search')}<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by scent or note" aria-label="Search products" /></div><div className="category-tabs"><button className={category === 'all' ? 'category-tab active' : 'category-tab'} onClick={() => setCategory('all')}>All · الكل</button>{visibleCategories.map(item => <button key={item.id} className={category === item.id ? 'category-tab active' : 'category-tab'} onClick={() => setCategory(item.id)}>{categoryLabel(item.id, categories)}</button>)}</div></div>
      <div className="product-grid">{filtered.map(product => <ProductCard key={product.id} product={product} categoryText={categoryLabel(product.category, categories)} onClick={() => onProduct(product)} />)}</div>
      {!filtered.length && <div className="empty-state"><span>{icon('sparkle')}</span><h3>No scents found.</h3><p>Try a different name, note or category.</p></div>}
    </section>
    <section className="brand-story section-wrap"><div className="story-mark">{icon('sparkle')}</div><div><p className="eyebrow">The Fragrance Land point of view</p><h2>Small rituals.<br /><em>Beautifully yours.</em></h2></div><p>We believe fragrance should feel personal, never precious. Every blend is made to meet you where you are — and stay with you a little longer.</p></section>
    <Footer />
  </main>
}

function ProductCard({ product, categoryText, onClick }: { product: Product; categoryText: string; onClick: () => void }) { return <button className="product-card" onClick={onClick}><div className="product-visual" style={{ '--accent': product.accent } as CSSProperties}><img src={product.images[0]} alt={product.name} loading="lazy" /><span className="product-tag">{categoryText}</span>{product.discountPercent > 0 && <span className="discount-badge">-{product.discountPercent}%</span>}<span className="quick-view">Quick view {icon('arrow')}</span></div><div className="product-card-meta"><div><h3>{product.name}</h3><p>{product.subtitle}</p></div><strong className={product.discountPercent > 0 ? 'has-sale' : ''}>{priceMarkup(product)}</strong></div></button> }

function ProductModal({ product, categories, selectedSize, selectedQuantity, onSize, onQuantity, onClose, onAdd }: { product: Product; categories: Category[]; selectedSize: SizeOption; selectedQuantity: number; onSize: (size: SizeOption) => void; onQuantity: (quantity: number) => void; onClose: () => void; onAdd: () => void }) { return <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="product-modal" role="dialog" aria-modal="true" aria-label={product.name}><button className="modal-close" onClick={onClose} aria-label="Close product details">{icon('close')}</button><div className="modal-gallery"><img src={product.images[0]} alt={product.name} /><div className="gallery-dots"><span className="active" /><span /><span /></div></div><div className="modal-content"><p className="eyebrow">{categoryLabel(product.category, categories)} / Fragrance Land</p><h2>{product.name}</h2><p className="modal-subtitle">{product.subtitle}</p><p className="modal-description">{product.description}</p><div className="notes"><p className="label">The notes</p><div>{product.notes.map(note => <span key={note}>{note}</span>)}</div></div><div className="modal-option"><p className="label">Size</p><div className="size-options">{product.sizes.map(size => <button key={sizeKey(size)} className={sizeKey(selectedSize) === sizeKey(size) ? 'size-option active' : 'size-option'} onClick={() => onSize(size)}>{sizeLabel(size)}</button>)}</div></div><div className="modal-buy"><div className="quantity-control"><button onClick={() => onQuantity(Math.max(1, selectedQuantity - 1))} aria-label="Decrease quantity">{icon('minus')}</button><span>{selectedQuantity}</span><button onClick={() => onQuantity(selectedQuantity + 1)} aria-label="Increase quantity">{icon('plus')}</button></div><button className="button button-dark add-button" onClick={onAdd}>Add to cart <span>{priceMarkup(product, selectedQuantity)}</span></button></div></div></div></div> }

function Cart({ products, categories, cart, total, onUpdate, onNavigate, onSubmit }: { products: Product[]; categories: Category[]; cart: CartLine[]; total: number; onUpdate: (line: CartLine, quantity: number) => void; onNavigate: (view: View) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <main className="page-wrap"><div className="page-intro"><p className="eyebrow">Your collection</p><h1>Take your favorites<br /><em>home with you.</em></h1></div>{cart.length === 0 ? <div className="empty-cart"><div className="empty-cart-mark">{icon('bag')}</div><h2>Your cart is waiting.</h2><p>Start with one scent and see where it takes you.</p><button className="button button-dark" onClick={() => onNavigate('shop')}>Explore perfumes {icon('arrow')}</button></div> : <div className="cart-layout"><section className="cart-lines"><div className="cart-section-title"><h2>Selected scents</h2><span>{cart.length} {cart.length === 1 ? 'item' : 'items'}</span></div>{cart.map(line => { const product = products.find(item => item.id === line.productId); if (!product) return null; return <div className="cart-line" key={`${line.productId}-${sizeKey(line.size)}`}><img src={product.images[0]} alt={product.name} /><div className="cart-line-info"><p className="eyebrow">{categoryLabel(product.category, categories)}</p><h3>{product.name}</h3><p>{sizeLabel(line.size)} · {product.discountPercent > 0 && <del>{money(product.price)}</del>} {money(productPrice(product))}</p></div><div className="quantity-control"><button onClick={() => onUpdate(line, line.quantity - 1)} aria-label="Decrease quantity">{icon('minus')}</button><span>{line.quantity}</span><button onClick={() => onUpdate(line, line.quantity + 1)} aria-label="Increase quantity">{icon('plus')}</button></div><strong className={product.discountPercent > 0 ? 'has-sale' : ''}>{priceMarkup(product, line.quantity)}</strong><button className="remove-button" onClick={() => onUpdate(line, 0)}>Remove</button></div>})}<button className="text-button back-button" onClick={() => onNavigate('shop')}>← Continue shopping</button></section><section className="checkout-card"><div className="checkout-summary"><div><span>Subtotal</span><strong>{money(total)}</strong></div><div><span>Delivery</span><strong className="free">Complimentary</strong></div><div className="total-row"><span>Total</span><strong>{money(total)}</strong></div></div><div className="checkout-divider" /><form onSubmit={onSubmit}><div className="checkout-title"><p className="eyebrow">Almost yours</p><h2>Delivery details</h2></div><label>Full name<input required name="name" placeholder="Your name" /></label><label>Email address<input required type="email" name="email" placeholder="you@example.com" /></label><div className="form-row"><label>Phone<input required name="phone" placeholder="+971" /></label><label>Address<input required name="address" placeholder="City, area" /></label></div><label>Notes <span className="optional">optional</span><textarea name="notes" placeholder="Anything we should know?"></textarea></label><button className="button button-dark full-button" type="submit">Continue to secure payment {icon('arrow')}</button><p className="secure-note">Secure payment powered by Stripe.</p></form></section></div>}</main> }

function Orders({ orders, products, onStatus }: { orders: Order[]; products: Product[]; onStatus: (id: string, status: OrderStatus) => void }) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const selectedOrder = orders.find(order => order.id === selectedOrderId)

  useEffect(() => {
    if (selectedOrderId && !selectedOrder) setSelectedOrderId(null)
  }, [selectedOrderId, selectedOrder])

  return <main className="admin-page page-wrap">
    <div className="admin-intro"><div><p className="eyebrow">Admin / Operations</p><h1>Orders <em>coming in.</em></h1><p className="admin-refresh-note">Paid website orders · updates automatically</p></div><div className="admin-stat"><span>{orders.filter(order => order.status === 'Pending').length}</span><small>awaiting attention</small></div></div>
    <div className="admin-table">
      <div className="table-head"><span>Order</span><span>Customer</span><span>Items</span><span>Total</span><span>Status</span></div>
      {orders.map(order => <div className={selectedOrderId === order.id ? 'table-row order-row selected' : 'table-row order-row'} key={order.id} role="button" tabIndex={0} onClick={() => setSelectedOrderId(order.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setSelectedOrderId(order.id) }}>
        <div><strong>{order.id}</strong><small>{order.date}</small><small className="row-detail-hint">View details</small></div>
        <div><strong>{order.customer.name}</strong><small>{order.customer.email}</small></div>
        <div><strong>{order.lines.reduce((sum, line) => sum + line.quantity, 0)} items</strong><small>{order.lines.map(line => products.find(product => product.id === line.productId)?.name || 'Product').join(', ')}</small></div>
        <strong>{money(order.total)}</strong>
        <select className={`status-select ${order.status.toLowerCase()}`} value={order.status} onClick={event => event.stopPropagation()} onChange={event => onStatus(order.id, event.target.value as OrderStatus)}>{(['Pending', 'Processing', 'Shipped', 'Completed', 'Cancelled'] as OrderStatus[]).map(status => <option key={status}>{status}</option>)}</select>
      </div>)}
      {!orders.length && <div className="orders-empty"><h2>No paid orders yet.</h2><p>Completed Stripe payments will appear here automatically.</p></div>}
    </div>
    {selectedOrder && <OrderDetails order={selectedOrder} products={products} onClose={() => setSelectedOrderId(null)} />}
  </main>
}

function OrderDetails({ order, products, onClose }: { order: Order; products: Product[]; onClose: () => void }) {
  return <section className="order-details" aria-label={`Details for ${order.id}`}>
    <div className="order-details-heading"><div><p className="eyebrow">Order details</p><h2>{order.id}</h2><p>{order.date}</p></div><div className="order-details-actions"><span className="payment-badge">{order.paymentStatus || 'Paid via Stripe'}</span><button className="icon-button" onClick={onClose} aria-label="Close order details">{icon('close')}</button></div></div>
    <div className="order-details-grid">
      <div className="order-customer-card"><p className="label">Customer</p><h3>{order.customer.name}</h3><dl><div><dt>Email</dt><dd>{order.customer.email}</dd></div><div><dt>Phone</dt><dd>{order.customer.phone}</dd></div><div><dt>Address</dt><dd>{order.customer.address}</dd></div>{order.customer.notes && <div><dt>Notes</dt><dd>{order.customer.notes}</dd></div>}</dl></div>
      <div className="order-items-card"><div className="order-items-heading"><p className="label">Items</p><span>{order.lines.reduce((sum, line) => sum + line.quantity, 0)} items</span></div>{order.lines.map((line, index) => { const product = products.find(item => item.id === line.productId); const unitPrice = line.price ?? (product ? productPrice(product) : 0); return <div className="order-item" key={`${line.productId}-${sizeKey(line.size)}-${index}`}><img src={product?.images[0]} alt={product?.name || 'Product'} /><div><strong>{product?.name || 'Product unavailable'}</strong><p>{sizeLabel(line.size)} · Qty {line.quantity}</p></div><span>{money(unitPrice * line.quantity)}</span></div> })}<div className="order-total"><span>Total paid</span><strong>{money(order.total)}</strong></div></div>
    </div>
  </section>
}


function AdminLocked({ onSignIn }: { onSignIn: () => void }) { return <main className="admin-locked page-wrap"><div className="locked-mark">{icon('sparkle')}</div><p className="eyebrow">Private studio / Admin</p><h1>Welcome <em>back.</em></h1><p>Sign in to manage orders, inventory and product images.</p><button className="button button-dark" onClick={onSignIn}>Sign in to admin {icon('arrow')}</button></main> }
function AdminRouteGuard({ onNavigate }: { onNavigate: (view: View) => void }) { return <main className="admin-locked page-wrap"><div className="locked-mark">{icon('sparkle')}</div><p className="eyebrow">Private studio</p><h1>This area is <em>private.</em></h1><p>Admin sign in is available only from the private admin page.</p><button className="button button-dark" onClick={() => onNavigate('admin')}>Go to admin sign in {icon('arrow')}</button></main> }
function AdminLogin({ onClose, onLogin, error }: { onClose: () => void; onLogin: (email: string, password: string) => Promise<void>; error: string }) { const [email, setEmail] = useState('admin@fragranceland.local'); const [password, setPassword] = useState('admin123'); const [busy, setBusy] = useState(false); async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); await onLogin(email, password); setBusy(false) } return <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="login-card" role="dialog" aria-modal="true" aria-label="Admin sign in"><button className="modal-close" onClick={onClose} aria-label="Close admin sign in">{icon('close')}</button><p className="eyebrow">Fragrance Land / Private studio</p><h2>Welcome back.</h2><p className="login-copy">Sign in to manage your catalog and incoming orders.</p><form onSubmit={submit}><label>Email address<input required type="email" value={email} onChange={event => setEmail(event.target.value)} /></label><label>Password<input required type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p className="field-error">{error}</p>}<button className="button button-dark full-button" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'} {icon('arrow')}</button><p className="login-hint">Local default: admin@fragranceland.local / admin123</p></form></div></div> }
function Footer() { return <footer className="site-footer section-wrap"><img src={logo} alt="Fragrance Land" /><p>© 2026 Fragrance Land. Made for beautiful rituals.</p><span>Dubai · UAE</span></footer> }

