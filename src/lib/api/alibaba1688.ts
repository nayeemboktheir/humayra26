import { supabase } from '@/integrations/supabase/client';

export interface Product1688 {
  num_iid: number;
  title: string;
  pic_url: string;
  price: number;
  promotion_price?: number;
  sales?: number;
  detail_url: string;
  max_price?: number;
  min_price?: number;
  tag_percent?: string;
  // Extra fields from OTAPI search for fallback detail view
  location?: string;
  extra_images?: string[];
  vendor_name?: string;
  stock?: number;
  weight?: number;
}

export interface ProductDetail1688 {
  num_iid: number;
  title: string;
  desc: string;
  price: number;
  orginal_price?: number;
  pic_url: string;
  item_imgs: { url: string }[];
  desc_img?: string[];
  location: string;
  num: string;
  min_num: number;
  video?: string;
  props: { name: string; value: string }[];
  priceRange?: number[][];
  configuredItems?: {
    id: string;
    title: string;
    imageUrl?: string;
    price: number;
    stock: number;
  }[];
  seller_info: {
    nick: string;
    shop_name: string;
    item_score: string;
    delivery_score: string;
    composite_score: string;
  };
  total_sold?: number;
  item_weight?: number;
}

type ApiResponse<T = any> = {
  success: boolean;
  error?: string;
  data?: T;
  meta?: unknown;
};

// Helper to get a featured value from the OTAPI FeaturedValues array
function getFeaturedValue(item: any, name: string): string {
  const arr = Array.isArray(item?.FeaturedValues) ? item.FeaturedValues : [];
  const found = arr.find((v: any) => v?.Name === name);
  return found?.Value || '';
}

// Parse OTAPI search item into our Product1688 format
function parseOtapiItem(item: any): Product1688 {
  const price = item?.Price?.OriginalPrice || item?.Price?.ConvertedPriceList?.Internal?.Price || 0;
  const picUrl = item?.MainPictureUrl || item?.Pictures?.[0]?.Url || '';
  const externalId = item?.Id || '';
  const numIid = parseInt(externalId.replace(/^abb-/, ''), 10) || 0;
  const totalSales = parseInt(getFeaturedValue(item, 'TotalSales') || '0', 10) || undefined;
  const pics = Array.isArray(item?.Pictures) ? item.Pictures : [];
  const location = item?.Location?.State || item?.Location?.City || '';

  return {
    num_iid: numIid,
    title: item?.Title || '',
    pic_url: picUrl,
    price: typeof price === 'number' ? price : parseFloat(price) || 0,
    promotion_price: undefined,
    sales: totalSales,
    detail_url: item?.ExternalItemUrl || `https://detail.1688.com/offer/${numIid}.html`,
    max_price: undefined,
    min_price: undefined,
    tag_percent: undefined,
    location,
    extra_images: pics.map((p: any) => p?.Url || p?.Large?.Url || '').filter(Boolean),
    vendor_name: item?.VendorName || item?.VendorDisplayName || '',
    stock: item?.MasterQuantity || undefined,
    weight: item?.PhysicalParameters?.Weight || undefined,
  };
}

// Translate an array of titles via the translate-text edge function (fire & forget style)
async function translateTitlesAsync(titles: string[]): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke('translate-text', {
      body: { texts: titles },
    });
    if (error || !data?.translations) return titles;
    return data.translations.length === titles.length ? data.translations : titles;
  } catch {
    return titles;
  }
}

export const alibaba1688Api = {
  async search(
    query: string,
    page = 1,
    pageSize = 40,
    _onTranslated?: (items: Product1688[]) => void,
  ): Promise<ApiResponse<{ items: Product1688[]; total: number }>> {
    try {
      const { data, error } = await supabase.functions.invoke('alibaba-1688-search', {
        body: { query, page, pageSize },
      });

      if (error) return { success: false, error: error.message };
      if (!data?.success) return { success: false, error: data?.error || 'Search failed' };

      const rawItems = data.data?.Result?.Items?.Content || [];
      const total = data.data?.Result?.Items?.TotalCount || 0;
      const items = rawItems.map(parseOtapiItem);

      // Translate titles synchronously before returning — ensures English from the start
      if (items.length > 0) {
        const titles = items.map((p: Product1688) => p.title);
        const translated = await translateTitlesAsync(titles);
        for (let i = 0; i < items.length; i++) {
          items[i].title = translated[i] || items[i].title;
        }
      }

      return {
        success: true,
        data: { items, total },
      };
    } catch (error) {
      console.error('Error searching 1688:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Search failed' };
    }
  },

  async searchByImage(
    imageBase64: string,
    page = 1,
    pageSize = 40,
    _onTranslated?: (items: Product1688[]) => void,
  ): Promise<ApiResponse<{ items: Product1688[]; total: number }>> {
    try {
      const { data, error } = await supabase.functions.invoke('alibaba-1688-image-search', {
        body: { imageBase64, page, pageSize },
      });

      if (error) return { success: false, error: error.message };
      if (!data?.success) return { success: false, error: data?.error || 'Image search failed' };

      const rawItems = data.data?.Result?.Items?.Content || [];
      const total = data.data?.Result?.Items?.TotalCount || 0;
      const items = rawItems.map(parseOtapiItem);

      // Translate titles synchronously before returning
      if (items.length > 0) {
        const titles = items.map((p: Product1688) => p.title);
        const translated = await translateTitlesAsync(titles);
        for (let i = 0; i < items.length; i++) {
          items[i].title = translated[i] || items[i].title;
        }
      }

      return {
        success: true,
        data: { items, total },
      };
    } catch (error) {
      console.error('Error searching 1688 by image:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Image search failed' };
    }
  },

  async getProduct(numIid: number, _retries = 0): Promise<ApiResponse<ProductDetail1688>> {
    try {
      const { data, error } = await supabase.functions.invoke('alibaba-1688-item-get', {
        body: { numIid },
      });

      if (error) return { success: false, error: error.message };

      // Handle retryable "loading" response from OTAPI
      if (data?.retryable && _retries < 2) {
        await new Promise(r => setTimeout(r, 3000));
        return this.getProduct(numIid, _retries + 1);
      }

      if (!data?.success) return { success: false, error: data?.error || 'Failed to get product' };

      // BatchGetItemFullInfo returns data in Result.Item
      const item = data.data?.Result?.Item;
      if (!item) return { success: false, error: 'Product not found' };

      // Price from OriginalPrice (CNY yuan)
      const price = item?.Price?.OriginalPrice || 0;

      // Extract price range from ConfiguredItems
      const configuredItems = Array.isArray(item?.ConfiguredItems) ? item.ConfiguredItems : [];
      
      // Parse price ranges from QuantityRanges if available (real quantity-based tiers)
      const quantityRanges = Array.isArray(item?.QuantityRanges) ? item.QuantityRanges : [];
      let priceRange: number[][] | undefined;
      if (quantityRanges.length > 1) {
        priceRange = quantityRanges
          .filter((qr: any) => qr?.MinQuantity && qr?.Price?.OriginalPrice)
          .map((qr: any) => [qr.MinQuantity, qr.Price.OriginalPrice]);
      }
      // Don't show variant price differences as "tiered pricing"

      // Pictures
      const pics = Array.isArray(item?.Pictures) ? item.Pictures : [];

      // Attributes
      const attributes = Array.isArray(item?.Attributes) ? item.Attributes : [];
      const props = attributes
        .filter((a: any) => !a?.IsConfigurator)
        .map((a: any) => ({
          name: a?.PropertyName || a?.OriginalPropertyName || '',
          value: a?.Value || a?.OriginalValue || '',
        }));

      // Build maps from configurator Attributes for image and title lookup
      const configuratorImageMap: Record<string, string> = {};
      const configuratorTitleMap: Record<string, string> = {};
      attributes
        .filter((a: any) => a?.IsConfigurator)
        .forEach((a: any) => {
          const vid = a?.Vid || a?.OriginalValue || '';
          if (vid) {
            if (a?.ImageUrl) {
              configuratorImageMap[vid] = a.ImageUrl;
            }
            if (a?.MiniImageUrl && !configuratorImageMap[vid]) {
              configuratorImageMap[vid] = a.MiniImageUrl;
            }
            // Map Vid to translated Value for display
            const displayValue = a?.Value || a?.OriginalValue || vid;
            configuratorTitleMap[vid] = displayValue;
          }
        });

      // Parse configured items for SKU variant table
      const parsedConfiguredItems = configuredItems.map((ci: any) => {
        const configurators = Array.isArray(ci?.Configurators) ? ci.Configurators : [];
        let imageUrl: string | undefined;
        // Find image: try each configurator's Vid against the image map
        for (const c of configurators) {
          const vid = c?.Vid || c?.OriginalValue || '';
          if (vid && configuratorImageMap[vid]) {
            imageUrl = configuratorImageMap[vid];
            break;
          }
        }
        // Build title from translated values
        const titleParts = configurators
          .map((c: any) => {
            const vid = c?.Vid || c?.OriginalValue || '';
            return configuratorTitleMap[vid] || c?.Value || c?.OriginalValue || vid || '';
          })
          .filter(Boolean);
        const title = ci?.Title || (titleParts.length > 0 ? titleParts.join(' / ') : '');
        return {
          id: ci?.Id || '',
          title,
          imageUrl,
          price: ci?.Price?.OriginalPrice || price,
          stock: ci?.Quantity || 0,
        };
      });

      // Parse item ID
      const externalId = item?.Id || '';
      const parsedNumIid = parseInt(externalId.replace(/^abb-/, ''), 10) || numIid;

      // Extract description images from HTML description
      const descHtml = item?.Description || '';
      const descImgMatches = descHtml.match(/src="(https?:\/\/[^"]+)"/g) || [];
      const descImgs = descImgMatches.map((m: string) => m.replace(/^src="/, '').replace(/"$/, ''));

      // Featured values
      const featuredValues = Array.isArray(item?.FeaturedValues) ? item.FeaturedValues : [];
      const getFeatured = (name: string) => featuredValues.find((v: any) => v?.Name === name)?.Value || '';

      // Location
      const location = typeof item?.Location === 'string'
        ? item.Location
        : (item?.Location?.State || item?.Location?.City || '');

      // Total stock from all configured items
      const totalStock = configuredItems.reduce((sum: number, ci: any) => sum + (ci?.Quantity || 0), 0);

      const rawTitle = item?.Title || item?.OriginalTitle || '';

      // Translate title + props synchronously before returning
      const textsToTranslate = [rawTitle, ...props.flatMap(p => [p.name, p.value])];
      const translated = await translateTitlesAsync(textsToTranslate);
      const translatedTitle = translated[0] || rawTitle;
      const translatedProps = props.map((p, i) => ({
        name: translated[1 + i * 2] || p.name,
        value: translated[2 + i * 2] || p.value,
      }));

      return {
        success: true,
        data: {
          num_iid: parsedNumIid,
          title: translatedTitle,
          desc: descHtml,
          price,
          orginal_price: undefined,
          pic_url: item?.MainPictureUrl || pics[0]?.Url || '',
          item_imgs: pics.map((p: any) => ({ url: p?.Large?.Url || p?.Url || '' })),
          desc_img: descImgs,
          location,
          num: String(totalStock || item?.MasterQuantity || ''),
          min_num: item?.FirstLotQuantity || 1,
          video: item?.VideoUrl || undefined,
          props: translatedProps,
          priceRange,
          configuredItems: parsedConfiguredItems.length > 0 ? parsedConfiguredItems : undefined,
          seller_info: {
            nick: item?.VendorName || item?.VendorDisplayName || '',
            shop_name: item?.VendorName || item?.VendorDisplayName || '',
            item_score: '',
            delivery_score: '',
            composite_score: '',
          },
          total_sold: parseInt(getFeatured('SalesInLast30Days') || getFeatured('TotalSales') || '0', 10) || undefined,
          item_weight: item?.PhysicalParameters?.Weight || undefined,
        },
      };
    } catch (error) {
      console.error('Error getting 1688 product:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get product' };
    }
  },
};
