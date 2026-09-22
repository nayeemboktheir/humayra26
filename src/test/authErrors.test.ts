import { describe, expect, it } from "vitest";
import { errorMessage, getFunctionErrorMessage } from "@/lib/authErrors";

describe("auth error mapping", () => {
  it("prefers a safe function response message", async () => {
    expect(await getFunctionErrorMessage(null, { error: "Account already exists." }, "Fallback"))
      .toBe("Account already exists.");
  });

  it("reads non-2xx Edge Function response bodies", async () => {
    const error = { context: { json: async () => ({ error: "OTP expired." }) } };
    expect(await getFunctionErrorMessage(error, null, "Fallback")).toBe("OTP expired.");
  });

  it("falls back when the response is unreadable", async () => {
    const error = { context: { json: async () => { throw new Error("bad body"); } } };
    expect(await getFunctionErrorMessage(error, null, "Fallback")).toBe("Fallback");
    expect(errorMessage(new Error("Known"), "Fallback")).toBe("Known");
  });
});

