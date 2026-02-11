import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { AllExceptionsFilter, ProblemDetails } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockResponse: {
    status: jest.Mock;
    header: jest.Mock;
    json: jest.Mock;
  };
  let mockRequest: { url: string; headers: Record<string, string> };
  let mockHost: {
    switchToHttp: jest.Mock;
  };
  let capturedJson: ProblemDetails;

  beforeEach(() => {
    filter = new AllExceptionsFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      json: jest.fn().mockImplementation((body) => {
        capturedJson = body;
      }),
    };

    mockRequest = {
      url: '/api/v1/test',
      headers: {},
    };

    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
  });

  it('should format HttpException as RFC 7807', () => {
    const exception = new NotFoundException('Resource not found');

    filter.catch(exception, mockHost as never);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.header).toHaveBeenCalledWith(
      'Content-Type',
      'application/problem+json',
    );
    expect(capturedJson.type).toBe('not_found');
    expect(capturedJson.title).toBe('Not Found');
    expect(capturedJson.status).toBe(404);
    expect(capturedJson.instance).toBe('/api/v1/test');
  });

  it('should include correlationId from request headers', () => {
    mockRequest.headers['x-correlation-id'] = 'corr-123';
    const exception = new BadRequestException('Bad input');

    filter.catch(exception, mockHost as never);

    expect(capturedJson.correlationId).toBe('corr-123');
  });

  it('should omit correlationId when not present', () => {
    const exception = new BadRequestException('Bad input');

    filter.catch(exception, mockHost as never);

    expect(capturedJson.correlationId).toBeUndefined();
  });

  it('should preserve RFC 7807 shape when controller throws it', () => {
    const exception = new ForbiddenException({
      type: 'tenant_id_missing',
      title: 'Tenant ID Required',
      status: 403,
      detail: 'X-Tenant-Id header is required',
    });

    filter.catch(exception, mockHost as never);

    expect(capturedJson.type).toBe('tenant_id_missing');
    expect(capturedJson.title).toBe('Tenant ID Required');
    expect(capturedJson.detail).toBe('X-Tenant-Id header is required');
    expect(capturedJson.status).toBe(403);
  });

  it('should handle ValidationPipe errors with field extraction', () => {
    const exception = new BadRequestException({
      statusCode: 400,
      message: ['email must be a valid email', 'name should not be empty'],
      error: 'Bad Request',
    });

    filter.catch(exception, mockHost as never);

    expect(capturedJson.type).toBe('validation_error');
    expect(capturedJson.title).toBe('Validation Failed');
    expect(capturedJson.errors).toHaveLength(2);
    const errors = capturedJson.errors!;
    const first = errors[0]!;
    const second = errors[1]!;
    expect(first.field).toBe('email');
    expect(first.message).toBe('email must be a valid email');
    expect(second.field).toBe('name');
  });

  it('should handle unknown exceptions as 500', () => {
    const exception = new Error('Something broke');

    filter.catch(exception, mockHost as never);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(capturedJson.type).toBe('internal_error');
    expect(capturedJson.title).toBe('Internal Server Error');
    expect(capturedJson.detail).toBe('Something broke');
  });

  it('should handle non-Error thrown values', () => {
    filter.catch('string error', mockHost as never);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(capturedJson.type).toBe('internal_error');
    expect(capturedJson.detail).toBe('An unexpected error occurred');
  });

  it('should handle HttpException with string response', () => {
    const exception = new HttpException('Custom message', HttpStatus.CONFLICT);

    filter.catch(exception, mockHost as never);

    expect(capturedJson.status).toBe(409);
    expect(capturedJson.type).toBe('conflict');
    expect(capturedJson.title).toBe('Conflict');
    expect(capturedJson.detail).toBe('Custom message');
  });
});
