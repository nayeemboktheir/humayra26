import { useMemo, useState } from "react";
import { convertToBDT } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Loader2, Search, ShoppingBag, Star, Store, ChevronLeft, ChevronRight, ShoppingCart, MessageCircle, Play, Truck, BadgeCheck, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { alibaba1688Api, Product1688, ProductDetail1688 } from "@/lib/api/alibaba1688";

export const ProductSearch = () => {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<Product1688[]>([]);

  const [selectedProduct, setSelectedProduct] = useState<ProductDetail1688 | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setProducts([]);

    try {
      const response = await alibaba1688Api.search(
        query,
        1,
        40,
      );

      if (response.success && response.data) {
        setProducts(response.data.items);

        if (response.data.items.length === 0) {
          toast({
            title: "কোন পণ্য পাওয়া যায়নি",
            description: "অন্য keyword দিয়ে চেষ্টা করুন",
          });
        } else {
          toast({ title: `${response.data.items.length}টি পণ্য পাওয়া গেছে` });
        }
      } else {
        toast({
          title: "সার্চ ব্যর্থ",
          description: response.error || "পণ্য খুঁজতে সমস্যা হয়েছে",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Search error:", error);
      toast({
        title: "Error",
        description: "Failed to search products",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleProductClick = (product: Product1688) => {
    window.open(`/?product=${product.num_iid}`, '_blank');
  };

  // Get all images from product
  const productImages = useMemo(() => {
    if (!selectedProduct) return [];
    const images: string[] = [];
    
    if (selectedProduct.item_imgs) {
      selectedProduct.item_imgs.forEach(img => {
        if (img.url) images.push(img.url);
      });
    }
    
    if (images.length === 0 && selectedProduct.pic_url) {
      images.push(selectedProduct.pic_url);
    }
    
    return images;
  }, [selectedProduct]);

  // Using shared convertToBDT from @/lib/currency

  // Get tiered pricing from API priceRange
  const getTieredPricing = (priceRange?: number[][]) => {
    if (!priceRange || priceRange.length === 0) return null;
    
    return priceRange.map(([qty, price]) => ({
      qty: `${qty}+`,
      priceCNY: price,
      priceBDT: convertToBDT(price),
    }));
  };

  return (
    <div className="w-full">
      {/* Search Form */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="পণ্য খুঁজুন (যেমন: bag, electronics, clothing)"
            className="pl-10 h-12 text-lg"
            required
          />
        </div>
        <Button type="submit" disabled={isLoading} size="lg" className="h-12 px-8">
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Search"}
        </Button>
      </form>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">1688 থেকে পণ্য খুঁজছি...</p>
        </div>
      )}

      {/* Product Grid */}
      {!isLoading && products.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((product) => {
            // Derive badge type from sales count
            const isTopRated = (product.sales || 0) >= 2000;
            const isVerified = !isTopRated && (product.sales || 0) >= 500;
            const formattedSales = product.sales
              ? product.sales >= 1000
                ? `${(product.sales / 1000).toFixed(product.sales >= 10000 ? 0 : 1)}K Sold`
                : `${product.sales} Sold`
              : null;

            return (
              <Card
                key={product.num_iid}
                className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
                role="button"
                tabIndex={0}
                onClick={() => handleProductClick(product)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleProductClick(product);
                  }
                }}
              >
                <div className="aspect-square bg-muted relative overflow-hidden">
                  {product.pic_url ? (
                    <img
                      src={product.pic_url}
                      alt={product.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/placeholder.svg";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                  {product.location && (
                    <div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm text-foreground text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                      <span className="inline-block w-3 h-2 rounded-sm bg-red-500 relative overflow-hidden">
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="block w-1 h-1 rounded-full" style={{ backgroundColor: '#FFD700' }} />
                        </span>
                      </span>
                      CN
                    </div>
                  )}
                </div>
                <CardContent className="p-3 space-y-1.5">
                  <h3 className="font-medium text-sm line-clamp-2 leading-tight">{product.title}</h3>

                  {/* Star rating + sold */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      <span>5</span>
                    </div>
                    {formattedSales && <span>{formattedSales}</span>}
                  </div>

                  {/* Price in BDT */}
                  <div className="text-primary font-bold text-base">
                    ৳{convertToBDT(product.price).toLocaleString()}
                  </div>

                  {/* Badge row */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isVerified && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-emerald-500 text-emerald-600 bg-emerald-50 gap-0.5">
                        <BadgeCheck className="h-3 w-3" />
                        Verified
                      </Badge>
                    )}
                    {isTopRated && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-red-500 text-red-600 bg-red-50 gap-0.5">
                        <Flame className="h-3 w-3" />
                        Top Rated
                      </Badge>
                    )}
                  </div>

                  {/* MOQ + Shipping */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                    <span>MOQ: 1</span>
                    <span className="flex items-center gap-0.5">
                      <Truck className="h-3 w-3" />
                      CN to BD: 10-12 days
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && products.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShoppingBag className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">1688 থেকে পণ্য অর্ডার করুন</h3>
          <p className="text-muted-foreground max-w-md">
            পণ্যের নাম লিখে সার্চ করুন - সরাসরি চায়নার সবচেয়ে বড় হোলসেল মার্কেট থেকে
          </p>
        </div>
      )}

      {/* Product Detail Modal */}
      <Dialog
        open={isDetailsOpen}
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) setSelectedProduct(null);
        }}
      >
        <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          {isLoadingDetails ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">পণ্যের তথ্য লোড হচ্ছে...</p>
            </div>
          ) : selectedProduct ? (
            <div className="grid md:grid-cols-[1fr,1.2fr,auto] min-h-[500px]">
              {/* Left: Product Image Gallery */}
              <div className="bg-muted p-4">
                <div className="relative aspect-square rounded-lg overflow-hidden bg-background mb-3">
                  {productImages.length > 0 ? (
                    <>
                      <img
                        src={productImages[currentImageIndex] || productImages[0]}
                        alt={selectedProduct.title}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/placeholder.svg";
                        }}
                      />
                      {productImages.length > 1 && (
                        <>
                          <button 
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full"
                            onClick={() => setCurrentImageIndex(prev => Math.max(0, prev - 1))}
                            disabled={currentImageIndex === 0}
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button 
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full"
                            onClick={() => setCurrentImageIndex(prev => Math.min(productImages.length - 1, prev + 1))}
                            disabled={currentImageIndex === productImages.length - 1}
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </>
                      )}
                      <div className="absolute bottom-3 right-3 bg-black/60 text-white text-sm px-2 py-1 rounded">
                        {currentImageIndex + 1}/{productImages.length}
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag className="h-16 w-16 text-muted-foreground" />
                    </div>
                  )}
                </div>
                
                {/* Thumbnail Gallery */}
                {productImages.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {productImages.slice(0, 8).map((img, i) => (
                      <div 
                        key={i}
                        className={`w-16 h-16 rounded border-2 flex-shrink-0 overflow-hidden cursor-pointer ${
                          i === currentImageIndex ? 'border-primary' : 'border-transparent'
                        }`}
                        onClick={() => setCurrentImageIndex(i)}
                      >
                        <img
                          src={img}
                          alt={`Image ${i + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "/placeholder.svg";
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Video Link */}
                {selectedProduct.video && (
                  <a 
                    href={selectedProduct.video} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 mt-3 p-2 bg-primary/10 rounded-lg text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Play className="h-4 w-4" />
                    <span className="text-sm font-medium">ভিডিও দেখুন</span>
                  </a>
                )}
              </div>

              {/* Middle: Product Info */}
              <div className="p-6 flex flex-col">
                <h1 className="text-xl font-semibold mb-4 line-clamp-3">
                  {selectedProduct.title}
                </h1>

                {/* Tiered Pricing */}
                {(() => {
                  const tiers = getTieredPricing(selectedProduct.priceRange);
                  if (!tiers || tiers.length === 0) return (
                    <div className="bg-primary/10 rounded-lg p-4 mb-4">
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-primary">৳{convertToBDT(selectedProduct.price).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                  return (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {tiers.slice(0, 3).map((tier, i) => (
                        <div 
                          key={tier.qty}
                          className={`rounded-lg p-3 text-center ${
                            i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted'
                          }`}
                        >
                          <div className={`text-lg font-bold ${i === 0 ? '' : 'text-foreground'}`}>
                            ৳{tier.priceBDT.toLocaleString()}
                          </div>
                          <div className={`text-xs mt-1 ${i === 0 ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                            {tier.qty}
                          </div>
                          <div className={`text-xs mt-1 ${i === 0 ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                            {tier.qty}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Product Properties */}
                {selectedProduct.props && selectedProduct.props.length > 0 && (
                  <div className="mb-4 max-h-40 overflow-y-auto">
                    <h3 className="text-sm font-medium mb-2">বিস্তারিত:</h3>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      {selectedProduct.props.slice(0, 10).map((prop, i) => (
                        <div key={i} className="flex gap-1">
                          <span className="text-muted-foreground">{prop.name}:</span>
                          <span className="font-medium">{prop.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stock & MOQ */}
                <div className="flex gap-4 mb-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">স্টক: </span>
                    <span className="font-medium">{selectedProduct.num || 'Available'}</span>
                  </div>
                  {selectedProduct.min_num > 1 && (
                    <div>
                      <span className="text-muted-foreground">সর্বনিম্ন: </span>
                      <span className="font-medium">{selectedProduct.min_num} pcs</span>
                    </div>
                  )}
                  {selectedProduct.total_sold && (
                    <div>
                      <span className="text-muted-foreground">বিক্রি: </span>
                      <span className="font-medium">{selectedProduct.total_sold}</span>
                    </div>
                  )}
                </div>

                {/* Quantity Selector */}
                <div className="border rounded-lg overflow-hidden mb-4">
                  <div className="grid grid-cols-3 bg-muted font-medium text-sm">
                    <div className="p-2 border-r">SIZE</div>
                    <div className="p-2 border-r">PRICE</div>
                    <div className="p-2">QUANTITY</div>
                  </div>
                  <div className="grid grid-cols-3 text-sm">
                    <div className="p-2 border-r border-t">Standard</div>
                    <div className="p-2 border-r border-t text-primary font-semibold">
                      {convertToBDT(selectedProduct.price)} ৳
                    </div>
                    <div className="p-2 border-t">
                      <Input type="number" defaultValue={selectedProduct.min_num || 1} min={selectedProduct.min_num || 1} className="h-8 w-20" />
                    </div>
                  </div>
                </div>

                <div className="mt-auto space-y-2">
                  <Button
                    className="w-full h-12 text-lg"
                    onClick={() => {
                      toast({
                        title: "অর্ডার করতে যোগাযোগ করুন",
                        description: "WhatsApp বা ফোনে যোগাযোগ করুন অর্ডার কনফার্ম করতে",
                      });
                    }}
                  >
                    <ShoppingCart className="mr-2 h-5 w-5" />
                    অর্ডার করুন
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-10"
                    onClick={() => {
                      toast({
                        title: "যোগাযোগ করুন",
                        description: "দাম ও স্টক জানতে আমাদের সাথে কথা বলুন",
                      });
                    }}
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    দাম জানতে চাই
                  </Button>
                </div>
              </div>

              {/* Right: Seller Info Sidebar */}
              <div className="bg-muted/50 p-4 w-64 hidden lg:flex flex-col border-l">
                {/* Seller Image */}
                <div className="w-20 h-20 rounded-lg bg-muted mx-auto mb-3 overflow-hidden">
                  <img
                    src={selectedProduct.pic_url || "/placeholder.svg"}
                    alt="Store"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/placeholder.svg";
                    }}
                  />
                </div>

                {/* Location */}
                <p className="text-center text-sm font-medium mb-2">{selectedProduct.location || 'China'}</p>

                {/* Rating Stars */}
                <div className="flex justify-center gap-0.5 mb-3">
                  {[1, 2, 3, 4].map(i => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                  <Star className="h-4 w-4 text-yellow-400" />
                </div>

                {/* Seller Stats */}
                <div className="grid grid-cols-2 gap-4 text-center mb-4">
                  <div>
                    <div className="text-xl font-bold">{selectedProduct.seller_info?.item_score || '5.0'}</div>
                    <div className="text-xs text-muted-foreground">Item Score</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold">{selectedProduct.seller_info?.delivery_score || '4.5'}</div>
                    <div className="text-xs text-muted-foreground">Delivery</div>
                  </div>
                </div>

                {/* Visit Store Button */}
                <Button variant="outline" className="w-full mb-4">
                  <Store className="mr-2 h-4 w-4" />
                  Visit Store
                </Button>

                {/* Weight Info */}
                {selectedProduct.item_weight && (
                  <div className="text-center text-sm mb-3">
                    <span className="text-muted-foreground">Weight: </span>
                    <span className="font-medium">{selectedProduct.item_weight} kg</span>
                  </div>
                )}

                {/* Shipping Notice */}
                <div className="bg-primary/10 rounded-lg p-3 text-xs text-center">
                  <p className="font-medium text-primary mb-1">ক্যাটাগরি ভিত্তিক শিপিং চার্জ</p>
                  <p className="text-muted-foreground">দেখতে এখানে ক্লিক করুন</p>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
