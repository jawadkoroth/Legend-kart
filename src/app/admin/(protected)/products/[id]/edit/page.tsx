'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ProductMediaManager, { type ProductMedia } from '@/components/admin/ProductMediaManager';
import ProductStoryBuilder, { type StorySection } from '@/components/admin/ProductStoryBuilder';
import {
  FileText,
  Layers,
  Image as ImageIcon,
  BookOpen,
  ArrowLeft,
  Save,
  Trash2,
  Undo
} from 'lucide-react';

const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

interface ProductData {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_paise: number;
  sale_price_paise: number | null;
  sizes: string[];
  images: string[];
  is_active: boolean;
}

type TabType = 'details' | 'inventory' | 'media' | 'stories';

export default function AdminEditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [product, setProduct] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Tab states
  const [activeTab, setActiveTab] = useState<TabType>('details');

  // Form states
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [sizes, setSizes] = useState<string[]>([]);
  const [media, setMedia] = useState<ProductMedia[]>([]);
  const [coupons, setCoupons] = useState<{ id: string; code: string; checked: boolean; showOnProduct: boolean }[]>([]);
  const [stories, setStories] = useState<StorySection[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [inventory, setInventory] = useState<{ size: string; stock: number }[]>([]);

  // Draft / Warning states
  const [isDirty, setIsDirty] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const isInitialLoad = useRef(true);

  // Load initial product data
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: p } = await supabase.from('products').select('*').eq('id', id).single();
      if (!p) { setLoading(false); return; }

      setProduct(p);
      setName(p.name);
      setSlug(p.slug);
      setDescription(p.description || '');
      setPrice((p.price_paise / 100).toString());
      setSalePrice(p.sale_price_paise ? (p.sale_price_paise / 100).toString() : '');
      setSizes(p.sizes || []);
      setIsActive(p.is_active);

      // Load media
      let initialMedia: ProductMedia[] = [];
      if (Array.isArray(p.media) && p.media.length > 0) {
        initialMedia = p.media;
      } else if (Array.isArray(p.images)) {
        initialMedia = p.images.map((img: string) => ({ url: img, type: 'image' }));
      }
      setMedia(initialMedia);

      // Load coupons
      const { data: allC } = await supabase.from('coupons').select('id, code, is_active').eq('is_active', true);
      const { data: linkedC } = await supabase.from('product_coupons').select('coupon_id, show_on_product_page').eq('product_id', id);
      const formattedCoupons = (allC || []).map((c: any) => {
        const link = (linkedC || []).find((l: any) => l.coupon_id === c.id);
        return {
          id: c.id,
          code: c.code,
          checked: !!link,
          showOnProduct: link ? link.show_on_product_page : true,
        };
      });
      setCoupons(formattedCoupons);

      // Load stories
      const { data: storyRows } = await supabase
        .from('product_story_sections')
        .select('*')
        .eq('product_id', id)
        .order('display_order', { ascending: true });
      setStories((storyRows as StorySection[]) || []);

      // Load inventory
      const { data: inv } = await supabase
        .from('inventory')
        .select('size, stock')
        .eq('product_id', id);
      setInventory(inv || []);
      
      setLoading(false);
      
      // Check for local storage drafts
      const savedDraft = localStorage.getItem(`product_draft_${id}`);
      if (savedDraft) {
        setHasDraft(true);
      }
      
      setTimeout(() => {
        isInitialLoad.current = false;
      }, 500);
    }
    load();
  }, [id]);

  // Unsaved changes confirmation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Periodic autosave drafts
  useEffect(() => {
    if (isInitialLoad.current || loading) return;
    
    setIsDirty(true);
    const timer = setTimeout(() => {
      const draftData = {
        name,
        slug,
        description,
        price,
        salePrice,
        sizes,
        media,
        coupons,
        stories,
        isActive,
        inventory
      };
      localStorage.setItem(`product_draft_${id}`, JSON.stringify(draftData));
    }, 1000); // Trigger save after 1s of input pause

    return () => clearTimeout(timer);
  }, [name, slug, description, price, salePrice, sizes, media, coupons, stories, isActive, inventory, id, loading]);

  const restoreDraft = () => {
    const saved = localStorage.getItem(`product_draft_${id}`);
    if (saved) {
      try {
        const d = JSON.parse(saved);
        setName(d.name || '');
        setSlug(d.slug || '');
        setDescription(d.description || '');
        setPrice(d.price || '');
        setSalePrice(d.salePrice || '');
        setSizes(d.sizes || []);
        setMedia(d.media || []);
        setCoupons(d.coupons || []);
        setStories(d.stories || []);
        setIsActive(d.isActive ?? true);
        setInventory(d.inventory || []);
        setHasDraft(false);
        setIsDirty(true);
      } catch {}
    }
  };

  const discardDraft = () => {
    localStorage.removeItem(`product_draft_${id}`);
    setHasDraft(false);
  };

  function toggleSize(s: string) {
    setSizes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  function getStock(s: string) {
    return inventory.find(i => i.size === s)?.stock ?? 0;
  }

  function setStock(s: string, val: number) {
    setInventory(prev => {
      const exists = prev.find(i => i.size === s);
      if (exists) return prev.map(i => i.size === s ? { ...i, stock: val } : i);
      return [...prev, { size: s, stock: val }];
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !price) return;
    setSaving(true);
    setError('');

    const supabase = createClient();
    const priceVal = Math.round(parseFloat(price) * 100);
    const salePriceVal = salePrice ? Math.round(parseFloat(salePrice) * 100) : null;

    // Sync images field
    const imagesVal = media.filter(m => m.type === 'image').map(m => m.url);

    // Update product record
    const { error: prodErr } = await supabase
      .from('products')
      .update({
        name: name.trim(),
        slug,
        description: description.trim(),
        price_paise: priceVal,
        sale_price_paise: salePriceVal,
        sizes,
        images: imagesVal,
        media: media,
        is_active: isActive,
      })
      .eq('id', id);

    if (prodErr) {
      setError(prodErr.message);
      setSaving(false);
      return;
    }

    // Update coupons relation
    await supabase.from('product_coupons').delete().eq('product_id', id);
    const checkedCoupons = coupons.filter(c => c.checked);
    if (checkedCoupons.length > 0) {
      const couponInserts = checkedCoupons.map(c => ({
        product_id: id,
        coupon_id: c.id,
        show_on_product_page: c.showOnProduct,
      }));
      await supabase.from('product_coupons').insert(couponInserts);
    }

    // Update stories
    await supabase.from('product_story_sections').delete().eq('product_id', id);
    if (stories.length > 0) {
      const storyInserts = stories.map((s, idx) => ({
        product_id: id,
        title: s.title,
        subtitle: s.subtitle || null,
        description: s.description,
        image_url: s.image_url,
        button_text: s.button_text || null,
        button_url: s.button_url || null,
        layout: s.layout,
        background: s.background,
        image_ratio: s.image_ratio,
        display_order: idx,
        enabled: s.enabled,
      }));
      await supabase.from('product_story_sections').insert(storyInserts);
    }

    // Sync inventory row edits
    for (const s of ALL_SIZES) {
      if (sizes.includes(s)) {
        const stockVal = getStock(s);
        const { data: existing } = await supabase
          .from('inventory')
          .select('id')
          .eq('product_id', id)
          .eq('size', s)
          .maybeSingle();

        if (existing) {
          await supabase.from('inventory').update({ stock: stockVal }).eq('product_id', id).eq('size', s);
        } else {
          await supabase.from('inventory').insert({ product_id: id, size: s, stock: stockVal });
        }
      } else {
        // Drop inventory row if size disabled
        await supabase.from('inventory').delete().eq('product_id', id).eq('size', s);
      }
    }

    localStorage.removeItem(`product_draft_${id}`);
    setIsDirty(false);
    router.push('/admin/products?saved=1');
  }

  if (loading) return <div className="animate-pulse text-muted" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>Loading...</div>;
  if (!product) return <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>Product not found</div>;

  return (
    <div className="admin-page-container">
      {/* Draft banner prompt */}
      {hasDraft && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px',
          background: 'rgba(201,168,106,0.1)', border: '1px solid var(--accent-gold)',
          borderRadius: '8px', marginBottom: '16px', fontSize: '0.8rem', color: 'var(--text-primary)'
        }}>
          <span>Unsaved product edits draft detected.</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={restoreDraft} className="btn btn-secondary btn-sm" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)', height: '28px', fontSize: '0.75rem', padding: '0 10px' }}>
              <Undo size={12} style={{ marginRight: '4px' }} /> Restore Draft
            </button>
            <button onClick={discardDraft} style={{ color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Editor Header */}
      <div className="admin-header-row" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => router.push('/admin/products')} className="admin-header-btn" style={{ padding: '6px' }} title="Back to products">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="admin-page-title">Edit Catalog Product</h1>
            <p className="admin-page-desc">ID: <span style={{ fontFamily: 'monospace' }}>{product.id}</span></p>
          </div>
        </div>
        
        <button
          className={`btn btn-sm ${isActive ? 'btn-success' : 'btn-secondary'}`}
          onClick={() => setIsActive(!isActive)}
          style={{ height: '34px', padding: '0 16px' }}
        >
          {isActive ? 'Active & Live' : 'Draft / Inactive'}
        </button>
      </div>

      {error && (
        <div className="warning-banner" style={{ marginBottom: '20px' }}>
          ⚠ {error}
        </div>
      )}

      {/* Tabbed Navigation Bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '16px', marginBottom: '24px', overflowX: 'auto' }}>
        {[
          { id: 'details', label: 'Basic Info', icon: FileText },
          { id: 'inventory', label: 'Inventory & Promo', icon: Layers },
          { id: 'media', label: 'Media Gallery', icon: ImageIcon },
          { id: 'stories', label: 'Landing Story', icon: BookOpen }
        ].map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                background: 'none',
                border: 'none',
                padding: '10px 12px',
                fontSize: '0.85rem',
                color: activeTab === tab.id ? 'var(--accent-gold)' : 'var(--text-muted)',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent-gold)' : 'none',
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <TabIcon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSave} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Tab content renders */}
        <div style={{ minHeight: '320px' }}>
          
          {/* TAB 1: Core details */}
          {activeTab === 'details' && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="input-group">
                <label className="input-label">Product Name</label>
                <input className="input-field" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Noir Classic Oversized Tee" />
              </div>
              <div className="input-group">
                <label className="input-label">URL Slug</label>
                <input className="input-field" value={slug} onChange={e => setSlug(e.target.value)} placeholder="e.g. noir-classic-oversized-tee" />
              </div>
              <div className="input-group">
                <label className="input-label">Description</label>
                <textarea className="input-field" value={description} onChange={e => setDescription(e.target.value)} rows={6} style={{ resize: 'vertical' }} placeholder="Detail product material, sizing specs, fit type..." />
              </div>
              <div className="input-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label className="input-label">Regular Price (₹)</label>
                  <input className="input-field" type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} required />
                </div>
                <div className="input-group">
                  <label className="input-label">Sale Price (₹)</label>
                  <input className="input-field" type="number" step="0.01" value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder="Optional discount rate" />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Sizes & Stock */}
          {activeTab === 'inventory' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div className="card">
                <label className="input-label" style={{ marginBottom: '12px', display: 'block' }}>Sizes Configuration</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                  {ALL_SIZES.map(s => {
                    const selected = sizes.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSize(s)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          border: '1px solid',
                          borderColor: selected ? 'var(--accent-gold)' : 'var(--border-color)',
                          background: selected ? 'rgba(201,168,106,0.1)' : 'var(--bg-tertiary)',
                          color: selected ? 'var(--accent-gold)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '0.8rem'
                        }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
                
                <label className="input-label" style={{ marginBottom: '12px', display: 'block' }}>Adjust Stock Limits</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
                  {sizes.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No sizes active. Enable sizes above.</div>
                  ) : (
                    sizes.map(s => (
                      <div key={s} className="input-group" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '8px' }}>
                        <label className="input-label" style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', marginBottom: '6px' }}>{s} Stock</label>
                        <input
                          className="input-field"
                          type="number"
                          min="0"
                          value={getStock(s)}
                          onChange={e => setStock(s, parseInt(e.target.value) || 0)}
                          style={{ height: '34px' }}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Coupons Promotions */}
              <div className="card">
                <label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>Promote Active Coupons</label>
                <p className="text-xs text-muted" style={{ marginBottom: '16px' }}>
                  Choose which coupons are highlighted on this product detail sheet.
                </p>
                {coupons.length === 0 ? (
                  <p className="text-xs text-muted">No active coupons available. Go to Coupons page to configure code.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {coupons.map((c, idx) => (
                      <div
                        key={c.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          background: 'var(--bg-tertiary)',
                        }}
                      >
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          <input
                            type="checkbox"
                            checked={c.checked}
                            onChange={(e) => {
                              const next = [...coupons];
                              next[idx].checked = e.target.checked;
                              setCoupons(next);
                            }}
                          />
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.code}</span>
                        </label>
                        
                        {c.checked && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <input
                              type="checkbox"
                              checked={c.showOnProduct}
                              onChange={(e) => {
                                const next = [...coupons];
                                next[idx].showOnProduct = e.target.checked;
                                setCoupons(next);
                              }}
                            />
                            Show on Product Page
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Media & Images */}
          {activeTab === 'media' && (
            <div className="card">
              <label className="input-label" style={{ marginBottom: '12px', display: 'block' }}>Product Gallery Assets</label>
              <ProductMediaManager
                value={media}
                onChange={setMedia}
                folder="products"
              />
            </div>
          )}

          {/* TAB 4: Stories builder */}
          {activeTab === 'stories' && (
            <div className="card">
              <label className="input-label" style={{ marginBottom: '12px', display: 'block' }}>Brand Landing Stories</label>
              <ProductStoryBuilder
                value={stories}
                onChange={setStories}
              />
            </div>
          )}

        </div>

        {/* STICKY FOOTER ACTION BAR (Vercel Style) */}
        <div style={{
          position: 'sticky',
          bottom: 0,
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border-color)',
          padding: '16px 20px',
          margin: '24px -20px -20px -20px',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          zIndex: 20,
          boxShadow: '0 -8px 24px rgba(0,0,0,0.3)',
          borderBottomLeftRadius: '8px',
          borderBottomRightRadius: '8px'
        }}>
          <button
            type="button"
            onClick={() => {
              discardDraft();
              router.push('/admin/products');
            }}
            className="btn btn-secondary"
            style={{ height: '38px', padding: '0 20px' }}
          >
            Cancel
          </button>
          
          <button
            type="submit"
            disabled={saving || !name.trim() || !price}
            className={`btn btn-primary ${saving ? 'btn-loading' : ''}`}
            style={{ height: '38px', padding: '0 24px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Save size={14} />
            Save Changes
          </button>
        </div>

      </form>
    </div>
  );
}
