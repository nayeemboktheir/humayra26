import { useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Product1688 } from "@/lib/api/alibaba1688";
import { convertToBDT } from "@/lib/currency";

interface CategorySectionProps {
  name: string;
  icon: string;
  query: string;
  cachedProducts: any[] | null;
  onProductClick: (product: Product1688) => void;
  onViewAll: (query: string) => void;
}

const mapRowToProduct = (row: any): Product1688 => ({
  num_iid: parseInt(String(row.product_id).replace(/^abb-/, ''), 10) || 0,
  title: row.title,
  pic_url: row.image_url,
  price: Number(row.price) || 0,
  sales: row.sales || undefined,
  detail_url: row.detail_url || '',
  location: row.location || '',
  vendor_name: row.vendor_name || '',
  stock: row.stock || undefined,
  weight: row.weight ? Number(row.weight) : undefined,
  extra_images: row.extra_images || [],
});

export default function CategorySection({ name, icon, query, cachedProducts, onProductClick, onViewAll }: CategorySectionProps) {
  const products = cachedProducts ? cachedProducts.slice(0, 12).map(mapRowToProduct) : [];
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" });
  };

  // Don't render section if no cached data available
  if (!cachedProducts || products.length === 0) return null;

  return (
    <section className="mb-10 animate-fade-in">
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

      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 bg-card shadow-md border h-8 w-8 hidden md:flex"
          onClick={() => scroll("left")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div ref={scrollRef} className="flex overflow-x-auto gap-3 pb-2 scrollbar-hide snap-x">
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
    </section>
  );
}
