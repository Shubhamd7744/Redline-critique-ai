/**
 * Shared resilience helpers for the multimodal critique calls.
 *
 * Why this exists: the analyze step fans out ~10 independent multimodal LLM
 * calls. Without bounds, one hung upstream call keeps the whole serverless
 * request open until the platform kills it — which means the `catch` in
 * `analyzeCritique` never runs and the row is stranded in `analyzing` forever.
 *
 * Two guarantees:
 *   1. Every call is time-boxed (AbortSignal), so a hung call fails fast.
 *   2. Fan-out is pooled, so we never open 10 large image requests at once.
 */

export const AI_CALL_TIMEOUT_MS = 45_000;

/** Time-box a promise-returning call and retry once on failure. */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  { attempts = 2, timeoutMs = AI_CALL_TIMEOUT_MS }: { attempts?: number; timeoutMs?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("AI call timed out")), timeoutMs);
    try {
      return await fn(controller.signal);
    } catch (e) {
      lastError = e;
      // Don't burn the remaining budget retrying a timeout on the last attempt.
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Run `items` through `fn` with at most `limit` in flight. Never rejects. */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}
