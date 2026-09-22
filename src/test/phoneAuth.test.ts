import { describe, expect, it } from "vitest";
import { normalizeBangladeshPhone } from "../../supabase/functions/_shared/phone.ts";

describe("normalizeBangladeshPhone", () => {
  it.each([
    ["01304775767", "8801304775767"],
    ["+880 1304-775767", "8801304775767"],
    ["8801304775767", "8801304775767"],
    ["1304775767", "8801304775767"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeBangladeshPhone(input)).toBe(expected);
  });

  it.each(["", "12345", "8802304775767", "0130477576", null, undefined])(
    "rejects invalid value %s",
    (input) => {
      expect(normalizeBangladeshPhone(input)).toBeNull();
    },
  );
});

