import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/dashboard/EmptyState";
import { Loader2, Trash2, Heart } from "lucide-react";
import { toast } from "sonner";

const Wishlist = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    if (!user) return;
    const { data } = await supabase.from("wishlist").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, [user]);

  const removeItem = async (id: string) => {
    await supabase.from("wishlist").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("Removed from wishlist");
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Wishlist</h1>
      {items.length === 0 ? (
        <EmptyState title="Your wishlist is empty." description="Save products you love!" icon={<Heart className="h-16 w-16 opacity-40" />} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              {item.product_image && (
                <img src={item.product_image} alt={item.product_name} className="w-full h-40 object-cover" />
              )}
              <CardContent className="p-4">
                <h3 className="font-medium text-sm line-clamp-2 mb-2">{item.product_name}</h3>
                {item.product_price && <p className="text-primary font-bold mb-2">৳{item.product_price}</p>}
                <Button variant="outline" size="sm" onClick={() => removeItem(item.id)} className="w-full">
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Wishlist;
