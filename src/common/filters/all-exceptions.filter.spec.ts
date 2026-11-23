import {
  ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { AllExceptionsFilter } from './all-exceptions.filter';

type ErrorEnvelope = {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
};

type MockRequest = {
  method: string;
  url: string;
};

type MockResponse = {
  json: jest.Mock<void, [ErrorEnvelope]>;
  status: jest.Mock<MockResponse, [number]>;
};

const createHost = (request: MockRequest, response: MockResponse) =>
  ({
    switchToHttp: () => ({
      getNext: jest.fn(),
      getRequest: () => request,
      getResponse: () => response,
    }),
  }) as unknown as ArgumentsHost;

const createResponse = (): MockResponse => {
  const response = {
    json: jest.fn<void, [ErrorEnvelope]>(),
    status: jest.fn<MockResponse, [number]>(),
  };

  response.status.mockReturnValue(response);

  return response;
};

const expectTimestampToBeIsoInstant = (timestamp: string) => {
  expect(new Date(timestamp).toISOString()).toBe(timestamp);
};

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let request: MockRequest;
  let response: MockResponse;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;
  let errorSpy: jest.SpiedFunction<Logger['error']>;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    filter = new AllExceptionsFilter();
    request = {
      method: 'GET',
      url: '/contents/missing-id',
    };
    response = createResponse();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('serializes NotFoundException to the standard 404 envelope', () => {
    filter.catch(new NotFoundException(), createHost(request, response));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'NOT_FOUND',
      message: expect.any(String),
      path: request.url,
      timestamp: expect.any(String),
    });

    const body = response.json.mock.calls[0][0];
    expectTimestampToBeIsoInstant(body.timestamp);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'NOT_FOUND',
        method: request.method,
        path: request.url,
        statusCode: 404,
        timestamp: body.timestamp,
      }),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('preserves validation message arrays from BadRequestException', () => {
    const validationMessages = ['limit must not be greater than 100'];

    filter.catch(
      new BadRequestException({
        error: 'Bad Request',
        message: validationMessages,
        statusCode: 400,
      }),
      createHost(request, response),
    );

    expect(response.status).toHaveBeenCalledWith(400);

    const body = response.json.mock.calls[0][0];
    expect(body).toEqual({
      statusCode: 400,
      error: 'BAD_REQUEST',
      message: validationMessages,
      path: request.url,
      timestamp: expect.any(String),
    });

    expect(body.message).toBe(validationMessages);
    expectTimestampToBeIsoInstant(body.timestamp);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'BAD_REQUEST',
        statusCode: 400,
      }),
    );
  });

  it('omits OAuth query parameters from the error response and log', () => {
    request.url = '/auth/google/callback?code=example-code&state=example-state';

    filter.catch(new UnauthorizedException(), createHost(request, response));

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/auth/google/callback' }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/auth/google/callback' }),
    );
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('example-');
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('example-');
  });

  it('sanitizes unexpected Error instances into a 500 envelope', () => {
    const exception = new Error('boom');

    filter.catch(exception, createHost(request, response));

    expect(response.status).toHaveBeenCalledWith(500);

    const body = response.json.mock.calls[0][0];
    expect(body).toEqual({
      statusCode: 500,
      error: 'INTERNAL_SERVER_ERROR',
      message: expect.any(String),
      path: request.url,
      timestamp: expect.any(String),
    });
    expect(body.message).not.toContain('boom');
    expect(JSON.stringify(body)).not.toContain('boom');
    expect(JSON.stringify(body)).not.toContain('Error: boom');
    expectTimestampToBeIsoInstant(body.timestamp);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"statusCode":500'),
      expect.stringContaining('Error: boom'),
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('sanitizes non-Error thrown values without leaking the raw value', () => {
    filter.catch('oops', createHost(request, response));

    expect(response.status).toHaveBeenCalledWith(500);

    const body = response.json.mock.calls[0][0];
    expect(body).toEqual({
      statusCode: 500,
      error: 'INTERNAL_SERVER_ERROR',
      message: expect.any(String),
      path: request.url,
      timestamp: expect.any(String),
    });
    expect(JSON.stringify(body)).not.toContain('oops');
    expectTimestampToBeIsoInstant(body.timestamp);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"exception":"oops"'),
      undefined,
    );
  });
});
