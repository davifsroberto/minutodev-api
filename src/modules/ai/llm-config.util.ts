const DEFAULT_LLM_TIMEOUT_MS = 30_000;

export function resolveLlmModel(fallback: string): string {
  return process.env.LLM_MODEL?.trim() || fallback;
}

export function resolveLlmTimeoutMs(): number {
  const raw = process.env.LLM_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_LLM_TIMEOUT_MS;
}
