import { type FormEvent, useEffect, useMemo, useState } from 'react'
import type { Product } from './App'

type Section = 'overview' | 'materials' | 'production' | 'sales' | 'expenses'
type Expense = { id: string; category: string; description: string; amount: number; transaction_date: string }
type Material = { id: string; name: string; category: string; quantity: number; unit: string; purchase_price: number; cost_per_unit: number; supplier: string; purchase_date: string; low_stock_threshold: number }
type Sale = { id: string; product_id: string; productName: string; size_value: number; size_unit: 'ml' | 'g'; quantity: number; unit_price: number; discount_percent: number; payment_method: string; sale_date: string; notes: string; total: number; status: string }
type Batch = { id: string; product_id: string; size_value: number; size_unit: 'ml' | 'g'; quantity_produced: number; raw_material_cost: number; packaging_cost: number; production_cost: number; cost_per_finished_product: number; batch_date: string; notes: string; status: string }
type ProductResult = { id: string; name: string; productionCost: number; packagingCost: number; unitCost: number; totalUnits: number; totalRevenue: number; estimatedCost: number; estimatedProfit: number; websiteUnits: number; outsideUnits: number }
type Summary = { generatedAt: string; dashboard: { totalRevenue: number; grossProfit: number; netProfit: number; totalExpenses: number; costOfGoodsSold: number; totalProductsSold: number; outsideSales: number; websiteSales: number; inventoryValue: number; stripeFees: number }; website: { orderCount: number; units: number; productRevenue: number; shippingRevenue: number }; external: { saleCount: number; units: number; productRevenue: number }; products: ProductResult[]; expenses: Expense[]; materials: Material[]; outsideSales: Sale[]; batches: Batch[]; inventory: { inventoryType: string; id: string; name: string; quantity: number; unit: string; value: number; lowStock: boolean }[] }

const expenseCategories = ['Raw Materials', 'Packaging', 'Shipping', 'Marketing', 'Advertising', 'Rent', 'Salaries', 'Subscriptions', 'Other Expenses']
const materialCategories = ['Perfume oils', 'Oud oils', 'Alcohol', 'Musk', 'Bakhoor ingredients', 'Packaging materials', 'Bottles', 'Boxes', 'Other']
const materialUnits = ['ml', 'liters', 'grams', 'kilograms', 'pieces']
const paymentMethods = ['Cash', 'Card', 'Bank transfer', 'Other']
const money = (value: number) => `AED ${Number(value || 0).toFixed(2)}`
const today = () => new Date().toISOString().slice(0, 10)
const dateMinus = (days: number) => { const date = new Date(); date.setDate(date.getDate() - days); return date.toISOString().slice(0, 10) }

async function request<T>(url: string, options: RequestInit = {}) {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`)
  return payload as T
}

function materialUnitHint(unit: string) {
  if (unit === 'liters') return 'Stored as ml'
  if (unit === 'kilograms') return 'Stored as grams'
  return `Stored as ${unit}`
}

function sizeFor(product?: Product) {
  return product?.sizes?.[0] || { value: 50, unit: 'ml' as const }
}

export default function AccountantTest({ products }: { products: Product[] }) {
  const [section, setSection] = useState<Section>('overview')
  const [from, setFrom] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`)
  const [to, setTo] = useState(today())
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '')
  const [materialLines, setMaterialLines] = useState<{ materialId: string; quantityUsed: string }[]>([{ materialId: '', quantityUsed: '' }])
  const [aiQuestion, setAiQuestion] = useState('Explain my profit and the most expensive products in this period.')
  const [aiAnswer, setAiAnswer] = useState('')
  const [aiBusy, setAiBusy] = useState(false)

  const selectedProduct = products.find(product => product.id === selectedProductId) || products[0]
  const selectedSize = sizeFor(selectedProduct)
  const sortedProducts = useMemo(() => [...(summary?.products || [])].sort((a, b) => b.estimatedProfit - a.estimatedProfit), [summary])

  async function refresh() {
    setLoading(true); setError('')
    try { setSummary(await request<Summary>(`/api/accountant/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)) } catch (value) { setError(value instanceof Error ? value.message : 'Unable to load accounting data.') } finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [from, to])
  useEffect(() => { if (!selectedProductId && products[0]) setSelectedProductId(products[0].id) }, [products, selectedProductId])

  function flash(message: string) { setNotice(message); window.setTimeout(() => setNotice(''), 3500) }
  async function save(url: string, method: string, body: Record<string, unknown>, message: string) {
    setBusy(true); setError('')
    try { await request(url, { method, body: JSON.stringify(body) }); await refresh(); flash(message); return true } catch (value) { setError(value instanceof Error ? value.message : 'Unable to save this record.'); return false } finally { setBusy(false) }
  }

  async function submitMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    const saved = await save(editingMaterial ? `/api/accountant/materials/${editingMaterial.id}` : '/api/accountant/materials', editingMaterial ? 'PATCH' : 'POST', { name: form.get('name'), category: form.get('category'), unit: form.get('unit'), quantity: form.get('quantity'), purchasePrice: form.get('purchasePrice'), costPerUnit: form.get('costPerUnit'), supplier: form.get('supplier'), purchaseDate: form.get('purchaseDate'), lowStockThreshold: form.get('lowStockThreshold') }, editingMaterial ? 'Material updated.' : 'Material purchase recorded.')
    if (!saved) return
    setEditingMaterial(null); event.currentTarget.reset()
  }

  async function submitBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    const lines = materialLines.filter(line => line.materialId && Number(line.quantityUsed) > 0).map(line => ({ materialId: line.materialId, quantityUsed: Number(line.quantityUsed) }))
    if (!lines.length) { setError('Add at least one material and quantity to the recipe.'); return }
    const saved = await save('/api/accountant/production/batches', 'POST', { productId: form.get('productId'), size: { value: Number(form.get('sizeValue')), unit: form.get('sizeUnit') }, quantityProduced: Number(form.get('quantityProduced')), packagingCost: Number(form.get('packagingCost') || 0), batchDate: form.get('batchDate'), notes: form.get('notes'), confirmed: true, materials: lines }, 'Production batch saved and stock updated.')
    if (!saved) return
    setMaterialLines([{ materialId: '', quantityUsed: '' }]); event.currentTarget.reset()
  }

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    const saved = await save('/api/accountant/outside-sales', 'POST', { productId: form.get('productId'), size: { value: Number(form.get('sizeValue')), unit: form.get('sizeUnit') }, quantity: Number(form.get('quantity')), unitPrice: Number(form.get('unitPrice')), discountPercent: Number(form.get('discountPercent') || 0), paymentMethod: form.get('paymentMethod'), saleDate: form.get('saleDate'), notes: form.get('notes'), confirmed: true }, 'Outside sale recorded and stock updated.')
    if (!saved) return
    event.currentTarget.reset()
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    const saved = await save(editingExpense ? `/api/accountant/expenses/${editingExpense.id}` : '/api/accountant/expenses', editingExpense ? 'PATCH' : 'POST', { category: form.get('category'), amount: Number(form.get('amount')), transactionDate: form.get('transactionDate'), description: form.get('description') }, editingExpense ? 'Expense updated.' : 'Expense recorded.')
    if (!saved) return
    setEditingExpense(null); event.currentTarget.reset()
  }

  async function remove(url: string, message: string) { if (!window.confirm('Are you sure?')) return; await save(url, 'DELETE', {}, message) }
  async function askAi(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setAiBusy(true); setError(''); try { setAiAnswer((await request<{ answer: string }>('/api/accountant/ask', { method: 'POST', body: JSON.stringify({ question: aiQuestion, from, to }) })).answer) } catch (value) { setError(value instanceof Error ? value.message : 'Unable to ask the AI accountant.') } finally { setAiBusy(false) } }

  if (loading && !summary) return <main className="accounting-page page-wrap"><div className="accounting-loading">Loading accounting records…</div></main>
  if (!summary) return <main className="accounting-page page-wrap"><div className="accounting-error">{error || 'Accounting records are unavailable.'}<button className="button button-dark" onClick={() => void refresh()}>Try again</button></div></main>

  return <main className="accounting-page page-wrap">
    <header className="accounting-header"><div><p className="eyebrow">Admin / Finance</p><h1>Accounting <em>control room.</em></h1><p>Track what each perfume costs to make, what it earns, and what is still in stock.</p></div><button className="button button-light" disabled={loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh records'}</button></header>
    <section className="accounting-datebar"><div><span>Report period</span><strong>{from} → {to}</strong></div><label>From<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={event => setTo(event.target.value)} /></label><button className="text-button" onClick={() => { setFrom(dateMinus(30)); setTo(today()) }}>Last 30 days</button></section>
    <nav className="accounting-nav" aria-label="Accounting sections">{([['overview', 'Overview'], ['materials', 'Materials'], ['production', 'Production'], ['sales', 'Sales'], ['expenses', 'Expenses']] as [Section, string][]).map(([key, label]) => <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}>{label}</button>)}</nav>
    {error && <div className="accounting-error">{error}</div>}{notice && <div className="accounting-success">{notice}</div>}
    {section === 'overview' && <Overview summary={summary} products={sortedProducts} aiQuestion={aiQuestion} setAiQuestion={setAiQuestion} aiAnswer={aiAnswer} onAsk={askAi} aiBusy={aiBusy} />}
    {section === 'materials' && <Materials summary={summary} editing={editingMaterial} setEditing={setEditingMaterial} onSubmit={submitMaterial} onDelete={id => void remove(`/api/accountant/materials/${id}`, 'Material removed from active inventory.')} busy={busy} />}
    {section === 'production' && <Production products={products} materials={summary.materials} batches={summary.batches} selectedProductId={selectedProductId} selectedSize={selectedSize} setSelectedProductId={setSelectedProductId} materialLines={materialLines} setMaterialLines={setMaterialLines} onSubmit={submitBatch} busy={busy} />}
    {section === 'sales' && <Sales products={products} sales={summary.outsideSales} onSubmit={submitSale} onCancel={id => void remove(`/api/accountant/outside-sales/${id}`, 'Sale cancelled and stock restored.')} busy={busy} />}
    {section === 'expenses' && <Expenses summary={summary} editing={editingExpense} setEditing={setEditingExpense} onSubmit={submitExpense} onDelete={id => void remove(`/api/accountant/expenses/${id}`, 'Expense deleted.')} busy={busy} />}
  </main>
}

function Overview({ summary, products, aiQuestion, setAiQuestion, aiAnswer, onAsk, aiBusy }: { summary: Summary; products: ProductResult[]; aiQuestion: string; setAiQuestion: (value: string) => void; aiAnswer: string; onAsk: (event: FormEvent<HTMLFormElement>) => void; aiBusy: boolean }) {
  const cards: [string, number, string][] = [['Revenue', summary.dashboard.totalRevenue, `${summary.website.orderCount} website orders · ${summary.external.saleCount} outside sales`], ['Cost of goods', summary.dashboard.costOfGoodsSold, 'Creation cost + packaging used'], ['Expenses', summary.dashboard.totalExpenses, 'Operating expenses recorded'], ['Net profit', summary.dashboard.netProfit, 'Revenue − COGS − expenses'], ['Inventory value', summary.dashboard.inventoryValue, 'Finished products + raw materials'], ['Units sold', summary.dashboard.totalProductsSold, 'Website + outside units']]
  return <div className="accounting-stack"><section className="accounting-cards">{cards.map(([label, value, hint]) => <div className="accounting-card" key={label}><span>{label}</span><strong>{label === 'Units sold' ? Number(value || 0).toFixed(0) : money(value)}</strong><small>{hint}</small></div>)}</section><section className="accounting-grid"><div className="accounting-panel"><div className="accounting-panel-heading"><div><p className="eyebrow">Profit by product</p><h2>Which products are earning?</h2></div></div><div className="accounting-table">{products.map(product => <div className="accounting-table-row" key={product.id}><div><strong>{product.name}</strong><small>{product.totalUnits} units · {product.websiteUnits} website · {product.outsideUnits} outside</small></div><span>{money(product.unitCost)} cost/item</span><strong className={product.estimatedProfit < 0 ? 'negative' : ''}>{money(product.estimatedProfit)}</strong></div>)}{!products.length && <Empty text="Add products and sales to see profitability." />}</div></div><div className="accounting-panel"><div className="accounting-panel-heading"><div><p className="eyebrow">Sales split</p><h2>Where revenue came from.</h2></div></div><div className="accounting-big-number">{money(summary.dashboard.websiteSales + summary.dashboard.outsideSales)}</div><div className="accounting-split"><div><span>Website</span><strong>{money(summary.dashboard.websiteSales)}</strong><small>{summary.website.units} units</small></div><div><span>Outside</span><strong>{money(summary.dashboard.outsideSales)}</strong><small>{summary.external.units} units</small></div></div><p className="accounting-note">Stripe fees recorded: {money(summary.dashboard.stripeFees)} · Shipping collected: {money(summary.website.shippingRevenue)}</p></div></section><section className="accounting-panel accounting-ai"><div className="accounting-panel-heading"><div><p className="eyebrow">AI accountant</p><h2>Ask about this period.</h2></div><span>English or العربية</span></div><form onSubmit={onAsk}><textarea value={aiQuestion} onChange={event => setAiQuestion(event.target.value)} /><button className="button button-dark" disabled={aiBusy || !aiQuestion.trim()}>{aiBusy ? 'Analyzing…' : 'Analyze records'}</button></form>{aiAnswer && <div className="accounting-ai-answer">{aiAnswer.split('\n').map((line, index) => <p key={`${index}-${line}`}>{line || ' '}</p>)}</div>}</section></div>
}

function Materials({ summary, editing, setEditing, onSubmit, onDelete, busy }: { summary: Summary; editing: Material | null; setEditing: (value: Material | null) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onDelete: (id: string) => void; busy: boolean }) {
  return <div className="accounting-grid"><section className="accounting-panel"><div className="accounting-panel-heading"><div><p className="eyebrow">Raw-material purchases</p><h2>{editing ? 'Edit material' : 'Add a material'}</h2></div></div><p className="accounting-note">Enter the purchase quantity and total price. The system converts liters to ml and kilograms to grams automatically.</p><form className="accounting-form" onSubmit={onSubmit}><label>Name<input required name="name" defaultValue={editing?.name || ''} placeholder="Example perfume oil" /></label><div className="accounting-form-row"><label>Category<select name="category" defaultValue={editing?.category || 'Perfume oils'}>{materialCategories.map(value => <option key={value}>{value}</option>)}</select></label><label>Purchase unit<select name="unit" defaultValue={editing?.unit || 'liters'}>{materialUnits.map(value => <option key={value}>{value}</option>)}</select></label></div><div className="accounting-form-row"><label>Quantity<input required name="quantity" type="number" min="0.001" step="0.001" defaultValue={editing?.quantity || ''} /><small>{editing ? materialUnitHint(editing.unit) : 'Example: 1 liter or 2 kilograms'}</small></label><label>Total purchase price (AED)<input name="purchasePrice" type="number" min="0" step="0.01" defaultValue={editing?.purchase_price || ''} /><small>Used to calculate the base-unit rate</small></label></div><div className="accounting-form-row"><label>Cost per listed unit (AED)<span className="optional"> optional override</span><input name="costPerUnit" type="number" min="0" step="0.0001" defaultValue={editing?.cost_per_unit || ''} /></label><label>Low-stock alert<input name="lowStockThreshold" type="number" min="0" step="0.001" defaultValue={editing?.low_stock_threshold || 0} /></label></div><div className="accounting-form-row"><label>Purchase date<input required name="purchaseDate" type="date" defaultValue={editing?.purchase_date || today()} /></label><label>Supplier<span className="optional"> optional</span><input name="supplier" defaultValue={editing?.supplier || ''} /></label></div><button className="button button-dark full-button" disabled={busy}>{editing ? 'Save material' : 'Record purchase'}</button>{editing && <button type="button" className="text-button full-button" onClick={() => setEditing(null)}>Cancel editing</button>}</form></section><section className="accounting-panel"><div className="accounting-panel-heading"><div><p className="eyebrow">Material inventory</p><h2>Available base units</h2></div><span>{summary.materials.length} materials</span></div><div className="accounting-list">{summary.materials.map(material => <div className="accounting-list-row" key={material.id}><div><strong>{material.name}</strong><small>{material.category} · {material.quantity} {material.unit} available · {money(material.cost_per_unit)}/{material.unit}</small></div><button className="text-button" onClick={() => setEditing(material)}>Edit</button><button className="text-button danger-text" disabled={busy} onClick={() => onDelete(material.id)}>Delete</button></div>)}{!summary.materials.length && <Empty text="No purchases recorded yet." />}</div></section></div>
}

function Production({ products, materials, batches, selectedProductId, selectedSize, setSelectedProductId, materialLines, setMaterialLines, onSubmit, busy }: { products: Product[]; materials: Material[]; batches: Batch[]; selectedProductId: string; selectedSize: { value: number; unit: 'ml' | 'g' }; setSelectedProductId: (value: string) => void; materialLines: { materialId: string; quantityUsed: string }[]; setMaterialLines: (value: { materialId: string; quantityUsed: string }[]) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  const product = products.find(item => item.id === selectedProductId) || products[0]
  return <div className="accounting-grid"><section className="accounting-panel"><div className="accounting-panel-heading"><div><p className="eyebrow">Recipe and production</p><h2>Make finished stock</h2></div></div><p className="accounting-note">Choose the materials used in one batch. The system calculates raw formula cost, packaging cost, cost per finished item, and updates stock together.</p><form className="accounting-form" onSubmit={onSubmit}><label>Product<select required name="productId" value={selectedProductId} onChange={event => setSelectedProductId(event.target.value)}>{products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="accounting-form-row"><label>Size<input required name="sizeValue" type="number" min="1" defaultValue={selectedSize.value} /></label><label>Unit<select name="sizeUnit" defaultValue={selectedSize.unit}><option value="ml">ml</option><option value="g">g</option></select></label></div><div className="accounting-form-row"><label>Finished quantity<input required name="quantityProduced" type="number" min="1" step="1" defaultValue="1" /></label><label>Extra packaging cost (AED)<input name="packagingCost" type="number" min="0" step="0.01" defaultValue="0" /></label></div><div className="recipe-heading"><strong>Materials used in this batch</strong><button type="button" className="text-button" onClick={() => setMaterialLines([...materialLines, { materialId: '', quantityUsed: '' }])}>+ Add material</button></div>{materialLines.map((line, index) => <div className="recipe-row" key={index}><select required value={line.materialId} onChange={event => setMaterialLines(materialLines.map((item, itemIndex) => itemIndex === index ? { ...item, materialId: event.target.value } : item))}><option value="">Choose material</option>{materials.map(material => <option key={material.id} value={material.id}>{material.name} · {money(material.cost_per_unit)}/{material.unit}</option>)}</select><input required type="number" min="0.001" step="0.001" placeholder="Base units used" value={line.quantityUsed} onChange={event => setMaterialLines(materialLines.map((item, itemIndex) => itemIndex === index ? { ...item, quantityUsed: event.target.value } : item))} />{materialLines.length > 1 && <button type="button" className="icon-button" onClick={() => setMaterialLines(materialLines.filter((_, itemIndex) => itemIndex !== index))}>×</button>}</div>)}<label>Batch date<input required name="batchDate" type="date" defaultValue={today()} /></label><label>Notes<span className="optional"> optional</span><textarea name="notes" placeholder="Optional batch note" /></label><button className="button button-dark full-button" disabled={busy || !products.length || !materials.length}>{busy ? 'Saving batch…' : 'Confirm production batch'}</button>{!products.length && <small className="accounting-warning">Add a product first.</small>}</form></section><section className="accounting-panel"><div className="accounting-panel-heading"><div><p className="eyebrow">Production history</p><h2>Completed batches</h2></div><span>{batches.length} batches</span></div><div className="accounting-list">{batches.map(batch => <div className="accounting-list-row" key={batch.id}><div><strong>{products.find(item => item.id === batch.product_id)?.name || 'Deleted product'} · {batch.size_value}{batch.size_unit}</strong><small>{batch.batch_date} · {batch.quantity_produced} made · Raw {money(batch.raw_material_cost)} · Packaging {money(batch.packaging_cost)}</small></div><strong>{money(batch.cost_per_finished_product)}/item</strong></div>)}{!batches.length && <Empty text="No production batches recorded yet." />}</div></section></div>
}

function Sales({ products, sales, onSubmit, onCancel, busy }: { products: Product[]; sales: Sale[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: (id: string) => void; busy: boolean }) {
  const size = sizeFor(products[0])
  return <div className="accounting-grid"><section className="accounting-panel"><div className="accounting-panel-heading"><div><p className="eyebrow">Outside sales</p><h2>Record a sale</h2></div></div><p className="accounting-note">Use this for sales made in person or outside the website. Confirming a sale deducts finished-product stock.</p><form className="accounting-form" onSubmit={onSubmit}><label>Product<select required name="productId">{products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="accounting-form-row"><label>Size<input required name="sizeValue" type="number" min="1" defaultValue={size.value} /></label><label>Unit<select name="sizeUnit" defaultValue={size.unit}><option value="ml">ml</option><option value="g">g</option></select></label></div><div className="accounting-form-row"><label>Quantity<input required name="quantity" type="number" min="1" step="1" defaultValue="1" /></label><label>Unit price (AED)<input required name="unitPrice" type="number" min="0" step="0.01" /></label></div><div className="accounting-form-row"><label>Discount %<input name="discountPercent" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label><label>Payment method<select name="paymentMethod">{paymentMethods.map(method => <option key={method}>{method}</option>)}</select></label></div><label>Sale date<input required name="saleDate" type="date" defaultValue={today()} /></label><label>Notes<span className="optional"> optional</span><textarea name="notes" /></label><button className="button button-dark full-button" disabled={busy || !products.length}>Confirm outside sale</button></form></section><section className="accounting-panel"><div className="accounting-panel-heading"><div><p className="eyebrow">Outside-sales ledger</p><h2>Recorded sales</h2></div><span>{sales.length} entries</span></div><div className="accounting-list">{sales.map(sale => <div className="accounting-list-row" key={sale.id}><div><strong>{sale.productName} · {sale.size_value}{sale.size_unit}</strong><small>{sale.sale_date} · Qty {sale.quantity} · {sale.payment_method} · {sale.status}</small></div><strong>{money(sale.total)}</strong><button className="text-button danger-text" disabled={busy || sale.status === 'Cancelled'} onClick={() => onCancel(sale.id)}>Cancel</button></div>)}{!sales.length && <Empty text="No outside sales in this period." />}</div></section></div>
}

function Expenses({ summary, editing, setEditing, onSubmit, onDelete, busy }: { summary: Summary; editing: Expense | null; setEditing: (value: Expense | null) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onDelete: (id: string) => void; busy: boolean }) {
  return <div className="accounting-grid"><section className="accounting-panel"><div className="accounting-panel-heading"><div><p className="eyebrow">Operating expenses</p><h2>{editing ? 'Edit expense' : 'Record an expense'}</h2></div></div><form className="accounting-form" onSubmit={onSubmit}><label>Category<select name="category" defaultValue={editing?.category || 'Other Expenses'}>{expenseCategories.map(category => <option key={category}>{category}</option>)}</select></label><label>Amount (AED)<input required name="amount" type="number" min="0.01" step="0.01" defaultValue={editing?.amount || ''} /></label><label>Date<input required name="transactionDate" type="date" defaultValue={editing?.transaction_date || today()} /></label><label>Description<input name="description" defaultValue={editing?.description || ''} placeholder="What was this expense for?" /></label><button className="button button-dark full-button" disabled={busy}>{editing ? 'Save expense' : 'Record expense'}</button>{editing && <button type="button" className="text-button full-button" onClick={() => setEditing(null)}>Cancel editing</button>}</form></section><section className="accounting-panel"><div className="accounting-panel-heading"><div><p className="eyebrow">Expense ledger</p><h2>{money(summary.dashboard.totalExpenses)}</h2></div><span>{summary.expenses.length} entries</span></div><div className="accounting-list">{summary.expenses.map(expense => <div className="accounting-list-row" key={expense.id}><div><strong>{expense.category}</strong><small>{expense.transaction_date} · {expense.description || 'No description'}</small></div><strong>{money(expense.amount)}</strong><button className="text-button" onClick={() => setEditing(expense)}>Edit</button><button className="text-button danger-text" disabled={busy} onClick={() => onDelete(expense.id)}>Delete</button></div>)}{!summary.expenses.length && <Empty text="No expenses in this period." />}</div></section></div>
}

function Empty({ text }: { text: string }) { return <div className="accounting-empty">{text}</div> }
