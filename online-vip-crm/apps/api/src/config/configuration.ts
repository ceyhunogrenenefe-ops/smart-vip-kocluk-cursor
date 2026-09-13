import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_COOKIE_NAME: z.string().default('ovip_crm_token'),
  META_APP_SECRET: z.string().optional().default(''),
  /** Preferred Meta webhook verify token. */
  META_VERIFY_TOKEN: z.string().optional().default(''),
  /** Alias accepted in .env.example / docs (merged into META_VERIFY_TOKEN). */
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional().default(''),
  PUBLIC_FORMS_API_KEY: z.string().optional().default(''),
  REDIS_URL: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export default () => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  const data = parsed.data;
  // Prefer explicit META_VERIFY_TOKEN; fall back to META_WEBHOOK_VERIFY_TOKEN.
  if (!data.META_VERIFY_TOKEN && data.META_WEBHOOK_VERIFY_TOKEN) {
    data.META_VERIFY_TOKEN = data.META_WEBHOOK_VERIFY_TOKEN;
  }
  return data;
};
