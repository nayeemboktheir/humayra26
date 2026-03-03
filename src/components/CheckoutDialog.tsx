import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Loader2, MapPin, Truck, Package, StickyNote, Warehouse, Plus, Pencil
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { convertToBDT } from "@/lib/currency";

interface SkuLine {
  name: string;
  qty: number;
  unitPrice: number; // BDT
  total: number; // BDT
  imageUrl?: string;
}

interface CheckoutData {
  productTitle: string;
  productImage: string;
  lines: SkuLine[];
  totalQty: number;
  totalPrice: number; // BDT
  domesticShippingFeeBDT: number;
  sellerName?: string;
  onConfirm: (opts: { deliveryOption: string; address: string; note: string }) => Promise<void>;
}

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CheckoutData | null;
}

export default function CheckoutDialog({ open, onOpenChange, data }: CheckoutDialogProps) {
  const { user } = useAuth();
  const [deliveryOption, setDeliveryOption] = useState<"courier" | "warehouse">("courier");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Load user profile
  useEffect(() => {
    if (!user || !open) return;
    setProfileLoaded(false);
    supabase.from("profiles").select("full_name, phone, address").eq("user_id", user.id).maybeSingle()
      .then(({ data: p }) => {
        if (p) {
          setAddress(p.address || "");
          setPhone(p.phone || "");
          setFullName(p.full_name || "");
        }
        setProfileLoaded(true);
      });
  }, [user, open]);

  if (!data) return null;

  const grandTotal = data.totalPrice + data.domesticShippingFeeBDT;

  const handlePlaceOrder = async () => {
    if (deliveryOption === "courier" && !address.trim()) {
      toast({ title: "Address required", description: "Please add a delivery address.", variant: "destructive" });
      return;
    }
    setPlacing(true);
    try {
      await data.onConfirm({ deliveryOption, address: address.trim(), note: note.trim() });
      onOpenChange(false);
    } catch {
      // error handled in parent
    } finally {
      setPlacing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-lg font-bold">Checkout</DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-5">
          {/* Delivery Option */}
          <div>
            <h3 className="text-sm font-bold mb-3">Delivery Option</h3>
            <RadioGroup value={deliveryOption} onValueChange={(v) => setDeliveryOption(v as any)} className="flex gap-3">
              <div className={`flex items-center gap-2 border rounded-lg px-4 py-2.5 cursor-pointer transition-all ${deliveryOption === "courier" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"}`}>
                <RadioGroupItem value="courier" id="courier" />
                <Label htmlFor="courier" className="cursor-pointer flex items-center gap-1.5 font-semibold text-sm">
                  <Truck className="h-4 w-4" /> By Courier
                </Label>
              </div>
              <div className={`flex items-center gap-2 border rounded-lg px-4 py-2.5 cursor-pointer transition-all ${deliveryOption === "warehouse" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"}`}>
                <RadioGroupItem value="warehouse" id="warehouse" />
                <Label htmlFor="warehouse" className="cursor-pointer flex items-center gap-1.5 font-semibold text-sm">
                  <Warehouse className="h-4 w-4" /> Warehouse Pickup
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Delivery Address */}
          {deliveryOption === "courier" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold">Delivery Address</h3>
                {address && !editingAddress && (
                  <Button variant="link" size="sm" className="text-primary gap-1 h-auto p-0" onClick={() => setEditingAddress(true)}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                )}
              </div>

              {!profileLoaded ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : address && !editingAddress ? (
                <div className="border rounded-lg p-3 bg-muted/30">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      {fullName && <p className="text-sm font-semibold">{fullName}</p>}
                      {phone && <p className="text-xs text-muted-foreground">{phone}</p>}
                      <p className="text-sm mt-0.5">{address}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 text-muted-foreground justify-center py-4">
                    <MapPin className="h-8 w-8 text-primary/40" />
                  </div>
                  <p className="text-center text-sm text-muted-foreground mb-2">
                    {editingAddress ? "Update your delivery address" : "No delivery address added yet"}
                  </p>
                  <Input placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-9 text-sm" />
                  <Input placeholder="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 text-sm" />
                  <Textarea
                    placeholder="Enter full delivery address..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="text-sm min-h-[60px]"
                  />
                  {editingAddress && (
                    <Button size="sm" variant="outline" onClick={() => setEditingAddress(false)}>Done</Button>
                  )}
                </div>
              )}
            </div>
          )}

          {deliveryOption === "warehouse" && (
            <div className="border rounded-lg p-3 bg-muted/30">
              <div className="flex items-start gap-2">
                <Warehouse className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Warehouse Pickup</p>
                  <p className="text-xs text-muted-foreground mt-0.5">আপনি আমাদের ওয়্যারহাউজ থেকে পণ্য সংগ্রহ করতে পারবেন।</p>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Order Items */}
          <div>
            <h3 className="text-sm font-bold mb-3">Order Summary</h3>
            {data.sellerName && (
              <p className="text-xs text-muted-foreground mb-2">Seller: {data.sellerName}</p>
            )}

            {/* Product card */}
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex gap-3">
                <img src={data.productImage} alt="" referrerPolicy="no-referrer" className="w-16 h-16 rounded-md object-cover border flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight line-clamp-2">{data.productTitle}</p>
                  <p className="text-xs text-muted-foreground mt-1">Quantity: {data.totalQty} Piece{data.totalQty > 1 ? "s" : ""}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Truck className="h-3 w-3" /> By Air- TradeOn Global Shipping | <span className="text-primary font-semibold">৳750/Kg</span>
                  </p>
                </div>
              </div>

              {/* Line items */}
              {data.lines.length > 1 && (
                <div className="border-t pt-2 space-y-1.5">
                  {data.lines.map((line, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-muted-foreground truncate mr-2">{line.name} × {line.qty}</span>
                      <span className="font-semibold whitespace-nowrap">৳{line.total.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Note */}
              {!showNote ? (
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShowNote(true)}>
                  <StickyNote className="h-3 w-3" /> Add Note
                </Button>
              ) : (
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Order Note</Label>
                  <Textarea
                    placeholder="Add any special instructions..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="text-sm min-h-[50px]"
                  />
                </div>
              )}

              <p className="text-xs text-destructive font-medium">Shipping charge will be added later.</p>

              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-bold text-primary">Total: ৳{data.totalPrice.toLocaleString()}</span>
                {data.domesticShippingFeeBDT > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Domestic Delivery (China) ৳{data.domesticShippingFeeBDT.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Summary Sidebar */}
          <div className="bg-muted/40 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{data.totalQty} Pcs</span>
              <span className="font-semibold">৳{data.totalPrice.toLocaleString()}</span>
            </div>
            {data.domesticShippingFeeBDT > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Domestic Delivery (China)</span>
                <span className="font-semibold">৳{data.domesticShippingFeeBDT.toLocaleString()}</span>
              </div>
            )}
            <Separator />
            <div className="flex items-center justify-between text-base font-bold">
              <span>Total</span>
              <span>৳{grandTotal.toLocaleString()}</span>
            </div>
          </div>

          {/* Place Order Button */}
          <Button
            className="w-full h-12 text-base font-bold rounded-xl shadow-md"
            onClick={handlePlaceOrder}
            disabled={placing}
          >
            {placing ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Package className="h-5 w-5 mr-2" />}
            {placing ? "Placing Order..." : "Place Order"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
