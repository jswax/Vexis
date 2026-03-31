const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type ApiError = Error & { status?: number };

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  // In the browser, prefer the Next rewrite to avoid CORS.
  const baseUrl =
    typeof window === "undefined" ? BASE_URL : "/api";

  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  const isJson = (res.headers.get("content-type") || "").includes(
    "application/json",
  );
  const body = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const err: ApiError = new Error(
      (body && typeof body === "object" && "error" in body && (body as any).error) ||
        `Request failed (${res.status})`,
    );
    err.status = res.status;
    throw err;
  }

  return body as T;
}

