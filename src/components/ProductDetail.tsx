import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, ArrowLeft, Play, ShoppingCart, MessageCircle, ExternalLink,
  Star, MapPin, Truck, Package, Box, Weight, Minus, Plus, ChevronDown,
  ChevronUp, ShieldCheck, Clock, Search, ArrowDownUp, Lock
} from "lucide-react";
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
  const [showAllSkus, setShowAllSkus] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

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
    if (hasSkus) {
      const selectedSkus = product.configuredItems!.filter(sku => (skuQuantities[sku.id] || 0) > 0);
      notes = selectedSkus.map(sku => `${sku.title}: ${skuQuantities[sku.id]} pcs × ৳${convertToBDT(sku.price)}`).join('\n');
    }

    const productUrl = `${window.location.origin}/?product=${product.num_iid}`;
    const sourceUrl = `https://detail.1688.com/offer/${product.num_iid}.html`;

    setOrdering(true);
    try {
      const { error } = await supabase.from('orders').insert({
        user_id: user.id,
        order_number: orderNumber,
        product_name: product.title,
        product_image: product.pic_url,
        quantity: totalQty,
        unit_price: unitPrice,
        total_price: totalPrice,
        notes: notes || null,
        product_url: productUrl,
        source_url: sourceUrl,
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
          <div className="container mx-auto px-4 max-w-7xl">
            <div className="flex items-center gap-2 py-3">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 py-6 max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] lg:grid-cols-[420px_1fr_320px] gap-4 md:gap-6 lg:gap-8">
            {/* Image skeleton */}
            <div className="space-y-3">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <div className="flex gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="w-[72px] h-[72px] rounded-lg flex-shrink-0" />
                ))}
              </div>
            </div>
            {/* Info skeleton */}
            <div className="space-y-4">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-5 w-3/4" />
              <div className="flex gap-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-24 w-full rounded-xl" />
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-48 w-full rounded-lg" />
            </div>
            {/* Sidebar skeleton */}
            <div className="space-y-4 md:col-span-2 lg:col-span-1">
              <Skeleton className="h-72 w-full rounded-lg" />
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-40 w-full rounded-lg" />
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

  const getPriceRanges = () => {
    if (!product.priceRange || product.priceRange.length === 0) {
      return [{ minQty: 1, priceCNY: product.price, priceBDT: convertToBDT(product.price) }];
    }
    return product.priceRange.map(([minQty, price]) => ({
      minQty, priceCNY: price, priceBDT: convertToBDT(price),
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      {isLoading && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-xs flex items-center gap-2 shadow-lg">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading full details...
        </div>
      )}

      {/* Breadcrumb */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            {onBack ? (
              <button onClick={onBack} className="hover:text-foreground transition-colors flex items-center gap-1">
                <ArrowLeft className="h-3.5 w-3.5" />
                Home
              </button>
            ) : (
              <span>Home</span>
            )}
            <span className="text-muted-foreground/50">›</span>
            <span className="text-foreground font-medium">Product Details</span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Main 3-column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] lg:grid-cols-[420px_1fr_320px] gap-4 md:gap-6 lg:gap-8">

          {/* ===== LEFT: Image Gallery ===== */}
          <div className="space-y-3 md:col-span-1">
            <div className="relative aspect-square rounded-xl overflow-hidden bg-muted border shadow-sm">
              {showVideo && product.video ? (
                <video src={product.video} controls autoPlay className="w-full h-full object-contain" />
              ) : (
                <img
                  src={images[selectedImage]}
                  alt={product.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain transition-transform duration-300"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                />
              )}
              {product.video && (
                <button
                  onClick={() => setShowVideo(!showVideo)}
                  className="absolute bottom-3 right-3 bg-foreground/80 backdrop-blur-sm text-background px-3 py-1.5 rounded-full flex items-center gap-1.5 text-sm hover:bg-foreground transition-colors shadow-md"
                >
                  <Play className="w-3.5 h-3.5" />
                  {showVideo ? "Photos" : "Video"}
                </button>
              )}
            </div>

            {/* Thumbnail Strip */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => { setSelectedImage(idx); setShowVideo(false); }}
                  className={`flex-shrink-0 w-[72px] h-[72px] rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImage === idx && !showVideo
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <img src={img} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                </button>
              ))}
              {product.video && (
                <button
                  onClick={() => setShowVideo(true)}
                  className={`flex-shrink-0 w-[72px] h-[72px] rounded-lg overflow-hidden border-2 bg-muted flex items-center justify-center transition-all ${
                    showVideo ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                  }`}
                >
                  <Play className="h-6 w-6 text-primary" />
                </button>
              )}
            </div>
          </div>

          {/* ===== CENTER: Product Info ===== */}
          <div className="space-y-4 md:space-y-5 md:col-span-1">
            {/* Title */}
            <h1 className="text-lg md:text-2xl font-bold leading-tight tracking-tight">{product.title}</h1>

            {/* Sold + Store row */}
            <div className="flex items-center gap-4 flex-wrap">
              {product.total_sold && (
                <span className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{product.total_sold.toLocaleString()}</span> Sold
                </span>
              )}
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full overflow-hidden bg-red-500 text-[9px] text-white font-bold flex-shrink-0">CN</span>
                <span>China Store</span>
              </div>
            </div>

            {/* Price Block */}
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-xl p-3 md:p-5">
              {(() => {
                // Show price range if variants have different prices
                const variantPrices = hasSkus
                  ? [...new Set(product.configuredItems!.map(ci => ci.price))].sort((a, b) => a - b)
                  : [];
                const showRange = variantPrices.length > 1;
                return (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-medium text-primary">৳</span>
                      <span className="text-2xl md:text-4xl font-extrabold text-primary tracking-tight">
                        {showRange
                          ? `${convertToBDT(variantPrices[0]).toLocaleString()} - ${convertToBDT(variantPrices[variantPrices.length - 1]).toLocaleString()}`
                          : convertToBDT(product.price).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1.5">
                      {showRange
                        ? `¥${variantPrices[0]} - ¥${variantPrices[variantPrices.length - 1]} CNY`
                        : `¥${product.price} CNY`}
                    </div>
                  </>
                );
              })()}

              {/* Quantity-based tiered pricing */}
              {getPriceRanges().length > 1 && (
                <div className="flex gap-4 mt-3 pt-3 border-t border-primary/10">
                  {getPriceRanges().map((range, idx) => (
                    <div key={idx} className="text-center px-3 py-1.5 bg-background/50 rounded-lg">
                      <div className="text-xs text-muted-foreground font-medium">≥{range.minQty} pcs</div>
                      <div className="font-bold text-primary text-sm">৳{range.priceBDT}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Service */}
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold">Service:</span>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Ships within 48 hours
              </div>
            </div>

            {/* Quick Info Cards */}
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <div className="flex items-center gap-2 p-2.5 md:p-3 bg-card border rounded-xl">
                <Package className="h-4 w-4 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] md:text-[11px] text-muted-foreground uppercase tracking-wide">Stock</div>
                  <div className="font-semibold text-xs md:text-sm truncate">{product.num || 'Available'}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2.5 md:p-3 bg-card border rounded-xl">
                <Box className="h-4 w-4 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] md:text-[11px] text-muted-foreground uppercase tracking-wide">Min Order</div>
                  <div className="font-semibold text-xs md:text-sm">{product.min_num} pcs</div>
                </div>
              </div>
              {product.item_weight && (
                <div className="flex items-center gap-2 p-2.5 md:p-3 bg-card border rounded-xl">
                  <Weight className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] md:text-[11px] text-muted-foreground uppercase tracking-wide">Weight</div>
                    <div className="font-semibold text-xs md:text-sm">{product.item_weight} kg</div>
                  </div>
                </div>
              )}
              {product.location && (
                <div className="flex items-center gap-2 p-2.5 md:p-3 bg-card border rounded-xl">
                  <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] md:text-[11px] text-muted-foreground uppercase tracking-wide">Origin</div>
                    <div className="font-semibold text-xs md:text-sm truncate">{translateLocation(product.location)}</div>
                  </div>
                </div>
              )}
            </div>

            {/* ===== SKU Variant Table ===== */}
            {hasSkus && (
              <div className="space-y-3">
                <h3 className="font-semibold text-base">Specifications</h3>
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/60">
                          <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Variant</th>
                          <th className="text-right py-3 px-4 font-semibold text-muted-foreground w-[100px]">Price</th>
                          <th className="text-right py-3 px-4 font-semibold text-muted-foreground w-[70px]">Stock</th>
                          <th className="text-center py-3 px-4 font-semibold text-muted-foreground w-[130px]">Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(showAllSkus ? product.configuredItems! : product.configuredItems!.slice(0, 5)).map((sku) => (
                          <tr key={sku.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                {sku.imageUrl && (
                                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0 border">
                                    <img src={sku.imageUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover"
                                      onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                                  </div>
                                )}
                                <span className="text-sm leading-snug">{sku.title || '—'}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-semibold whitespace-nowrap">
                              ৳{convertToBDT(sku.price).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right text-muted-foreground">
                              {sku.stock.toLocaleString()}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-center gap-1.5">
                                <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg"
                                  onClick={() => setSkuQuantities(prev => ({ ...prev, [sku.id]: Math.max(0, (prev[sku.id] || 0) - 1) }))}>
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="w-8 text-center text-sm font-medium tabular-nums">{skuQuantities[sku.id] || 0}</span>
                                <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg"
                                  onClick={() => setSkuQuantities(prev => ({ ...prev, [sku.id]: (prev[sku.id] || 0) + 1 }))}>
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {product.configuredItems!.length > 5 && (
                    <button
                      onClick={() => setShowAllSkus(!showAllSkus)}
                      className="w-full py-2.5 text-sm font-medium text-primary hover:bg-primary/5 flex items-center justify-center gap-1 border-t transition-colors"
                    >
                      {showAllSkus ? <>Show Less <ChevronUp className="h-4 w-4" /></> : <>Show More ({product.configuredItems!.length - 5} more) <ChevronDown className="h-4 w-4" /></>}
                    </button>
                  )}
                </Card>
              </div>
            )}
          </div>

          {/* ===== RIGHT: Sidebar ===== */}
          <div className="space-y-4 md:col-span-2 lg:col-span-1 lg:sticky lg:top-4 lg:self-start">
            {/* Shipping Card */}
            <Card className="shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base">Shipping</span>
                    <span className="text-primary text-xs">*</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    To Bangladesh
                  </div>
                </div>

                <button className="w-full flex items-center justify-between p-3 bg-muted/50 border rounded-xl text-sm hover:bg-muted transition-colors">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    <span className="font-medium">Select Shipping Method</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>

                <Separator />

                {/* Quantity selector for non-SKU products */}
                {!hasSkus && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{quantity} Pieces</span>
                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setQuantity(Math.max(0, quantity - 1))}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-semibold tabular-nums">{quantity}</span>
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setQuantity(quantity + 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* SKU total pieces */}
                {hasSkus && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{totalSelectedQty} Pieces</span>
                    <span className="text-primary font-bold">৳{totalSelectedPrice.toLocaleString()}</span>
                  </div>
                )}

                <div className="flex items-center justify-between py-2 border-t border-b">
                  <span className="font-bold">Total</span>
                  <span className="text-lg font-bold">৳{totalSelectedPrice.toLocaleString()}</span>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  চায়না গোডাউন ডেলিভারি চার্জ কার্ট পেজে যোগ হবে
                </p>

                <Button className="w-full h-12 text-base font-bold rounded-xl shadow-md hover:shadow-lg transition-shadow" onClick={handleBuyNow} disabled={ordering}>
                  {ordering ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-5 h-5 mr-2" />}
                  {ordering ? "Placing Order..." : "Buy Now"}
                </Button>

                <Button variant="outline" className="w-full h-11 rounded-xl font-semibold" onClick={handleBuyNow} disabled={ordering}>
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Add to Cart
                </Button>

                <Button variant="ghost" className="w-full h-10 rounded-xl text-muted-foreground hover:text-foreground">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  WhatsApp Order
                </Button>
              </CardContent>
            </Card>

            {/* Dropship CTA */}
            <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-br from-green-600 to-emerald-700 text-white">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <Truck className="h-6 w-6 mt-0.5 flex-shrink-0 opacity-90" />
                  <div>
                    <p className="font-bold text-lg leading-tight">Dropship this product!</p>
                    <p className="text-sm text-white/80 mt-1">No stock, No risk! Just sell and grow your business.</p>
                    <Button size="sm" variant="secondary" className="mt-3 font-semibold">
                      Start Dropshipping
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Assurance */}
            <Card className="shadow-sm">
              <CardContent className="p-5 space-y-3">
                <h3 className="font-bold text-sm">HumayraTraders Assurance</h3>
                {[
                  { icon: ShieldCheck, text: "100% money back guarantee" },
                  { icon: Clock, text: "On time guarantee" },
                  { icon: Search, text: "Detailed inspection" },
                  { icon: ArrowDownUp, text: "Lower exchange loss" },
                  { icon: Lock, text: "Security & Privacy" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <Icon className="h-4 w-4 text-green-600 flex-shrink-0" />
                    {text}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* View on 1688 */}
            <a
              href={`https://detail.1688.com/offer/${product.num_iid}.html`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View original on 1688
            </a>
          </div>
        </div>

        {/* ===== Tabs Section: Specifications | Product Description | Reviews ===== */}
        <div className="mt-10">
          <Tabs defaultValue="specs">
            <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 gap-0 overflow-x-auto scrollbar-hide">
              <TabsTrigger
                value="specs"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 py-3 text-sm font-medium"
              >
                Specifications
              </TabsTrigger>
              <TabsTrigger
                value="description"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 py-3 text-sm font-medium"
              >
                Product Description
              </TabsTrigger>
              <TabsTrigger
                value="reviews"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 py-3 text-sm font-medium"
              >
                Reviews
              </TabsTrigger>
            </TabsList>

            {/* Specifications Tab */}
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

            {/* Product Description Tab */}
            <TabsContent value="description" className="mt-0">
              {product.desc_img && product.desc_img.length > 0 ? (
                <div className="space-y-3 py-6 max-w-4xl">
                  {product.desc_img.map((img, index) => (
                    <img
                      key={index}
                      src={img}
                      alt={`Product detail ${index + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full rounded-lg border"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm py-12 text-center">No product description images available</p>
              )}
            </TabsContent>

            {/* Reviews Tab */}
            <TabsContent value="reviews" className="mt-0">
              <div className="py-12 text-center">
                <p className="text-muted-foreground text-sm">No reviews yet for this product.</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* ===== Seller Info (below tabs) ===== */}
        {product.seller_info && (
          <div className="mt-8 mb-8">
            <Card className="max-w-2xl">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xl font-bold text-primary">
                      {(product.seller_info.shop_name || 'S')[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-base">{product.seller_info.shop_name || "1688 Seller"}</div>
                    <div className="flex items-center gap-3 mt-1">
                      <Badge variant="secondary" className="text-xs">Verified Supplier</Badge>
                      {product.location && (
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {translateLocation(product.location)}
                        </span>
                      )}
                    </div>
                  </div>
                  {(product.seller_info.item_score || product.seller_info.delivery_score || product.seller_info.composite_score) && (
                    <div className="flex gap-5">
                      {product.seller_info.item_score && (
                        <div className="text-center">
                          <div className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" /><span className="font-bold text-sm">{product.seller_info.item_score}</span></div>
                          <div className="text-[11px] text-muted-foreground">Product</div>
                        </div>
                      )}
                      {product.seller_info.delivery_score && (
                        <div className="text-center">
                          <div className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" /><span className="font-bold text-sm">{product.seller_info.delivery_score}</span></div>
                          <div className="text-[11px] text-muted-foreground">Delivery</div>
                        </div>
                      )}
                      {product.seller_info.composite_score && (
                        <div className="text-center">
                          <div className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" /><span className="font-bold text-sm">{product.seller_info.composite_score}</span></div>
                          <div className="text-[11px] text-muted-foreground">Overall</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
