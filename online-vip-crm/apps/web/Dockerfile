# Online VIP CRM — Web (Next.js)
FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @online-vip-crm/web...

FROM deps AS build
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @online-vip-crm/web build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
COPY --from=build /app /app
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
