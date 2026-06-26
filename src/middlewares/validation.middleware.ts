import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from '../utils/app-error';

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      // Only overwrite what the schema actually validated; otherwise a schema
      // that omits (e.g.) `params` would wipe req.params with `undefined`.
      if (parsed.body !== undefined) {
        req.body = parsed.body;
      }
      if (parsed.query !== undefined) {
        req.query = parsed.query as any;
      }
      if (parsed.params !== undefined) {
        req.params = parsed.params as any;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.errors.map((err) => {
          // Remove the top-level path (body, query, params) for user-friendly keys
          const path = err.path.slice(1).join('.');
          return `${path || 'value'}: ${err.message}`;
        });
        next(new AppError(`Validation error: ${issues.join(', ')}`, 400));
      } else {
        next(error);
      }
    }
  };
};
