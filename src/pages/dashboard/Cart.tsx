import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Trash2, Minus, Plus, ShoppingCart, Loader2, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import CheckoutDialog from "@/components/CheckoutDialog";
import EmptyState from "@/components/dashboard/EmptyState";

export default function Cart() {
  const { items, loading, removeFromCart, updateQuantity, clearCart, refresh } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutData, setCheckoutData] = useState<any>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart className="h-16 w-16 mx-auto opacity-40" />}
        title="কার্ট খালি"
        description="আপনার কার্টে কোনো পণ্য নেই। পণ্য খুঁজে কার্টে যোগ করুন।"
      >
        <Button onClick={() => navigate("/")} className="mt-4">পণ্য খুঁজুন</Button>
      </EmptyState>
    );
  }

  const totalPrice = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const totalDomestic = items.reduce((sum, item) => sum + (item.domestic_shipping_fee || 0), 0);
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = () => {
    if (!user) return;

    const lines = items.map(item => ({
      name: item.variant_name || item.product_name,
      qty: item.quantity,
      unitPrice: item.unit_price,
      total: item.unit_price * item.quantity,
      imageUrl: item.product_image || undefined,
    }));

    setCheckoutData({
      productTitle: items.length === 1 ? items[0].product_name : `${items.length}টি পণ্য`,
      productImage: items[0].product_image || "/placeholder.svg",
      lines,
      totalQty,
      totalPrice,
      domesticShippingFeeBDT: totalDomestic,
      sellerName: items[0].seller_name,
      onConfirm: async (opts: { address: string; paymentOption: string; deliveryMethod: string }) => {
        const payableAmount = opts.paymentOption === "partial" ? Math.round((totalPrice + totalDomestic) * 0.7) : totalPrice + totalDomestic;
        const grandTotal = totalPrice + totalDomestic;
        const invoiceNumber = `PS-${Date.now()}`;

        for (const item of items) {
          const orderNumber = `HT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
          const itemTotal = item.unit_price * item.quantity;

          let notes = "";
          if (item.sku_details && Array.isArray(item.sku_details) && item.sku_details.length > 0) {
            notes = item.sku_details.map((s: any) => `${s.name}: ${s.qty} pcs × ৳${s.unitPrice}`).join("\n");
          }
          notes += `\n[Address: ${opts.address}]\n[Delivery: ${opts.deliveryMethod}]`;

          const { error } = await supabase.from("orders").insert({
            user_id: user.id,
            order_number: orderNumber,
            product_name: item.product_name,
            product_image: item.product_image,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: itemTotal,
            domestic_courier_charge: item.domestic_shipping_fee || 0,
            notes: notes || null,
            product_url: item.product_url,
            source_url: item.source_url,
            variant_name: item.variant_name || null,
            variant_id: item.variant_id || null,
            product_1688_id: item.product_id,
            status: "awaiting_payment",
            payment_status: "unpaid",
            payment_amount: opts.paymentOption === "partial" ? Math.round((itemTotal + (item.domestic_shipping_fee || 0)) * 0.7) : itemTotal + (item.domestic_shipping_fee || 0),
            payment_invoice: invoiceNumber,
          } as any);

          if (error) throw error;
        }

        // Init PayStation payment
        const userEmail = user.email || "customer@example.com";
        const callbackUrl = `${window.location.origin}/payment/callback`;

        const { data: psData, error: psError } = await supabase.functions.invoke("paystation-init-payment", {
          body: {
            amount: payableAmount,
            invoiceNumber,
            customerEmail: userEmail,
            callbackUrl,
          },
        });

        if (psError || !psData?.payment_url) {
          toast({ title: "Payment Error", description: "পেমেন্ট শুরু করতে সমস্যা হয়েছে।", variant: "destructive" });
          return;
        }

        await clearCart();
        window.location.href = psData.payment_url;
      },
    });
    setCheckoutOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" /> কার্ট ({totalQty})
        </h2>
        <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => clearCart()}>
          সব মুছুন
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.id} className="overflow-hidden">
            <CardContent className="p-3">
              <div className="flex gap-3">
                <img
                  src={item.product_image || "/placeholder.svg"}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-20 h-20 rounded-lg object-cover border flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold line-clamp-2 leading-tight">{item.product_name}</p>
                  {item.variant_name && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.variant_name}</p>
                  )}
                  <p className="text-sm font-bold text-primary mt-1">৳{item.unit_price.toLocaleString()}</p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1.5 border rounded-lg">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          if (item.quantity <= 1) removeFromCart(item.id);
                          else updateQuantity(item.id, item.quantity - 1);
                        }}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="text-sm font-semibold w-6 text-center">{item.quantity}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      {/* Summary */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">মোট পণ্য ({totalQty} Pcs)</span>
            <span className="font-semibold">৳{totalPrice.toLocaleString()}</span>
          </div>
          {totalDomestic > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Domestic Delivery (China)</span>
              <span className="font-semibold">৳{totalDomestic.toLocaleString()}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-base font-bold text-primary">
            <span>মোট মূল্য</span>
            <span>৳{(totalPrice + totalDomestic).toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full h-12 text-base font-bold rounded-xl shadow-md" onClick={handleCheckout}>
        <CreditCard className="h-5 w-5 mr-2" /> চেকআউট করুন
      </Button>

      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} data={checkoutData} />
    </div>
  );
}
