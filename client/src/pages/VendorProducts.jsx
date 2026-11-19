import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button.jsx';
import { ProductMediaPicker } from '../components/ProductMediaPicker.jsx';
import { getErrorMessage } from '../lib/forms.js';
import { useVendorProducts, useSaveVendorProduct, usePublishVendorProduct, useArchiveVendorProduct } from '../lib/vendorProducts.js';
import './pages.css';
import './vendor-products.css';

const EMPTY = { name: '', description: '', price: '', unit: 'portion', maxPerOrder: '20' };
const money = (kobo) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(kobo || 0) / 100);

export function VendorProducts() {
  const query = useVendorProducts(); const save = useSaveVendorProduct(); const publish = usePublishVendorProduct(); const archive = useArchiveVendorProduct();
  const [form, setForm] = useState(EMPTY); const [editing, setEditing] = useState(null); const [notice, setNotice] = useState('');
  const [mediaFor, setMediaFor] = useState(null);
  const products = query.data || [];
  const publishedCount = useMemo(() => products.filter((p) => p.isPublished).length, [products]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  function beginEdit(product) {
    setEditing(product.id); setForm({ name: product.name, description: product.description || '', price: (product.priceKobo / 100).toFixed(2), unit: product.unit || 'item', maxPerOrder: String(product.maxPerOrder || 20) });
    setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reset() { setEditing(null); setForm(EMPTY); }
  async function submit(event) {
    event.preventDefault(); setNotice('');
    const price = Number(form.price);
    if (!Number.isFinite(price) || price <= 0) { setNotice('Enter a valid price greater than ₦0.'); return; }
    try {
      await save.mutateAsync({ ...(editing ? { id: editing } : {}), name: form.name.trim(), description: form.description.trim() || null, priceKobo: Math.round(price * 100), unit: form.unit.trim(), maxPerOrder: Number(form.maxPerOrder) });
      setNotice(editing ? 'Product details updated.' : 'Product saved as a draft. Publish it when it is ready.'); reset();
    } catch (error) { setNotice(getErrorMessage(error)); }
  }
  async function togglePublished(product) {
    try { await publish.mutateAsync({ id: product.id, isPublished: !product.isPublished }); setNotice(product.isPublished ? 'Product unpublished.' : 'Product published to the customer storefront.'); }
    catch (error) { setNotice(getErrorMessage(error)); }
  }
  async function remove(product) {
    if (!window.confirm(`Archive “${product.name}”? It will no longer appear in your product list.`)) return;
    try { await archive.mutateAsync(product.id); if (editing === product.id) reset(); setNotice('Product archived.'); }
    catch (error) { setNotice(getErrorMessage(error)); }
  }

  return <main className="vendor-products-page">
    <header className="vendor-products-header"><div><p className="eyebrow">Vendor workspace</p><h1>Product management</h1><p className="muted">Add your products, keep prices up to date, and control what customers can see.</p></div><Link className="vendor-products-back" to="/vendor">← Back to orders</Link></header>
    <section className="vendor-products-stats"><article><span>Total products</span><strong>{products.length}</strong></article><article><span>Published</span><strong>{publishedCount}</strong></article><article><span>Drafts / hidden</span><strong>{products.length - publishedCount}</strong></article></section>
    <section className="vendor-products-panel"><div className="vendor-products-panel-heading"><div><h2>{editing ? 'Edit product' : 'Add a product'}</h2><p className="muted">New products are saved as drafts and are not visible to customers until published.</p></div></div>
      <form className="vendor-product-form" onSubmit={submit}>
        <label>Product name<input required minLength="2" maxLength="160" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Party Jollof Rice" /></label>
        <label>Price (₦)<input required type="number" min="0.01" step="0.01" value={form.price} onChange={(e) => update('price', e.target.value)} placeholder="2500" /></label>
        <label>Unit / serving<input required maxLength="30" value={form.unit} onChange={(e) => update('unit', e.target.value)} placeholder="plate, portion, pack" /></label>
        <label>Maximum per order<input required type="number" min="1" max="50" value={form.maxPerOrder} onChange={(e) => update('maxPerOrder', e.target.value)} /></label>
        <label className="vendor-product-description">Description<textarea rows="3" maxLength="1000" value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Describe the ingredients, size or what makes it special." /></label>
        {notice && <p className="vendor-products-notice" role="status">{notice}</p>}
        <div className="vendor-product-form-actions"><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Save product'}</Button>{editing && <Button variant="secondary" type="button" onClick={reset}>Cancel edit</Button>}</div>
      </form>
    </section>
    <section className="vendor-products-panel"><div className="vendor-products-panel-heading"><div><h2>Your products</h2><p className="muted">Only published and platform-approved products can appear in the store.</p></div></div>
      {query.isLoading && <p className="muted">Loading products…</p>}
      {query.isError && <p className="vendor-products-error">{getErrorMessage(query.error)}</p>}
      {!query.isLoading && !query.isError && products.length === 0 && <div className="vendor-products-empty"><h3>No products yet</h3><p className="muted">Use the form above to add your first product.</p></div>}
      <div className="vendor-products-list">{products.map((product) => <div key={product.id}><article className="vendor-product-row"><div className="vendor-product-info">{product.imageUrl && <img className="vendor-product-thumb" src={product.imageUrl} alt="" />}<div className="vendor-product-title"><h3>{product.name}</h3><span className={product.isPublished ? 'vendor-product-badge is-live' : 'vendor-product-badge'}>{product.isPublished ? 'Published' : 'Draft / hidden'}</span></div><strong>{money(product.priceKobo)} <small>/ {product.unit}</small></strong><p className="muted">{product.description || 'No description added.'}</p><small>Maximum {product.maxPerOrder} per order</small><small>Markets: {product.markets.length ? product.markets.join(', ') : 'none yet'}</small>{(!product.imageUrl || product.markets.length === 0) && <small className="vendor-product-hint">Add a photo and at least one market before publishing.</small>}</div><div className="vendor-product-actions"><Button variant="secondary" onClick={() => setMediaFor(mediaFor === product.id ? null : product.id)}>{product.imageUrl ? 'Photo & markets' : 'Add photo & markets'}</Button><Button variant="secondary" onClick={() => beginEdit(product)}>Edit</Button><Button variant={product.isPublished ? 'secondary' : 'primary'} onClick={() => togglePublished(product)} disabled={publish.isPending}>{product.isPublished ? 'Unpublish' : 'Publish'}</Button><button className="vendor-product-archive" type="button" onClick={() => remove(product)} disabled={archive.isPending}>Archive</button></div></article>{mediaFor === product.id && <ProductMediaPicker product={product} onCancel={() => setMediaFor(null)} onSaved={() => { setMediaFor(null); setNotice('Photo and markets saved. You can publish this product now.'); }} />}</div>)}</div>
    </section>
  </main>;
}
