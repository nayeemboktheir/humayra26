import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, ArrowLeft, Play, ShoppingCart, MessageCircle,
  Star, MapPin, Truck, Package, Box, Weight, Minus, Plus, ChevronDown,
  ChevronUp, ShieldCheck, Clock, Search, ArrowDownUp, Lock, Plane, Download, AlertTriangle,
  Heart, Anchor
} from "lucide-react";
import ShippingRatesModal from "@/components/ShippingRatesModal";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ProductDetail1688 } from "@/lib/api/alibaba1688";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const CNY_TO_BDT = 17.5;
const convertToBDT = (cny: number) => Math.round(cny * CNY_TO_BDT);

const translateLocation = (location: string): string => {
  if (location.includes("省") || location.includes("市")) return "China";
  return location;
};

interface ProductDetailProps {
  product?: ProductDetail1688;
  isLoading?: boolean;
  onBack?: () => void;
}

export default function ProductDetail({ product, isLoading, onBack }: ProductDetailProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [quantity, setQuantity] = useState(0);
  const [skuQuantities, setSkuQuantities] = useState<Record<string, number>>({});
  const [ordering, setOrdering] = useState(false);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [shippingMethod, setShippingMethod] = useState<'air' | 'sea'>('air');
  const [addingToWishlist, setAddingToWishlist] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [domesticShippingFee, setDomesticShippingFee] = useState<number | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Fetch 1688 domestic shipping fee
  useEffect(() => {
    if (!product?.num_iid) return;
    setDomesticShippingFee(null);
    supabase.functions.invoke('alibaba-1688-shipping-fee', {
      body: { numIid: String(product.num_iid), province: 'Guangdong' },
    }).then(({ data }) => {
      if (data?.success && data?.data?.total_fee != null) {
        setDomesticShippingFee(data.data.total_fee);
      }
    }).catch(() => {});
  }, [product?.num_iid]);

  const handleToggleWishlist = async () => {
    if (!product) return;
    if (!user) {
      toast({ title: "Please login first", description: "You need to be logged in to add to wishlist.", variant: "destructive" });
      navigate("/auth");
      return;
    }
    setAddingToWishlist(true);
    try {
      if (isWishlisted) {
        await supabase.from('wishlist').delete().eq('user_id', user.id).eq('product_id', String(product.num_iid));
        setIsWishlisted(false);
        toast({ title: "Removed from wishlist" });
      } else {
        await supabase.from('wishlist').insert({
          user_id: user.id,
          product_id: String(product.num_iid),
          product_name: product.title,
          product_image: product.pic_url,
          product_price: convertToBDT(product.price),
          product_url: `${window.location.origin}/?product=${product.num_iid}`,
        });
        setIsWishlisted(true);
        toast({ title: "Added to wishlist!" });
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong.", variant: "destructive" });
    } finally {
      setAddingToWishlist(false);
    }
  };

  // Check if product is already in wishlist
  useEffect(() => {
    if (user && product) {
      supabase.from('wishlist').select('id').eq('user_id', user.id).eq('product_id', String(product.num_iid)).maybeSingle().then(({ data }) => {
        if (data) setIsWishlisted(true);
      });
    }
  }, [user, product]);

  const downloadFile = async (url: string, filename: string) => {
    try {
      const res = await fetch(url, { referrerPolicy: 'no-referrer' });
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleBuyNow = async () => {
    if (!product) return;
    if (!user) {
      toast({ title: "Please login first", description: "You need to be logged in to place an order.", variant: "destructive" });
      navigate("/auth");
      return;
    }

    const hasSkus = product.configuredItems && product.configuredItems.length > 0;
    const totalQty = hasSkus
      ? Object.values(skuQuantities).reduce((a, b) => a + b, 0)
      : quantity;

    if (totalQty <= 0) {
      toast({ title: "Select quantity", description: "Please select at least 1 item.", variant: "destructive" });
      return;
    }

    const totalPrice = hasSkus
      ? product.configuredItems!.reduce((sum, sku) => sum + convertToBDT(sku.price) * (skuQuantities[sku.id] || 0), 0)
      : convertToBDT(product.price) * quantity;

    const unitPrice = totalQty > 0 ? Math.round(totalPrice / totalQty) : 0;
    const orderNumber = `HT-${Date.now().toString(36).toUpperCase()}`;

    let notes = '';
    let variantName = '';
    let variantId = '';
    if (hasSkus) {
      const selectedSkus = product.configuredItems!.filter(sku => (skuQuantities[sku.id] || 0) > 0);
      notes = selectedSkus.map(sku => `${sku.title}: ${skuQuantities[sku.id]} pcs × ৳${convertToBDT(sku.price)}`).join('\n');
      variantName = selectedSkus.map(sku => sku.title).join(', ');
      variantId = selectedSkus.map(sku => sku.id).join(', ');
    }

    const productUrl = `${window.location.origin}/?product=${product.num_iid}`;
    const sourceUrl = `https://detail.1688.com/offer/${product.num_iid}.html`;

    setOrdering(true);
    try {
      const domesticChargeBDT = domesticShippingFee != null && domesticShippingFee > 0 ? Math.round(convertToBDT(domesticShippingFee)) : 0;
      const { error } = await supabase.from('orders').insert({
        user_id: user.id,
        order_number: orderNumber,
        product_name: product.title,
        product_image: product.pic_url,
        quantity: totalQty,
        unit_price: unitPrice,
        total_price: totalPrice,
        domestic_courier_charge: domesticChargeBDT,
        notes: notes || null,
        product_url: productUrl,
        source_url: sourceUrl,
        variant_name: variantName || null,
        variant_id: variantId || null,
        product_1688_id: String(product.num_iid),
      } as any);

      if (error) throw error;

      toast({ title: "Order placed!", description: `Order ${orderNumber} has been created successfully.` });
      navigate("/dashboard/orders");
    } catch (err: any) {
      toast({ title: "Order failed", description: err.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setOrdering(false);
    }
  };

  if (!product && isLoading) {
    return (
      <div className="min-h-screen bg-background animate-fade-in">
        <div className="border-b bg-card">
          <div className="mx-auto px-2 sm:px-3 max-w-[1600px]">
            <div className="flex items-center gap-2 py-3">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>
        <div className="mx-auto px-2 sm:px-3 py-4 max-w-[1600px]">
          <Skeleton className="h-7 w-full mb-4" />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <div className="flex gap-3">
              <div className="hidden md:flex flex-col gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="w-16 h-16 rounded-lg flex-shrink-0" />
                ))}
              </div>
              <Skeleton className="aspect-square w-full max-w-[500px] rounded-xl" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-48 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">No product selected</p>
      </div>
    );
  }

  const images = product.item_imgs?.map((img) => img.url) || [product.pic_url];
  const displayProps = product.props?.slice(0, 15) || [];
  const hasSkus = product.configuredItems && product.configuredItems.length > 0;
  const totalSelectedQty = hasSkus
    ? Object.values(skuQuantities).reduce((a, b) => a + b, 0)
    : quantity;
  const totalSelectedPrice = hasSkus
    ? product.configuredItems!.reduce((sum, sku) => sum + convertToBDT(sku.price) * (skuQuantities[sku.id] || 0), 0)
    : convertToBDT(product.price) * quantity;

  // Get selected SKU's title for display
  const selectedSkuItem = hasSkus && selectedSkuId
    ? product.configuredItems!.find(s => s.id === selectedSkuId)
    : null;

  const baseUnitPrice = hasSkus
    ? convertToBDT(selectedSkuItem?.price ?? product.configuredItems?.[0]?.price ?? product.price)
    : convertToBDT(product.price);
  const displayCnyPrice = hasSkus
    ? Math.round(selectedSkuItem?.price ?? product.configuredItems?.[0]?.price ?? product.price)
    : Math.round(product.price);

  return (
    <div className="min-h-screen bg-background">
      {isLoading && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-xs flex items-center gap-2 shadow-lg">
          <Loader2 className="h-3 w-3 animate-spin" />
          Translating descriptions...
        </div>
      )}

      {/* ===== Product Layout ===== */}
      <div className="mx-auto px-2 sm:px-3 max-w-[1600px] py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {onBack ? (
              <button onClick={onBack} className="hover:text-foreground transition-colors flex items-center gap-1">
                <ArrowLeft className="h-3.5 w-3.5" />
                Home
              </button>
            ) : (
              <span>Home</span>
            )}
            <span className="text-muted-foreground/50">›</span>
            <span className="text-foreground font-medium">Product</span>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs font-semibold rounded-full">
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Image Download</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Download Images & Videos</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 mt-2">
                {images.map((img, idx) => (
                  <button
                    key={`img-${idx}`}
                    onClick={() => downloadFile(img, `product-image-${idx + 1}.jpg`)}
                    className="aspect-square rounded-lg overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition-all cursor-pointer group relative"
                  >
                    <img src={img} alt={`Product ${idx + 1}`} referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                    <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors flex items-center justify-center">
                      <Download className="h-5 w-5 text-background opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                  </button>
                ))}
                {product.configuredItems?.filter(ci => ci.imageUrl).map((ci, idx) => (
                  <button
                    key={`sku-${idx}`}
                    onClick={() => downloadFile(ci.imageUrl!, `variant-${idx + 1}.jpg`)}
                    className="aspect-square rounded-lg overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition-all cursor-pointer group relative"
                  >
                    <img src={ci.imageUrl} alt={ci.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                    <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors flex items-center justify-center">
                      <Download className="h-5 w-5 text-background opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                  </button>
                ))}
                {product.video && (
                  <button
                    onClick={() => downloadFile(product.video!, `product-video.mp4`)}
                    className="aspect-square rounded-lg overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition-all cursor-pointer group relative"
                  >
                    <video src={product.video} className="w-full h-full object-cover" muted />
                    <div className="absolute inset-0 flex items-center justify-center bg-foreground/30 group-hover:bg-foreground/40 transition-colors">
                      <Play className="h-8 w-8 text-background drop-shadow-lg" />
                    </div>
                  </button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)_320px] gap-4 lg:gap-6">
          {/* LEFT: Gallery */}
          <div>
            <div className="relative rounded-2xl overflow-hidden bg-muted border shadow-sm">
              {showVideo && product.video ? (
                <video src={product.video} controls autoPlay className="w-full aspect-square object-contain" />
              ) : (
                <img
                  src={images[selectedImage]}
                  alt={product.title}
                  referrerPolicy="no-referrer"
                  className="w-full aspect-square object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                />
              )}
              {product.video && (
                <button
                  onClick={() => setShowVideo(!showVideo)}
                  className="absolute bottom-3 right-3 bg-foreground/85 text-background px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-semibold"
                >
                  <Play className="w-3.5 h-3.5" />
                  {showVideo ? "Photos" : "Video"}
                </button>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pt-3 pb-1 scrollbar-hide">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => { setSelectedImage(idx); setShowVideo(false); }}
                  className={`flex-shrink-0 w-[72px] h-[72px] rounded-xl overflow-hidden border-2 transition-all ${
                    selectedImage === idx && !showVideo
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <img src={img} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                </button>
              ))}
              {product.video && (
                <button
                  onClick={() => setShowVideo(true)}
                  className={`flex-shrink-0 w-[72px] h-[72px] rounded-xl overflow-hidden border-2 bg-muted flex items-center justify-center transition-all ${
                    showVideo ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                  }`}
                >
                  <Play className="h-5 w-5 text-primary" />
                </button>
              )}
            </div>
          </div>

          {/* CENTER: Product info */}
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl md:text-[2rem] leading-tight font-bold">{product.title}</h1>
              <div className="flex items-center gap-3 mt-2 text-sm">
                {product.total_sold ? (
                  <span className="font-medium">{product.total_sold.toLocaleString()} Sold</span>
                ) : null}
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-destructive" />
                  China Store
                </span>
              </div>
            </div>

            <Card className="border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-card">
              <CardContent className="p-4 md:p-5">
                <div className="text-4xl md:text-5xl font-bold text-primary">৳{baseUnitPrice.toLocaleString()}</div>
                <p className="text-muted-foreground mt-1">¥{displayCnyPrice} CNY</p>

                {product.priceRange && product.priceRange.length > 0 && (
                  <div className="mt-4 pt-3 border-t flex flex-wrap gap-2">
                    {product.priceRange.slice(0, 3).map((range, idx) => (
                      <div key={idx} className="rounded-lg border bg-card px-3 py-2">
                        <p className="text-xs text-muted-foreground">≥{range[0]} pcs</p>
                        <p className="font-semibold text-primary">৳{convertToBDT(range[1]).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Service:</span>
              <span className="font-medium text-foreground">Ships within 48 hours</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="border rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stock</p>
                <p className="font-bold text-lg">{product.num ? parseInt(product.num).toLocaleString() : '—'}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Min Order</p>
                <p className="font-bold text-lg">{product.min_num || 1} pcs</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Weight</p>
                <p className="font-bold text-lg">{product.item_weight ? `${product.item_weight} kg` : '—'}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Origin</p>
                <p className="font-bold text-lg">{product.location ? translateLocation(product.location) : '—'}</p>
              </div>
            </div>

            {hasSkus && (
              <div>
                <h3 className="text-xl font-semibold mb-2">Specifications</h3>
                <div className="border rounded-xl overflow-hidden bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[460px]">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-3 px-3 font-semibold">Variant</th>
                          <th className="text-right py-3 px-3 font-semibold">Price</th>
                          <th className="text-right py-3 px-3 font-semibold">Stock</th>
                          <th className="text-center py-3 px-3 font-semibold">Quantity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {product.configuredItems!.map((sku) => {
                          const qty = skuQuantities[sku.id] || 0;
                          return (
                            <tr key={sku.id} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2.5">
                                  {sku.imageUrl && (
                                    <img src={sku.imageUrl} alt="" referrerPolicy="no-referrer" className="w-10 h-10 rounded object-cover border" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                                  )}
                                  <span className="font-medium line-clamp-2">{sku.title}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-semibold text-primary">৳{convertToBDT(sku.price).toLocaleString()}</td>
                              <td className="py-2.5 px-3 text-right text-muted-foreground">{sku.stock}</td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center justify-center gap-0">
                                  <Button variant="outline" size="icon" className="h-7 w-7 rounded-l-xl rounded-r-none border-r-0" onClick={() => setSkuQuantities(prev => ({ ...prev, [sku.id]: Math.max(0, (prev[sku.id] || 0) - 1) }))}>
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <div className="h-7 w-9 border border-input flex items-center justify-center text-xs font-semibold bg-background">
                                    {qty}
                                  </div>
                                  <Button variant="outline" size="icon" className="h-7 w-7 rounded-r-xl rounded-l-none border-l-0" onClick={() => setSkuQuantities(prev => ({ ...prev, [sku.id]: (prev[sku.id] || 0) + 1 }))}>
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Checkout sidebar */}
          <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
            <Card className="border shadow-sm">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-lg">Shipping</p>
                  <p className="text-sm text-muted-foreground inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> To Bangladesh</p>
                </div>

                <button className="w-full h-11 border rounded-xl px-3 text-sm text-left flex items-center justify-between bg-card">
                  <span className="inline-flex items-center gap-2 text-foreground"><Truck className="h-4 w-4 text-primary" /> Select Shipping Method</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>

                {!hasSkus && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Quantity</span>
                    <div className="flex items-center gap-0">
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-l-xl rounded-r-none border-r-0" onClick={() => setQuantity(Math.max(0, quantity - 1))}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <div className="h-8 w-9 border border-input flex items-center justify-center text-xs font-semibold bg-background">{quantity}</div>
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-r-xl rounded-l-none border-l-0" onClick={() => setQuantity(quantity + 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span>{hasSkus ? Math.max(totalSelectedQty, 1) : Math.max(quantity, 1)} Pieces</span>
                    <span className="font-semibold text-primary">৳{(hasSkus ? (totalSelectedQty > 0 ? totalSelectedPrice : baseUnitPrice) : (quantity > 0 ? totalSelectedPrice : baseUnitPrice)).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xl font-bold">
                    <span>Total</span>
                    <span>৳{(hasSkus ? (totalSelectedQty > 0 ? totalSelectedPrice : baseUnitPrice) : (quantity > 0 ? totalSelectedPrice : baseUnitPrice)).toLocaleString()}</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">China warehouse delivery charge will be added on the cart page.</p>

                {domesticShippingFee != null && domesticShippingFee > 0 && (
                  <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm flex items-center justify-between">
                    <span className="text-muted-foreground">China Courier (1688)</span>
                    <span className="font-semibold">৳{convertToBDT(domesticShippingFee).toLocaleString()}</span>
                  </div>
                )}

                <Button className="w-full h-11 rounded-xl font-bold" onClick={handleBuyNow} disabled={ordering}>
                  {ordering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
                  {ordering ? "Placing..." : "Buy Now"}
                </Button>

                <Button variant="outline" className="w-full h-11 rounded-xl font-semibold" onClick={handleBuyNow} disabled={ordering}>
                  <ShoppingCart className="h-4 w-4 mr-2" /> Add to Cart
                </Button>

                <Button variant="ghost" className="w-full h-10 text-muted-foreground" onClick={handleToggleWishlist} disabled={addingToWishlist}>
                  <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp Order
                </Button>

                <div className="rounded-xl border bg-accent text-accent-foreground p-4">
                  <p className="font-bold text-lg">Dropship this product!</p>
                  <p className="text-sm opacity-90 mt-1">No stock, no risk — just sell and grow your business.</p>
                  <Button variant="secondary" className="mt-3">Start Dropshipping</Button>
                </div>
              </CardContent>
            </Card>

            {product.seller_info && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Seller</p>
                  <p className="font-semibold text-base mt-0.5">{product.seller_info.shop_name || "1688 Seller"}</p>
                  {product.location && (
                    <p className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {translateLocation(product.location)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Shipping mode: {shippingMethod === 'air' ? 'By Air' : 'By Sea'}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>


        {/* ===== Tabs Section ===== */}
        <div className="mt-8">
          <Tabs defaultValue="specs">
            <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 gap-0 overflow-x-auto scrollbar-hide">
              <TabsTrigger
                value="specs"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-5 py-3 text-sm font-medium"
              >
                Specifications
              </TabsTrigger>
              <TabsTrigger
                value="description"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-5 py-3 text-sm font-medium"
              >
                Description
              </TabsTrigger>
              <TabsTrigger
                value="reviews"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-5 py-3 text-sm font-medium"
              >
                Reviews
              </TabsTrigger>
            </TabsList>

            <TabsContent value="specs" className="mt-0">
              {displayProps.length > 0 ? (
                <div className="border rounded-b-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {displayProps.map((prop, index) => (
                        <tr key={index} className="border-b last:border-b-0">
                          <td className="py-3.5 px-5 bg-muted/30 font-medium text-muted-foreground w-1/3 align-top">
                            {prop.name}
                          </td>
                          <td className="py-3.5 px-5">
                            {prop.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm py-12 text-center">No specifications available</p>
              )}
            </TabsContent>

            <TabsContent value="description" className="mt-0">
              {product.desc_img && product.desc_img.length > 0 ? (
                <div className="space-y-0 max-w-3xl">
                  {product.desc_img.map((img, idx) => (
                    <img
                      key={idx}
                      src={img}
                      alt={`Description ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm py-12 text-center">No product description images available</p>
              )}
            </TabsContent>

            <TabsContent value="reviews" className="mt-0">
              <div className="py-12 text-center">
                <p className="text-muted-foreground text-sm">No reviews yet for this product.</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
