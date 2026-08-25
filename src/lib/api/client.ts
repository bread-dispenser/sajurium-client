export interface ApiError {
  code: string;
  message: string;
  field_errors: Record<string, string[]>;
  request_id: string;
  retryable: boolean;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  requestId: string;
  retryAfterSeconds: number | null;
  headers: Headers;
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  baseUrl?: string;
  body?: BodyInit | Record<string, unknown> | null;
  csrfToken?: string;
  requestId?: string;
  fetch?: typeof globalThis.fetch;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly error: ApiError;
  readonly retryAfterSeconds: number | null;
  readonly headers: Headers;

  constructor(status: number, error: ApiError, retryAfterSeconds: number | null, headers: Headers) {
    super(error.message);
    this.name = "ApiRequestError";
    this.status = status;
    this.error = error;
    this.retryAfterSeconds = retryAfterSeconds;
    this.headers = headers;
  }
}

function createRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `req_${uuid}` : `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeFieldErrors(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([field, messages]) => [
      field,
      Array.isArray(messages) ? messages.map(String) : [String(messages)],
    ]),
  );
}

function normalizeApiError(value: unknown, status: number, responseRequestId: string): ApiError {
  const body = isRecord(value) ? value : {};
  return {
    code: typeof body.code === "string" ? body.code : `HTTP_${status}`,
    message: typeof body.message === "string" ? body.message : `Request failed with status ${status}`,
    field_errors: normalizeFieldErrors(body.field_errors),
    request_id: typeof body.request_id === "string" ? body.request_id : responseRequestId,
    retryable: typeof body.retryable === "boolean" ? body.retryable : status === 429 || status >= 500,
  };
}

function buildUrl(path: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
  const {
    baseUrl = "",
    csrfToken,
    requestId = createRequestId(),
    fetch: fetchImplementation = globalThis.fetch,
    body,
    headers: initialHeaders,
    credentials = "include",
    ...requestInit
  } = options;
  const headers = new Headers(initialHeaders);
  headers.set("X-Request-ID", requestId);
  if (csrfToken) headers.set("X-CSRFToken", csrfToken);

  let requestBody = body as BodyInit | null | undefined;
  if (isJsonObject(body)) {
    headers.set("Content-Type", "application/json");
    requestBody = JSON.stringify(body);
  }

  const response = await fetchImplementation(buildUrl(path, baseUrl), {
    ...requestInit,
    body: requestBody,
    credentials,
    headers,
  });
  const responseRequestId = response.headers.get("X-Request-ID") ?? requestId;
  const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
  const payload = await readJson(response);

  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      normalizeApiError(payload, response.status, responseRequestId),
      retryAfterSeconds,
      response.headers,
    );
  }

  return {
    data: payload as T,
    status: response.status,
    requestId: responseRequestId,
    retryAfterSeconds,
    headers: response.headers,
  };
}
