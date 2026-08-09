import { z } from "zod";
import { IsoDateSchema } from "./common.ts";

/** `GET /api/health` — no session required, never cached by the service worker. */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  time: IsoDateSchema,
  database: z.enum(["file", "remote"]),
  /** Which mail transport is configured — `console` writes links to the log. */
  mail: z.enum(["console", "smtp"]),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
