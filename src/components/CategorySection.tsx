import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { alibaba1688Api, Product1688 } from "@/lib/api/alibaba1688";

const CNY_TO_BDT = 17.5;
const convertToBDT = (cny: number) => Math.round(cny * CNY_TO_BDT);

interface CategorySectionProps {
  name: string;
  icon: string;
  query: string;
  onProductClick: (product: Product1688) => void;
  onViewAll: (query: string) => void;
}

export default function CategorySection({ name, icon, query, onProductClick, onViewAll }: CategorySectionProps) {
  const [products, setProducts] = useState<Product1688[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Lazy load when section comes into view
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loaded && !loading) {
          fetchProducts();
        }
      },
      { rootMargin: "200px" }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, [loaded, loading]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const result = await alibaba1688Api.search(query, 1);
      if (result.success && result.data) {
        setProducts(result.data.items.slice(0, 12));
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" });
  };

  return (
    <section ref={sectionRef} className="mb-10">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{icon}</span>
          <h2 className="text-xl font-bold">{name}</h2>
        </div>
        <Button variant="link" className="text-primary text-sm" onClick={() => onViewAll(query)}>
          View all →
        </Button>
      </div>
      <div className="border-b border-primary/20 mb-4" />

      {/* Products */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : products.length > 0 ? (
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 bg-card shadow-md border h-8 w-8 hidden md:flex"
            onClick={() => scroll("left")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div
            ref={scrollRef}
            className="flex overflow-x-auto gap-3 pb-2 scrollbar-hide snap-x"
          >
            {products.map((product) => (
              <Card
                key={product.num_iid}
                className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group shrink-0 w-[160px] sm:w-[180px] snap-start"
                onClick={() => onProductClick(product)}
              >
                <div className="aspect-square overflow-hidden bg-muted relative">
                  <img
                    src={product.pic_url}
                    alt={product.title}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
                  />
                </div>
                <CardContent className="p-2.5 space-y-1">
                  <h3 className="text-xs font-medium line-clamp-2 min-h-[2rem] leading-tight">
                    {product.title}
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-primary">
                      ৳{convertToBDT(product.price).toLocaleString()}
                    </span>
                  </div>
                  {product.sales ? (
                    <p className="text-[10px] text-muted-foreground">
                      {product.sales >= 1000
                        ? `${(product.sales / 1000).toFixed(product.sales >= 10000 ? 0 : 1)}k sold`
                        : `${product.sales} sold`}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 bg-card shadow-md border h-8 w-8 hidden md:flex"
            onClick={() => scroll("right")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : loaded ? (
        <p className="text-sm text-muted-foreground py-4">No products available</p>
      ) : null}
    </section>
  );
}
