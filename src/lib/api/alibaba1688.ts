import { supabase } from '@/integrations/supabase/client';

// Set only on the VPS staging build (see /Dockerfile, /Caddyfile). When present,
// search and product-detail — the two hot, cacheable paths — call this instance's
// cache-api + Redis layer instead of the Supabase edge functions. Every other API
// method, and the production Hostinger build (where this is unset), is unaffected.
const CACHE_API_BASE = import.meta.env.VITE_API_BASE as string | undefined;

async function callCacheApi(path: string, body: unknown): Promise<{ data: any; error: { message: string } | null }> {
  try {
    const resp = await fetch(`${CACHE_API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok && !data) return { data: null, error: { message: `Request failed: ${resp.status}` } };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Network error' } };
  }
}

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
  configuredItems?: { id: string; title: string; imageUrl?: string; price: number; stock: number; }[];
  seller_info: { nick: string; shop_name: string; vendor_id?: string; item_score: string; delivery_score: string; composite_score: string; rating?: string; service_score?: string; total_sales?: number; location?: string; service_tags?: string[]; product_count?: number; };
  total_sold?: number;
  item_weight?: number;
}

type ApiResponse<T = any> = { success: boolean; error?: string; data?: T; meta?: any; retryable?: boolean; };

export const alibaba1688Api = {
  async search(query: string, page = 1, pageSize = 40): Promise<ApiResponse<{ items: Product1688[]; total: number }>> {
    try {
      const { data, error } = CACHE_API_BASE
        ? await callCacheApi('/search', { query, page, pageSize })
        : await supabase.functions.invoke('alibaba-1688-cached-search', { body: { query, page, pageSize } });
      if (error) return { success: false, error: error.message };
      if (!data?.success) return { success: false, error: data?.error || 'Search failed' };
      return { success: true, data: { items: data.data?.items || [], total: data.data?.total || 0 } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Search failed' };
    }
  },

  async searchByImageOtapi(imageUrl: string, page = 1, pageSize = 40): Promise<ApiResponse<{ items: Product1688[]; total: number }>> {
    try {
      const { data, error } = await supabase.functions.invoke('alibaba-1688-cached-search', { body: { imageUrl, page, pageSize } });
      if (error) return { success: false, error: error.message };
      if (!data?.success) return { success: false, error: data?.error || 'Image search failed' };
      return { success: true, data: { items: data.data?.items || [], total: data.data?.total || 0 } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Image search failed' };
    }
  },

  async searchByImage(imageBase64: string, page = 1, pageSize = 40, imageUrl = '', originalImageUrl = ''): Promise<ApiResponse<{ items: Product1688[]; total: number }>> {
    try {
      const body: any = { page, pageSize };
      if (imageUrl) body.imageUrl = imageUrl; else body.imageBase64 = imageBase64;
      if (originalImageUrl) body.originalImageUrl = originalImageUrl;
      const { data, error } = await supabase.functions.invoke('alibaba-1688-image-search', { body });
      if (error) return { success: false, error: error.message };
      if (!data?.success) return { success: false, error: data?.error || 'Image search failed' };
      return { success: true, data: { items: data.data?.items || [], total: data.data?.total || 0 }, meta: { ...data.meta, convertedImageUrl: data.meta?.convertedImageUrl } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Image search failed' };
    }
  },

  async searchByKeywordTmapi(keyword: string, page = 1, pageSize = 20): Promise<ApiResponse<{ items: Product1688[]; total: number }>> {
    try {
      const { data, error } = await supabase.functions.invoke('tmapi-keyword-search', { body: { keyword, page, pageSize } });
      if (error) return { success: false, error: error.message };
      if (!data?.success) return { success: false, error: data?.error || 'Keyword search failed' };
      return { success: true, data: { items: data.data?.items || [], total: data.data?.total || 0 } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Keyword search failed' };
    }
  },


  async getProduct(numIid: number, _retries = 0): Promise<ApiResponse<ProductDetail1688>> {
    try {
      const { data, error } = CACHE_API_BASE
        ? await callCacheApi('/product', { numIid })
        : await supabase.functions.invoke('alibaba-1688-item-get', { body: { numIid } });
      if (error) return { success: false, error: error.message };
      if (data?.retryable && _retries < 2) {
        // Exponential backoff from a short first delay — the previous flat 3s sleep
        // added up to 6s before the user saw anything on a transient upstream blip.
        await new Promise(r => setTimeout(r, 600 * Math.pow(2, _retries)));
        return this.getProduct(numIid, _retries + 1);
      }
      if (!data?.success) return { success: false, error: data?.error || 'Failed to get product', retryable: Boolean(data?.retryable) };
      // TMAPI edge function returns already-mapped ProductDetail1688 shape
      const detail = data.data as ProductDetail1688;
      if (!detail || !detail.num_iid) return { success: false, error: 'Product not found' };
      return { success: true, data: detail };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get product' };
    }
  },
};
