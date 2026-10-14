/** An error that is safe to show to the user. `message` must be plain, non-technical language. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = (msg = "Please sign in to continue.") => new AppError(401, "unauthorized", msg);
export const forbidden = (msg = "You don't have access to this.") => new AppError(403, "forbidden", msg);
export const notFound = (what = "item") => new AppError(404, "not_found", `We couldn't find that ${what}.`);
export const badRequest = (msg: string, details?: unknown) => new AppError(400, "invalid", msg, details);
export const conflict = (msg: string) => new AppError(409, "conflict", msg);
export const rateLimited = (msg = "You're doing that a little too often. Please wait a moment and try again.") =>
  new AppError(429, "rate_limited", msg);
export const unavailable = (code: string, msg: string) => new AppError(503, code, msg);
