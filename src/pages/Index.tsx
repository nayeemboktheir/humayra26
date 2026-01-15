import { useState, useEffect, useRef } from "react";
import { Search, Loader2, Camera, ImageIcon } from "lucide-react";
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

  // Background translation effect
  useEffect(() => {
    if (products.length === 0) return;
    
    const translateInBackground = async () => {
      const titles = products.map(p => p.title);
      const translated = await translateTextsBackground(titles);
      
      const titleMap: Record<number, string> = {};
      products.forEach((product, index) => {
        if (translated[index] && translated[index] !== product.title) {
          titleMap[product.num_iid] = translated[index];
        }
      });
      
      setTranslatedTitles(titleMap);
    };
    
    translateInBackground();
  }, [products]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      toast.error("Please enter a search term");
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    setSelectedProduct(null);
    setTranslatedTitles({});

    try {
      const result = await alibaba1688Api.search(query);
      if (result.success && result.data) {
        setProducts(result.data.items);
        if (result.data.items.length === 0) {
          toast.info("No products found");
        } else {
          toast.success(`Found ${result.data.items.length} products`);
        }
      } else {
        toast.error(result.error || "Search failed");
        setProducts([]);
      }
    } catch (error) {
      toast.error("Search failed");
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageSearch = async (file: File) => {
    setIsLoading(true);
    setHasSearched(true);
    setSelectedProduct(null);
    setTranslatedTitles({});

    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Remove the data:image/xxx;base64, prefix
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      
      const imageBase64 = await base64Promise;
      toast.info("Uploading image and searching...");
      
      const result = await alibaba1688Api.searchByImage(imageBase64);
      if (result.success && result.data) {
        setProducts(result.data.items);
        if (result.data.items.length === 0) {
          toast.info("No similar products found");
        } else {
          toast.success(`Found ${result.data.items.length} similar products`);
        }
      } else {
        toast.error(result.error || "Image search failed");
        setProducts([]);
      }
    } catch (error) {
      toast.error("Image search failed");
      setProducts([]);
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
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Search Results</h2>
              <Badge variant="secondary">{products.length} products</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
