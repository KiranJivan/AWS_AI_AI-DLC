import { Request, Response, NextFunction } from 'express';

type Schema = Record<
  string,
  {
    type: string;
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    enum?: string[];
  }
>;

export function validateBody(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      if (rules.required && (value === undefined || value === null || value === '')) {
        res.status(400).json({ error: `Field '${field}' is required` });
        return;
      }

      if (value !== undefined && value !== null) {
        if (rules.type === 'string' && typeof value !== 'string') {
          res.status(400).json({ error: `Field '${field}' must be a string` });
          return;
        }
        if (rules.type === 'boolean' && typeof value !== 'boolean') {
          res.status(400).json({ error: `Field '${field}' must be a boolean` });
          return;
        }
        if (rules.minLength && typeof value === 'string' && value.trim().length < rules.minLength) {
          res.status(400).json({
            error: `Field '${field}' must be at least ${rules.minLength} characters`,
          });
          return;
        }
        if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
          res.status(400).json({
            error: `Field '${field}' must be at most ${rules.maxLength} characters`,
          });
          return;
        }
        if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
          res.status(400).json({ error: `Field '${field}' has an invalid format` });
          return;
        }
        if (rules.enum && !rules.enum.includes(value)) {
          res.status(400).json({
            error: `Field '${field}' must be one of: ${rules.enum.join(', ')}`,
          });
          return;
        }
      }
    }
    next();
  };
}
