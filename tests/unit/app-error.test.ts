import { AppError } from '@/utils/app-error';

describe('AppError', () => {
  it('should create an error with proper statusCode and status', () => {
    const error = new AppError('Bad Request', 400);
    expect(error.message).toBe('Bad Request');
    expect(error.statusCode).toBe(400);
    expect(error.status).toBe('fail');
    expect(error.isOperational).toBe(true);
  });

  it('should format status as error for 500 status codes', () => {
    const error = new AppError('Internal Error', 500);
    expect(error.status).toBe('error');
  });
});
