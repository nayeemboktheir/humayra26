import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, MapPin, CreditCard, User, Phone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface SkuLine {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  imageUrl?: string;
}

interface CheckoutData {
  productTitle: string;
  productImage: string;
  lines: SkuLine[];
  totalQty: number;
  totalPrice: number;
  domesticShippingFeeBDT: number;
  sellerName?: string;
  onConfirm: (opts: { address: string; paymentOption: string }) => Promise<void>;
}

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CheckoutData | null;
}

export default function CheckoutDialog({ open, onOpenChange, data }: CheckoutDialogProps) {
  const { user } = useAuth();
  const [placing, setPlacing] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profile, setProfile] = useState<{ full_name: string; phone: string; address: string }>({ full_name: "", phone: "", address: "" });

  useEffect(() => {
    if (!user || !open) return;
    setProfileLoaded(false);
    supabase.from("profiles").select("full_name, phone, address").eq("user_id", user.id).maybeSingle()
      .then(({ data: p }) => {
        if (p) {
          setProfile({
            full_name: p.full_name || "",
            phone: p.phone || "",
            address: p.address || "",
          });
        }
        setProfileLoaded(true);
      });
  }, [user, open]);

  if (!data) return null;

  const grandTotal = data.totalPrice + data.domesticShippingFeeBDT;

  const handleProceedToPayment = async () => {
    if (!profile.address.trim()) {
      toast({ title: "ঠিকানা নেই", description: "প্রোফাইলে ডেলিভারি ঠিকানা যোগ করুন।", variant: "destructive" });
      return;
    }
    setPlacing(true);
    try {
      await data.onConfirm({
        address: profile.address.trim(),
        paymentOption: "full",
      });
    } catch {
      // error handled in parent
    } finally {
      setPlacing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-lg font-bold">অর্ডার সামারি</DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-4">
          {/* Customer Info from profile */}
          {!profileLoaded ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="border rounded-lg p-3 bg-muted/30 space-y-1.5">
              {profile.full_name && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="font-semibold">{profile.full_name}</span>
                </div>
              )}
              {profile.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>{profile.phone}</span>
                </div>
              )}
              {profile.address && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>{profile.address}</span>
                </div>
              )}
              {!profile.address && (
                <p className="text-sm text-destructive">⚠ প্রোফাইলে ঠিকানা যোগ করুন</p>
              )}
            </div>
          )}

          <Separator />

          {/* Order Items */}
          <div>
            <h3 className="text-sm font-bold mb-3">পণ্য তালিকা</h3>
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex gap-3">
                <img src={data.productImage} alt="" referrerPolicy="no-referrer" className="w-14 h-14 rounded-md object-cover border flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight line-clamp-2">{data.productTitle}</p>
                  <p className="text-xs text-muted-foreground mt-1">Qty: {data.totalQty} Pcs</p>
                </div>
              </div>

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
            </div>
          </div>

          <Separator />

          {/* Price Summary */}
          <div className="bg-muted/40 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">সাবটোটাল ({data.totalQty} Pcs)</span>
              <span className="font-semibold">৳{data.totalPrice.toLocaleString()}</span>
            </div>
            {data.domesticShippingFeeBDT > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">ডেলিভারি চার্জ (China)</span>
                <span className="font-semibold">৳{data.domesticShippingFeeBDT.toLocaleString()}</span>
              </div>
            )}
            <Separator />
            <div className="flex items-center justify-between text-base font-bold text-primary">
              <span>মোট পরিশোধযোগ্য</span>
              <span>৳{grandTotal.toLocaleString()}</span>
            </div>
            <p className="text-xs text-destructive font-medium">* আন্তর্জাতিক শিপিং চার্জ পরে যোগ হবে</p>
          </div>

          {/* Proceed to Payment */}
          <Button
            className="w-full h-12 text-base font-bold rounded-xl shadow-md"
            onClick={handleProceedToPayment}
            disabled={placing || !profileLoaded}
          >
            {placing ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CreditCard className="h-5 w-5 mr-2" />}
            {placing ? "Processing..." : `পেমেন্ট করুন ৳${grandTotal.toLocaleString()}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
