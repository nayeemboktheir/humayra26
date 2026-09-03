import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// alibaba1688Api reads import.meta.env.VITE_API_BASE once at module load, so each test
// that needs a different value re-imports the module with vi.resetModules() rather than
// mutating env mid-test.
const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

const originalFetch = global.fetch;

beforeEach(() => {
  vi.resetModules();
  invokeMock.mockReset();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
});

describe("alibaba1688Api — cache-api vs. Supabase edge function routing", () => {
  it("calls the Supabase edge function when VITE_API_BASE is unset (production build)", async () => {
    vi.stubEnv("VITE_API_BASE", "");
    invokeMock.mockResolvedValue({ data: { success: true, data: { items: [], total: 0 } }, error: null });

    const { alibaba1688Api } = await import("@/lib/api/alibaba1688");
    await alibaba1688Api.search("shoes", 1, 20);

    expect(invokeMock).toHaveBeenCalledWith(
      "alibaba-1688-cached-search",
      { body: { query: "shoes", page: 1, pageSize: 20 } },
    );
  });

  it("calls cache-api instead when VITE_API_BASE is set (staging build)", async () => {
    vi.stubEnv("VITE_API_BASE", "/api");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { items: [], total: 0 } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { alibaba1688Api } = await import("@/lib/api/alibaba1688");
    await alibaba1688Api.search("shoes", 1, 20);

    expect(invokeMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "shoes", page: 1, pageSize: 20 }),
      }),
    );
  });

  it("routes getProduct the same way", async () => {
    vi.stubEnv("VITE_API_BASE", "/api");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { num_iid: 123 } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { alibaba1688Api } = await import("@/lib/api/alibaba1688");
    const result = await alibaba1688Api.getProduct(123);

    expect(invokeMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/product", expect.objectContaining({ method: "POST" }));
    expect(result.success).toBe(true);
    expect(result.data?.num_iid).toBe(123);
  });

  it("surfaces a network failure from cache-api as a normal error, not a throw", async () => {
    vi.stubEnv("VITE_API_BASE", "/api");
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed")) as unknown as typeof fetch;

    const { alibaba1688Api } = await import("@/lib/api/alibaba1688");
    const result = await alibaba1688Api.search("shoes");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/fetch failed/);
  });

  it("does not affect image search or keyword search, which always use the edge function", async () => {
    vi.stubEnv("VITE_API_BASE", "/api");
    global.fetch = vi.fn() as unknown as typeof fetch;
    invokeMock.mockResolvedValue({ data: { success: true, data: { items: [], total: 0 } }, error: null });

    const { alibaba1688Api } = await import("@/lib/api/alibaba1688");
    await alibaba1688Api.searchByKeywordTmapi("bag");

    expect(invokeMock).toHaveBeenCalledWith("tmapi-keyword-search", expect.anything());
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
