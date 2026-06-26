'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { createClient } from '@/lib/supabase/client';

interface WishlistContextType {
  wishlistProductIds: string[];
  isWishlisted: (productId: string) => boolean;
  toggleWishlist: (productId: string) => Promise<void>;
  loading: boolean;
}

const WishlistContext = createContext<WishlistContextType | null>(null);

const WISHLIST_KEY = 'panther_wishlist';

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [wishlistProductIds, setWishlistProductIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync / Load logic
  useEffect(() => {
    const supabase = createClient();

    async function loadWishlist() {
      setLoading(true);
      if (user) {
        try {
          // 1. Fetch DB wishlist
          const { data: dbItems, error } = await supabase
            .from('wishlist_items')
            .select('product_id')
            .eq('user_id', user.id);

          if (error) throw error;

          const dbIds = (dbItems || []).map(item => item.product_id);

          // 2. Check guest local storage to merge
          const guestRaw = localStorage.getItem(WISHLIST_KEY);
          if (guestRaw) {
            try {
              const guestIds: string[] = JSON.parse(guestRaw);
              if (Array.isArray(guestIds) && guestIds.length > 0) {
                // Find IDs that are in guest list but not in DB list
                const toInsert = guestIds.filter(id => !dbIds.includes(id));
                if (toInsert.length > 0) {
                  const rows = toInsert.map(prodId => ({
                    user_id: user.id,
                    product_id: prodId,
                  }));
                  const { error: insertErr } = await supabase
                    .from('wishlist_items')
                    .insert(rows);
                  
                  if (!insertErr) {
                    // Update list of IDs
                    dbIds.push(...toInsert);
                  }
                }
              }
            } catch (err) {
              console.error('Failed to parse or merge guest wishlist', err);
            } finally {
              // Always clean up guest storage once merged
              localStorage.removeItem(WISHLIST_KEY);
            }
          }
          setWishlistProductIds(dbIds);
        } catch (err) {
          console.error('Failed to sync DB wishlist', err);
        }
      } else {
        // Guest mode - load from localStorage
        const guestRaw = localStorage.getItem(WISHLIST_KEY);
        if (guestRaw) {
          try {
            const parsed = JSON.parse(guestRaw);
            if (Array.isArray(parsed)) {
              setWishlistProductIds(parsed);
            }
          } catch {
            setWishlistProductIds([]);
          }
        } else {
          setWishlistProductIds([]);
        }
      }
      setLoading(false);
    }

    loadWishlist();
  }, [user]);

  // Check if item is wishlisted
  const isWishlisted = useCallback((productId: string) => {
    return wishlistProductIds.includes(productId);
  }, [wishlistProductIds]);

  // Toggle item in wishlist
  const toggleWishlist = useCallback(async (productId: string) => {
    const supabase = createClient();
    const isCurrentlyWishlisted = wishlistProductIds.includes(productId);

    if (user) {
      // DB-backed operation
      if (isCurrentlyWishlisted) {
        // Remove from DB
        const { error } = await supabase
          .from('wishlist_items')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', productId);
        
        if (!error) {
          setWishlistProductIds(prev => prev.filter(id => id !== productId));
        } else {
          console.error('Failed to remove from wishlist DB', error);
        }
      } else {
        // Add to DB
        const { error } = await supabase
          .from('wishlist_items')
          .insert({ user_id: user.id, product_id: productId });
        
        if (!error) {
          setWishlistProductIds(prev => [...prev, productId]);
        } else {
          console.error('Failed to add to wishlist DB', error);
        }
      }
    } else {
      // LocalStorage guest operation
      let nextList: string[];
      if (isCurrentlyWishlisted) {
        nextList = wishlistProductIds.filter(id => id !== productId);
      } else {
        nextList = [...wishlistProductIds, productId];
      }
      localStorage.setItem(WISHLIST_KEY, JSON.stringify(nextList));
      setWishlistProductIds(nextList);
    }
  }, [user, wishlistProductIds]);

  const value = useMemo(() => ({
    wishlistProductIds,
    isWishlisted,
    toggleWishlist,
    loading
  }), [wishlistProductIds, isWishlisted, toggleWishlist, loading]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside WishlistProvider');
  return ctx;
}
