import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import type { CartItem, Product } from './supabase';

type CartContextType = {
  items: CartItem[];
  loading: boolean;
  addToCart: (product: Product, size: string, color: string, quantity?: number) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  totalItems: number;
  subtotal: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCart = async (reason: string) => {
    console.log(`%c[CartContext] fetchCart() called — reason: ${reason}`, 'color:#f80', {
      user_id: user?.id ?? null,
      time: new Date().toISOString(),
    });
    if (!user) {
      console.log('[CartContext] fetchCart: no user -> setItems([])');
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error, status } = await supabase
      .from('cart_items')
      .select(`
        *,
        product:products(*)
      `)
      .eq('user_id', user.id);
    console.log('[CartContext] fetchCart: query result', {
      user_id: user.id,
      status,
      error,
      rowCount: data?.length,
      data,
      time: new Date().toISOString(),
    });
    setItems((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    console.log('[CartContext] useEffect fired', {
      user_id: user?.id ?? null,
      authLoading,
      time: new Date().toISOString(),
    });
    // Wait until auth has resolved (session restored) before deciding the
    // cart is empty — otherwise we briefly report an empty cart while the
    // user's session is still loading (most noticeable on web).
    if (authLoading) {
      console.log('[CartContext] useEffect: authLoading=true, setLoading(true) and waiting');
      setLoading(true);
      return;
    }
    fetchCart('useEffect[user?.id, authLoading]');
  }, [user?.id, authLoading]);

  const addToCart = async (product: Product, size: string, color: string, quantity = 1) => {
    console.log('[CartContext] addToCart() called', { product_id: product.id, size, color, quantity, user_id: user?.id ?? null });
    if (!user) throw new Error('Please sign in to add items to cart');
    const { data: existing, error: existingError } = await supabase
      .from('cart_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('product_id', product.id)
      .eq('size', size)
      .eq('color', color)
      .maybeSingle();
    console.log('[CartContext] addToCart: existing row check', { existing, existingError });

    if (existingError) throw new Error(existingError.message || 'Failed to check cart');

    if (existing) {
      const { error: updateError } = await supabase
        .from('cart_items')
        .update({ quantity: existing.quantity + quantity })
        .eq('id', existing.id);
      console.log('[CartContext] addToCart: update result', { updateError });
      if (updateError) throw new Error(updateError.message || 'Failed to update cart');
    } else {
      const { error: insertError } = await supabase.from('cart_items').insert({
        user_id: user.id,
        product_id: product.id,
        size,
        color,
        quantity,
      });
      console.log('[CartContext] addToCart: insert result', { insertError });
      if (insertError) throw new Error(insertError.message || 'Failed to add item to cart');
    }
    await fetchCart('addToCart');
    console.log('[CartContext] addToCart: done, fetchCart completed');
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity < 1) return;
    await supabase.from('cart_items').update({ quantity }).eq('id', itemId);
    setItems(items.map(i => i.id === itemId ? { ...i, quantity } : i));
  };

  const removeItem = async (itemId: string) => {
    await supabase.from('cart_items').delete().eq('id', itemId);
    setItems(items.filter(i => i.id !== itemId));
  };

  const clearCart = async () => {
    if (!user) return;
    await supabase.from('cart_items').delete().eq('user_id', user.id);
    setItems([]);
  };

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => {
    const price = i.product?.price ?? 0;
    return sum + price * i.quantity;
  }, 0);

  return (
    <CartContext.Provider
      value={{ items, loading, addToCart, updateQuantity, removeItem, clearCart, totalItems, subtotal }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
