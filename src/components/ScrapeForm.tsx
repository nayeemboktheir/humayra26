import { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { firecrawlApi } from '@/lib/api/firecrawl';
import { Loader2 } from 'lucide-react';

export const ScrapeForm = () => {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResult(null);

    try {
      const response = await firecrawlApi.scrape(url);

      if (response.success) {
        toast({ title: "Success", description: "Page scraped successfully" });
        setResult(response.data || response);
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to scrape page",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error scraping:', error);
      toast({
        title: "Error",
        description: "Failed to scrape page",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Website Scraper</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            required
          />
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scraping...
              </>
            ) : (
              "Scrape Page"
            )}
          </Button>
        </form>

        {result && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-2">Result</h3>
            <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-96 text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
