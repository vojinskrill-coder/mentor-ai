import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * RFC 7807 Problem Details response shape.
 * @see https://datatracker.ietf.org/doc/html/rfc7807
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  correlationId?: string;
  errors?: Array<{ field: string; message: string }>;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId = request.headers['x-correlation-id'] as
      | string
      | undefined;

    const problem = this.buildProblemDetails(exception, request, correlationId);

    this.logException(exception, problem);

    response
      .status(problem.status)
      .header('Content-Type', 'application/problem+json')
      .json(problem);
  }

  private buildProblemDetails(
    exception: unknown,
    request: Request,
    correlationId?: string,
  ): ProblemDetails {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception, request, correlationId);
    }
    return this.fromUnknown(exception, request, correlationId);
  }

  private fromHttpException(
    exception: HttpException,
    request: Request,
    correlationId?: string,
  ): ProblemDetails {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // If the controller already threw RFC 7807 shape, preserve it
    if (this.isRfc7807(exceptionResponse)) {
      return {
        type: exceptionResponse.type,
        title: exceptionResponse.title,
        status,
        detail: exceptionResponse.detail,
        instance: request.url,
        ...(correlationId && { correlationId }),
        ...(exceptionResponse.errors && { errors: exceptionResponse.errors }),
      };
    }

    // NestJS ValidationPipe errors come as { statusCode, message: string[], error }
    if (this.isValidationError(exceptionResponse)) {
      return {
        type: 'validation_error',
        title: 'Validation Failed',
        status,
        detail: 'One or more fields failed validation',
        instance: request.url,
        ...(correlationId && { correlationId }),
        errors: exceptionResponse.message.map((msg: string) => ({
          field: this.extractFieldFromMessage(msg),
          message: msg,
        })),
      };
    }

    // Standard NestJS exception (string or { message, error, statusCode })
    const detail =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as Record<string, unknown>).message?.toString() ||
          exception.message;

    return {
      type: this.statusToType(status),
      title: this.statusToTitle(status),
      status,
      detail,
      instance: request.url,
      ...(correlationId && { correlationId }),
    };
  }

  private fromUnknown(
    exception: unknown,
    request: Request,
    correlationId?: string,
  ): ProblemDetails {
    const detail =
      exception instanceof Error ? exception.message : 'An unexpected error occurred';

    return {
      type: 'internal_error',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail,
      instance: request.url,
      ...(correlationId && { correlationId }),
    };
  }

  private isRfc7807(
    response: unknown,
  ): response is { type: string; title: string; detail: string; errors?: Array<{ field: string; message: string }> } {
    if (typeof response !== 'object' || response === null) return false;
    const obj = response as Record<string, unknown>;
    return (
      typeof obj.type === 'string' &&
      typeof obj.title === 'string' &&
      typeof obj.detail === 'string'
    );
  }

  private isValidationError(
    response: unknown,
  ): response is { statusCode: number; message: string[]; error: string } {
    if (typeof response !== 'object' || response === null) return false;
    const obj = response as Record<string, unknown>;
    return Array.isArray(obj.message) && typeof obj.statusCode === 'number';
  }

  private extractFieldFromMessage(message: string): string {
    // NestJS validation messages typically start with the property name
    const match = message.match(/^(\w+)\s/);
    return match?.[1] ?? 'unknown';
  }

  private logException(exception: unknown, problem: ProblemDetails): void {
    const logContext = {
      type: problem.type,
      status: problem.status,
      instance: problem.instance,
      correlationId: problem.correlationId,
    };

    if (problem.status >= 500) {
      this.logger.error(
        `[${problem.correlationId || 'no-correlation'}] ${problem.detail}`,
        exception instanceof Error ? exception.stack : undefined,
        logContext,
      );
    } else if (problem.status >= 400) {
      this.logger.warn(
        `[${problem.correlationId || 'no-correlation'}] ${problem.type}: ${problem.detail}`,
      );
    }
  }

  private statusToType(status: number): string {
    const map: Record<number, string> = {
      400: 'bad_request',
      401: 'unauthorized',
      403: 'forbidden',
      404: 'not_found',
      409: 'conflict',
      422: 'unprocessable_entity',
      429: 'too_many_requests',
      500: 'internal_error',
      502: 'bad_gateway',
      503: 'service_unavailable',
    };
    return map[status] || `http_error_${status}`;
  }

  private statusToTitle(status: number): string {
    const map: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
    };
    return map[status] || `HTTP Error ${status}`;
  }
}
