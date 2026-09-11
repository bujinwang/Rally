import { Request, Response, NextFunction } from 'express';
import winston from 'winston';
import { redactionFormat } from './logRedaction';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    redactionFormat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

interface CorrelationRequest extends Request {
  correlationId?: string;
}

export interface AppError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: CorrelationRequest,
  res: Response,
  next: NextFunction
): Response | void => {
  let error = { ...err };
  error.message = err.message;

  // Build a child logger with the correlation ID for this request
  const childLogger = req.correlationId
    ? logger.child({ correlationId: req.correlationId })
    : logger;

  // Redact sensitive headers before logging
  const headers = { ...req.headers };
  ['authorization', 'cookie', 'x-api-key', 'x-api-key'].forEach((key) => {
    if (headers[key]) headers[key] = '[REDACTED]';
  });

  // Log error
  childLogger.error(err.message, {
    error: err,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    headers,
  });

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { ...error, message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.name === 'MongoError' && (err as any).code === 11000) {
    const message = 'Duplicate field value entered';
    error = { ...error, message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values((err as any).errors).map((val: any) => val.message).join(', ');
    error = { ...error, message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { ...error, message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { ...error, message, statusCode: 401 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      code: error.status || 'INTERNAL_ERROR',
      message: error.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    },
    timestamp: new Date().toISOString()
  });
};