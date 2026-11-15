import { type ChangeEvent, type FormEvent, useState } from 'react'
import type { Category, Product } from './App'

type Props = {
  products: Product[]
  categories: Category[]
  onSave: (product: Product) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onSaveCategory: (category: Category) => Promise<void>
  onDeleteCategory: (id: string) => Promise<void>
}

const emptyProduct = (categories: Category[]): Product => ({
  id: '', name: '', subtitle: '', category: categories[0]?.id || '', price: 120, stock: 10,
  notes: [''], description: '', images: ['', ''], sizes: [50, 75, 100], active: true, accent: '#c8753c',
})

function categoryLabel(id: string, categories: Category[]) {
  const category = categories.find(item => item.id === id)
  return category ? `${category.nameEn} · ${category.nameAr}` : id
}

function actionIcon(kind: 'edit' | 'trash') {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={kind === 'edit' ? 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z' : 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'} /></svg>
}

export default function ProductsAdminV2({ products, categories, onSave, onDelete, onSaveCategory, onDeleteCategory }: Props) {
  const [draft, setDraft] = useState<Product>(emptyProduct(categories))
  const [editing, setEditing] = useState(false)
  const [imageSource, setImageSource] = useState<'upload' | 'url'>('upload')
  const [imageError, setImageError] = useState('')
  const [saved, setSaved] = useState(false)

  function startNew() {
    setDraft(emptyProduct(categories))
    setEditing(false)
    setImageSource('upload')
    setImageError('')
  }

  function edit(product: Product) {
    setDraft(product)
    setEditing(true)
    setImageSource(product.images[0]?.startsWith('data:') ? 'upload' : 'url')
    setImageError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setImageError('Please choose an image file.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      setDraft(current => ({ ...current, images: [dataUrl, current.images[1] || dataUrl] }))
      setImageError('')
    }
    reader.readAsDataURL(file)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.images[0]) {
      setImageError('Add an image by uploading a file or entering an image URL.')
      return
    }
    const product = { ...draft, id: draft.id || `${draft.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`, notes: draft.notes.filter(Boolean) }
    try { await onSave(product) } catch (error) { setImageError(error instanceof Error ? error.message : 'Unable to save product.'); return }
    setDraft(emptyProduct(categories))
    setEditing(false)
    setImageSource('upload')
    setImageError('')
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2200)
  }

  return <main className="admin-page page-wrap">
    <div className="admin-intro"><div><p className="eyebrow">Admin / Catalog</p><h1>Make the shelf <em>yours.</em></h1></div><button className="button button-dark" onClick={startNew}><span aria-hidden="true">＋</span> New product</button></div>
    <CategoryManager categories={categories} onSave={onSaveCategory} onDelete={onDeleteCategory} />
    <div className="product-admin-layout">
      <form className="product-form" onSubmit={save}>
        <div className="form-card-heading"><div><p className="eyebrow">{editing ? 'Edit product' : 'Add a new product'}</p><h2>{editing ? draft.name : 'New fragrance'}</h2></div>{editing && <button type="button" className="icon-button" onClick={startNew} aria-label="Cancel editing">×</button>}</div>
        <label>Product name<input required value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Rose Atelier" /></label>
        <label>Short description<input required value={draft.subtitle} onChange={event => setDraft({ ...draft, subtitle: event.target.value })} placeholder="A warm, polished signature" /></label>
        <div className="form-row"><label>Category<select required value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>{categories.map(category => <option key={category.id} value={category.id}>{categoryLabel(category.id, categories)}</option>)}</select></label><label>Price<input required type="number" min="0" value={draft.price} onChange={event => setDraft({ ...draft, price: Number(event.target.value) })} /></label></div>
        <div className="form-row"><label>Stock<input required type="number" min="0" value={draft.stock} onChange={event => setDraft({ ...draft, stock: Number(event.target.value) })} /></label><label>Accent color<input type="color" value={draft.accent} onChange={event => setDraft({ ...draft, accent: event.target.value })} /></label></div>
        <div className="image-source-field"><p className="field-label">Product image</p><div className="image-source-tabs"><button type="button" className={imageSource === 'upload' ? 'image-source-tab active' : 'image-source-tab'} onClick={() => { setImageSource('upload'); setImageError('') }}>Upload from computer</button><button type="button" className={imageSource === 'url' ? 'image-source-tab active' : 'image-source-tab'} onClick={() => { setImageSource('url'); setImageError('') }}>Use image URL</button></div>{imageSource === 'upload' ? <><input className="file-input" type="file" accept="image/*" onChange={handleImageUpload} /><p className="field-hint">Choose a JPG, PNG or WEBP image from your computer.</p></> : <input value={draft.images[0]} onChange={event => { setDraft({ ...draft, images: [event.target.value, draft.images[1] || event.target.value] }); setImageError('') }} placeholder="https://..." />}{draft.images[0] && <div className="image-preview"><img src={draft.images[0]} alt="Product preview" /><span>{imageSource === 'upload' ? 'Uploaded image preview' : 'URL image preview'}</span></div>}{imageError && <p className="field-error">{imageError}</p>}</div>
        <label>Fragrance notes<input value={draft.notes.join(', ')} onChange={event => setDraft({ ...draft, notes: event.target.value.split(',').map(note => note.trim()) })} placeholder="Sandalwood, Rose, Amber" /></label>
        <label>Description<textarea required value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="Tell customers how it feels..."></textarea></label>
        <label className="checkbox-label"><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} /> Visible in shop</label>
        <button className="button button-dark full-button" type="submit">{editing ? 'Save changes' : 'Add to catalog'} <span aria-hidden="true">→</span></button>{saved && <p className="saved-message">✓ Saved successfully.</p>}
      </form>
      <div className="admin-product-list"><div className="list-heading"><h2>Catalog</h2><span>{products.length} products</span></div>{products.map(product => <div className="admin-product-row" key={product.id}><img src={product.images[0]} alt="" /><div><strong>{product.name}</strong><small>{categoryLabel(product.category, categories)} · {product.stock} in stock</small></div><span className={product.active ? 'active-dot' : 'inactive-dot'}>{product.active ? 'Live' : 'Hidden'}</span><button className="icon-button" onClick={() => edit(product)} aria-label={`Edit ${product.name}`}>{actionIcon('edit')}</button><button className="icon-button danger" onClick={() => onDelete(product.id)} aria-label={`Delete ${product.name}`}>{actionIcon('trash')}</button></div>)}</div>
    </div>
  </main>
}

function CategoryManager({ categories, onSave, onDelete }: { categories: Category[]; onSave: (category: Category) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [draft, setDraft] = useState<Category>({ id: '', nameEn: '', nameAr: '' })
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  function reset() { setDraft({ id: '', nameEn: '', nameAr: '' }); setEditing(false); setError('') }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try { await onSave(draft); reset() } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Unable to save category.') }
  }

  return <section className="category-manager">
    <div className="category-manager-heading"><div><p className="eyebrow">Admin / Categories</p><h2>Shape your <em>collection.</em></h2><p>Add each category in English and Arabic. Customers will see both names.</p></div><span className="category-count">{categories.length} categories</span></div>
    <div className="category-manager-body">
      <form className="category-form" onSubmit={save}>
        <div className="form-card-heading"><div><p className="eyebrow">{editing ? 'Edit category' : 'New category'}</p><h3>{editing ? 'Update names' : 'Add a category'}</h3></div>{editing && <button type="button" className="icon-button" onClick={reset} aria-label="Cancel category editing">×</button>}</div>
        <div className="form-row"><label>English name<input required value={draft.nameEn} onChange={event => setDraft({ ...draft, nameEn: event.target.value })} placeholder="e.g. Citrus" /></label><label>Arabic name<input required dir="rtl" value={draft.nameAr} onChange={event => setDraft({ ...draft, nameAr: event.target.value })} placeholder="مثال: حمضيات" /></label></div>
        {error && <p className="field-error">{error}</p>}
        <button className="button button-dark" type="submit">{editing ? 'Save category' : 'Add category'} <span aria-hidden="true">→</span></button>
      </form>
      <div className="category-list">{categories.map(category => <div className="category-row" key={category.id}><div><strong>{category.nameEn}</strong><span dir="rtl">{category.nameAr}</span></div><button className="text-button" type="button" onClick={() => { setDraft(category); setEditing(true); setError('') }}>Edit</button><button className="text-button danger-text" type="button" onClick={async () => { try { await onDelete(category.id) } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete category.') } }}>Delete</button></div>)}</div>
    </div>
  </section>
}

