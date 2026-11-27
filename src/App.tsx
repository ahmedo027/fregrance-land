import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react'
import ProductsAdminV2 from './ProductsAdmin'
import AccountantTest from './AccountantTest'
import { roundAed, shippingFeeForCountry } from './pricing'

type View = 'shop' | 'cart' | 'orders' | 'products' | 'accountant' | 'admin'
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
  productionCost?: number
  packagingCost?: number
}

type CartLine = { productId: string; size: SizeOption; quantity: number }
type OrderLine = CartLine & { price?: number }
type Order = {
  id: string
  date: string
  customer: { name: string; email: string; phone: string; address: string; country?: 'AE' | 'OTHER'; countryName?: string; notes: string }
  lines: OrderLine[]
  shippingFee?: number
  stripeFee?: number
  total: number
  status: OrderStatus
  paymentStatus?: string
  paymentMethod?: 'Cash' | 'Card'
}

const logo = '/assets/fragrance-land-logo.png'
const starterCategories: Category[] = [
  { id: 'woody', nameEn: 'Woody', nameAr: 'خشبي' },
  { id: 'floral', nameEn: 'Floral', nameAr: 'زهري' },
  { id: 'fresh', nameEn: 'Fresh', nameAr: 'منعش' },
  { id: 'oriental', nameEn: 'Oriental', nameAr: 'شرقي' },
]

const starterProducts: Product[] = []

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
function productPrice(product: Product) { return roundAed(product.price * (1 - (product.discountPercent || 0) / 100)) }
function priceMarkup(product: Product, quantity = 1) { const sale = productPrice(product) * quantity; return product.discountPercent > 0 ? <><del>{money(product.price * quantity)}</del> <span className="sale-price">{money(sale)}</span></> : money(sale) }
function categoryLabel(id: string, categories: Category[]) { const category = categories.find(item => item.id === id); return category ? `${category.nameEn} · ${category.nameAr}` : id }
function getView(): View { const path = window.location.pathname; return path === '/admin' || path === '/admin/' ? 'admin' : path === '/admin/accountant' || path === '/admin/accountant/' || path === '/accountant-test' || path === '/accountant-test/' ? 'accountant' : path.includes('cart') ? 'cart' : path.includes('orders') ? 'orders' : path.includes('products') ? 'products' : 'shop' }
export async function apiJson<T>(url: string, options: RequestInit = {}) {
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
  const [accountantEnabled, setAccountantEnabled] = useState<boolean | null>(null)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [cashOrderId, setCashOrderId] = useState('')

  const activeProducts = products.filter(product => product.active)
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const cartTotal = cart.reduce((sum, line) => {
    const product = products.find(item => item.id === line.productId)
    return sum + (product ? productPrice(product) : 0) * line.quantity
  }, 0)

  function navigate(next: View) {
    const target = next === 'accountant' && accountantEnabled === false ? 'shop' : next
    const path = target === 'shop' ? '/' : target === 'accountant' ? '/admin/accountant' : `/${target}`
    window.history.pushState({}, '', path)
    setView(target)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const onPopState = () => setView(getView())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    let alive = true
    apiJson<{ accountantEnabled: boolean }>('/api/config').then(config => {
      if (!alive) return
      setAccountantEnabled(config.accountantEnabled)
      if (!config.accountantEnabled && getView() === 'accountant') { window.history.replaceState({}, '', '/'); setView('shop') }
    }).catch(() => { if (alive) setAccountantEnabled(true) })
    Promise.all([apiJson<Product[]>('/api/products'), apiJson<Category[]>('/api/categories')]).then(([remoteProducts, remoteCategories]) => { if (alive) { setProducts(remoteProducts); setCategories(remoteCategories); setCart(current => current.filter(line => { const product = remoteProducts.find(item => item.id === line.productId); return Boolean(product?.active && product.sizes.some(size => sizeKey(size) === sizeKey(line.size))) })) } }).catch(() => undefined)
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
    const stock = products.find(product => product.id === productId)?.stock ?? 0
    const currentQuantity = cart.filter(line => line.productId === productId).reduce((sum, line) => sum + line.quantity, 0)
    if (currentQuantity + quantity > stock) {
      setNotice('There is not enough stock to add this quantity.')
      window.setTimeout(() => setNotice(''), 3000)
      return
    }
    setCart(current => {
      const found = current.find(line => line.productId === productId && sizeKey(line.size) === sizeKey(size))
      return found ? current.map(line => line === found ? { ...line, quantity: line.quantity + quantity } : line) : [...current, { productId, size, quantity }]
    })
    setNotice('Added to your collection')
    setActiveProduct(null)
    window.setTimeout(() => setNotice(''), 2500)
  }

  function updateLine(line: CartLine, quantity: number) {
    const stock = products.find(product => product.id === line.productId)?.stock ?? 0
    const otherSizes = cart.filter(item => item !== line && item.productId === line.productId).reduce((sum, item) => sum + item.quantity, 0)
    if (quantity > line.quantity && quantity + otherSizes > stock) {
      setCheckoutError('There is not enough stock to increase that quantity.')
      return
    }
    setCheckoutError('')
    setCart(current => quantity < 1 ? current.filter(item => item !== line) : current.map(item => item === line ? { ...item, quantity } : item))
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (checkoutBusy) return
    const form = new FormData(event.currentTarget)
    const customer = Object.fromEntries(['name', 'email', 'phone', 'address', 'country', 'countryName', 'notes'].map(field => [field, String(form.get(field) || '')]))
    const paymentMethod = form.get('paymentMethod') || 'Card'
    setCheckoutBusy(true)
    setCheckoutError('')
    try {
      const checkout = await apiJson<{ url?: string; orderId?: string }>('/api/checkout/session', { method: 'POST', body: JSON.stringify({ customer, lines: cart, paymentMethod }) })
      if (checkout.url) window.location.assign(checkout.url)
      else if (checkout.orderId) {
        setCashOrderId(checkout.orderId)
        setCart([])
      } else throw new Error('Unable to place the order. Please try again.')
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Unable to place the order.')
    } finally {
      setCheckoutBusy(false)
    }
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

  async function confirmCashPayment(id: string) {
    const updated = await apiJson<Order>(`/api/orders/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ confirmCashPayment: true }) })
    setOrders(current => current.map(order => order.id === updated.id ? updated : order))
  }

  return <div className="app-shell">
    <Header view={view} cartCount={cartCount} adminMode={adminMode} accountantEnabled={accountantEnabled === true} onNavigate={navigate} onLogout={logoutAdmin} />
    {view === 'shop' && <Shop products={activeProducts} categories={categories} onProduct={openProduct} onNavigate={navigate} />}
    {view === 'cart' && <Cart products={products} categories={categories} cart={cart} total={cartTotal} onUpdate={updateLine} onNavigate={navigate} onSubmit={submitOrder} busy={checkoutBusy} error={checkoutError} cashOrderId={cashOrderId} />}
    {view === 'orders' && adminMode && <Orders orders={orders} products={products} onStatus={updateOrderStatus} onCashPayment={confirmCashPayment} />}
    {view === 'products' && adminMode && <ProductsAdminV2 products={products} categories={categories} onSave={saveProduct} onDelete={deleteProduct} onSaveCategory={saveCategory} onDeleteCategory={deleteCategory} />}
    {view === 'accountant' && adminMode && accountantEnabled && <AccountantTest products={products} />}
    {view === 'admin' && !adminMode && <AdminLocked onSignIn={() => { setAuthError(''); setShowLogin(true) }} />}
    {(view === 'orders' || view === 'products' || view === 'accountant') && !adminMode && <AdminRouteGuard onNavigate={navigate} />}
    {showLogin && view === 'admin' && <AdminLogin onClose={() => setShowLogin(false)} onLogin={loginAdmin} error={authError} />}
    {activeProduct && <ProductModal product={activeProduct} categories={categories} selectedSize={selectedSize} selectedQuantity={selectedQuantity} onSize={setSelectedSize} onQuantity={setSelectedQuantity} onClose={() => setActiveProduct(null)} onAdd={() => addToCart(activeProduct.id, selectedSize, selectedQuantity)} />}
    {notice && <div className="toast"><span className="toast-icon">{icon('check')}</span>{notice}</div>}
  </div>
}

function Header({ view, cartCount, adminMode, accountantEnabled, onNavigate, onLogout }: { view: View; cartCount: number; adminMode: boolean; accountantEnabled: boolean; onNavigate: (view: View) => void; onLogout: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const nav = (next: View) => { onNavigate(next); setMobileOpen(false) }
  return <header className="site-header">
    <div className="header-inner">
      <button className="brand" onClick={() => nav('shop')} aria-label="Go to Fragrance Land home"><img src={logo} alt="Fragrance Land" /></button>
      <div className="mobile-actions"><button className="mobile-cart" onClick={() => nav('cart')} aria-label={`Your cart ${cartCount}`}>{icon('bag')}<span className="cart-count">{cartCount}</span></button>{adminMode && <button className="mobile-menu" onClick={() => setMobileOpen(open => !open)} aria-label="Toggle admin menu" aria-expanded={mobileOpen}>{icon('menu')}</button>}</div>
      <nav className={mobileOpen ? 'main-nav open' : 'main-nav'}>
        <button className={view === 'shop' ? 'nav-link active' : 'nav-link'} onClick={() => nav('shop')}>Shop perfumes</button>
        <button className={view === 'cart' ? 'nav-link cart-nav active' : 'nav-link cart-nav'} onClick={() => nav('cart')} aria-label={`Your cart ${cartCount}`}>{icon('bag')}<span className="cart-count">{cartCount}</span></button>
        {adminMode && <><span className="nav-divider" /><button className={view === 'orders' ? 'nav-link admin-link active' : 'nav-link admin-link'} onClick={() => nav('orders')}>Orders</button><button className={view === 'products' ? 'nav-link admin-link active' : 'nav-link admin-link'} onClick={() => nav('products')}>Products</button>{accountantEnabled && <button className={view === 'accountant' ? 'nav-link admin-link active' : 'nav-link admin-link'} onClick={() => nav('accountant')}>Accountant</button>}</>}
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
      {!filtered.length && <div className="empty-state"><span>{icon('sparkle')}</span><h3>{products.length ? 'No scents found.' : 'The collection is being prepared.'}</h3><p>{products.length ? 'Try a different name, note or category.' : 'New fragrances will appear here as the admin adds them.'}</p></div>}
    </section>
    <section className="brand-story section-wrap"><div className="story-mark">{icon('sparkle')}</div><div><p className="eyebrow">The Fragrance Land point of view</p><h2>Small rituals.<br /><em>Beautifully yours.</em></h2></div><p>We believe fragrance should feel personal, never precious. Every blend is made to meet you where you are — and stay with you a little longer.</p></section>
    <Footer />
  </main>
}

function ProductCard({ product, categoryText, onClick }: { product: Product; categoryText: string; onClick: () => void }) { return <button className="product-card" onClick={onClick}><div className="product-visual" style={{ '--accent': product.accent } as CSSProperties}><img src={product.images[0]} alt={product.name} loading="lazy" /><span className="product-tag">{categoryText}</span>{product.discountPercent > 0 && <span className="discount-badge">-{product.discountPercent}%</span>}<span className="quick-view">Quick view {icon('arrow')}</span></div><div className="product-card-meta"><div><h3>{product.name}</h3><p>{product.subtitle}</p></div><strong className={product.discountPercent > 0 ? 'has-sale' : ''}>{priceMarkup(product)}</strong></div></button> }

function ProductModal({ product, categories, selectedSize, selectedQuantity, onSize, onQuantity, onClose, onAdd }: { product: Product; categories: Category[]; selectedSize: SizeOption; selectedQuantity: number; onSize: (size: SizeOption) => void; onQuantity: (quantity: number) => void; onClose: () => void; onAdd: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [imageIndex, setImageIndex] = useState(0)
  const images = [...new Set(product.images)]
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return <dialog ref={dialog} className="product-dialog" aria-label={product.name}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="product-modal">
      <button className="modal-close" onClick={onClose} aria-label="Close product details">{icon('close')}</button>
      <div className="modal-gallery">
        <img src={images[imageIndex]} alt={product.name} />
        {images.length > 1 && <div className="gallery-dots">{images.map((src, index) =>
          <button key={src} onClick={() => setImageIndex(index)} aria-label={`Show image ${index + 1}`} aria-pressed={index === imageIndex} />)}</div>}
      </div>
      <div className="modal-content">
        <p className="eyebrow">{categoryLabel(product.category, categories)}</p>
        <h2>{product.name}</h2><p className="modal-subtitle">{product.subtitle}</p><p className="modal-description">{product.description}</p>
        {product.notes.length > 0 && <div className="notes"><p className="label">Fragrance notes</p><div>{product.notes.map(note => <span key={note}>{note}</span>)}</div></div>}
        <div className="modal-option"><p className="label">Size</p><div className="size-options">{product.sizes.map(size =>
          <button key={sizeKey(size)} className={sizeKey(selectedSize) === sizeKey(size) ? 'size-option active' : 'size-option'} onClick={() => onSize(size)} aria-pressed={sizeKey(selectedSize) === sizeKey(size)}>{sizeLabel(size)}</button>)}</div></div>
        <div className="modal-buy">
          {product.stock > 0 && <div className="quantity-control">
            <button disabled={selectedQuantity <= 1} onClick={() => onQuantity(selectedQuantity - 1)} aria-label="Decrease quantity">{icon('minus')}</button>
            <span>{selectedQuantity}</span>
            <button disabled={selectedQuantity >= product.stock} onClick={() => onQuantity(selectedQuantity + 1)} aria-label="Increase quantity">{icon('plus')}</button>
          </div>}
          <button className="button button-dark add-button" disabled={product.stock < 1} onClick={onAdd}>{product.stock < 1 ? 'Sold out' : <>Add to cart <span>{priceMarkup(product, selectedQuantity)}</span></>}</button>
        </div>
      </div>
    </div>
  </dialog>
}

function Cart({ products, categories, cart, total, onUpdate, onNavigate, onSubmit, busy, error, cashOrderId }: {
  products: Product[]; categories: Category[]; cart: CartLine[]; total: number
  onUpdate: (line: CartLine, quantity: number) => void
  onNavigate: (view: View) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  busy: boolean; error: string; cashOrderId: string
}) {
  const [country, setCountry] = useState('AE')
  const [payment, setPayment] = useState('Card')
  const isCash = country === 'OTHER' && payment === 'Cash'
  const shipping = shippingFeeForCountry(country)

  if (!cart.length) return <main className="page-wrap">
    <div className="page-intro"><h1>{cashOrderId ? 'Order received' : 'Your cart'}</h1></div>
    <div className="empty-cart">
      <div className="empty-cart-mark">{icon(cashOrderId ? 'check' : 'bag')}</div>
      <h2>{cashOrderId || 'Your cart is empty'}</h2>
      <p>{cashOrderId ? 'We’ll contact you to arrange cash payment and delivery.' : 'Browse the collection to find your next fragrance.'}</p>
      <button className="button button-dark" onClick={() => onNavigate('shop')}>Explore perfumes {icon('arrow')}</button>
    </div>
  </main>

  return <main className="page-wrap">
    <div className="page-intro"><h1>Your cart</h1></div>
    <div className="cart-layout">
      <section className="cart-lines">
        <div className="cart-section-title"><h2>Selected scents</h2><span>{cart.reduce((sum, line) => sum + line.quantity, 0)} items</span></div>
        {cart.map(line => {
          const product = products.find(item => item.id === line.productId)
          if (!product) return null
          return <div className="cart-line" key={`${line.productId}-${sizeKey(line.size)}`}>
            <img src={product.images[0]} alt={product.name} />
            <div className="cart-line-info"><p className="eyebrow">{categoryLabel(product.category, categories)}</p><h3>{product.name}</h3><p>{sizeLabel(line.size)} · {money(productPrice(product))}</p></div>
            <div className="quantity-control"><button disabled={busy || line.quantity <= 1} onClick={() => onUpdate(line, line.quantity - 1)} aria-label={`Decrease ${product.name} quantity`}>{icon('minus')}</button><span>{line.quantity}</span><button disabled={busy} onClick={() => onUpdate(line, line.quantity + 1)} aria-label={`Increase ${product.name} quantity`}>{icon('plus')}</button></div>
            <strong>{priceMarkup(product, line.quantity)}</strong>
            <button className="remove-button" disabled={busy} onClick={() => onUpdate(line, 0)} aria-label={`Remove ${product.name}`}>Remove</button>
          </div>
        })}
        <button className="text-button back-button" onClick={() => onNavigate('shop')}>← Continue shopping</button>
      </section>
      <section className="checkout-card">
        <form onSubmit={onSubmit}>
          <fieldset className="checkout-fields" disabled={busy}>
            <div className="checkout-title"><h2>Delivery details</h2></div>
            <label>Delivery region<select required name="country" value={country} onChange={event => { setCountry(event.target.value); setPayment('Card') }}>
              <option value="AE">United Arab Emirates</option><option value="OTHER">Outside UAE</option>
            </select></label>
            {country === 'OTHER' && <label>Destination country<input required name="countryName" maxLength={100} autoComplete="country-name" placeholder="Enter your country" /></label>}
            <label>Full name<input required name="name" maxLength={120} autoComplete="name" placeholder="Your name" /></label>
            <label>Phone<input required type="tel" name="phone" maxLength={40} autoComplete="tel" placeholder={country === 'AE' ? '+971' : 'Include your country code'} /></label>
            <label>Full address<textarea required name="address" maxLength={240} autoComplete="street-address" placeholder="Building, street, area, city" /></label>
            <label>Email address <span className="optional">optional</span><input type="email" name="email" maxLength={254} autoComplete="email" placeholder="you@example.com" /></label>
            <label>Delivery notes <span className="optional">optional</span><textarea name="notes" maxLength={1000} /></label>
            {country === 'OTHER' && <label>Payment method<select name="paymentMethod" value={payment} onChange={event => setPayment(event.target.value)}>
              <option value="Card">Card via Stripe</option><option value="Cash">Cash · arrange with us</option>
            </select></label>}
          </fieldset>
          <div className="checkout-summary" aria-live="polite">
            <div><span>Products</span><strong>{money(total)}</strong></div>
            <div><span>Delivery</span><strong>{money(shipping)}</strong></div>
            <div className="total-row"><span>Order total</span><strong>{money(total + shipping)}</strong></div>
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <button className="button button-dark full-button" disabled={busy} type="submit">{busy ? 'Processing…' : isCash ? 'Place cash order' : 'Continue to secure payment'} {icon('arrow')}</button>
          <p className="secure-note">{isCash ? 'We’ll contact you to arrange cash payment and delivery.' : 'Secure payment powered by Stripe.'}</p>
        </form>
      </section>
    </div>
  </main>
}

function Orders({ orders, products, onStatus, onCashPayment }: { orders: Order[]; products: Product[]; onStatus: (id: string, status: OrderStatus) => Promise<void>; onCashPayment: (id: string) => Promise<void> }) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const selectedOrder = orders.find(order => order.id === selectedOrderId)
  const [orderError, setOrderError] = useState('')
  const [savingOrder, setSavingOrder] = useState(false)

  async function saveOrder(change: () => Promise<void>) {
    setOrderError('')
    setSavingOrder(true)
    try { await change() } catch (error) {
      setOrderError(error instanceof Error ? error.message : 'Unable to update this order.')
    } finally { setSavingOrder(false) }
  }

  useEffect(() => {
    if (selectedOrderId && !selectedOrder) setSelectedOrderId(null)
  }, [selectedOrderId, selectedOrder])

  return <main className="admin-page page-wrap">
    <div className="admin-intro"><div><p className="eyebrow">Admin / Operations</p><h1>Orders <em>coming in.</em></h1><p className="admin-refresh-note">Website orders and payment status</p></div><div className="admin-stat"><span>{orders.filter(order => order.status === 'Pending').length}</span><small>awaiting attention</small></div></div>
    {orderError && <p className="field-error" role="alert">{orderError}</p>}
    <div className="admin-table">
      <div className="table-head"><span>Order</span><span>Customer</span><span>Items</span><span>Total</span><span>Status</span></div>
      {orders.map(order => <div className={selectedOrderId === order.id ? 'table-row order-row selected' : 'table-row order-row'} key={order.id} role="button" tabIndex={0} onClick={() => setSelectedOrderId(order.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setSelectedOrderId(order.id) }}>
        <div><strong>{order.id}</strong><small>{order.date}</small><small>{order.paymentMethod === 'Cash' ? (order.paymentStatus === 'Paid' ? 'Cash paid' : 'Cash pending') : 'Card'}</small><small className="row-detail-hint">View details</small></div>
        <div><strong>{order.customer.name}</strong><small>{order.customer.email}</small></div>
        <div><strong>{order.lines.reduce((sum, line) => sum + line.quantity, 0)} items</strong><small>{order.lines.map(line => products.find(product => product.id === line.productId)?.name || 'Product').join(', ')}</small></div>
        <strong>{money(order.total)}</strong>
        <select className={`status-select ${order.status.toLowerCase()}`} aria-label={`Status for ${order.id}`} disabled={savingOrder} value={order.status} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onChange={event => { const status = event.target.value as OrderStatus; void saveOrder(() => onStatus(order.id, status)) }}>{(['Pending', 'Processing', 'Shipped', 'Completed', 'Cancelled'] as OrderStatus[]).map(status => <option key={status}>{status}</option>)}</select>
      </div>)}
      {!orders.length && <div className="orders-empty"><h2>No orders yet.</h2><p>Website orders will appear here automatically.</p></div>}
    </div>
    {selectedOrder && <OrderDetails order={selectedOrder} products={products} onClose={() => setSelectedOrderId(null)} onCashPayment={() => void saveOrder(() => onCashPayment(selectedOrder.id))} saving={savingOrder} />}
  </main>
}

function OrderDetails({ order, products, onClose, onCashPayment, saving }: { order: Order; products: Product[]; onClose: () => void; onCashPayment: () => void; saving: boolean }) {
  const awaitingCash = order.paymentMethod === 'Cash' && order.paymentStatus !== 'Paid'
  return <section className="order-details" aria-label={`Details for ${order.id}`}>
    <div className="order-details-heading"><div><p className="eyebrow">Order details</p><h2>{order.id}</h2><p>{order.date}</p></div><div className="order-details-actions"><span className="payment-badge">{order.paymentMethod === 'Cash' ? (awaitingCash ? 'Cash pending' : 'Cash paid') : (order.paymentStatus || 'Paid via Stripe')}</span><button className="icon-button" onClick={onClose} aria-label="Close order details">{icon('close')}</button></div></div>
    <div className="order-details-grid">
      <div className="order-customer-card"><p className="label">Customer</p><h3>{order.customer.name}</h3><dl><div><dt>Email</dt><dd>{order.customer.email || 'Not provided'}</dd></div><div><dt>Phone</dt><dd>{order.customer.phone}</dd></div><div><dt>Country</dt><dd>{order.customer.country === 'AE' ? 'United Arab Emirates' : order.customer.country === 'OTHER' ? (order.customer.countryName || 'Outside UAE') : 'Not provided'}</dd></div><div><dt>Address</dt><dd>{order.customer.address || 'Not provided'}</dd></div>{order.customer.notes && <div><dt>Notes</dt><dd>{order.customer.notes}</dd></div>}</dl></div>
      <div className="order-items-card"><div className="order-items-heading"><p className="label">Items</p><span>{order.lines.reduce((sum, line) => sum + line.quantity, 0)} items</span></div>{order.lines.map((line, index) => { const product = products.find(item => item.id === line.productId); const unitPrice = line.price ?? (product ? productPrice(product) : 0); return <div className="order-item" key={`${line.productId}-${sizeKey(line.size)}-${index}`}><img src={product?.images[0]} alt={product?.name || 'Product'} /><div><strong>{product?.name || 'Product unavailable'}</strong><p>{sizeLabel(line.size)} · Qty {line.quantity}</p></div><span>{money(unitPrice * line.quantity)}</span></div> })}{typeof order.shippingFee === 'number' && <div className="order-total"><span>Shipping</span><strong>{money(order.shippingFee)}</strong></div>}{typeof order.stripeFee === 'number' && order.stripeFee > 0 && <div className="order-total"><span>Stripe fee</span><strong>{money(order.stripeFee)}</strong></div>}<div className="order-total"><span>{awaitingCash ? 'Amount due' : 'Total paid'}</span><strong>{money(order.total)}</strong></div></div>
    </div>
    {awaitingCash && order.status !== 'Cancelled' && <div className="order-cash-action">
      <p>Record payment once you receive the cash. Stock is deducted when payment is recorded.</p>
      <button className="button button-dark" disabled={saving} onClick={onCashPayment}>Mark cash as received</button>
    </div>}
  </section>
}


function AdminLocked({ onSignIn }: { onSignIn: () => void }) { return <main className="admin-locked page-wrap"><div className="locked-mark">{icon('sparkle')}</div><p className="eyebrow">Private studio / Admin</p><h1>Welcome <em>back.</em></h1><p>Sign in to manage orders, inventory and product images.</p><button className="button button-dark" onClick={onSignIn}>Sign in to admin {icon('arrow')}</button></main> }
function AdminRouteGuard({ onNavigate }: { onNavigate: (view: View) => void }) { return <main className="admin-locked page-wrap"><div className="locked-mark">{icon('sparkle')}</div><p className="eyebrow">Private studio</p><h1>This area is <em>private.</em></h1><p>Admin sign in is available only from the private admin page.</p><button className="button button-dark" onClick={() => onNavigate('admin')}>Go to admin sign in {icon('arrow')}</button></main> }
function AdminLogin({ onClose, onLogin, error }: { onClose: () => void; onLogin: (email: string, password: string) => Promise<void>; error: string }) { const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); await onLogin(email, password); setBusy(false) } return <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="login-card" role="dialog" aria-modal="true" aria-label="Admin sign in"><button className="modal-close" onClick={onClose} aria-label="Close admin sign in">{icon('close')}</button><p className="eyebrow">Fragrance Land / Private studio</p><h2>Welcome back.</h2><p className="login-copy">Sign in to manage your catalog and incoming orders.</p><form onSubmit={submit}><label>Email address<input required type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} /></label><label>Password<input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p className="field-error">{error}</p>}<button className="button button-dark full-button" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'} {icon('arrow')}</button></form></div></div> }
function Footer() { return <footer className="site-footer section-wrap"><img src={logo} alt="Fragrance Land" /><p>© 2026 Fragrance Land. Made for beautiful rituals.</p><span>Dubai · UAE</span></footer> }
