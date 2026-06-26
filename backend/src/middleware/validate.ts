/**
 * validate.ts
 *
 * Zod-based request validation middleware.
 * Validates body, params, and query against provided schemas.
 *
 * Usage:
 *   router.post("/", validate(createServerSchema), ctrl.createServer);
 */

import type { Request, Response, NextFunction } from "express";
import { z, type ZodSchema } from "zod";

export interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

/**
 * validate — express middleware factory.
 * Parses request parts against Zod schemas.
 * On failure: returns 400 with structured error messages.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: Array<{ field: string; message: string }> = [];

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({ field: issue.path.join(".") || "body", message: issue.message });
        }
      } else {
        req.body = result.data; // Use parsed & coerced data
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({ field: `params.${issue.path.join(".")}`, message: issue.message });
        }
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({ field: `query.${issue.path.join(".")}`, message: issue.message });
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: "Validation failed.",
        details: errors,
      });
      return;
    }

    next();
  };
}
