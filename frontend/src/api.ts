export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }

  /** Machine-readable `code` from a 409 detail, e.g. "channel_mismatch". */
  get code(): string | undefined {
    return (this.detail as { code?: string } | null)?.code;
  }
}

function messageOf(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    // FastAPI request validation errors
    return detail.map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).slice(1).join('.')}: ${d.msg}`).join('; ');
  }
  if (detail && typeof detail === 'object') {
    const d = detail as { message?: string; timers?: string[] };
    if (d.message) return d.timers?.length ? `${d.message}: ${d.timers.join(', ')}` : d.message;
  }
  return fallback;
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server', null);
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail ?? data;
    throw new ApiError(res.status, messageOf(detail, `${res.status} ${res.statusText}`), detail);
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
