import crypto from 'node:crypto'

export const EXPENSE_CATEGORIES = ['Raw Materials', 'Packaging', 'Shipping', 'Marketing', 'Advertising', 'Rent', 'Salaries', 'Subscriptions', 'Other Expenses']
export const MATERIAL_CATEGORIES = ['Perfume oils', 'Oud oils', 'Alcohol', 'Musk', 'Bakhoor ingredients', 'Packaging materials', 'Bottles', 'Boxes', 'Other']
export const MATERIAL_UNITS = ['ml', 'liters', 'grams', 'kilograms', 'pieces']
export const PAYMENT_METHODS = ['Cash', 'Card', 'Bank transfer', 'Other']

const money = value => {
  const amount = Number(value || 0)
  return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : 0
}
const quantity = value => {
  const amount = Number(value || 0)
  return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(3)) : 0
}
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max)
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
const today = () => new Date().toISOString().slice(0, 10)
const newId = () => crypto.randomUUID()

function normalizeSize(size) {
  const value = Number(size?.value)
  const unit = size?.unit === 'g' ? 'g' : 'ml'
  return { value: Number.isInteger(value) && value > 0 ? value : 50, unit }
}

function sizeKey(size) {
  const normalized = normalizeSize(size)
  return `${normalized.value}-${normalized.unit}`
}

function inRange(date, from, to) {
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

function dateForOrder(order) {
  if (order.createdAt) return String(order.createdAt).slice(0, 10)
  const parsed = new Date(order.date)
  return Number.isNaN(parsed.getTime()) ? today() : parsed.toISOString().slice(0, 10)
}

function localState(store) {
  if (!store.accountant || typeof store.accountant !== 'object') store.accountant = {}
  for (const key of ['expenses', 'materials', 'outsideSales', 'batches', 'batchMaterials', 'movements', 'auditLogs']) {
    if (!Array.isArray(store.accountant[key])) store.accountant[key] = []
  }
  return store.accountant
}

export function createAccountantService({ supabase, getStore, writeStore, getProducts, auditActor = 'admin' }) {
  const remote = Boolean(supabase)

  async function list(table, order = 'created_at') {
    const { data, error } = await supabase.from(table).select('*').order(order, { ascending: false })
    if (error) throw new Error(`${table} read failed: ${error.message}`)
    return data || []
  }

  async function one(table, id) {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`${table} read failed: ${error.message}`)
    return data
  }

  async function insert(table, payload) {
    const { data, error } = await supabase.from(table).insert(payload).select().single()
    if (error) throw new Error(`${table} write failed: ${error.message}`)
    return data
  }

  async function update(table, id, payload) {
    const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single()
    if (error) throw new Error(`${table} update failed: ${error.message}`)
    return data
  }

  async function audit(action, entityType, entityId, metadata = {}) {
    const record = { actor: auditActor, action, entity_type: entityType, entity_id: String(entityId || ''), metadata }
    if (remote) return insert('accountant_audit_logs', record)
    const state = localState(getStore())
    state.auditLogs.unshift({ id: newId(), ...record, created_at: new Date().toISOString() })
  }

  async function recordMovement(input) {
    const movement = {
      idempotency_key: text(input.idempotencyKey, 180),
      movement_type: text(input.movementType, 60),
      reference_id: text(input.referenceId, 180),
      inventory_key: text(input.inventoryKey, 180),
      product_id: input.productId ? text(input.productId, 180) : null,
      material_id: input.materialId || null,
      size_value: input.sizeValue || null,
      size_unit: input.sizeUnit || null,
      quantity_delta: Number(input.quantityDelta || 0),
      unit: text(input.unit || 'pieces', 30),
      unit_cost: money(input.unitCost),
    }
    if (remote) {
      const { data, error } = await supabase.rpc('accountant_record_inventory_movement', { p_payload: movement })
      if (error) throw new Error(`Inventory movement failed: ${error.message}`)
      return data || { duplicate: false }
    }
    const state = localState(getStore())
    if (state.movements.some(item => item.idempotency_key === movement.idempotency_key)) return { duplicate: true }
    if (movement.material_id) {
      const material = state.materials.find(item => item.id === movement.material_id)
      if (!material) throw new Error('Raw material not found.')
      const next = quantity(Number(material.quantity || 0) + movement.quantity_delta)
      if (next < 0) throw new Error(`Not enough ${material.name} in raw-material inventory.`)
      material.quantity = next
    }
    state.movements.unshift({ id: newId(), ...movement, created_at: new Date().toISOString() })
    return { duplicate: false }
  }

  async function expenses() { return remote ? list('accountant_expenses', 'transaction_date') : localState(getStore()).expenses }
  async function materials() { return remote ? list('accountant_materials', 'purchase_date') : localState(getStore()).materials }
  async function outsideSales() {
    if (!remote) return localState(getStore()).outsideSales
    const rows = await list('accountant_outside_sales', 'sale_date')
    const legacy = Array.isArray(getStore().externalSales) ? getStore().externalSales : []
    if (rows.length || !legacy.length) return rows
    for (const legacySale of legacy) {
      try {
        const normalized = normalizeSale({ id: legacySale.id, productId: legacySale.productId, size: legacySale.size, quantity: legacySale.quantity, unitPrice: legacySale.unitPrice, saleDate: legacySale.date, notes: legacySale.notes, confirmed: true })
        await insert('accountant_outside_sales', { id: /^[0-9a-f-]{36}$/i.test(normalized.id) ? normalized.id : newId(), product_id: normalized.product_id, size_value: normalized.size_value, size_unit: normalized.size_unit, quantity: normalized.quantity, unit_price: normalized.unit_price, discount_percent: normalized.discount_percent, payment_method: 'Other', sale_date: normalized.sale_date, notes: normalized.notes, status: 'Confirmed' })
      } catch (error) { console.warn('Legacy outside sale migration skipped:', error?.message || error) }
    }
    return list('accountant_outside_sales', 'sale_date')
  }
  async function batches() { return remote ? list('accountant_production_batches', 'batch_date') : localState(getStore()).batches }
  async function batchMaterials(batchId) {
    if (remote) {
      const { data, error } = await supabase.from('accountant_production_batch_materials').select('*').eq('batch_id', batchId)
      if (error) throw new Error(`Production materials read failed: ${error.message}`)
      return data || []
    }
    return localState(getStore()).batchMaterials.filter(item => item.batch_id === batchId)
  }

  async function createExpense(input) {
    const record = {
      id: newId(), category: EXPENSE_CATEGORIES.includes(input?.category) ? input.category : 'Other Expenses',
      description: text(input?.description, 500), amount: money(input?.amount), transaction_date: validDate(input?.transactionDate) ? input.transactionDate : today(),
    }
    if (record.amount <= 0) throw new Error('Expense amount must be greater than zero.')
    const saved = remote ? await insert('accountant_expenses', record) : (() => { const state = localState(getStore()); const value = { ...record, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; state.expenses.unshift(value); return value })()
    await audit('create', 'expense', saved.id, saved)
    await writeStore(getStore())
    return saved
  }

  async function updateExpense(id, input) {
    const record = { category: EXPENSE_CATEGORIES.includes(input?.category) ? input.category : 'Other Expenses', description: text(input?.description, 500), amount: money(input?.amount), transaction_date: validDate(input?.transactionDate) ? input.transactionDate : today(), updated_at: new Date().toISOString() }
    if (record.amount <= 0) throw new Error('Expense amount must be greater than zero.')
    const saved = remote ? await update('accountant_expenses', id, record) : (() => { const value = localState(getStore()).expenses.find(item => item.id === id); if (!value) return null; Object.assign(value, record); return value })()
    if (!saved) throw new Error('Expense not found.')
    await audit('update', 'expense', id, record)
    await writeStore(getStore())
    return saved
  }

  async function deleteExpense(id) {
    if (remote) {
      const { error } = await supabase.from('accountant_expenses').delete().eq('id', id)
      if (error) throw new Error(`Expense delete failed: ${error.message}`)
    } else {
      const state = localState(getStore()); const before = state.expenses.length; state.expenses = state.expenses.filter(item => item.id !== id); if (before === state.expenses.length) throw new Error('Expense not found.')
    }
    await audit('delete', 'expense', id)
    await writeStore(getStore())
  }

  function normalizeMaterial(input, existing = {}) {
    const name = text(input?.name ?? existing.name, 160)
    const category = MATERIAL_CATEGORIES.includes(input?.category ?? existing.category) ? (input?.category ?? existing.category) : 'Other'
    const unit = MATERIAL_UNITS.includes(input?.unit ?? existing.unit) ? (input?.unit ?? existing.unit) : 'pieces'
    const value = { id: existing.id || newId(), name, category, quantity: quantity(input?.quantity ?? existing.quantity), unit, purchase_price: money(input?.purchasePrice ?? existing.purchase_price), cost_per_unit: money(input?.costPerUnit ?? existing.cost_per_unit), supplier: text(input?.supplier ?? existing.supplier, 160), purchase_date: validDate(input?.purchaseDate ?? existing.purchase_date) ? (input?.purchaseDate ?? existing.purchase_date) : today(), low_stock_threshold: quantity(input?.lowStockThreshold ?? existing.low_stock_threshold) }
    if (!name) throw new Error('Raw material name is required.')
    if (value.cost_per_unit <= 0 && value.quantity > 0 && value.purchase_price > 0) value.cost_per_unit = money(value.purchase_price / value.quantity)
    return value
  }

  async function createMaterial(input) {
    const record = normalizeMaterial(input)
    const startingQuantity = record.quantity
    record.quantity = 0
    const saved = remote ? await insert('accountant_materials', record) : (() => { const value = { ...record, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; localState(getStore()).materials.unshift(value); return value })()
    if (startingQuantity > 0) await recordMovement({ idempotencyKey: `material-purchase:${saved.id}`, movementType: 'material_purchase', referenceId: saved.id, inventoryKey: `material:${saved.id}`, materialId: saved.id, quantityDelta: startingQuantity, unit: saved.unit, unitCost: saved.cost_per_unit })
    await audit('create', 'material', saved.id, { ...saved, startingQuantity })
    await writeStore(getStore())
    if (remote && startingQuantity > 0) return (await one('accountant_materials', saved.id)) || saved
    return saved
  }

  async function updateMaterial(id, input) {
    const current = remote ? await one('accountant_materials', id) : localState(getStore()).materials.find(item => item.id === id)
    if (!current) throw new Error('Raw material not found.')
    const next = normalizeMaterial(input, current)
    const delta = quantity(next.quantity - Number(current.quantity || 0))
    next.quantity = current.quantity
    const saved = remote ? await update('accountant_materials', id, { name: next.name, category: next.category, unit: next.unit, purchase_price: next.purchase_price, cost_per_unit: next.cost_per_unit, supplier: next.supplier, purchase_date: next.purchase_date, low_stock_threshold: next.low_stock_threshold }) : Object.assign(current, { ...next, quantity: current.quantity })
    if (delta) await recordMovement({ idempotencyKey: `material-adjustment:${id}:${Date.now()}`, movementType: 'adjustment', referenceId: id, inventoryKey: `material:${id}`, materialId: id, quantityDelta: delta, unit: next.unit, unitCost: next.cost_per_unit })
    await audit('update', 'material', id, { ...next, quantityDelta: delta })
    await writeStore(getStore())
    return remote ? (await one('accountant_materials', id)) || saved : saved
  }

  async function deleteMaterial(id) {
    const current = remote ? await one('accountant_materials', id) : localState(getStore()).materials.find(item => item.id === id)
    if (!current) throw new Error('Raw material not found.')
    if (remote) { const { error } = await supabase.from('accountant_materials').delete().eq('id', id); if (error) throw new Error(`Material delete failed: ${error.message}`) }
    else { const state = localState(getStore()); state.materials = state.materials.filter(item => item.id !== id) }
    await audit('delete', 'material', id)
    await writeStore(getStore())
  }

  function productById(id) { return getProducts().find(product => product.id === id) }

  function normalizeSale(input, existing = {}) {
    const product = productById(String(input?.productId ?? existing.product_id ?? ''))
    if (!product) throw new Error('Choose a valid product for the outside sale.')
    const size = normalizeSize(input?.size ?? { value: existing.size_value, unit: existing.size_unit })
    if (!product.sizes.some(option => Number(option.value) === size.value && option.unit === size.unit)) throw new Error('Choose a valid product size.')
    const sale = { id: existing.id || newId(), product_id: product.id, size_value: size.value, size_unit: size.unit, quantity: Number(input?.quantity ?? existing.quantity), unit_price: money(input?.unitPrice ?? existing.unit_price), discount_percent: Math.min(100, Math.max(0, Number(input?.discountPercent ?? existing.discount_percent ?? 0))), payment_method: PAYMENT_METHODS.includes(input?.paymentMethod ?? existing.payment_method) ? (input?.paymentMethod ?? existing.payment_method) : 'Other', sale_date: validDate(input?.saleDate ?? existing.sale_date) ? (input?.saleDate ?? existing.sale_date) : today(), notes: text(input?.notes ?? existing.notes, 500), status: input?.status || existing.status || 'Confirmed' }
    if (!Number.isInteger(sale.quantity) || sale.quantity < 1) throw new Error('Sale quantity must be a whole number from 1 upward.')
    if (sale.unit_price < 0) throw new Error('Sale price cannot be negative.')
    return { ...sale, total: money(sale.quantity * sale.unit_price * (1 - sale.discount_percent / 100)), productName: product.name, size }
  }

  async function createOutsideSale(input) {
    const sale = normalizeSale(input)
    const product = productById(sale.product_id)
    if (sale.status === 'Confirmed') {
      if (Number(product.stock) < sale.quantity) throw new Error('Not enough finished-product stock for this sale.')
      product.stock -= sale.quantity
    }
    const payload = { id: sale.id, product_id: sale.product_id, size_value: sale.size_value, size_unit: sale.size_unit, quantity: sale.quantity, unit_price: sale.unit_price, discount_percent: sale.discount_percent, payment_method: sale.payment_method, sale_date: sale.sale_date, notes: sale.notes, status: sale.status }
    const saved = remote ? await insert('accountant_outside_sales', payload) : (() => { const value = { ...payload, total: sale.total, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; localState(getStore()).outsideSales.unshift(value); return value })()
    if (sale.status === 'Confirmed') await recordMovement({ idempotencyKey: `outside-sale:${sale.id}`, movementType: 'outside_sale', referenceId: sale.id, inventoryKey: `product:${sale.product_id}`, productId: sale.product_id, sizeValue: sale.size_value, sizeUnit: sale.size_unit, quantityDelta: -sale.quantity, unit: 'pieces', unitCost: 0 })
    await audit('create', 'outside_sale', sale.id, payload)
    await writeStore(getStore())
    return { ...saved, total: sale.total, productName: product.name, size: { value: sale.size_value, unit: sale.size_unit } }
  }

  async function updateOutsideSale(id, input) {
    const current = remote ? await one('accountant_outside_sales', id) : localState(getStore()).outsideSales.find(item => item.id === id)
    if (!current) throw new Error('Outside sale not found.')
    const next = normalizeSale(input, current)
    if (current.status === 'Confirmed' && next.status !== 'Cancelled') throw new Error('Confirmed sales cannot be edited. Cancel it and create a corrected sale.')
    const saved = remote ? await update('accountant_outside_sales', id, { notes: next.notes, status: next.status }) : Object.assign(current, { notes: next.notes, status: next.status })
    await audit('update', 'outside_sale', id, { status: next.status })
    await writeStore(getStore())
    return saved
  }

  async function deleteOutsideSale(id) {
    const current = remote ? await one('accountant_outside_sales', id) : localState(getStore()).outsideSales.find(item => item.id === id)
    if (!current) throw new Error('Outside sale not found.')
    if (current.status === 'Confirmed') {
      const product = productById(current.product_id)
      if (product) product.stock += Number(current.quantity || 0)
      await recordMovement({ idempotencyKey: `outside-sale-reversal:${id}`, movementType: 'outside_sale_reversal', referenceId: id, inventoryKey: `product:${current.product_id}`, productId: current.product_id, sizeValue: current.size_value, sizeUnit: current.size_unit, quantityDelta: Number(current.quantity || 0), unit: 'pieces', unitCost: 0 })
    }
    if (remote) { const { error } = await supabase.from('accountant_outside_sales').update({ status: 'Cancelled', updated_at: new Date().toISOString() }).eq('id', id); if (error) throw new Error(`Outside sale cancellation failed: ${error.message}`) }
    else current.status = 'Cancelled'
    await audit('cancel', 'outside_sale', id)
    await writeStore(getStore())
  }

  async function createProductionBatch(input) {
    const product = productById(String(input?.productId || ''))
    if (!product) throw new Error('Choose a valid finished product.')
    const size = normalizeSize(input?.size)
    if (!product.sizes.some(option => Number(option.value) === size.value && option.unit === size.unit)) throw new Error('Choose a valid product size.')
    const produced = Number(input?.quantityProduced)
    if (!Number.isInteger(produced) || produced < 1) throw new Error('Finished quantity must be a whole number from 1 upward.')
    const materialInputs = Array.isArray(input?.materials) ? input.materials : []
    if (!materialInputs.length) throw new Error('Add at least one raw material to the batch.')
    const allMaterials = await materials()
    const lines = materialInputs.map(line => {
      const material = allMaterials.find(item => item.id === line.materialId)
      if (!material) throw new Error('A selected raw material no longer exists.')
      const used = quantity(line.quantityUsed)
      if (used <= 0 || Number(material.quantity) < used) throw new Error(`Not enough ${material.name} for this batch.`)
      const unitCost = money(material.cost_per_unit)
      return { material, quantity_used: used, unit_cost: unitCost, total_cost: money(used * unitCost) }
    })
    const rawMaterialCost = money(lines.reduce((sum, line) => sum + line.total_cost, 0))
    const packagingCost = money(input?.packagingCost)
    const productionCost = money(rawMaterialCost + packagingCost)
    const batch = { id: newId(), product_id: product.id, size_value: size.value, size_unit: size.unit, quantity_produced: produced, raw_material_cost: rawMaterialCost, packaging_cost: packagingCost, production_cost: productionCost, cost_per_finished_product: money(productionCost / produced), batch_date: validDate(input?.batchDate) ? input.batchDate : today(), notes: text(input?.notes, 800), status: input?.confirmed === false ? 'Draft' : 'Confirmed' }
    if (batch.status === 'Confirmed') {
      product.productionCost = money(rawMaterialCost / produced)
      product.packagingCost = money(packagingCost / produced)
      if (remote) {
        const { data, error } = await supabase.rpc('accountant_confirm_production_batch', { p_payload: { batch, materials: lines.map(line => ({ material_id: line.material.id, quantity_used: line.quantity_used, unit_cost: line.unit_cost, total_cost: line.total_cost })) } })
        if (error) throw new Error(`Production batch failed: ${error.message}`)
        product.stock += produced
        await writeStore(getStore())
        await audit('create', 'production_batch', batch.id, batch)
        return { ...(data || batch), materialLines: lines }
      }
      for (const line of lines) {
        await recordMovement({ idempotencyKey: `batch:${batch.id}:material:${line.material.id}`, movementType: 'material_use', referenceId: batch.id, inventoryKey: `material:${line.material.id}`, materialId: line.material.id, quantityDelta: -line.quantity_used, unit: line.material.unit, unitCost: line.unit_cost })
      }
      product.stock += produced
    }
    if (remote) {
      const saved = await insert('accountant_production_batches', batch)
      if (lines.length) await supabase.from('accountant_production_batch_materials').insert(lines.map(line => ({ batch_id: batch.id, material_id: line.material.id, quantity_used: line.quantity_used, unit_cost: line.unit_cost, total_cost: line.total_cost })))
      await audit('create', 'production_batch', batch.id, batch)
      await writeStore(getStore())
      return { ...saved, materialLines: lines }
    }
    const state = localState(getStore())
    state.batches.unshift(batch)
    state.batchMaterials.push(...lines.map(line => ({ id: newId(), batch_id: batch.id, material_id: line.material.id, quantity_used: line.quantity_used, unit_cost: line.unit_cost, total_cost: line.total_cost })))
    await audit('create', 'production_batch', batch.id, batch)
    await writeStore(getStore())
    return { ...batch, materialLines: lines }
  }

  async function getInventory() {
    const productInventory = getProducts().map(product => ({ inventoryType: 'Finished products', id: product.id, name: product.name, quantity: Number(product.stock || 0), unit: 'pieces', value: money(Number(product.stock || 0) * (Number(product.productionCost || 0) + Number(product.packagingCost || 0))), lowStock: Number(product.stock || 0) <= 3 }))
    const materialRows = await materials()
    const materialInventory = materialRows.map(material => ({ inventoryType: material.category, id: material.id, name: material.name, quantity: Number(material.quantity || 0), unit: material.unit, value: money(Number(material.quantity || 0) * Number(material.cost_per_unit || 0)), lowStock: Number(material.quantity || 0) <= Number(material.low_stock_threshold || 0) }))
    return [...productInventory, ...materialInventory]
  }

  async function summary({ from, to } = {}) {
    const store = getStore()
    const [expenseRows, materialRows, salesRows, batchRows] = await Promise.all([expenses(), materials(), outsideSales(), batches()])
    const products = getProducts()
    const productRows = products.map(product => ({ id: product.id, name: product.name, image: product.images?.[0] || '', productionCost: money(product.productionCost), packagingCost: money(product.packagingCost), unitCost: money(Number(product.productionCost || 0) + Number(product.packagingCost || 0)), websiteUnits: 0, outsideUnits: 0, websiteRevenue: 0, outsideRevenue: 0 }))
    const byId = new Map(productRows.map(product => [product.id, product]))
    let websiteRevenue = 0; let shippingRevenue = 0; let websiteUnits = 0; let websiteOrderCount = 0; let stripeFees = 0
    for (const order of store.orders || []) {
      const date = dateForOrder(order)
      if (!inRange(date, from, to) || order.status === 'Cancelled' || (order.paymentStatus && order.paymentStatus !== 'Paid')) continue
      websiteOrderCount += 1; shippingRevenue += money(order.shippingFee); stripeFees += money(order.stripeFee)
      for (const line of order.lines || []) {
        const product = byId.get(line.productId); const units = Number(line.quantity || 0); const revenue = money(Number(line.price || 0) * units)
        if (product) { product.websiteUnits += units; product.websiteRevenue += revenue }
        websiteUnits += units; websiteRevenue += revenue
      }
    }
    const outsideSalesFiltered = salesRows.filter(sale => sale.status !== 'Cancelled' && inRange(String(sale.sale_date), from, to)).map(sale => { const product = byId.get(sale.product_id); const total = money(Number(sale.quantity || 0) * Number(sale.unit_price || 0) * (1 - Number(sale.discount_percent || 0) / 100)); if (product) { product.outsideUnits += Number(sale.quantity || 0); product.outsideRevenue += total }; return { ...sale, productName: product?.name || 'Deleted product', total, size: { value: sale.size_value, unit: sale.size_unit } } })
    const outsideRevenue = money(outsideSalesFiltered.reduce((sum, sale) => sum + sale.total, 0))
    const totalUnits = websiteUnits + outsideSalesFiltered.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0)
    const productRowsFinal = productRows.map(product => { const units = product.websiteUnits + product.outsideUnits; const revenue = money(product.websiteRevenue + product.outsideRevenue); const cogs = money(units * product.unitCost); return { ...product, totalUnits: units, totalRevenue: revenue, estimatedCost: cogs, estimatedProfit: money(revenue - cogs) } })
    const expensesFiltered = expenseRows.filter(expense => inRange(String(expense.transaction_date), from, to))
    const totalExpenses = money(expensesFiltered.reduce((sum, expense) => sum + Number(expense.amount || 0), 0))
    const totalRevenue = money(websiteRevenue + shippingRevenue + outsideRevenue)
    const cogs = money(productRowsFinal.reduce((sum, product) => sum + product.estimatedCost, 0))
    const grossProfit = money(totalRevenue - cogs)
    const netProfit = money(grossProfit - totalExpenses)
    const inventory = await getInventory()
    const inventoryValue = money(inventory.reduce((sum, item) => sum + item.value, 0))
    const fixedExpenseCategories = new Set(['Rent', 'Salaries', 'Subscriptions', 'Marketing', 'Advertising', 'Other Expenses'])
    const fixedExpenses = money(expensesFiltered.filter(expense => fixedExpenseCategories.has(expense.category)).reduce((sum, expense) => sum + Number(expense.amount || 0), 0))
    const contributionMargin = totalUnits ? (totalRevenue - cogs) / totalUnits : 0
    const breakEvenUnits = contributionMargin > 0 ? Math.ceil(fixedExpenses / contributionMargin) : 0
    return { currency: 'AED', dateRange: { from: from || null, to: to || null }, generatedAt: new Date().toISOString(), dashboard: { totalRevenue, grossProfit, netProfit, totalExpenses, costOfGoodsSold: cogs, totalProductsSold: totalUnits, outsideSales: outsideRevenue, websiteSales: money(websiteRevenue + shippingRevenue), inventoryValue, stripeFees, breakEvenProgress: breakEvenUnits ? Math.min(100, Math.round((totalUnits / breakEvenUnits) * 100)) : 0 }, breakEven: { fixedExpenses, contributionMargin: money(contributionMargin), unitsNeeded: breakEvenUnits, unitsSold: totalUnits }, website: { orderCount: websiteOrderCount, units: websiteUnits, productRevenue: websiteRevenue, shippingRevenue, collectedRevenue: money(websiteRevenue + shippingRevenue) }, external: { saleCount: outsideSalesFiltered.length, units: outsideSalesFiltered.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0), productRevenue: outsideRevenue }, products: productRowsFinal, expenses: expensesFiltered, materials: materialRows, outsideSales: outsideSalesFiltered, batches: batchRows.filter(batch => inRange(String(batch.batch_date), from, to)), inventory }
  }

  return { summary, expenses, createExpense, updateExpense, deleteExpense, materials, createMaterial, updateMaterial, deleteMaterial, outsideSales, createOutsideSale, updateOutsideSale, deleteOutsideSale, batches, batchMaterials, createProductionBatch, getInventory, recordMovement, audit }
}

