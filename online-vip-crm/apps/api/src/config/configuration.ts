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
  META_VERIFY_TOKEN: z.string().optional().default(''),
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
  return parsed.data;
};
