/** Sunucudan dönen hata. Mesaj, API'nin `{ error }` alanından gelir. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const DEFAULT_ERROR = "İstek başarısız.";

/**
 * JSON döndüren bir API'yi çağırır. Yanıt başarısızsa API'nin `{ error }` mesajıyla
 * bir `ApiError` fırlatır, böylece arayüz sunucunun yazdığı açıklamayı gösterebilir.
 */
export async function fetchJson<T>(input: string, init?: RequestInit, fallbackError = DEFAULT_ERROR): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(payload.error ?? fallbackError, response.status);
  return payload;
}

function withBody(method: string, body: unknown): RequestInit {
  if (body instanceof FormData || body instanceof Blob) return { method, body };
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const api = {
  get: <T>(url: string, fallbackError?: string) => fetchJson<T>(url, undefined, fallbackError),
  post: <T>(url: string, body?: unknown, fallbackError?: string) =>
    fetchJson<T>(url, body === undefined ? { method: "POST" } : withBody("POST", body), fallbackError),
  patch: <T>(url: string, body: unknown, fallbackError?: string) => fetchJson<T>(url, withBody("PATCH", body), fallbackError),
  delete: <T>(url: string, fallbackError?: string) => fetchJson<T>(url, { method: "DELETE" }, fallbackError),
};

/** `?a=1&b=2` sorgusunu güvenle oluşturur. */
export function withQuery(path: string, params: Record<string, string>): string {
  return `${path}?${new URLSearchParams(params)}`;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
