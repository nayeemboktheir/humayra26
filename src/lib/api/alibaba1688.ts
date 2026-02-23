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
  meta?: any;
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

export const alibaba1688Api = {
  async search(
    query: string,
    page = 1,
    pageSize = 40,
  ): Promise<ApiResponse<{ items: Product1688[]; total: number }>> {
    try {
      const { data, error } = await supabase.functions.invoke('alibaba-1688-cached-search', {
        body: { query, page, pageSize },
      });

      if (error) return { success: false, error: error.message };
      if (!data?.success) return { success: false, error: data?.error || 'Search failed' };

      const items: Product1688[] = data.data?.items || [];
      const total = data.data?.total || 0;

      return { success: true, data: { items, total } };
    } catch (error) {
      console.error('Error searching 1688:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Search failed' };
    }
  },

  async searchByImage(
    imageBase64: string,
    page = 1,
    pageSize = 40,
    imageUrl = '',
  ): Promise<ApiResponse<{ items: Product1688[]; total: number }>> {
    try {
      const body: any = { page, pageSize };
      if (imageUrl) {
        body.imageUrl = imageUrl;
      } else {
        body.imageBase64 = imageBase64;
      }
      const { data, error } = await supabase.functions.invoke('alibaba-1688-image-search', {
        body,
      });

      if (error) return { success: false, error: error.message };
      if (!data?.success) return { success: false, error: data?.error || 'Image search failed' };

      const items: Product1688[] = data.data?.items || [];
      const total = data.data?.total || 0;

      return {
        success: true,
        data: { items, total },
        meta: { ...data.meta, convertedImageUrl: data.meta?.convertedImageUrl },
      };
    } catch (error) {
      console.error('Error searching 1688 by image:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Image search failed' };
    }
  },

  // Parse raw OTAPI product data (already translated via language=en)
  parseRawProduct(data: any, numIid: number): ProductDetail1688 | null {
    const item = data?.Result?.Item;
    if (!item) return null;

    const price = item?.Price?.OriginalPrice || 0;
    const configuredItems = Array.isArray(item?.ConfiguredItems) ? item.ConfiguredItems : [];
    const quantityRanges = Array.isArray(item?.QuantityRanges) ? item.QuantityRanges : [];
    let priceRange: number[][] | undefined;
    if (quantityRanges.length > 1) {
      priceRange = quantityRanges
        .filter((qr: any) => qr?.MinQuantity && qr?.Price?.OriginalPrice)
        .map((qr: any) => [qr.MinQuantity, qr.Price.OriginalPrice]);
    }

    const pics = Array.isArray(item?.Pictures) ? item.Pictures : [];
    const attributes = Array.isArray(item?.Attributes) ? item.Attributes : [];
    const props = attributes
      .filter((a: any) => !a?.IsConfigurator)
      .map((a: any) => ({
        name: a?.PropertyName || a?.OriginalPropertyName || '',
        value: a?.Value || a?.OriginalValue || '',
      }));

    const configuratorImageMap: Record<string, string> = {};
    const configuratorTitleMap: Record<string, string> = {};
    attributes.filter((a: any) => a?.IsConfigurator).forEach((a: any) => {
      const vid = a?.Vid || a?.OriginalValue || '';
      if (vid) {
        if (a?.ImageUrl) configuratorImageMap[vid] = a.ImageUrl;
        if (a?.MiniImageUrl && !configuratorImageMap[vid]) configuratorImageMap[vid] = a.MiniImageUrl;
        configuratorTitleMap[vid] = a?.Value || a?.OriginalValue || vid;
      }
    });

    const parsedConfiguredItems = configuredItems.map((ci: any) => {
      const configurators = Array.isArray(ci?.Configurators) ? ci.Configurators : [];
      let imageUrl: string | undefined;
      for (const c of configurators) {
        const vid = c?.Vid || c?.OriginalValue || '';
        if (vid && configuratorImageMap[vid]) { imageUrl = configuratorImageMap[vid]; break; }
      }
      const titleParts = configurators.map((c: any) => {
        const vid = c?.Vid || c?.OriginalValue || '';
        return configuratorTitleMap[vid] || c?.Value || c?.OriginalValue || vid || '';
      }).filter(Boolean);
      return {
        id: ci?.Id || '',
        title: ci?.Title || (titleParts.length > 0 ? titleParts.join(' / ') : ''),
        imageUrl,
        price: ci?.Price?.OriginalPrice || price,
        stock: ci?.Quantity || 0,
      };
    });

    const externalId = item?.Id || '';
    const parsedNumIid = parseInt(externalId.replace(/^abb-/, ''), 10) || numIid;
    const descHtml = item?.Description || '';
    const descImgMatches = descHtml.match(/src="(https?:\/\/[^"]+)"/g) || [];
    const descImgs = descImgMatches.map((m: string) => m.replace(/^src="/, '').replace(/"$/, ''));
    const featuredValues = Array.isArray(item?.FeaturedValues) ? item.FeaturedValues : [];
    const getFeatured = (name: string) => featuredValues.find((v: any) => v?.Name === name)?.Value || '';
    const location = typeof item?.Location === 'string'
      ? item.Location
      : (item?.Location?.State || item?.Location?.City || '');
    const totalStock = configuredItems.reduce((sum: number, ci: any) => sum + (ci?.Quantity || 0), 0);

    return {
      num_iid: parsedNumIid,
      title: item?.Title || item?.OriginalTitle || '',
      desc: descHtml,
      price,
      pic_url: item?.MainPictureUrl || pics[0]?.Url || '',
      item_imgs: pics.map((p: any) => ({ url: p?.Large?.Url || p?.Url || '' })),
      desc_img: descImgs,
      location,
      num: String(totalStock || item?.MasterQuantity || ''),
      min_num: item?.FirstLotQuantity || 1,
      video: item?.VideoUrl || undefined,
      props,
      priceRange,
      configuredItems: parsedConfiguredItems.length > 0 ? parsedConfiguredItems : undefined,
      seller_info: {
        nick: item?.VendorName || item?.VendorDisplayName || '',
        shop_name: item?.VendorName || item?.VendorDisplayName || '',
        item_score: '', delivery_score: '', composite_score: '',
      },
      total_sold: parseInt(getFeatured('SalesInLast30Days') || getFeatured('TotalSales') || '0', 10) || undefined,
      item_weight: item?.PhysicalParameters?.Weight || undefined,
    };
  },

  async searchByKeywordTmapi(
    keyword: string,
    page = 1,
    pageSize = 20,
  ): Promise<ApiResponse<{ items: Product1688[]; total: number }>> {
    try {
      const { data, error } = await supabase.functions.invoke('tmapi-keyword-search', {
        body: { keyword, page, pageSize },
      });
      if (error) return { success: false, error: error.message };
      if (!data?.success) return { success: false, error: data?.error || 'Keyword search failed' };
      return {
        success: true,
        data: { items: data.data?.items || [], total: data.data?.total || 0 },
      };
    } catch (error) {
      console.error('Error in TMAPI keyword search:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Keyword search failed' };
    }
  },

  async getProduct(
    numIid: number,
    _retries = 0,
  ): Promise<ApiResponse<ProductDetail1688>> {
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

      const parsed = this.parseRawProduct(data.data, numIid);
      if (!parsed) return { success: false, error: 'Product not found' };

      return { success: true, data: parsed };
    } catch (error) {
      console.error('Error getting 1688 product:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get product' };
    }
  },
};
