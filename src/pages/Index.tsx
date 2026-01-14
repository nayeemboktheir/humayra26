import { ScrapeForm } from "@/components/ScrapeForm";

const Index = () => {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Web Scraper</h1>
          <p className="text-muted-foreground">Enter a URL to extract content using Firecrawl</p>
        </div>
        <ScrapeForm />
      </div>
    </div>
  );
};

export default Index;
