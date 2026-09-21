import { describe, expect, it } from "vitest";
import { LOCAL_API_ORIGIN, validateApiOrigin } from "../../scripts/validate-api-origin";

describe("production API origin validation", () => {
  it.each([undefined, "", "   "])("rejects a missing value", (value) => {
    expect(() => validateApiOrigin(value)).toThrow(/required/);
  });

  it.each(["not-a-url", "ftp://api.example.com", "https://user:pass@api.example.com", "https://api.example.com/v1", "https://api.example.com?x=1"])(
    "rejects an unsafe origin: %s",
    (value) => {
      expect(() => validateApiOrigin(value)).toThrow();
    },
  );

  it.each(["http://localhost:8000", "http://api.localhost:8000", "http://127.0.0.1:8000", "http://127.10.20.30:8000", "http://[::1]:8000"])(
    "rejects a local production origin: %s",
    (value) => {
      expect(() => validateApiOrigin(value)).toThrow(/localhost/);
    },
  );

  it("accepts explicit non-local HTTP(S) origins and normalizes a trailing slash", () => {
    expect(validateApiOrigin("https://api.sajurium.example/")).toBe("https://api.sajurium.example");
    expect(validateApiOrigin("http://api.internal.example:8080")).toBe("http://api.internal.example:8080");
  });

  it("allows the explicit local integration origin only through the integration gate", () => {
    expect(validateApiOrigin(LOCAL_API_ORIGIN, { allowLocal: true })).toBe(LOCAL_API_ORIGIN);
  });
});
