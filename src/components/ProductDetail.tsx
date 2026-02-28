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
    }).then(({ data, error }) => {
      if (!error && data?.success && data?.data?.total_fee != null) {
        setDomesticShippingFee(data.data.total_fee);
      }
      // Silently ignore failures — shipping fee is optional
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
        {/* Breadcrumb */}
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
              <Button size="sm" variant="outline" className="gap-1.5 text-xs font-semibold rounded-full border-primary text-primary hover:bg-primary hover:text-primary-foreground">
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Image Download</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Download Images & Videos</DialogTitle></DialogHeader>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 mt-2">
                {images.map((img, idx) => (
                  <button key={`img-${idx}`} onClick={() => downloadFile(img, `product-image-${idx + 1}.jpg`)} className="aspect-square rounded-lg overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition-all cursor-pointer group relative">
                    <img src={img} alt={`Product ${idx + 1}`} referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                    <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors flex items-center justify-center">
                      <Download className="h-5 w-5 text-background opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                  </button>
                ))}
                {product.configuredItems?.filter(ci => ci.imageUrl).map((ci, idx) => (
                  <button key={`sku-${idx}`} onClick={() => downloadFile(ci.imageUrl!, `variant-${idx + 1}.jpg`)} className="aspect-square rounded-lg overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition-all cursor-pointer group relative">
                    <img src={ci.imageUrl} alt={ci.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                    <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors flex items-center justify-center">
                      <Download className="h-5 w-5 text-background opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                  </button>
                ))}
                {product.video && (
                  <button onClick={() => downloadFile(product.video!, `product-video.mp4`)} className="aspect-square rounded-lg overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition-all cursor-pointer group relative">
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

        {/* Title + Sold */}
        <h1 className="text-base sm:text-lg md:text-xl font-bold leading-tight">{product.title}</h1>
        <div className="flex items-center gap-3 mt-1 mb-3 flex-wrap">
          {product.total_sold && (
            <Badge variant="secondary" className="text-xs font-semibold gap-1">
              🔥 {product.total_sold.toLocaleString()} Sold
            </Badge>
          )}
        </div>

        {/* 3 Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] lg:grid-cols-[auto_1fr_320px] gap-3 lg:gap-4">

          {/* COL 1: Vertical Thumbnails + Main Image */}
          <div className="flex gap-3 lg:col-span-1">
            <div className="hidden md:flex flex-col gap-2 overflow-y-auto max-h-[560px] scrollbar-hide">
              {images.map((img, idx) => (
                <button key={idx} onClick={() => { setSelectedImage(idx); setShowVideo(false); }}
                  className={`flex-shrink-0 w-[72px] h-[72px] rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImage === idx && !showVideo ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                  }`}>
                  <img src={img} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                </button>
              ))}
              {product.video && (
                <button onClick={() => setShowVideo(true)}
                  className={`flex-shrink-0 w-[72px] h-[72px] rounded-lg overflow-hidden border-2 bg-muted flex items-center justify-center transition-all ${
                    showVideo ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                  }`}>
                  <Play className="h-5 w-5 text-primary" />
                </button>
              )}
            </div>

            <div className="relative rounded-xl overflow-hidden bg-muted border shadow-sm w-full max-w-[520px]">
              {showVideo && product.video ? (
                <video src={product.video} controls autoPlay className="w-full aspect-square object-contain" />
              ) : (
                <img src={images[selectedImage]} alt={product.title} referrerPolicy="no-referrer"
                  className="w-full aspect-square object-contain" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
              )}
              {product.video && (
                <button onClick={() => setShowVideo(!showVideo)}
                  className="absolute bottom-3 right-3 bg-foreground/80 text-background px-3 py-1.5 rounded-full flex items-center gap-1.5 text-sm">
                  <Play className="w-3.5 h-3.5" />{showVideo ? "Photos" : "Preview"}
                </button>
              )}
            </div>
          </div>

          {/* Mobile thumbnails */}
          <div className="flex md:hidden gap-2 overflow-x-auto pb-1 scrollbar-hide col-span-full">
            {images.map((img, idx) => (
              <button key={idx} onClick={() => { setSelectedImage(idx); setShowVideo(false); }}
                className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                  selectedImage === idx && !showVideo ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                }`}>
                <img src={img} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
              </button>
            ))}
          </div>

          {/* COL 2: Product Info + Color Grid + Specs Table */}
          <div className="space-y-3 md:col-span-2 lg:col-span-1">
            {/* Service */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Service:</span>
              <span className="font-medium text-foreground">Ships within 48 hours</span>
            </div>

            {/* Stock / Min / Weight / Origin */}
            <div className="grid grid-cols-2 gap-2">
              <div className="border rounded-lg p-2.5 flex items-center gap-2">
                <Package className="h-4.5 w-4.5 text-primary flex-shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-primary font-semibold">Stock</div>
                  <div className="font-bold text-base">{product.num ? parseInt(product.num).toLocaleString() : '—'}</div>
                </div>
              </div>
              <div className="border rounded-lg p-2.5 flex items-center gap-2">
                <Box className="h-4.5 w-4.5 text-primary flex-shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-primary font-semibold">Min Order</div>
                  <div className="font-bold text-base">{product.min_num || 1} pcs</div>
                </div>
              </div>
              <div className="border rounded-lg p-2.5 flex items-center gap-2">
                <Weight className="h-4.5 w-4.5 text-primary flex-shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-primary font-semibold">Weight</div>
                  <div className="font-bold text-base">{product.item_weight ? `${product.item_weight} kg` : '—'}</div>
                </div>
              </div>
              <div className="border rounded-lg p-2.5 flex items-center gap-2">
                <MapPin className="h-4.5 w-4.5 text-primary flex-shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-primary font-semibold">Origin</div>
                  <div className="font-bold text-base">{product.location ? translateLocation(product.location) : '—'}</div>
                </div>
              </div>
            </div>

            {/* Color / Variant Thumbnail Grid */}
            {hasSkus && (
              <div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-base font-bold">Color :</span>
                  {selectedSkuItem && <span className="text-primary text-sm font-medium">{selectedSkuItem.title}</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {product.configuredItems!.filter(sku => sku.imageUrl).map((sku) => {
                    const skuQty = skuQuantities[sku.id] || 0;
                    return (
                      <button key={sku.id} onClick={() => {
                        setSelectedSkuId(sku.id);
                        const imgIdx = images.findIndex(img => img === sku.imageUrl);
                        if (imgIdx >= 0) { setSelectedImage(imgIdx); setShowVideo(false); }
                      }}
                        className={`relative flex-shrink-0 w-[60px] h-[60px] rounded overflow-hidden border-2 transition-all ${
                          selectedSkuId === sku.id ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/40'
                        }`}>
                        <img src={sku.imageUrl} alt={sku.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                        {skuQty > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm">{skuQty}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Specifications Table */}
            {hasSkus && (
              <div>
                <h3 className="text-base font-bold mb-2">Specifications</h3>
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[400px]">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2.5 px-2 sm:px-3 font-semibold">Variant</th>
                          <th className="text-right py-2.5 px-2 sm:px-3 font-semibold">Price</th>
                          <th className="text-right py-2.5 px-2 sm:px-3 font-semibold">Stock</th>
                          <th className="text-center py-2.5 px-2 sm:px-3 font-semibold">Quantity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {product.configuredItems!.map((sku) => {
                          const qty = skuQuantities[sku.id] || 0;
                          return (
                            <tr key={sku.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2.5">
                                  {sku.imageUrl && (
                                    <img src={sku.imageUrl} alt="" referrerPolicy="no-referrer" className="w-10 h-10 rounded object-cover border flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                                  )}
                                  <span className="font-medium line-clamp-2 text-xs sm:text-sm">{sku.title}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-semibold text-primary whitespace-nowrap">৳{convertToBDT(sku.price).toLocaleString()}</td>
                              <td className="py-2.5 px-3 text-right text-muted-foreground whitespace-nowrap">{sku.stock}</td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center justify-center gap-0">
                                  <Button variant="outline" size="icon" className="h-7 w-7 rounded-l-md rounded-r-none border-r-0" onClick={() => setSkuQuantities(prev => ({ ...prev, [sku.id]: Math.max(0, (prev[sku.id] || 0) - 1) }))}>
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <div className="h-7 w-8 border border-input flex items-center justify-center text-xs font-semibold tabular-nums bg-background">{qty}</div>
                                  <Button variant="outline" size="icon" className="h-7 w-7 rounded-r-md rounded-l-none border-l-0" onClick={() => setSkuQuantities(prev => ({ ...prev, [sku.id]: (prev[sku.id] || 0) + 1 }))}>
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

            {/* If no variants, show price */}
            {!hasSkus && (
              <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-xl p-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-medium text-primary">৳</span>
                  <span className="text-3xl md:text-5xl font-extrabold text-primary tracking-tight">{convertToBDT(product.price).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>

          {/* COL 3: Right Sidebar */}
          <div className="space-y-3 md:col-span-2 lg:col-span-1 lg:sticky lg:top-4 lg:self-start">
            <Card className="shadow-sm overflow-hidden">
              <CardContent className="p-0">
                {/* By Air header */}
                <div className="flex items-center justify-center py-4 border-b border-border">
                  <Plane className="h-6 w-6 mb-1.5 text-primary" />
                  <div className="ml-2">
                    <span className="text-sm font-bold text-primary">By Air</span>
                    <span className="text-xs text-muted-foreground ml-2">৳750/ ৳1150 Per Kg</span>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {/* Selected Variant Detail */}
                  {hasSkus && selectedSkuItem && (() => {
                    const qty = skuQuantities[selectedSkuId!] || 0;
                    return (
                      <div className="border border-primary/20 rounded-lg p-3 space-y-2.5 bg-primary/5">
                        <div className="flex items-start gap-3">
                          {selectedSkuItem.imageUrl && (
                            <img src={selectedSkuItem.imageUrl} alt="" referrerPolicy="no-referrer" className="w-14 h-14 rounded-md object-cover border" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold leading-tight line-clamp-2">{selectedSkuItem.title}</p>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="text-lg font-bold text-primary">৳{convertToBDT(selectedSkuItem.price).toLocaleString()}</span>
                              <span className="text-xs text-muted-foreground line-through">৳{Math.round(convertToBDT(selectedSkuItem.price) * 1.05).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          {qty > 0 ? (
                            <div className="flex items-center gap-0">
                              <Button variant="outline" size="icon" className="h-8 w-8 rounded-l-md rounded-r-none border-r-0"
                                onClick={() => setSkuQuantities(prev => ({ ...prev, [selectedSkuId!]: Math.max(0, (prev[selectedSkuId!] || 0) - 1) }))}>
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <div className="h-8 w-10 border border-input flex items-center justify-center text-sm font-semibold tabular-nums bg-background">{qty}</div>
                              <Button variant="outline" size="icon" className="h-8 w-8 rounded-r-md rounded-l-none border-l-0"
                                onClick={() => setSkuQuantities(prev => ({ ...prev, [selectedSkuId!]: (prev[selectedSkuId!] || 0) + 1 }))}>
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" className="h-8 px-6 rounded-md font-semibold"
                              onClick={() => setSkuQuantities(prev => ({ ...prev, [selectedSkuId!]: 1 }))}>
                              Add
                            </Button>
                          )}
                          <span className="text-xs text-muted-foreground">Stock: {selectedSkuItem.stock}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Other added variants */}
                  {hasSkus && (() => {
                    const addedSkus = product.configuredItems!.filter(sku => (skuQuantities[sku.id] || 0) > 0 && sku.id !== selectedSkuId);
                    if (addedSkus.length === 0) return null;
                    return addedSkus.map(sku => {
                      const qty = skuQuantities[sku.id] || 0;
                      return (
                        <div key={sku.id} className="border rounded-lg p-3 space-y-2.5">
                          <div className="flex items-start gap-3">
                            {sku.imageUrl && <img src={sku.imageUrl} alt="" referrerPolicy="no-referrer" className="w-14 h-14 rounded-md object-cover border" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold leading-tight line-clamp-2">{sku.title}</p>
                              <div className="flex items-baseline gap-2 mt-1">
                                <span className="text-lg font-bold text-primary">৳{convertToBDT(sku.price).toLocaleString()}</span>
                                <span className="text-xs text-muted-foreground line-through">৳{Math.round(convertToBDT(sku.price) * 1.05).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-0">
                              <Button variant="outline" size="icon" className="h-8 w-8 rounded-l-md rounded-r-none border-r-0"
                                onClick={() => setSkuQuantities(prev => ({ ...prev, [sku.id]: Math.max(0, (prev[sku.id] || 0) - 1) }))}>
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <div className="h-8 w-10 border border-input flex items-center justify-center text-sm font-semibold tabular-nums bg-background">{qty}</div>
                              <Button variant="outline" size="icon" className="h-8 w-8 rounded-r-md rounded-l-none border-l-0"
                                onClick={() => setSkuQuantities(prev => ({ ...prev, [sku.id]: (prev[sku.id] || 0) + 1 }))}>
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <span className="text-xs text-muted-foreground">Stock: {sku.stock}</span>
                          </div>
                        </div>
                      );
                    });
                  })()}

                  {/* No-variant quantity */}
                  {!hasSkus && (
                    <div className="flex items-center justify-between">
                      <span className="text-base font-semibold">Quantity</span>
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setQuantity(Math.max(0, quantity - 1))}><Minus className="h-3 w-3" /></Button>
                        <span className="w-8 text-center text-base font-semibold tabular-nums">{quantity}</span>
                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setQuantity(quantity + 1)}><Plus className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  )}

                  {hasSkus && (
                    <div className="flex items-center justify-between">
                      <span className="text-base font-semibold">Quantity</span>
                      <span className="text-base font-bold">{totalSelectedQty}</span>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold">Product price</span>
                    <span className="text-base font-bold">৳{totalSelectedPrice.toLocaleString()}</span>
                  </div>

                  {domesticShippingFee != null && domesticShippingFee > 0 && (
                    <div className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                      <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" />China Courier (1688)</span>
                      <span className="text-sm font-semibold">৳{convertToBDT(domesticShippingFee).toLocaleString()} <span className="text-muted-foreground font-normal">(¥{domesticShippingFee})</span></span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground">Pay now <Badge variant="secondary" className="text-xs ml-1.5 py-0.5 px-1.5">70%</Badge></span>
                    <span className="text-sm font-bold">৳{Math.round(totalSelectedPrice * 0.7).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground">Pay on delivery <Badge variant="secondary" className="text-xs ml-1.5 py-0.5 px-1.5">30%</Badge></span>
                    <span className="text-sm font-bold">৳{Math.round(totalSelectedPrice * 0.3).toLocaleString()} +</span>
                  </div>
                  <p className="text-xs text-primary font-medium cursor-pointer hover:underline">Shipping + China Courier Charge</p>

                  <Separator />

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button variant="outline" size="icon" className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl shrink-0" onClick={handleToggleWishlist} disabled={addingToWishlist}>
                      <Heart className={`h-4 w-4 sm:h-5 sm:w-5 ${isWishlisted ? 'fill-destructive text-destructive' : ''}`} />
                    </Button>
                    <Button variant="outline" className="min-w-0 flex-1 basis-[calc(50%-2rem)] h-10 sm:h-11 rounded-xl font-semibold text-xs sm:text-sm px-2 sm:px-4" onClick={handleBuyNow} disabled={ordering}>
                      <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 shrink-0" />Add to Cart
                    </Button>
                    <Button className="min-w-0 flex-1 basis-[calc(50%-2rem)] h-10 sm:h-11 rounded-xl font-bold shadow-md text-xs sm:text-sm px-2 sm:px-4" onClick={handleBuyNow} disabled={ordering}>
                      {ordering ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin shrink-0" /> : <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 shrink-0" />}
                      {ordering ? "Placing..." : "Buy Now"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Seller Info Card */}
            {product.seller_info && (
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-xl font-bold text-primary">{(product.seller_info.shop_name || 'S')[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-base">{product.seller_info.shop_name || "1688 Seller"}</div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <Badge variant="secondary" className="text-xs">Verified Supplier</Badge>
                        {product.location && (
                          <span className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{translateLocation(product.location)}</span>
                        )}
                      </div>
                    </div>
                  </div>
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
