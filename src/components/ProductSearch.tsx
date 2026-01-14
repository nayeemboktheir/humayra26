import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Search, ShoppingBag, ExternalLink } from "lucide-react";
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setProducts([]);

    try {
      // Search for products using Firecrawl (without scraping to be faster)
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
                setIsDetailsOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedProduct(product);
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

      {/* Details Modal (stay on your site) */}
      <Dialog
        open={isDetailsOpen}
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) setSelectedProduct(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="line-clamp-2">
              {selectedProduct?.title || "Product"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="aspect-square bg-muted rounded-md overflow-hidden">
              {selectedProduct?.image ? (
                <img
                  src={selectedProduct.image}
                  alt={selectedProduct.title}
                  loading="lazy"
                  className="w-full h-full object-cover"
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

            <div className="flex flex-col gap-3">
              {selectedProduct?.price && (
                <div>
                  <div className="text-sm text-muted-foreground">Price</div>
                  <div className="text-xl font-semibold text-primary">{selectedProduct.price}</div>
                </div>
              )}

              {selectedProduct?.description && (
                <div>
                  <div className="text-sm text-muted-foreground">Description</div>
                  <p className="text-sm leading-6">{selectedProduct.description}</p>
                </div>
              )}

              <div className="mt-auto flex gap-2">
                <Button
                  className="w-full"
                  onClick={() => {
                    if (!selectedProduct?.url) return;
                    window.open(selectedProduct.url, "_blank", "noopener,noreferrer");
                  }}
                >
                  1688 এ দেখুন <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                নোট: কিছু 1688 লিংক login/redirect করতে পারে—তবুও আপনার সাইটে product info দেখাচ্ছে।
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
