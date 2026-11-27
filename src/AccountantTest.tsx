import { type FormEvent, useEffect, useMemo, useState } from 'react'
import type { Product, SizeOption } from './App'

type AccountantProduct = {
  id: string
  name: string
  image: string
  productionCost: number
  packagingCost: number
  unitCost: number
  websiteUnits: number
  externalUnits: number
  totalUnits: number
  websiteRevenue: number
  externalRevenue: number
  totalRevenue: number
  estimatedCost: number
  estimatedProfit: number
}

type ExternalSale = {
  id: string
  date: string
  productId: string
  productName: string
  size?: SizeOption
  quantity: number
  unitPrice: number
  total: number
  notes?: string
}

type Summary = {
  currency: 'AED'
  generatedAt: string
  website: { orderCount: number; units: number; productRevenue: number; shippingRevenue: number; collectedRevenue: number }
  external: { saleCount: number; units: number; productRevenue: number }
  totals: { units: number; productRevenue: number; shippingRevenue: number; collectedRevenue: number; estimatedCost: number; estimatedProfit: number }
  products: AccountantProduct[]
  externalSales: ExternalSale[]
}

function money(value: number) { return `AED ${Number(value || 0).toFixed(2)}` }
function today() { return new Date().toISOString().slice(0, 10) }
async function request<T>(url: string, options: RequestInit = {}) {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Request failed.')
  return payload as T
}

export default function AccountantTest({ products }: { products: Product[] }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [saleProductId, setSaleProductId] = useState(products[0]?.id || '')
  const [saleSize, setSaleSize] = useState('')
  const [question, setQuestion] = useState('Give me a financial overview and identify the products with the best margin.')
  const [answer, setAnswer] = useState('')
  const [asking, setAsking] = useState(false)

  const selectedSaleProduct = products.find(product => product.id === saleProductId) || products[0]
  const saleSizes = selectedSaleProduct?.sizes || []
  const currentSaleSize = saleSizes.find(size => `${size.value}-${size.unit}` === saleSize) || saleSizes[0]
  const sortedSales = useMemo(() => [...(summary?.externalSales || [])].sort((a, b) => b.date.localeCompare(a.date)), [summary])

  async function refresh() {
    setLoading(true)
    try { setSummary(await request<Summary>('/api/accountant/summary')); setError('') } catch (value) { setError(value instanceof Error ? value.message : 'Unable to load accountant data.') } finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    if (!saleProductId && products[0]) setSaleProductId(products[0].id)
    const size = products.find(product => product.id === saleProductId)?.sizes[0]
    if (size) setSaleSize(`${size.value}-${size.unit}`)
  }, [products, saleProductId])

  async function saveCosts(product: AccountantProduct, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true); setError(''); setSaved('')
    try {
      await request(`/api/accountant/costs/${encodeURIComponent(product.id)}`, { method: 'PUT', body: JSON.stringify({ productionCost: form.get('productionCost'), packagingCost: form.get('packagingCost') }) })
      await refresh(); setSaved(`${product.name} costs saved.`); window.setTimeout(() => setSaved(''), 3000)
    } catch (value) { setError(value instanceof Error ? value.message : 'Unable to save costs.') } finally { setBusy(false) }
  }

  async function addSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true); setError(''); setSaved('')
    try {
      await request('/api/accountant/sales', { method: 'POST', body: JSON.stringify({ productId: form.get('productId'), date: form.get('date'), quantity: form.get('quantity'), unitPrice: form.get('unitPrice'), size: currentSaleSize, notes: form.get('notes') }) })
      event.currentTarget.reset(); const dateInput = event.currentTarget.elements.namedItem('date') as HTMLInputElement | null; if (dateInput) dateInput.value = today(); setSaleProductId(products[0]?.id || ''); await refresh(); setSaved('Outside sale added.'); window.setTimeout(() => setSaved(''), 3000)
    } catch (value) { setError(value instanceof Error ? value.message : 'Unable to add outside sale.') } finally { setBusy(false) }
  }

  async function deleteSale(id: string) {
    if (!window.confirm('Remove this outside sale from the accountant?')) return
    setBusy(true); setError('')
    try { await request(`/api/accountant/sales/${encodeURIComponent(id)}`, { method: 'DELETE' }); await refresh() } catch (value) { setError(value instanceof Error ? value.message : 'Unable to remove outside sale.') } finally { setBusy(false) }
  }

  async function askAi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAsking(true); setError(''); setAnswer('')
    try { setAnswer((await request<{ answer: string }>('/api/accountant/ask', { method: 'POST', body: JSON.stringify({ question }) })).answer) } catch (value) { setError(value instanceof Error ? value.message : 'Unable to ask the AI accountant.') } finally { setAsking(false) }
  }

  return <main className="accountant-page page-wrap">
    <div className="admin-intro accountant-intro"><div><p className="eyebrow">Admin / Finance</p><h1>AI <em>Accountant.</em></h1><p className="admin-refresh-note">Website orders are collected automatically after successful Stripe payments.</p></div><div className="accountant-updated">{summary ? `Updated ${new Date(summary.generatedAt).toLocaleString()}` : 'Loading summary…'}</div></div>
    {error && <div className="accountant-alert">{error}</div>}
    {saved && <div className="accountant-success">{saved}</div>}
    {loading && !summary ? <div className="accountant-card accountant-loading">Loading financial summary…</div> : summary && <>
      <section className="accountant-metrics">
        <div className="accountant-metric"><span>Website collected</span><strong>{money(summary.website.collectedRevenue)}</strong><small>{summary.website.orderCount} paid orders · includes shipping</small></div>
        <div className="accountant-metric"><span>Outside sales</span><strong>{money(summary.external.productRevenue)}</strong><small>{summary.external.saleCount} entries · {summary.external.units} units</small></div>
        <div className="accountant-metric"><span>Estimated cost</span><strong>{money(summary.totals.estimatedCost)}</strong><small>Creation + packaging</small></div>
        <div className="accountant-metric highlight"><span>Estimated profit</span><strong>{money(summary.totals.estimatedProfit)}</strong><small>Product revenue minus entered costs</small></div>
      </section>

      <section className="accountant-card">
        <div className="accountant-section-heading"><div><p className="eyebrow">Cost library</p><h2>What does each item cost?</h2></div><span>{summary.products.length} products</span></div>
        <p className="accountant-help">Enter the cost to create one item and its packaging. The server uses these values to estimate product cost and profit.</p>
        <div className="accountant-table-wrap"><div className="accountant-table accountant-table-head"><span>Product</span><span>Create cost</span><span>Packaging</span><span>Unit cost</span><span>Units sold</span><span>Profit</span><span /></div>
          {summary.products.map(product => <form className="accountant-table accountant-table-row" key={product.id} onSubmit={event => saveCosts(product, event)}><div className="accountant-product-cell"><img src={product.image} alt="" /><strong>{product.name}</strong></div><input name="productionCost" type="number" min="0" step="0.01" defaultValue={product.productionCost} aria-label={`${product.name} creation cost`} /><input name="packagingCost" type="number" min="0" step="0.01" defaultValue={product.packagingCost} aria-label={`${product.name} packaging cost`} /><span>{money(product.unitCost)}</span><span>{product.totalUnits}</span><span className={product.estimatedProfit < 0 ? 'negative' : ''}>{money(product.estimatedProfit)}</span><button className="small-button" disabled={busy} type="submit">Save</button></form>)}
          {!summary.products.length && <div className="accountant-empty">Add products first, then their creation and packaging costs will appear here.</div>}
        </div>
      </section>

      <div className="accountant-two-col">
        <section className="accountant-card"><div className="accountant-section-heading"><div><p className="eyebrow">Offline revenue</p><h2>Add an outside sale.</h2></div></div><p className="accountant-help">Use this for individual sales made in person, by phone or anywhere outside the website.</p><form className="accountant-form" onSubmit={addSale}><label>Product<select required name="productId" value={saleProductId} onChange={event => { setSaleProductId(event.target.value); const size = products.find(product => product.id === event.target.value)?.sizes[0]; setSaleSize(size ? `${size.value}-${size.unit}` : '') }}>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><div className="accountant-form-row"><label>Date<input required name="date" type="date" defaultValue={today()} /></label><label>Quantity<input required name="quantity" type="number" min="1" step="1" defaultValue="1" /></label></div><div className="accountant-form-row"><label>Size<select name="size" value={currentSaleSize ? `${currentSaleSize.value}-${currentSaleSize.unit}` : ''} onChange={event => setSaleSize(event.target.value)}>{saleSizes.map(size => <option key={`${size.value}-${size.unit}`} value={`${size.value}-${size.unit}`}>{size.value} {size.unit}</option>)}</select></label><label>Unit price (AED)<input required name="unitPrice" type="number" min="0" step="0.01" /></label></div><label>Notes <span className="optional">optional</span><textarea name="notes" placeholder="Customer name, market or context (no private details needed)"></textarea></label><button className="button button-dark full-button" disabled={busy || !products.length} type="submit">Add outside sale</button></form></section>
        <section className="accountant-card"><div className="accountant-section-heading"><div><p className="eyebrow">Manual ledger</p><h2>Outside sales.</h2></div><span>{sortedSales.length} entries</span></div><div className="accountant-sales-list">{sortedSales.map(sale => <div className="accountant-sale-row" key={sale.id}><div><strong>{sale.productName}</strong><small>{sale.date} · {sale.size?.value || '—'} {sale.size?.unit || ''} · Qty {sale.quantity}</small>{sale.notes && <small>{sale.notes}</small>}</div><strong>{money(sale.total)}</strong><button className="text-button danger-text" disabled={busy} onClick={() => void deleteSale(sale.id)}>Remove</button></div>)}{!sortedSales.length && <div className="accountant-empty">No outside sales entered yet.</div>}</div></section>
      </div>

      <section className="accountant-card ai-accountant-card"><div className="accountant-section-heading"><div><p className="eyebrow">OpenAI assistant</p><h2>Ask about the business.</h2></div><span>Uses the current summary only</span></div><p className="accountant-help">The arithmetic is calculated by the website. OpenAI explains the results and finds patterns without receiving customer names, emails, phone numbers or addresses.</p><form className="accountant-ai-form" onSubmit={askAi}><textarea value={question} onChange={event => setQuestion(event.target.value)} aria-label="Question for AI accountant" /><button className="button button-dark" disabled={asking || !question.trim()} type="submit">{asking ? 'Thinking…' : 'Ask accountant'}</button></form>{answer && <div className="accountant-answer"><p className="eyebrow">AI analysis</p>{answer.split('\n').map((line, index) => <p key={`${line}-${index}`}>{line || ' '}</p>)}</div>}</section>
    </>}
  </main>
}

