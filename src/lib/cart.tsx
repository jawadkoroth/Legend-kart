'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';

/**
 * NOIR cart — local, client-side, localStorage-backed.
 *
 * Design notes:
 *
 * 1. Three-layer stock enforcement.
 *    - PDP disables sold-out sizes (UI level).
 *    - This provider clamps quantities at add/update against `maxStock`
 *      (a snapshot of `inventory.stock` for the selected size at the
 *      moment the line was added).
 *    - The `/api/cart/validate` route re-reads live inventory on
 *      `/cart` mount and on checkout submission to catch any drift
 *      that happened while the cart sat idle.
 *    The database remains the only authoritative source of truth — the
 *    snapshot exists purely so the UI can clamp instantly without a
 *    network round-trip on every `+` click.
 *
 * 2. Inactive product handling.
 *    When the validation route flags a line as `removed` (product
 *    `is_active = false`, or no inventory rows exist anymore), the
 *    line is deleted outright — never silently retained at qty 0.
 *
 * 3. Multi-tab sync.
 *    A `storage` listener mirrors writes from sibling tabs but is
 *    filtered to our key and JSON-diff guarded so it cannot loop.
 *
 * 4. Upgrade path.
 *    To swap in a database-backed cart later, replace `loadCart` /
 *    `saveCart` and the corresponding effects; the public context
 *    surface (addItem / updateQuantity / removeItem / clearCart /
 *    applyValidation / getTotal) is intentionally storage-agnostic.
 */
export interface CartItem {
  product_id: string;
  name: string;
  slug: string;
  size: string;
  price_paise: number;
  quantity: number;
  image: string;
  /**
   * Snapshot of available stock for this (product, size) at the time
   * the line was added or last revalidated. Used purely for instant
   * client-side clamping — never trusted at order time.
   *
   * Legacy `localStorage` entries written before this field existed
   * load with `maxStock = 0`, which makes `+` disabled until the next
   * server revalidation rehydrates the real value.
   */
  maxStock: number;
}

export interface CartValidationEntry {
  product_id: string;
  size: string;
  maxStock: number;
  clampedQuantity: number;
  removed: boolean;
}

export interface CartValidationResult {
  items: CartValidationEntry[];
}

interface ApplyValidationSummary {
  removed: CartItem[];
  clamped: CartItem[];
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>, qty?: number) => void;
  removeItem: (product_id: string, size: string) => void;
  updateQuantity: (product_id: string, size: string, qty: number) => void;
  clearCart: () => void;
  applyValidation: (result: CartValidationResult) => ApplyValidationSummary;
  totalItems: number;
  totalPaise: number;
  /** Spec-compatible alias for `totalPaise`. */
  getTotal: () => number;
}

const CartContext = createContext<CartContextType | null>(null);

const CART_KEY = 'noir_cart';

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.product_id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.slug === 'string' &&
    typeof v.size === 'string' &&
    typeof v.price_paise === 'number' &&
    typeof v.quantity === 'number' &&
    typeof v.image === 'string'
  );
}

function loadCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartItem).map(item => ({
      ...item,
      // Backfill for legacy entries written before maxStock existed.
      maxStock: typeof item.maxStock === 'number' ? item.maxStock : 0,
      quantity: Math.max(1, Math.floor(item.quantity)),
    }));
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch (err) {
    // Quota exceeded / private mode — non-fatal.
    console.error('[CART_PERSIST_FAILED]', err);
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Tracks the last JSON we wrote to localStorage so the storage
  // listener can ignore echoes of our own writes.
  const lastSerializedRef = useRef<string>('[]');

  // Initial hydrate from localStorage.
  useEffect(() => {
    const initial = loadCart();
    lastSerializedRef.current = JSON.stringify(initial);
    setItems(initial);
    setLoaded(true);
  }, []);

  // Persist on change.
  useEffect(() => {
    if (!loaded) return;
    const serialized = JSON.stringify(items);
    if (serialized === lastSerializedRef.current) return;
    lastSerializedRef.current = serialized;
    saveCart(items);
  }, [items, loaded]);

  // Multi-tab sync: respond to writes in sibling tabs only.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onStorage(e: StorageEvent) {
      if (e.key !== CART_KEY) return;
      // Tab cleared storage -> treat as empty cart, but only if we
      // didn't just write the same value ourselves.
      const next = e.newValue ?? '[]';
      if (next === lastSerializedRef.current) return;
      try {
        const parsed: unknown = JSON.parse(next);
        if (!Array.isArray(parsed)) return;
        const sanitized = parsed.filter(isCartItem).map(item => ({
          ...item,
          maxStock: typeof item.maxStock === 'number' ? item.maxStock : 0,
        }));
        lastSerializedRef.current = JSON.stringify(sanitized);
        setItems(sanitized);
      } catch {
        // Ignore malformed payloads from other tabs.
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addItem = useCallback(
    (item: Omit<CartItem, 'quantity'>, qty = 1) => {
      // Defence-in-depth: PDP should already block this, but never
      // silently push a sold-out line into the cart.
      if (!item.maxStock || item.maxStock <= 0) return;
      const safeQty = Math.max(1, Math.floor(qty));

      setItems(prev => {
        const idx = prev.findIndex(
          i => i.product_id === item.product_id && i.size === item.size,
        );
        if (idx >= 0) {
          const existing = prev[idx];
          // Always overwrite maxStock with the freshest snapshot the
          // PDP just observed.
          const merged = {
            ...existing,
            ...item,
            quantity: Math.min(existing.quantity + safeQty, item.maxStock),
            maxStock: item.maxStock,
          };
          const next = [...prev];
          next[idx] = merged;
          return next;
        }
        return [
          ...prev,
          { ...item, quantity: Math.min(safeQty, item.maxStock) },
        ];
      });
    },
    [],
  );

  const removeItem = useCallback((product_id: string, size: string) => {
    setItems(prev =>
      prev.filter(i => !(i.product_id === product_id && i.size === size)),
    );
  }, []);

  const updateQuantity = useCallback(
    (product_id: string, size: string, qty: number) => {
      if (qty <= 0) {
        removeItem(product_id, size);
        return;
      }
      setItems(prev =>
        prev.map(i =>
          i.product_id === product_id && i.size === size
            ? {
                ...i,
                // Clamp to `[1, maxStock]`. If maxStock is 0 (legacy
                // entry pre-revalidation), keep the existing quantity
                // rather than zero it out — revalidation will fix it.
                quantity:
                  i.maxStock > 0
                    ? Math.min(Math.max(1, Math.floor(qty)), i.maxStock)
                    : i.quantity,
              }
            : i,
        ),
      );
    },
    [removeItem],
  );

  const clearCart = useCallback(() => setItems([]), []);

  const applyValidation = useCallback(
    (result: CartValidationResult): ApplyValidationSummary => {
      const summary: ApplyValidationSummary = { removed: [], clamped: [] };

      setItems(prev => {
        // Map by composite key for O(1) lookup against validation rows.
        const byKey = new Map<string, CartValidationEntry>();
        for (const entry of result.items) {
          byKey.set(`${entry.product_id}::${entry.size}`, entry);
        }

        const next: CartItem[] = [];
        for (const line of prev) {
          const entry = byKey.get(`${line.product_id}::${line.size}`);
          if (!entry) {
            // Server didn't return this line (shouldn't happen, but
            // be defensive: keep it untouched).
            next.push(line);
            continue;
          }
          if (entry.removed) {
            summary.removed.push(line);
            continue;
          }
          const clampedQty = entry.clampedQuantity;
          if (clampedQty !== line.quantity || entry.maxStock !== line.maxStock) {
            const updated = {
              ...line,
              quantity: Math.max(1, clampedQty),
              maxStock: entry.maxStock,
            };
            if (clampedQty < line.quantity) {
              summary.clamped.push(updated);
            }
            next.push(updated);
          } else {
            next.push(line);
          }
        }
        return next;
      });

      return summary;
    },
    [],
  );

  const totalItems = useMemo(
    () => items.reduce((s, i) => s + i.quantity, 0),
    [items],
  );
  const totalPaise = useMemo(
    () => items.reduce((s, i) => s + i.price_paise * i.quantity, 0),
    [items],
  );

  const getTotal = useCallback(() => totalPaise, [totalPaise]);

  const value = useMemo<CartContextType>(
    () => ({
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      applyValidation,
      totalItems,
      totalPaise,
      getTotal,
    }),
    [
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      applyValidation,
      totalItems,
      totalPaise,
      getTotal,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
