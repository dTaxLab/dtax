import { z } from "zod";

// ─── Error Responses ─────────────────────────

export const errorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.string().optional(),
        message: z.string(),
        details: z
          .array(z.object({ path: z.string(), message: z.string() }))
          .optional(),
      })
      .passthrough(),
  })
  .openapi({ ref: "ErrorResponse" });

// ─── Pagination ──────────────────────────────

export const paginationMetaSchema = z
  .object({
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    totalPages: z.number().int(),
  })
  .openapi({ ref: "PaginationMeta" });

// ─── Common Params ───────────────────────────

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
