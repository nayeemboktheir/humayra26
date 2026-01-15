import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { alibaba1688Api, Product1688 } from "@/lib/api/alibaba1688";
import ProductDetail from "@/components/ProductDetail";

const CNY_TO_BDT = 17.5;
const convertToBDT = (cny: number) => Math.round(cny * CNY_TO_BDT);

const Index = () => {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product1688[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      toast.error("সার্চ করতে কিছু লিখুন");
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    setSelectedProductId(null);

    try {
      const result = await alibaba1688Api.search(query);
      if (result.success && result.data) {
        setProducts(result.data.items);
        if (result.data.items.length === 0) {
          toast.info("কোনো প্রোডাক্ট পাওয়া যায়নি");
        } else {
          toast.success(`${result.data.items.length} টি প্রোডাক্ট পাওয়া গেছে`);
        }
      } else {
        toast.error(result.error || "সার্চ করতে সমস্যা হয়েছে");
        setProducts([]);
      }
    } catch (error) {
      toast.error("সার্চ করতে সমস্যা হয়েছে");
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Show static product detail if no search
  if (!hasSearched) {
    return (
      <div className="min-h-screen bg-background">
        {/* Search Header */}
        <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
          <div className="container mx-auto px-4 py-4 max-w-4xl">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="1688 প্রোডাক্ট সার্চ করুন..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "সার্চ"
                )}
              </Button>
            </form>
          </div>
        </div>

        {/* Static Product Detail */}
        <ProductDetail />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Search Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-4 max-w-4xl">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="1688 প্রোডাক্ট সার্চ করুন..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "সার্চ"
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Search Results */}
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">সার্চ করা হচ্ছে...</p>
          </div>
        ) : products.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">সার্চ রেজাল্ট</h2>
              <Badge variant="secondary">{products.length} প্রোডাক্ট</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {products.map((product) => (
                <Card
                  key={product.num_iid}
                  className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
                  onClick={() => {
                    // Open 1688 product page in new tab for now
                    window.open(product.detail_url, "_blank");
                  }}
                >
                  <div className="aspect-square overflow-hidden bg-muted">
                    <img
                      src={product.pic_url}
                      alt={product.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <CardContent className="p-3">
                    <h3 className="text-sm font-medium line-clamp-2 mb-2 min-h-[2.5rem]">
                      {product.title}
                    </h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-bold text-primary">
                        ৳{convertToBDT(product.price)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        (¥{product.price})
                      </span>
                    </div>
                    {product.sales && (
                      <p className="text-xs text-muted-foreground mt-1">
                        বিক্রি: {product.sales}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-20">
            <p className="text-muted-foreground">কোনো প্রোডাক্ট পাওয়া যায়নি</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
