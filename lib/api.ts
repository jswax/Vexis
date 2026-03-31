const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

type ApiError = Error & { status?: number };

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!BASE_URL) {
    const msg =
      "Missing NEXT_PUBLIC_API_URL. Set NEXT_PUBLIC_API_URL=http://localhost:8080 for local dev, and set it to your deployed Go backend URL in Vercel.";
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.error(msg);
    }
    throw new Error(msg);
  }
  const baseUrl = BASE_URL.replace(/\/+$/, "");

  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
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

