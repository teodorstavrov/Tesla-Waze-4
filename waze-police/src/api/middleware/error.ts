import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { logger } from '../../monitoring/metrics.js';
import { ZodError } from 'zod';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export function createApiError(message: string, statusCode: number, code?: string): ApiError {
  const err: ApiError = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

// 404 handler — must be registered after all routes
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
  });
}

// Global error handler — 4-arg signature required by Express
export const globalErrorHandler: ErrorRequestHandler = (
  err: ApiError | ZodError | Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation Error',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const apiErr = err as ApiError;
  const statusCode = apiErr.statusCode ?? 500;

  logger.error(
    {
      err: { message: err.message, stack: err.stack, code: apiErr.code },
      method: req.method,
      path: req.path,
      status: statusCode,
    },
    'API error',
  );

  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal Server Error' : err.message,
    code: apiErr.code,
    timestamp: new Date().toISOString(),
  });
};
