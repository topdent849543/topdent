import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import type { Product } from './supabase';

type WishlistContextType = {
  items: Product[];
  loading: boolean;
  toggle: (productId: string) => Promise<void>;
  isWishlisted: (productId: string) => boolean;
};

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchWishlist = async () => {
    if (!user) {
      setItems([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('wishlist_items')
      .select(`
        product:products(*)
      `)
      .eq('user_id', user.id);
    const products = (data as any)?.map((w: any) => w.product).filter(Boolean) ?? [];
    setItems(products);
    setLoading(false);
  };

  useEffect(() => {
    fetchWishlist();
  }, [user?.id]);

  const toggle = async (productId: string) => {
    if (!user) throw new Error('Please sign in to use wishlist');
    const existing = items.find(p => p.id === productId);
    if (existing) {
      await supabase
        .from('wishlist_items')
        .delete()
        .eq('user_id', user.id)
        .eq('product_id', productId);
      setItems(items.filter(p => p.id !== productId));
    } else {
      await supabase.from('wishlist_items').insert({
        user_id: user.id,
        product_id: productId,
      });
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .maybeSingle();
      if (data) setItems([...items, data as Product]);
    }
  };

  const isWishlisted = (productId: string) => items.some(p => p.id === productId);

  return (
    <WishlistContext.Provider value={{ items, loading, toggle, isWishlisted }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
}
