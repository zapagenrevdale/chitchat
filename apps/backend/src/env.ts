import { z } from "zod";

export const env = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.url(),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    LANGFUSE_PUBLIC_KEY: z.string().trim().optional(),
    LANGFUSE_SECRET_KEY: z.string().trim().optional(),
    LANGFUSE_BASE_URL: z.url().default("https://cloud.langfuse.com"),
    TYPESAFE_API_KEY: z.string().trim().optional(),
    GEMINI_API_KEY: z.string().trim().optional(),
    GEMINI_API_KEY_LIVE: z.string().trim().optional(),
  })
  .parse(process.env);
