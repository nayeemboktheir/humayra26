import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Search, ShoppingBag } from 'lucide-react';
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
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setIsLoading(true);
    setProducts([]);

    try {
      // Search 1688 for products
      const { data, error } = await supabase.functions.invoke('firecrawl-search', {
        body: { 
          query: `${query} site:1688.com`,
          options: {
            limit: 12,
            scrapeOptions: {
              formats: ['markdown']
            }
          }
        },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        const searchResults = data.data.map((item: any) => ({
          title: item.title || 'Product',
          url: item.url,
          image: item.metadata?.ogImage || item.metadata?.image || extractImageFromMarkdown(item.markdown),
          price: extractPrice(item.markdown || item.description || ''),
          description: item.description || extractDescription(item.markdown || ''),
        }));
        setProducts(searchResults);
        
        if (searchResults.length === 0) {
          toast({ title: "No products found", description: "Try a different search term" });
        }
      } else {
        toast({ 
          title: "Search failed", 
          description: data?.error || "Could not search products",
          variant: "destructive" 
        });
      }
    } catch (error) {
      console.error('Search error:', error);
      toast({ 
        title: "Error", 
        description: "Failed to search products",
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const extractImageFromMarkdown = (markdown: string): string | undefined => {
    if (!markdown) return undefined;
    const imgMatch = markdown.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    return imgMatch ? imgMatch[1] : undefined;
  };

  const extractPrice = (text: string): string | undefined => {
    if (!text) return undefined;
    const priceMatch = text.match(/¥\s*[\d,.]+|[\d,.]+\s*元/);
    return priceMatch ? priceMatch[0] : undefined;
  };

  const extractDescription = (markdown: string): string => {
    if (!markdown) return '';
    // Remove images and links, get first 150 chars
    const clean = markdown
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .replace(/[#*`]/g, '')
      .trim();
    return clean.substring(0, 150) + (clean.length > 150 ? '...' : '');
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
            placeholder="Search products from 1688 (e.g., bags, electronics, clothing)"
            className="pl-10 h-12 text-lg"
            required
          />
        </div>
        <Button type="submit" disabled={isLoading} size="lg" className="h-12 px-8">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            "Search"
          )}
        </Button>
      </form>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Searching 1688.com for products...</p>
        </div>
      )}

      {/* Product Grid */}
      {!isLoading && products.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((product, index) => (
            <Card key={index} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group">
              <a href={product.url} target="_blank" rel="noopener noreferrer">
                <div className="aspect-square bg-muted relative overflow-hidden">
                  {product.image ? (
                    <img 
                      src={product.image} 
                      alt={product.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/placeholder.svg';
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
                  {product.price && (
                    <p className="text-primary font-bold">{product.price}</p>
                  )}
                  {product.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {product.description}
                    </p>
                  )}
                </CardContent>
              </a>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && products.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShoppingBag className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">Search Products from China</h3>
          <p className="text-muted-foreground max-w-md">
            Enter a product name to search from 1688.com - China's largest wholesale marketplace
          </p>
        </div>
      )}
    </div>
  );
};
