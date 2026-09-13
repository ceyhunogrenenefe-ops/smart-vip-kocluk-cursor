# Online VIP CRM — Next.js web (dev-friendly image; prefer monorepo root build in CI)
FROM node:20-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/web/.next/standalone ./
COPY apps/web/.next/static ./.next/static
COPY apps/web/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
