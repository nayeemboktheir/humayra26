import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, Play, ShoppingCart, MessageCircle, ExternalLink, Star, MapPin, Truck, Package, Box, Weight, ChevronLeft, ChevronRight, Minus, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { ProductDetail1688 } from "@/lib/api/alibaba1688";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const CNY_TO_BDT = 17.5;
const convertToBDT = (cny: number) => Math.round(cny * CNY_TO_BDT);

const propNameTranslations: Record<string, string> = {
  "品牌": "Brand", "型号": "Model", "货号": "Item No.", "产地": "Origin",
  "货源类别": "Stock Type", "类型": "Category", "颜色": "Color", "重量": "Weight",
  "材质": "Material", "适用场景": "Application", "功能": "Function", "规格": "Specification",
  "包装": "Packaging", "风格": "Style", "图案": "Pattern", "适用人群": "Suitable For",
  "尺寸（直径 x 长度）": "Size", "是否支持一件代发": "Dropshipping", "售后服务": "Warranty",
};

const propValueTranslations: Record<string, string> = {
  "中性": "Generic", "CN": "China", "现货": "In Stock", "黑色": "Black",
  "白色": "White", "红色": "Red", "蓝色": "Blue", "绿色": "Green",
  "支持": "Supported", "不支持": "Not Supported", "是": "Yes", "否": "No",
};

const locationTranslations: Record<string, string> = {
  "广东省深圳市": "Shenzhen, China", "广东省广州市": "Guangzhou, China",
  "浙江省杭州市": "Hangzhou, China", "浙江省义乌市": "Yiwu, China",
  "上海市": "Shanghai, China", "北京市": "Beijing, China",
};

const translateLocation = (location: string): string => {
  if (locationTranslations[location]) return locationTranslations[location];
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

    // Build notes with SKU details
    let notes = '';
    if (hasSkus) {
      const selectedSkus = product.configuredItems!.filter(sku => (skuQuantities[sku.id] || 0) > 0);
      notes = selectedSkus.map(sku => `${sku.title}: ${skuQuantities[sku.id]} pcs × ৳${convertToBDT(sku.price)}`).join('\n');
    }

    // Build URLs
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
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading product details...</p>
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

  console.log('ProductDetail props count:', product.props?.length, product.props);

  const images = product.item_imgs?.map((img) => img.url) || [product.pic_url];
  const displayProps = product.props?.slice(0, 15) || [];

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
      <div className="container mx-auto px-4 py-4 max-w-7xl">
        {/* Breadcrumb */}
        {onBack && (
          <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
            <button onClick={onBack} className="hover:text-foreground transition-colors flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" />
              Home
            </button>
            <span>›</span>
            <span className="text-foreground">Product Details</span>
          </div>
        )}

        {/* Main Layout: Image | Info | Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr_320px] gap-6">
          {/* LEFT: Image Gallery */}
          <div className="space-y-3">
            <div className="relative aspect-square rounded-lg overflow-hidden bg-muted border">
              {showVideo && product.video ? (
                <video src={product.video} controls autoPlay className="w-full h-full object-contain" />
              ) : (
                <img
                  src={images[selectedImage]}
                  alt={product.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                />
              )}
              {product.video && (
                <button
                  onClick={() => setShowVideo(!showVideo)}
                  className="absolute bottom-3 right-3 bg-foreground/80 text-background px-3 py-1.5 rounded-full flex items-center gap-1.5 text-sm hover:bg-foreground transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  {showVideo ? "Images" : "Video"}
                </button>
              )}
            </div>

            {/* Thumbnails */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => { setSelectedImage(idx); setShowVideo(false); }}
                  className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-all ${
                    selectedImage === idx && !showVideo ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
                  }`}
                >
                  <img src={img} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                </button>
              ))}
              {product.video && (
                <button
                  onClick={() => setShowVideo(true)}
                  className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 bg-muted flex items-center justify-center transition-all ${
                    showVideo ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
                  }`}
                >
                  <Play className="h-6 w-6 text-primary" />
                </button>
              )}
            </div>
          </div>

          {/* CENTER: Product Info */}
          <div className="space-y-4">
            {/* Title */}
            <h1 className="text-xl font-semibold leading-snug">{product.title}</h1>

            {/* Rating & Store */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
                <span className="text-sm font-medium ml-1">5</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="inline-block w-4 h-4 rounded-full overflow-hidden bg-red-500 text-[8px] text-white flex items-center justify-center font-bold">CN</span>
                China Store
              </div>
            </div>

            {/* Price */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-primary">৳ {convertToBDT(product.price).toLocaleString()}</span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">¥{product.price} CNY</div>
            </div>

            {/* Service */}
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">Service:</span>
              <span className="text-muted-foreground">Ships within 48 hours</span>
            </div>

            {/* SKU Variant Table */}
            {product.configuredItems && product.configuredItems.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Specification: Selected Good Products</h3>
                <div className="border rounded-lg overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-[48px_1fr_100px_80px_120px] gap-2 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                    <span></span>
                    <span>Variant</span>
                    <span className="text-right">Price</span>
                    <span className="text-right">Stock</span>
                    <span className="text-center">Quantity</span>
                  </div>
                  {/* Table rows */}
                  {(showAllSkus ? product.configuredItems : product.configuredItems.slice(0, 5)).map((sku) => (
                    <div key={sku.id} className="grid grid-cols-[48px_1fr_100px_80px_120px] gap-2 px-3 py-2 border-b last:border-b-0 items-center">
                      <div className="w-10 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                        {sku.imageUrl ? (
                          <img src={sku.imageUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                        ) : (
                          <div className="w-full h-full bg-muted" />
                        )}
                      </div>
                      <span className="text-sm truncate">{sku.title || '—'}</span>
                      <span className="text-sm font-medium text-right">৳{convertToBDT(sku.price).toLocaleString()}</span>
                      <span className="text-sm text-muted-foreground text-right">{sku.stock.toLocaleString()}</span>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="outline" size="icon" className="h-6 w-6"
                          onClick={() => setSkuQuantities(prev => ({ ...prev, [sku.id]: Math.max(0, (prev[sku.id] || 0) - 1) }))}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm">{skuQuantities[sku.id] || 0}</span>
                        <Button variant="outline" size="icon" className="h-6 w-6"
                          onClick={() => setSkuQuantities(prev => ({ ...prev, [sku.id]: (prev[sku.id] || 0) + 1 }))}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {/* Show more toggle */}
                  {product.configuredItems.length > 5 && (
                    <button
                      onClick={() => setShowAllSkus(!showAllSkus)}
                      className="w-full py-2 text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 border-t"
                    >
                      {showAllSkus ? <>Show Less <ChevronUp className="h-3.5 w-3.5" /></> : <>Show More <ChevronDown className="h-3.5 w-3.5" /></>}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Tiered Pricing (fallback when no SKU variants) */}
            {(!product.configuredItems || product.configuredItems.length === 0) && getPriceRanges().length > 1 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Price by Quantity:</h3>
                <div className="flex gap-2 overflow-x-auto">
                  {getPriceRanges().map((range, idx) => (
                    <div key={idx} className="flex-shrink-0 bg-muted rounded-lg p-3 text-center min-w-[90px]">
                      <div className="text-xs text-muted-foreground">≥{range.minQty} pcs</div>
                      <div className="font-bold text-primary">৳{range.priceBDT}</div>
                      <div className="text-xs text-muted-foreground">¥{range.priceCNY}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Info */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Stock</div>
                  <div className="font-medium">{product.num || 'Available'}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg">
                <Box className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Min Order</div>
                  <div className="font-medium">{product.min_num} pcs</div>
                </div>
              </div>
              {product.item_weight && (
                <div className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg">
                  <Weight className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Weight</div>
                    <div className="font-medium">{product.item_weight} kg</div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Origin</div>
                  <div className="font-medium">{translateLocation(product.location)}</div>
                </div>
              </div>
            </div>

            {product.total_sold && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{product.total_sold.toLocaleString()}</span> sold
              </div>
            )}
          </div>

          {/* RIGHT: Sidebar */}
          <div className="space-y-4">
            {/* Shipping Card */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Shipping</span>
                  <span className="text-sm text-muted-foreground">To Bangladesh</span>
                </div>
                <div className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <span>Select Shipping Method ›</span>
                </div>

                <Separator />

                {/* Quantity - only show simple selector when no SKU variants */}
                {(!product.configuredItems || product.configuredItems.length === 0) && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{quantity} Pieces</span>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQuantity(Math.max(0, quantity - 1))}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">{quantity}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQuantity(quantity + 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Show total pieces from SKU selection */}
                {product.configuredItems && product.configuredItems.length > 0 && (
                  <div className="text-sm">
                    <span>{Object.values(skuQuantities).reduce((a, b) => a + b, 0)} Pieces</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span>৳{(
                    product.configuredItems && product.configuredItems.length > 0
                      ? product.configuredItems.reduce((sum, sku) => sum + convertToBDT(sku.price) * (skuQuantities[sku.id] || 0), 0)
                      : convertToBDT(product.price) * quantity
                  ).toLocaleString()}</span>
                </div>

                <p className="text-xs text-muted-foreground">
                  চায়না গোডাউন ডেলিভারি চার্জ কার্ট পেজে যোগ হবে
                </p>

                <Button className="w-full" size="lg" onClick={handleBuyNow} disabled={ordering}>
                  {ordering ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                  {ordering ? "Placing Order..." : "Buy Now"}
                </Button>
                <Button variant="outline" className="w-full" size="lg">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  WhatsApp
                </Button>
              </CardContent>
            </Card>

            {/* Dropship Card */}
            <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Truck className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-400 text-sm">Dropship this product</p>
                    <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">No stock, No risk! Just sell and grow your business.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Assurance */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="font-semibold text-sm">Assurance</h3>
                {["100% money back guarantee", "On time guarantee", "Detailed inspection", "Lower exchange loss", "Security & Privacy"].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    {item}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* View on 1688 */}
            <a
              href={`https://detail.1688.com/offer/${product.num_iid}.html`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors p-2"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View on 1688
            </a>
          </div>
        </div>

        {/* Tabs: Specifications, Description, Seller */}
        <div className="mt-8">
          <Tabs defaultValue="specs">
            <TabsList>
              <TabsTrigger value="specs">Specifications</TabsTrigger>
              <TabsTrigger value="description">Product Description</TabsTrigger>
              <TabsTrigger value="seller">Seller Information</TabsTrigger>
            </TabsList>

            <TabsContent value="specs" className="mt-4">
              {displayProps.length > 0 ? (
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {displayProps.map((prop, index) => (
                        <div key={index} className="flex py-3 px-4">
                          <span className="w-1/3 text-muted-foreground text-sm">
                            {propNameTranslations[prop.name] || prop.name}
                          </span>
                          <span className="w-2/3 font-medium text-sm">
                            {propValueTranslations[prop.value] || prop.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <p className="text-muted-foreground text-sm py-8 text-center">No specifications available</p>
              )}
            </TabsContent>

            <TabsContent value="description" className="mt-4">
              {product.desc_img && product.desc_img.length > 0 ? (
                <div className="space-y-4">
                  {product.desc_img.map((img, index) => (
                    <img
                      key={index}
                      src={img}
                      alt={`Product detail ${index + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full rounded-lg border"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm py-8 text-center">No product description images available</p>
              )}
            </TabsContent>

            <TabsContent value="seller" className="mt-4">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="text-lg font-bold text-primary">S</span>
                    </div>
                    <div>
                      <div className="font-medium">{product.seller_info?.shop_name || "1688 Seller"}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Badge variant="secondary" className="text-xs">Verified</Badge>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {product.seller_info?.item_score && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Product Accuracy</span>
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          <span className="font-medium">{product.seller_info.item_score}</span>
                        </div>
                      </div>
                    )}
                    {product.seller_info?.delivery_score && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Delivery</span>
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          <span className="font-medium">{product.seller_info.delivery_score}</span>
                        </div>
                      </div>
                    )}
                    {product.seller_info?.composite_score && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Overall</span>
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          <span className="font-medium">{product.seller_info.composite_score}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 inline mr-1" />
                    {translateLocation(product.location)}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
