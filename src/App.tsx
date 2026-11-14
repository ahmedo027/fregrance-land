import { type CSSProperties, type FormEvent, useEffect, useState } from 'react'
import ProductsAdminV2 from './ProductsAdmin'

type View = 'shop' | 'cart' | 'orders' | 'products' | 'admin'
type OrderStatus = 'Pending' | 'Processing' | 'Shipped' | 'Completed' | 'Cancelled'

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
  sizes: number[]
  active: boolean
  accent: string
}

type CartLine = { productId: string; size: number; quantity: number }
type Order = {
  id: string
  date: string
  customer: { name: string; email: string; phone: string; address: string; notes: string }
  lines: CartLine[]
  total: number
  status: OrderStatus
}

const logo = '/assets/fragrance-land-logo.png'
const fallbackImage = 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1200&q=85'

const starterProducts: Product[] = [
  {
    id: 'santal-21', name: 'Santal 21', subtitle: 'A warm, polished signature', category: 'Woody', price: 148, stock: 18,
    notes: ['Sandalwood', 'Cardamom', 'Amber'], description: 'A quiet statement of warm sandalwood, bright cardamom and a skin-like amber dry down. Designed to linger close and leave a memorable trail.',
    images: ['https://images.unsplash.com/photo-1547887538-e3a2f32cb1cc?auto=format&fit=crop&w=1200&q=85', fallbackImage], sizes: [50, 75, 100], active: true, accent: '#c8753c',
  },
  {
    id: 'orange-blossom', name: 'Orange Blossom', subtitle: 'Sunlit citrus, soft petals', category: 'Floral', price: 122, stock: 24,
    notes: ['Neroli', 'Orange blossom', 'Musk'], description: 'A luminous floral built around fresh neroli and orange blossom, softened with clean musk and a hint of green leaves.',
    images: ['https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=1200&q=85', fallbackImage], sizes: [50, 75, 100], active: true, accent: '#efaa62',
  },
  {
    id: 'velvet-oud', name: 'Velvet Oud', subtitle: 'Deep, smoky and magnetic', category: 'Oriental', price: 176, stock: 9,
    notes: ['Oud', 'Rose', 'Saffron'], description: 'An enveloping composition where smoky oud meets crimson rose and a thread of saffron. Bold, velvety and made for evening.',
    images: ['https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=1200&q=85', fallbackImage], sizes: [50, 75], active: true, accent: '#722e2a',
  },
  {
    id: 'fig-leaf', name: 'Fig Leaf', subtitle: 'Green, creamy, effortless', category: 'Fresh', price: 118, stock: 32,
    notes: ['Fig leaf', 'Cedar', 'Coconut'], description: 'The softness of ripe fig with crisp green leaves and a creamy cedar base. An easy, everyday veil for warm days.',
    images: ['https://images.unsplash.com/photo-1588405748880-12d1d2a0c2e4?auto=format&fit=crop&w=1200&q=85', fallbackImage], sizes: [50, 75, 100], active: true, accent: '#8b9867',
  },
  {
    id: 'iris-noir', name: 'Iris Noir', subtitle: 'Powdered elegance, reimagined', category: 'Floral', price: 154, stock: 14,
    notes: ['Iris', 'Violet', 'Tonka'], description: 'A modern iris with the coolness of violet and the soft warmth of tonka bean. Powdery, poised, and never predictable.',
    images: ['https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=1200&q=85', fallbackImage], sizes: [50, 75, 100], active: true, accent: '#82739d',
  },
  {
    id: 'sea-salt', name: 'Sea Salt', subtitle: 'Air, mineral and light', category: 'Fresh', price: 106, stock: 27,
    notes: ['Sea salt', 'Bergamot', 'Driftwood'], description: 'A clean mineral scent that opens with sparkling bergamot before settling into sun-warmed driftwood and salt-kissed skin.',
    images: ['https://images.unsplash.com/photo-1610461888750-10bfc601b8a5?auto=format&fit=crop&w=1200&q=85', fallbackImage], sizes: [50, 75, 100], active: true, accent: '#7e9aa5',
  },
]

const sampleOrders: Order[] = [
  { id: 'FL-240816-01', date: '16 Aug 2026', customer: { name: 'Maya Al-Hadi', email: 'maya@example.com', phone: '+971 50 123 4567', address: 'Jumeirah, Dubai', notes: '' }, lines: [{ productId: 'santal-21', size: 75, quantity: 1 }], total: 148, status: 'Processing' },
  { id: 'FL-240815-02', date: '15 Aug 2026', customer: { name: 'Omar Rahman', email: 'omar@example.com', phone: '+971 55 879 2210', address: 'Al Barsha, Dubai', notes: 'Please call on arrival.' }, lines: [{ productId: 'orange-blossom', size: 50, quantity: 1 }, { productId: 'fig-leaf', size: 50, quantity: 1 }], total: 240, status: 'Pending' },
  { id: 'FL-240812-03', date: '12 Aug 2026', customer: { name: 'Lina Costa', email: 'lina@example.com', phone: '+971 52 445 0076', address: 'Al Reem Island, Abu Dhabi', notes: '' }, lines: [{ productId: 'velvet-oud', size: 50, quantity: 1 }], total: 176, status: 'Completed' },
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

function money(value: number) { return `$${value.toFixed(2)}` }
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
  const [orders, setOrders] = useState<Order[]>([])
  const [cart, setCart] = usePersistentState<CartLine[]>('fl-cart', [])
  const [activeProduct, setActiveProduct] = useState<Product | null>(null)
  const [selectedSize, setSelectedSize] = useState(50)
  const [selectedQuantity, setSelectedQuantity] = useState(1)
  const [notice, setNotice] = useState('')
  const [adminMode, setAdminMode] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [authError, setAuthError] = useState('')

  const activeProducts = products.filter(product => product.active)
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const cartTotal = cart.reduce((sum, line) => {
    const product = products.find(item => item.id === line.productId)
    return sum + (product?.price || 0) * line.quantity
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
    apiJson<Product[]>('/api/products').then(remoteProducts => { if (alive) setProducts(remoteProducts) }).catch(() => undefined)
    apiJson<{ email: string }>('/api/auth/me').then(async () => {
      if (!alive) return
      setAdminMode(true)
      const [allProducts, remoteOrders] = await Promise.all([apiJson<Product[]>('/api/products/all'), apiJson<Order[]>('/api/orders')])
      if (alive) {
        setProducts(allProducts); setOrders(remoteOrders)
        if (getView() === 'admin') { window.history.replaceState({}, '', '/orders'); setView('orders') }
      }
    }).catch(() => undefined)
    return () => { alive = false }
  }, [])

  function openProduct(product: Product) {
    setActiveProduct(product)
    setSelectedSize(product.sizes[0])
    setSelectedQuantity(1)
  }

  function addToCart(productId: string, size: number, quantity: number) {
    setCart(current => {
      const found = current.find(line => line.productId === productId && line.size === size)
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
      const order = await apiJson<Order>('/api/orders', { method: 'POST', body: JSON.stringify({ customer, lines: cart }) })
      setCart([])
      setNotice(`Order ${order.id} received — thank you for choosing Fragrance Land`)
      event.currentTarget.reset()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to place the order.') }
    window.setTimeout(() => setNotice(''), 3500)
  }

  async function loginAdmin(email: string, password: string) {
    try {
      await apiJson('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      const [allProducts, remoteOrders] = await Promise.all([apiJson<Product[]>('/api/products/all'), apiJson<Order[]>('/api/orders')])
      setProducts(allProducts); setOrders(remoteOrders); setAdminMode(true); setShowLogin(false); setAuthError(''); navigate('orders')
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

  async function updateOrderStatus(id: string, status: OrderStatus) {
    const updated = await apiJson<Order>(`/api/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    setOrders(current => current.map(order => order.id === updated.id ? updated : order))
  }

  return <div className="app-shell">
    <Header view={view} cartCount={cartCount} adminMode={adminMode} onNavigate={navigate} onLogout={logoutAdmin} />
    {view === 'shop' && <Shop products={activeProducts} onProduct={openProduct} onNavigate={navigate} />}
    {view === 'cart' && <Cart products={products} cart={cart} total={cartTotal} onUpdate={updateLine} onNavigate={navigate} onSubmit={submitOrder} />}
    {view === 'orders' && adminMode && <Orders orders={orders} products={products} onStatus={updateOrderStatus} />}
    {view === 'products' && adminMode && <ProductsAdminV2 products={products} onSave={saveProduct} onDelete={deleteProduct} />}
    {view === 'admin' && !adminMode && <AdminLocked onSignIn={() => { setAuthError(''); setShowLogin(true) }} />}
    {(view === 'orders' || view === 'products') && !adminMode && <AdminRouteGuard onNavigate={navigate} />}
    {showLogin && view === 'admin' && <AdminLogin onClose={() => setShowLogin(false)} onLogin={loginAdmin} error={authError} />}
    {activeProduct && <ProductModal product={activeProduct} selectedSize={selectedSize} selectedQuantity={selectedQuantity} onSize={setSelectedSize} onQuantity={setSelectedQuantity} onClose={() => setActiveProduct(null)} onAdd={() => addToCart(activeProduct.id, selectedSize, selectedQuantity)} />}
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

function Shop({ products, onProduct, onNavigate }: { products: Product[]; onProduct: (product: Product) => void; onNavigate: (view: View) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const categories = ['All', ...Array.from(new Set(products.map(product => product.category)))]
  const filtered = products.filter(product => (category === 'All' || product.category === category) && `${product.name} ${product.subtitle} ${product.notes.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  return <main>
    <section className="hero section-wrap">
      <div className="hero-copy"><p className="eyebrow">Fragrance, beautifully composed</p><h1>Find the scent<br /><em>that feels like you.</em></h1><p className="hero-description">Thoughtfully blended fragrances for every version of your day. Explore a considered collection of modern signatures.</p><button className="button button-dark" onClick={() => document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' })}>Explore the collection {icon('arrow')}</button></div>
      <div className="hero-art"><div className="hero-orb orb-one" /><div className="hero-orb orb-two" /><div className="hero-bottle"><span className="bottle-cap" /><span className="bottle-label">FL<br /><small>NO. 01</small></span></div><div className="hero-caption">A little ritual<br /><strong>for every day.</strong></div></div>
    </section>
    <section id="collection" className="collection section-wrap"><div className="section-heading"><div><p className="eyebrow">The collection</p><h2>Made to be remembered.</h2></div><button className="text-button" onClick={() => onNavigate('cart')}>View your cart {icon('arrow')}</button></div>
      <div className="catalog-tools"><div className="search-field">{icon('search')}<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by scent or note" aria-label="Search products" /></div><div className="category-tabs">{categories.map(item => <button key={item} className={category === item ? 'category-tab active' : 'category-tab'} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
      <div className="product-grid">{filtered.map(product => <ProductCard key={product.id} product={product} onClick={() => onProduct(product)} />)}</div>
      {!filtered.length && <div className="empty-state"><span>{icon('sparkle')}</span><h3>No scents found.</h3><p>Try a different name, note or category.</p></div>}
    </section>
    <section className="brand-story section-wrap"><div className="story-mark">{icon('sparkle')}</div><div><p className="eyebrow">The Fragrance Land point of view</p><h2>Small rituals.<br /><em>Beautifully yours.</em></h2></div><p>We believe fragrance should feel personal, never precious. Every blend is made to meet you where you are — and stay with you a little longer.</p></section>
    <Footer />
  </main>
}

function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) { return <button className="product-card" onClick={onClick}><div className="product-visual" style={{ '--accent': product.accent } as CSSProperties}><img src={product.images[0]} alt={product.name} loading="lazy" /><span className="product-tag">{product.category}</span><span className="quick-view">Quick view {icon('arrow')}</span></div><div className="product-card-meta"><div><h3>{product.name}</h3><p>{product.subtitle}</p></div><strong>{money(product.price)}</strong></div></button> }

function ProductModal({ product, selectedSize, selectedQuantity, onSize, onQuantity, onClose, onAdd }: { product: Product; selectedSize: number; selectedQuantity: number; onSize: (size: number) => void; onQuantity: (quantity: number) => void; onClose: () => void; onAdd: () => void }) { return <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="product-modal" role="dialog" aria-modal="true" aria-label={product.name}><button className="modal-close" onClick={onClose} aria-label="Close product details">{icon('close')}</button><div className="modal-gallery"><img src={product.images[0]} alt={product.name} /><div className="gallery-dots"><span className="active" /><span /><span /></div></div><div className="modal-content"><p className="eyebrow">{product.category} / Fragrance Land</p><h2>{product.name}</h2><p className="modal-subtitle">{product.subtitle}</p><p className="modal-description">{product.description}</p><div className="notes"><p className="label">The notes</p><div>{product.notes.map(note => <span key={note}>{note}</span>)}</div></div><div className="modal-option"><p className="label">Size</p><div className="size-options">{product.sizes.map(size => <button key={size} className={selectedSize === size ? 'size-option active' : 'size-option'} onClick={() => onSize(size)}>{size} ml</button>)}</div></div><div className="modal-buy"><div className="quantity-control"><button onClick={() => onQuantity(Math.max(1, selectedQuantity - 1))} aria-label="Decrease quantity">{icon('minus')}</button><span>{selectedQuantity}</span><button onClick={() => onQuantity(selectedQuantity + 1)} aria-label="Increase quantity">{icon('plus')}</button></div><button className="button button-dark add-button" onClick={onAdd}>Add to cart <span>{money(product.price * selectedQuantity)}</span></button></div></div></div></div> }

function Cart({ products, cart, total, onUpdate, onNavigate, onSubmit }: { products: Product[]; cart: CartLine[]; total: number; onUpdate: (line: CartLine, quantity: number) => void; onNavigate: (view: View) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <main className="page-wrap"><div className="page-intro"><p className="eyebrow">Your collection</p><h1>Take your favorites<br /><em>home with you.</em></h1></div>{cart.length === 0 ? <div className="empty-cart"><div className="empty-cart-mark">{icon('bag')}</div><h2>Your cart is waiting.</h2><p>Start with one scent and see where it takes you.</p><button className="button button-dark" onClick={() => onNavigate('shop')}>Explore perfumes {icon('arrow')}</button></div> : <div className="cart-layout"><section className="cart-lines"><div className="cart-section-title"><h2>Selected scents</h2><span>{cart.length} {cart.length === 1 ? 'item' : 'items'}</span></div>{cart.map(line => { const product = products.find(item => item.id === line.productId); if (!product) return null; return <div className="cart-line" key={`${line.productId}-${line.size}`}><img src={product.images[0]} alt={product.name} /><div className="cart-line-info"><p className="eyebrow">{product.category}</p><h3>{product.name}</h3><p>{line.size} ml · {money(product.price)}</p></div><div className="quantity-control"><button onClick={() => onUpdate(line, line.quantity - 1)} aria-label="Decrease quantity">{icon('minus')}</button><span>{line.quantity}</span><button onClick={() => onUpdate(line, line.quantity + 1)} aria-label="Increase quantity">{icon('plus')}</button></div><strong>{money(product.price * line.quantity)}</strong><button className="remove-button" onClick={() => onUpdate(line, 0)}>Remove</button></div>})}<button className="text-button back-button" onClick={() => onNavigate('shop')}>← Continue shopping</button></section><section className="checkout-card"><div className="checkout-summary"><div><span>Subtotal</span><strong>{money(total)}</strong></div><div><span>Delivery</span><strong className="free">Complimentary</strong></div><div className="total-row"><span>Total</span><strong>{money(total)}</strong></div></div><div className="checkout-divider" /><form onSubmit={onSubmit}><div className="checkout-title"><p className="eyebrow">Almost yours</p><h2>Delivery details</h2></div><label>Full name<input required name="name" placeholder="Your name" /></label><label>Email address<input required type="email" name="email" placeholder="you@example.com" /></label><div className="form-row"><label>Phone<input required name="phone" placeholder="+971" /></label><label>Address<input required name="address" placeholder="City, area" /></label></div><label>Notes <span className="optional">optional</span><textarea name="notes" placeholder="Anything we should know?"></textarea></label><button className="button button-dark full-button" type="submit">Place your order {icon('arrow')}</button><p className="secure-note">Your order is saved securely for this demo.</p></form></section></div>}</main> }

function Orders({ orders, products, onStatus }: { orders: Order[]; products: Product[]; onStatus: (id: string, status: OrderStatus) => void }) { return <main className="admin-page page-wrap"><div className="admin-intro"><div><p className="eyebrow">Admin / Operations</p><h1>Orders <em>coming in.</em></h1></div><div className="admin-stat"><span>{orders.filter(order => order.status === 'Pending').length}</span><small>awaiting attention</small></div></div><div className="admin-table"><div className="table-head"><span>Order</span><span>Customer</span><span>Items</span><span>Total</span><span>Status</span></div>{orders.map(order => <div className="table-row" key={order.id}><div><strong>{order.id}</strong><small>{order.date}</small></div><div><strong>{order.customer.name}</strong><small>{order.customer.email}</small></div><div><strong>{order.lines.reduce((sum, line) => sum + line.quantity, 0)} items</strong><small>{order.lines.map(line => products.find(product => product.id === line.productId)?.name).join(', ')}</small></div><strong>{money(order.total)}</strong><select className={`status-select ${order.status.toLowerCase()}`} value={order.status} onChange={event => onStatus(order.id, event.target.value as OrderStatus)}>{(['Pending', 'Processing', 'Shipped', 'Completed', 'Cancelled'] as OrderStatus[]).map(status => <option key={status}>{status}</option>)}</select></div>)}</div></main> }

function ProductsAdmin({ products, onSave, onDelete }: { products: Product[]; onSave: (product: Product) => void; onDelete: (id: string) => void }) { const blank: Product = { id: '', name: '', subtitle: '', category: 'Woody', price: 120, stock: 10, notes: [''], description: '', images: [fallbackImage, fallbackImage], sizes: [50, 75, 100], active: true, accent: '#c8753c' }; const [draft, setDraft] = useState<Product>(blank); const [editing, setEditing] = useState(false); const [saved, setSaved] = useState(false); function save(event: FormEvent) { event.preventDefault(); const product = { ...draft, id: draft.id || `${draft.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`, notes: draft.notes.filter(Boolean) }; onSave(product); setDraft(blank); setEditing(false); setSaved(true); window.setTimeout(() => setSaved(false), 2200) } function edit(product: Product) { setDraft(product); setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }) } return <main className="admin-page page-wrap"><div className="admin-intro"><div><p className="eyebrow">Admin / Catalog</p><h1>Make the shelf <em>yours.</em></h1></div><button className="button button-dark" onClick={() => { setDraft(blank); setEditing(false) }}>{icon('plus')} New product</button></div><div className="product-admin-layout"><form className="product-form" onSubmit={save}><div className="form-card-heading"><div><p className="eyebrow">{editing ? 'Edit product' : 'Add a new product'}</p><h2>{editing ? draft.name : 'New fragrance'}</h2></div>{editing && <button type="button" className="icon-button" onClick={() => { setDraft(blank); setEditing(false) }} aria-label="Cancel editing">{icon('close')}</button>}</div><label>Product name<input required value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Rose Atelier" /></label><label>Short description<input required value={draft.subtitle} onChange={event => setDraft({ ...draft, subtitle: event.target.value })} placeholder="A warm, polished signature" /></label><div className="form-row"><label>Category<select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>{['Woody', 'Floral', 'Fresh', 'Oriental'].map(category => <option key={category}>{category}</option>)}</select></label><label>Price<input required type="number" min="0" value={draft.price} onChange={event => setDraft({ ...draft, price: Number(event.target.value) })} /></label></div><div className="form-row"><label>Stock<input required type="number" min="0" value={draft.stock} onChange={event => setDraft({ ...draft, stock: Number(event.target.value) })} /></label><label>Accent color<input type="color" value={draft.accent} onChange={event => setDraft({ ...draft, accent: event.target.value })} /></label></div><label>Image URL<input value={draft.images[0]} onChange={event => setDraft({ ...draft, images: [event.target.value, draft.images[1] || event.target.value] })} placeholder="https://..." /></label><label>Fragrance notes<input value={draft.notes.join(', ')} onChange={event => setDraft({ ...draft, notes: event.target.value.split(',').map(note => note.trim()) })} placeholder="Sandalwood, Rose, Amber" /></label><label>Description<textarea required value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="Tell customers how it feels..."></textarea></label><label className="checkbox-label"><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} /> Visible in shop</label><button className="button button-dark full-button" type="submit">{editing ? 'Save changes' : 'Add to catalog'} {icon('arrow')}</button>{saved && <p className="saved-message">{icon('check')} Saved successfully.</p>}</form><div className="admin-product-list"><div className="list-heading"><h2>Catalog</h2><span>{products.length} products</span></div>{products.map(product => <div className="admin-product-row" key={product.id}><img src={product.images[0]} alt="" /><div><strong>{product.name}</strong><small>{product.category} · {product.stock} in stock</small></div><span className={product.active ? 'active-dot' : 'inactive-dot'}>{product.active ? 'Live' : 'Hidden'}</span><button className="icon-button" onClick={() => edit(product)} aria-label={`Edit ${product.name}`}>{icon('edit')}</button><button className="icon-button danger" onClick={() => onDelete(product.id)} aria-label={`Delete ${product.name}`}>{icon('trash')}</button></div>)}</div></div></main> }

function AdminLocked({ onSignIn }: { onSignIn: () => void }) { return <main className="admin-locked page-wrap"><div className="locked-mark">{icon('sparkle')}</div><p className="eyebrow">Private studio / Admin</p><h1>Welcome <em>back.</em></h1><p>Sign in to manage orders, inventory and product images.</p><button className="button button-dark" onClick={onSignIn}>Sign in to admin {icon('arrow')}</button></main> }
function AdminRouteGuard({ onNavigate }: { onNavigate: (view: View) => void }) { return <main className="admin-locked page-wrap"><div className="locked-mark">{icon('sparkle')}</div><p className="eyebrow">Private studio</p><h1>This area is <em>private.</em></h1><p>Admin sign in is available only from the private admin page.</p><button className="button button-dark" onClick={() => onNavigate('admin')}>Go to admin sign in {icon('arrow')}</button></main> }
function AdminLogin({ onClose, onLogin, error }: { onClose: () => void; onLogin: (email: string, password: string) => Promise<void>; error: string }) { const [email, setEmail] = useState('admin@fragranceland.local'); const [password, setPassword] = useState('admin123'); const [busy, setBusy] = useState(false); async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); await onLogin(email, password); setBusy(false) } return <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="login-card" role="dialog" aria-modal="true" aria-label="Admin sign in"><button className="modal-close" onClick={onClose} aria-label="Close admin sign in">{icon('close')}</button><p className="eyebrow">Fragrance Land / Private studio</p><h2>Welcome back.</h2><p className="login-copy">Sign in to manage your catalog and incoming orders.</p><form onSubmit={submit}><label>Email address<input required type="email" value={email} onChange={event => setEmail(event.target.value)} /></label><label>Password<input required type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p className="field-error">{error}</p>}<button className="button button-dark full-button" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'} {icon('arrow')}</button><p className="login-hint">Local default: admin@fragranceland.local / admin123</p></form></div></div> }
function Footer() { return <footer className="site-footer section-wrap"><img src={logo} alt="Fragrance Land" /><p>© 2026 Fragrance Land. Made for beautiful rituals.</p><span>Dubai · UAE</span></footer> }

