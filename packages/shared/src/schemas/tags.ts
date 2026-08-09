import { z } from "zod";
import { TAG_MAX_LENGTH } from "../tags.ts";
import { IdSchema } from "./common.ts";

export const TagNameSchema = z.string().trim().min(1).max(TAG_MAX_LENGTH);

export const TagResponseSchema = z.object({
  id: IdSchema,
  name: z.string(),
  usageCount: z.number().int().nonnegative(),
});
export type TagResponse = z.infer<typeof TagResponseSchema>;

export const TagListResponseSchema = z.object({ items: z.array(TagResponseSchema) });
export type TagListResponse = z.infer<typeof TagListResponseSchema>;

export const UpdateTagRequestSchema = z.object({ name: TagNameSchema });
export type UpdateTagRequest = z.infer<typeof UpdateTagRequestSchema>;

export const TagQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type TagQuery = z.infer<typeof TagQuerySchema>;
