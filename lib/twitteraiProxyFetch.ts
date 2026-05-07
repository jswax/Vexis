/**
 * Next route handlers use Node's fetch (undici). Undici defaults headersTimeout /
 * bodyTimeout to ~300s, so long TwitterAI calls get cut off even with AbortSignal.
 * This helper raises those limits for the duration of one request.
 */
import { Agent, fetch as undiciFetch } from "undici";

export type TwitterAiFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
};

export async function fetchTwitterAiLong(
  url: string,
  init: TwitterAiFetchInit,
  timeoutMs: number
): Promise<Response> {
  const agent = new Agent({
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    connectTimeout: 60_000,
  });
  try {
    return await undiciFetch(url, {
      method: init.method ?? "GET",
      headers: init.headers,
      body: init.body ?? undefined,
      dispatcher: agent,
    }) as unknown as Response;
  } finally {
    await agent.close();
  }
}
