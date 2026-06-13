import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

type ErrorMessage = string | string[];

type ErrorEnvelope = {
  statusCode: number;
  error: string;
  message: ErrorMessage;
  path: string;
  timestamp: string;
};

type HttpRequest = {
  method?: string;
  url: string;
};

type HttpResponse = {
  status: (statusCode: number) => {
    json: (body: ErrorEnvelope) => unknown;
  };
};

type ExceptionResponse = {
  error?: unknown;
  message?: unknown;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<HttpRequest>();
    const response = context.getResponse<HttpResponse>();
    const timestamp = new Date().toISOString();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const error = this.getErrorCode(statusCode);
    const message = this.getMessage(exception);

    const body: ErrorEnvelope = {
      statusCode,
      error,
      message,
      path: request.url,
      timestamp,
    };

    this.logException(exception, {
      error,
      method: request.method,
      path: request.url,
      statusCode,
      timestamp,
    });

    response.status(statusCode).json(body);
  }

  private getErrorCode(statusCode: number): string {
    const statusName = HttpStatus[statusCode];

    return typeof statusName === 'string'
      ? statusName
      : HttpStatus[HttpStatus.INTERNAL_SERVER_ERROR];
  }

  private getMessage(exception: unknown): ErrorMessage {
    if (!(exception instanceof HttpException)) {
      return 'Internal server error';
    }

    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (this.isExceptionResponse(exceptionResponse)) {
      const { message } = exceptionResponse;

      if (Array.isArray(message) && message.every(this.isString)) {
        return message;
      }

      if (typeof message === 'string') {
        return message;
      }
    }

    return exception.message;
  }

  private isExceptionResponse(value: unknown): value is ExceptionResponse {
    return typeof value === 'object' && value !== null;
  }

  private isString(value: unknown): value is string {
    return typeof value === 'string';
  }

  private logException(
    exception: unknown,
    metadata: {
      error: string;
      method?: string;
      path: string;
      statusCode: number;
      timestamp: string;
    },
  ): void {
    const logPayload = {
      ...metadata,
      exception: this.getLogException(exception),
    };

    if (metadata.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(JSON.stringify(logPayload), this.getStack(exception));
      return;
    }

    this.logger.warn(logPayload);
  }

  private getLogException(exception: unknown): string {
    if (exception instanceof Error) {
      return exception.message;
    }

    return String(exception);
  }

  private getStack(exception: unknown): string | undefined {
    return exception instanceof Error ? exception.stack : undefined;
  }
}
