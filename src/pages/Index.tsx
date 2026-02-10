import { useState, useEffect, useRef, useMemo } from "react";
import { Search, Loader2, Camera, ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { alibaba1688Api, Product1688, ProductDetail1688 } from "@/lib/api/alibaba1688";
import { supabase } from "@/integrations/supabase/client";
import ProductDetail from "@/components/ProductDetail";

const CNY_TO_BDT = 17.5;
const convertToBDT = (cny: number) => Math.round(cny * CNY_TO_BDT);

// Translate texts in background
async function translateTextsBackground(texts: string[]): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke('translate-text', {
      body: { texts },
    });
    
    if (error || !data?.translations) {
      return texts;
    }
    
    return data.translations;
  } catch {
    return texts;
  }
}

const Index = () => {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product1688[]>([]);
  const [translatedTitles, setTranslatedTitles] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail1688 | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [activeSearch, setActiveSearch] = useState<{
    mode: "text" | "image";
    query: string; // for image search this is the derived Chinese keyword query
    altQueries: string[];
  } | null>(null);
  const [altQueryIndex, setAltQueryIndex] = useState(0);

  // Title translation is optional (manual) to keep searches fast.
  const [isTranslatingTitles, setIsTranslatingTitles] = useState(false);

  const handleTranslateTitles = async () => {
    if (products.length === 0 || isTranslatingTitles) return;
    setIsTranslatingTitles(true);
    try {
      const titles = products.map((p) => p.title);
      const translated = await translateTextsBackground(titles);

      const titleMap: Record<number, string> = {};
      products.forEach((product, index) => {
        const t = translated[index];
        if (t && t !== product.title) titleMap[product.num_iid] = t;
      });

      setTranslatedTitles(titleMap);
    } finally {
      setIsTranslatingTitles(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = query.trim();
    if (!trimmed) {
      toast.error("Please enter a search term");
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    setSelectedProduct(null);
    setTranslatedTitles({});

    setCurrentPage(1);
    setTotalResults(null);
    setAltQueryIndex(0);
    setActiveSearch({ mode: "text", query: trimmed, altQueries: [] });

    try {
      const result = await alibaba1688Api.search(trimmed, 1);
      if (result.success && result.data) {
        setProducts(result.data.items);
        setTotalResults(result.data.total);
        if (result.data.items.length === 0) {
          toast.info("No products found");
        } else {
          toast.success(`Found ${result.data.items.length} products`);
        }
      } else {
        toast.error(result.error || "Search failed");
        setProducts([]);
        setTotalResults(0);
      }
    } catch {
      toast.error("Search failed");
      setProducts([]);
      setTotalResults(0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageSearch = async (file: File) => {
    setIsLoading(true);
    setHasSearched(true);
    setSelectedProduct(null);
    setTranslatedTitles({});

    setCurrentPage(1);
    setTotalResults(null);
    setAltQueryIndex(0);
    setActiveSearch({ mode: "image", query: "", altQueries: [] });

    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Remove the data:image/xxx;base64, prefix
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);

      const imageBase64 = await base64Promise;
      toast.info("Uploading image and searching...");

      const result = await alibaba1688Api.searchByImage(imageBase64, 1);
      if (result.success && result.data) {
        setProducts(result.data.items);
        setTotalResults(result.data.total);

        const derivedQuery = (result.meta as any)?.query;
        const altQueries = Array.isArray((result.meta as any)?.altQueries) ? ((result.meta as any).altQueries as string[]) : [];
        setActiveSearch({
          mode: "image",
          query: typeof derivedQuery === "string" ? derivedQuery : "",
          altQueries: altQueries.filter(Boolean),
        });

        if (result.data.items.length === 0) {
          toast.info("No similar products found");
        } else {
          toast.success(`Found ${result.data.items.length} similar products`);
        }
      } else {
        toast.error(result.error || "Image search failed");
        setProducts([]);
        setTotalResults(0);
      }
    } catch {
      toast.error("Image search failed");
      setProducts([]);
      setTotalResults(0);
    } finally {
      setIsLoading(false);
    }
  };

  const PAGE_SIZE = 40;
  const totalPages = totalResults ? Math.ceil(totalResults / PAGE_SIZE) : 0;

  const goToPage = async (page: number) => {
    if (!activeSearch || isLoading) return;
    if (page < 1 || (totalPages > 0 && page > totalPages)) return;

    setIsLoading(true);
    setTranslatedTitles({});
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const searchQuery = activeSearch.query || query.trim();
      const resp = await alibaba1688Api.search(searchQuery, page);
      if (resp.success && resp.data) {
        setProducts(resp.data.items);
        setCurrentPage(page);
        setTotalResults(resp.data.total);
      } else {
        toast.error(resp.error || "Failed to load page");
      }
    } catch {
      toast.error("Failed to load page");
    } finally {
      setIsLoading(false);
    }
  };

  const tryAlternativeMatch = async () => {
    if (!activeSearch || activeSearch.mode !== "image") return;
    const alts = activeSearch.altQueries;
    if (!alts || alts.length === 0) return;

    const nextIndex = (altQueryIndex + 1) % alts.length;
    const nextQuery = alts[nextIndex];
    if (!nextQuery) return;

    setAltQueryIndex(nextIndex);
    setIsLoading(true);
    setHasSearched(true);
    setSelectedProduct(null);
    setTranslatedTitles({});
    setCurrentPage(1);
    setTotalResults(null);
    setProducts([]);

    try {
      const result = await alibaba1688Api.search(nextQuery, 1);
      if (result.success && result.data) {
        setProducts(result.data.items);
        setTotalResults(result.data.total);
        setActiveSearch({ mode: "image", query: nextQuery, altQueries: alts });

        if (result.data.items.length === 0) {
          toast.info("No similar products found");
        } else {
          toast.success(`Found ${result.data.items.length} similar products`);
        }
      } else {
        toast.error(result.error || "Search failed");
      }
    } catch {
      toast.error("Search failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageButtonClick = () => {
    fileInputRef.current?.click();
  };

  const validateAndSearchImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }
    handleImageSearch(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSearchImage(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      validateAndSearchImage(file);
    }
  };

  // Paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            validateAndSearchImage(file);
            break;
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isLoading]);

  const handleProductClick = async (product: Product1688) => {
    setIsLoadingProduct(true);
    
    try {
      const result = await alibaba1688Api.getProduct(product.num_iid);
      if (result.success && result.data) {
        setSelectedProduct(result.data);
      } else {
        toast.error(result.error || "Failed to load product details");
      }
    } catch (error) {
      toast.error("Failed to load product details");
    } finally {
      setIsLoadingProduct(false);
    }
  };

  const handleBackToSearch = () => {
    setSelectedProduct(null);
  };

  const getDisplayTitle = (product: Product1688) => {
    return translatedTitles[product.num_iid] || product.title;
  };

  // Show product detail if selected
  if (selectedProduct || isLoadingProduct) {
    return (
      <div className="min-h-screen bg-background">
        {/* Search Header */}
        <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
          <div className="container mx-auto px-4 py-4 max-w-4xl">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search 1688 products..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="button" variant="outline" size="icon" title="Search by image" onClick={handleImageButtonClick} disabled={isLoading}>
                <Camera className="h-4 w-4" />
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Search"
                )}
              </Button>
            </form>
          </div>
        </div>

        <ProductDetail 
          product={selectedProduct || undefined} 
          isLoading={isLoadingProduct}
          onBack={handleBackToSearch}
        />
      </div>
    );
  }

  // Show initial state or search results
  return (
    <div 
      className="min-h-screen bg-background relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-background border-2 border-dashed border-primary rounded-xl p-12 text-center shadow-lg">
            <ImageIcon className="h-16 w-16 text-primary mx-auto mb-4" />
            <p className="text-xl font-semibold text-primary">Drop image to search</p>
            <p className="text-sm text-muted-foreground mt-2">Find similar products on 1688</p>
          </div>
        </div>
      )}

      {/* Search Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-4 max-w-4xl">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search 1688 products..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="button" variant="outline" size="icon" title="Search by image (or paste/drop)" onClick={handleImageButtonClick} disabled={isLoading}>
              <Camera className="h-4 w-4" />
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Search"
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {!hasSearched ? (
          <div className="text-center py-20">
            <h1 className="text-3xl font-bold mb-4">1688 Product Search</h1>
            <p className="text-muted-foreground mb-4">
              Search and view products from 1688.com with prices in BDT
            </p>
            <p className="text-sm text-muted-foreground mb-8">
              💡 Tip: Drag & drop an image or paste (Ctrl+V) to search by image
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Badge variant="outline" className="cursor-pointer" onClick={() => setQuery("fog machine")}>fog machine</Badge>
              <Badge variant="outline" className="cursor-pointer" onClick={() => setQuery("led lights")}>led lights</Badge>
              <Badge variant="outline" className="cursor-pointer" onClick={() => setQuery("phone case")}>phone case</Badge>
              <Badge variant="outline" className="cursor-pointer" onClick={() => setQuery("camera lens")}>camera lens</Badge>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Searching products...</p>
          </div>
        ) : products.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {totalResults ? `${totalResults.toLocaleString()} results` : `${products.length} products`}
              </h2>
              {totalPages > 1 && (
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {products.map((product) => (
                <Card
                  key={product.num_iid}
                  className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
                  onClick={() => handleProductClick(product)}
                >
                  <div className="aspect-square overflow-hidden bg-muted">
                    <img
                      src={product.pic_url}
                      alt={getDisplayTitle(product)}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = '/placeholder.svg';
                      }}
                    />
                  </div>
                  <CardContent className="p-3">
                    <h3 className="text-sm font-medium line-clamp-2 mb-2 min-h-[2.5rem]">
                      {getDisplayTitle(product)}
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
                        Sold: {product.sales}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 mt-8 pb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1 || isLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {(() => {
                  const pages: (number | '...')[] = [];
                  if (totalPages <= 7) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                  } else {
                    pages.push(1);
                    if (currentPage > 3) pages.push('...');
                    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
                      pages.push(i);
                    }
                    if (currentPage < totalPages - 2) pages.push('...');
                    pages.push(totalPages);
                  }
                  return pages.map((p, idx) =>
                    p === '...' ? (
                      <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">…</span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === currentPage ? "default" : "outline"}
                        size="sm"
                        className="min-w-[36px]"
                        onClick={() => goToPage(p)}
                        disabled={isLoading}
                      >
                        {p}
                      </Button>
                    )
                  );
                })()}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages || isLoading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20">
            <p className="text-muted-foreground">No products found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
