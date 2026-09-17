import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Turns everything the app can throw into one predictable JSON shape, so the
 * React client never has to guess how to read an error.
 *
 *   { statusCode, error, message, path, timestamp, ...extra }
 *
 * Unexpected errors are logged with their stack but reported to the client as a
 * plain 500 — internal details do not leak out.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let body: Record<string, unknown>;

    if (isHttp) {
      const res = exception.getResponse();
      body =
        typeof res === 'string'
          ? { statusCode: status, message: res }
          : { statusCode: status, ...(res as Record<string, unknown>) };
    } else {
      this.logger.error(
        `Unhandled error on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      body = {
        statusCode: status,
        error: 'Internal Server Error',
        message: 'Something went wrong on our side.',
      };
    }

    response.status(status).json({
      ...body,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
