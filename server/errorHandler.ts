import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

export class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export type AsyncRouteHandler<TReq extends Request = Request> = (
  req: TReq,
  res: Response,
  next: NextFunction
) => Promise<unknown> | unknown;

export function asyncHandler<TReq extends Request = Request>(fn: AsyncRouteHandler<TReq>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as TReq, res, next)).catch(next);
  };
}

export function apiNotFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
}

export function globalErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Custom application error
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  // 2. Zod validation error
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // 3. Malformed JSON body from express.json()
  if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
    res.status(400).json({ error: 'Invalid JSON request body' });
    return;
  }

  const errObj = err as { code?: string; message?: string } | undefined;
  const message = err instanceof Error ? err.message : String(errObj?.message || 'Internal server error');
  const code = errObj?.code;

  // 4. PostgreSQL / PostgREST constraint & syntax errors
  if (code === '23505' || message.includes('duplicate key')) {
    res.status(409).json({ error: 'Record already exists (duplicate constraint).' });
    return;
  }

  if (code === '23503' || message.includes('violates foreign key constraint')) {
    res.status(400).json({ error: 'Referenced record does not exist.' });
    return;
  }

  if (code === '22P02' || message.includes('invalid input syntax')) {
    res.status(400).json({ error: 'Invalid identifier or input format.' });
    return;
  }

  // 5. Unexpected server error (log server-side without leaking internals in prod)
  console.error(`[server-error] ${req.method} ${req.originalUrl}:`, message);
  res.status(500).json({
    error: isProduction ? 'Internal server error' : message,
  });
}
