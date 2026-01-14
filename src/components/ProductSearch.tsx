import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Loader2, Search, ShoppingBag, ExternalLink, Star, Store, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface Product {
  title: string;
  url: string;
  image?: string;
  price?: string;
  description?: string;
}

export const ProductSearch = () => {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setProducts([]);

    try {
      const { data, error } = await supabase.functions.invoke("firecrawl-search", {
        body: {
          query: `${query} 1688 wholesale china`,
          options: {
            limit: 12,
          },
        },
      });

      if (error) throw error;

      console.log("Search response:", data);

      if (data?.success && data?.data) {
        const searchResults: Product[] = data.data
          .filter((item: any) => item.url && !String(item.url).includes("login"))
          .map((item: any) => ({
            title: item.title || "Product",
            url: item.url,
            image: item.metadata?.ogImage || item.metadata?.image || item.thumbnail,
            price: extractPrice(item.description || item.title || ""),
            description: item.description || "",
          }));

        setProducts(searchResults);

        if (searchResults.length === 0) {
          toast({
            title: "কোন পণ্য পাওয়া যায়নি",
            description: "অন্য keyword দিয়ে চেষ্টা করুন",
          });
        } else {
          toast({ title: `${searchResults.length}টি পণ্য পাওয়া গেছে` });
        }
      } else {
        toast({
          title: "সার্চ ব্যর্থ",
          description: data?.error || "পণ্য খুঁজতে সমস্যা হয়েছে",
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

  const extractPrice = (text: string): string | undefined => {
    if (!text) return undefined;
    const priceMatch = text.match(/¥\s*[\d,.]+|[\d,.]+\s*元|\$[\d,.]+/);
    return priceMatch ? priceMatch[0] : undefined;
  };

  const safeProducts = useMemo(
    () =>
      products.map((p) => ({
        ...p,
        title: p.title?.trim() || "Product",
        url: p.url,
      })),
    [products]
  );

  // Generate mock tiered pricing from base price
  const getTieredPricing = (basePrice?: string) => {
    const numMatch = basePrice?.match(/[\d,.]+/);
    if (!numMatch) return null;
    const base = parseFloat(numMatch[0].replace(',', ''));
    if (isNaN(base)) return null;
    
    return [
      { qty: "3+", price: Math.round(base * 12) }, // Convert to BDT approx
      { qty: "100+", price: Math.round(base * 11.5) },
      { qty: "500+", price: Math.round(base * 11) },
    ];
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
          <p className="text-muted-foreground">চায়না থেকে পণ্য খুঁজছি...</p>
        </div>
      )}

      {/* Product Grid */}
      {!isLoading && safeProducts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {safeProducts.map((product, index) => (
            <Card
              key={`${product.url}-${index}`}
              className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedProduct(product);
                setCurrentImageIndex(0);
                setIsDetailsOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedProduct(product);
                  setCurrentImageIndex(0);
                  setIsDetailsOpen(true);
                }
              }}
            >
              <div className="aspect-square bg-muted relative overflow-hidden">
                {product.image ? (
                  <img
                    src={product.image}
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
              </div>
              <CardContent className="p-3">
                <h3 className="font-medium text-sm line-clamp-2 mb-1">{product.title}</h3>
                {product.price && <p className="text-primary font-bold">{product.price}</p>}
                {product.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{product.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && safeProducts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShoppingBag className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">চায়না থেকে পণ্য অর্ডার করুন</h3>
          <p className="text-muted-foreground max-w-md">
            পণ্যের নাম লিখে সার্চ করুন - সরাসরি চায়নার সবচেয়ে বড় হোলসেল মার্কেট থেকে
          </p>
        </div>
      )}

      {/* Product Detail Modal - ChinaOnlineBD Style */}
      <Dialog
        open={isDetailsOpen}
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) setSelectedProduct(null);
        }}
      >
        <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
          <div className="grid md:grid-cols-[1fr,1.2fr,auto] min-h-[500px]">
            {/* Left: Product Image Gallery */}
            <div className="bg-muted p-4">
              <div className="relative aspect-square rounded-lg overflow-hidden bg-background mb-3">
                {selectedProduct?.image ? (
                  <>
                    <img
                      src={selectedProduct.image}
                      alt={selectedProduct.title}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/placeholder.svg";
                      }}
                    />
                    {/* Image Navigation */}
                    <button 
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full"
                      onClick={() => setCurrentImageIndex(prev => Math.max(0, prev - 1))}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button 
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full"
                      onClick={() => setCurrentImageIndex(prev => prev + 1)}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    {/* Image Counter */}
                    <div className="absolute bottom-3 right-3 bg-black/60 text-white text-sm px-2 py-1 rounded">
                      1/5
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ShoppingBag className="h-16 w-16 text-muted-foreground" />
                  </div>
                )}
              </div>
              
              {/* Thumbnail Gallery */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {[...Array(5)].map((_, i) => (
                  <div 
                    key={i}
                    className={`w-16 h-16 rounded border-2 flex-shrink-0 overflow-hidden cursor-pointer ${
                      i === currentImageIndex ? 'border-primary' : 'border-transparent'
                    }`}
                    onClick={() => setCurrentImageIndex(i)}
                  >
                    {selectedProduct?.image ? (
                      <img
                        src={selectedProduct.image}
                        alt={`Variant ${i + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/placeholder.svg";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-muted" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Middle: Product Info */}
            <div className="p-6 flex flex-col">
              <h1 className="text-xl font-semibold mb-4 line-clamp-3">
                {selectedProduct?.title}
              </h1>

              {/* Tiered Pricing */}
              {(() => {
                const tiers = getTieredPricing(selectedProduct?.price);
                if (!tiers) return (
                  <div className="bg-primary/10 rounded-lg p-4 mb-4">
                    <span className="text-2xl font-bold text-primary">
                      {selectedProduct?.price || "মূল্য জানতে যোগাযোগ করুন"}
                    </span>
                  </div>
                );
                return (
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {tiers.map((tier, i) => (
                      <div 
                        key={tier.qty}
                        className={`rounded-lg p-3 text-center ${
                          i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted'
                        }`}
                      >
                        <div className={`text-xl font-bold ${i === 0 ? '' : 'text-foreground'}`}>
                          {tier.price} ৳
                        </div>
                        <div className={`text-sm ${i === 0 ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                          {tier.qty}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Color Options */}
              <div className="mb-4">
                <div className="text-sm text-muted-foreground mb-2">
                  Color: <span className="text-foreground">Default</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-14 h-14 rounded border-2 overflow-hidden cursor-pointer ${
                        i === 0 ? 'border-primary' : 'border-muted hover:border-primary/50'
                      }`}
                    >
                      {selectedProduct?.image ? (
                        <img
                          src={selectedProduct.image}
                          alt={`Color ${i + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "/placeholder.svg";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-muted" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Size & Price Table */}
              <div className="border rounded-lg overflow-hidden mb-4">
                <div className="grid grid-cols-3 bg-muted font-medium text-sm">
                  <div className="p-2 border-r">SIZE</div>
                  <div className="p-2 border-r">PRICE</div>
                  <div className="p-2">QUANTITY</div>
                </div>
                <div className="grid grid-cols-3 text-sm">
                  <div className="p-2 border-r border-t">Standard</div>
                  <div className="p-2 border-r border-t text-primary font-semibold">
                    {getTieredPricing(selectedProduct?.price)?.[0]?.price || '---'} ৳
                  </div>
                  <div className="p-2 border-t">
                    <Input type="number" defaultValue={1} min={1} className="h-8 w-20" />
                  </div>
                </div>
              </div>

              {/* Description */}
              {selectedProduct?.description && (
                <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                  {selectedProduct.description}
                </p>
              )}

              <div className="mt-auto">
                <Button
                  className="w-full h-12 text-lg"
                  onClick={() => {
                    if (!selectedProduct?.url) return;
                    window.open(selectedProduct.url, "_blank", "noopener,noreferrer");
                  }}
                >
                  1688 এ দেখুন <ExternalLink className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Right: Seller Info Sidebar */}
            <div className="bg-muted/50 p-4 w-64 hidden lg:flex flex-col border-l">
              {/* Seller Image */}
              <div className="w-20 h-20 rounded-lg bg-muted mx-auto mb-3 overflow-hidden">
                <img
                  src={selectedProduct?.image || "/placeholder.svg"}
                  alt="Store"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/placeholder.svg";
                  }}
                />
              </div>

              {/* Location */}
              <p className="text-center text-sm font-medium mb-2">浙江省金华市</p>

              {/* Rating Stars */}
              <div className="flex justify-center gap-0.5 mb-3">
                {[1, 2, 3, 4].map(i => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
                <Star className="h-4 w-4 text-yellow-400" />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 text-center mb-4">
                <div>
                  <div className="text-xl font-bold">32,064</div>
                  <div className="text-xs text-muted-foreground">Total Sale</div>
                </div>
                <div>
                  <div className="text-xl font-bold">4.0</div>
                  <div className="text-xs text-muted-foreground">Positive Rating</div>
                </div>
              </div>

              {/* Visit Store Button */}
              <Button variant="outline" className="w-full mb-4">
                <Store className="mr-2 h-4 w-4" />
                Visit Store
              </Button>

              {/* Shipping Notice */}
              <div className="bg-primary/10 rounded-lg p-3 text-xs text-center">
                <p className="font-medium text-primary mb-1">ক্যাটাগরি ভিত্তিক শিপিং চার্জ</p>
                <p className="text-muted-foreground">দেখতে এখানে ক্লিক করুন</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
