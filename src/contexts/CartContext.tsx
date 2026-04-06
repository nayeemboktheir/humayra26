import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface CartItem {
  id: string;
  product_id: string;
  product_name: string;
  product_image: string | null;
  product_url: string | null;
  source_url: string | null;
  variant_id: string | null;
  variant_name: string | null;
  unit_price: number;
  quantity: number;
  domestic_shipping_fee: number;
  seller_name: string | null;
  sku_details: any;
  created_at: string;
}

interface CartContextType {
  items: CartItem[];
  count: number;
  loading: boolean;
  addToCart: (item: Partial<CartItem> & { product_id: string; product_name: string }) => Promise<void>;
  removeFromCart: (id: string) => Promise<void>;
  updateQuantity: (id: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextType>({
  items: [],
  count: 0,
  loading: false,
  addToCart: async () => {},
  removeFromCart: async () => {},
  updateQuantity: async () => {},
  clearCart: async () => {},
  refresh: async () => {},
});

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCart = useCallback(async () => {
    if (!user) { setItems([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("cart_items" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data as any as CartItem[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchCart(); }, [fetchCart]);

  const addToCart = async (item: Partial<CartItem> & { product_id: string; product_name: string }) => {
    if (!user) return;
    await (supabase.from("cart_items" as any) as any).insert({ ...item, user_id: user.id });
    await fetchCart();
  };

  const removeFromCart = async (id: string) => {
    await (supabase.from("cart_items" as any) as any).delete().eq("id", id);
    await fetchCart();
  };

  const updateQuantity = async (id: string, quantity: number) => {
    await (supabase.from("cart_items" as any) as any).update({ quantity }).eq("id", id);
    await fetchCart();
  };

  const clearCart = async () => {
    if (!user) return;
    await (supabase.from("cart_items" as any) as any).delete().eq("user_id", user.id);
    setItems([]);
  };

  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, count, loading, addToCart, removeFromCart, updateQuantity, clearCart, refresh: fetchCart }}>
      {children}
    </CartContext.Provider>
  );
};
