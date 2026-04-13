export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(opts: { message: string; statusCode?: number; code?: string; details?: unknown }) {
    super(opts.message);
    this.statusCode = opts.statusCode ?? 500;
    this.code = opts.code ?? 'APP_ERROR';
    this.details = opts.details;
  }
}

export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

