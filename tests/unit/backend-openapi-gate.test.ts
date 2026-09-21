import { describe, expect, it } from "vitest";
import { validateBackendOpenApiUrl } from "../../scripts/check-backend-openapi";

describe("backend OpenAPI gate", () => {
  it.each([undefined, "", "relative/openapi.json", "file:///tmp/openapi.json"])("rejects an unusable schema URL", (value) => {
    expect(() => validateBackendOpenApiUrl(value)).toThrow();
  });

  it("accepts an explicit HTTP(S) schema URL", () => {
    expect(validateBackendOpenApiUrl("http://localhost:8000/api/v1/openapi.json")).toBe("http://localhost:8000/api/v1/openapi.json");
    expect(validateBackendOpenApiUrl("https://api.example.com/openapi.json")).toBe("https://api.example.com/openapi.json");
  });
});
