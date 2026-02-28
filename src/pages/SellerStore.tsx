import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Package, Store, Loader2 } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const CNY_TO_BDT = 17.5;
const convertToBDT = (cny: number) => Math.round(cny * CNY_TO_BDT);

interface SellerProduct {
  num_iid: number;
  title: string;
  pic_url: string;
  price: number;
  sales?: number;
  vendor_name?: string;
}

interface VendorInfo {
  name: string;
  score: number;
  location: string;
}

export default function SellerStore() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const navigate = useNavigate();
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [vendorInfo, setVendorInfo] = useState<VendorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchProducts = async (pageNum: number, append = false) => {
    if (!vendorId) return;
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const { data, error } = await supabase.functions.invoke('alibaba-1688-seller-products', {
        body: { vendorId, page: pageNum, pageSize: 40 },
      });

      if (!error && data?.success) {
        const items = data.data?.items || [];
        setProducts(prev => append ? [...prev, ...items] : items);
        setTotal(data.data?.total || 0);
        if (data.data?.vendorInfo) setVendorInfo(data.data.vendorInfo);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchProducts(1);
  }, [vendorId]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchProducts(nextPage, true);
  };

  const sellerName = vendorInfo?.name || vendorId || 'Seller';

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-30">
        <div className="mx-auto max-w-[1600px] px-3 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Store className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-base truncate">{sellerName}</h1>
              {vendorInfo?.location && (
                <p className="text-xs text-muted-foreground truncate">{vendorInfo.location}</p>
              )}
            </div>
          </div>
          {total > 0 && (
            <Badge variant="secondary" className="ml-auto shrink-0">{total.toLocaleString()} Products</Badge>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-2 sm:px-3 py-4">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Package className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No products found for this seller</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
              {products.map((product) => (
                <Card
                  key={product.num_iid}
                  className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
                  onClick={() => navigate(`/?product=${product.num_iid}`)}
                >
                  <div className="aspect-square overflow-hidden bg-muted">
                    <img
                      src={product.pic_url}
                      alt={product.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                    />
                  </div>
                  <CardContent className="p-2 sm:p-3">
                    <p className="text-xs sm:text-sm font-medium line-clamp-2 leading-tight mb-1.5">{product.title}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs text-primary font-medium">৳</span>
                      <span className="text-base sm:text-lg font-bold text-primary">{convertToBDT(product.price).toLocaleString()}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">¥{Math.round(product.price)}</span>
                    </div>
                    {product.sales && product.sales > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{product.sales.toLocaleString()} sold</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {products.length < total && (
              <div className="flex justify-center mt-6">
                <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore} className="px-8">
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Load More
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
