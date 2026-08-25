import { describe, expect, it, vi } from "vitest";
import { ApiRequestError, apiRequest } from "@/lib/api/client";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

describe("apiRequest", () => {
  it("returns successful JSON with credentials, CSRF, and request metadata", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse({ profile_id: "profile_1" }, {
        status: 201,
        headers: { "X-Request-ID": "req_server" },
      }),
    );

    const result = await apiRequest<{ profile_id: string }>("/api/v1/profiles", {
      baseUrl: "https://api.example.test/",
      method: "POST",
      body: { nickname: "해" },
      csrfToken: "csrf-token",
      requestId: "req_client",
      fetch,
    });

    expect(result).toMatchObject({
      data: { profile_id: "profile_1" },
      status: 201,
      requestId: "req_server",
      retryAfterSeconds: null,
    });
    expect(fetch).toHaveBeenCalledWith("https://api.example.test/api/v1/profiles", expect.objectContaining({
      body: JSON.stringify({ nickname: "해" }),
      credentials: "include",
      method: "POST",
    }));
    const headers = new Headers(fetch.mock.calls[0][1]?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-CSRFToken")).toBe("csrf-token");
    expect(headers.get("X-Request-ID")).toBe("req_client");
  });

  it("throws a normalized ApiRequestError for every non-2xx response", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse({
        code: "PROFILE_INVALID",
        message: "프로필을 확인해 주세요.",
        field_errors: { birth_date: "필수 항목입니다." },
        retryable: false,
      }, {
        status: 422,
        headers: { "X-Request-ID": "req_validation" },
      }),
    );

    const thrown = await apiRequest("/api/v1/profiles", { fetch }).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ApiRequestError);
    expect(thrown).toMatchObject({
      status: 422,
      retryAfterSeconds: null,
      error: {
        code: "PROFILE_INVALID",
        message: "프로필을 확인해 주세요.",
        field_errors: { birth_date: ["필수 항목입니다."] },
        request_id: "req_validation",
        retryable: false,
      },
    });
  });

  it("exposes Retry-After polling metadata on accepted and failed responses", async () => {
    const acceptedFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse({ job_id: "job_1", status: "QUEUED" }, {
        status: 202,
        headers: { "Retry-After": "7" },
      }),
    );
    const accepted = await apiRequest<{ job_id: string }>("/api/v1/jobs/job_1", {
      requestId: "req_poll",
      fetch: acceptedFetch,
    });
    expect(accepted.retryAfterSeconds).toBe(7);

    const failedFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse({ code: "JOB_BUSY", message: "다시 시도해 주세요.", retryable: true }, {
        status: 503,
        headers: { "Retry-After": "3", "X-Request-ID": "req_busy" },
      }),
    );
    await expect(apiRequest("/api/v1/jobs/job_1", { fetch: failedFetch })).rejects.toMatchObject({
      status: 503,
      retryAfterSeconds: 3,
      error: { request_id: "req_busy", retryable: true },
    });
  });
});
