# Online VIP CRM — API
FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY packages/integrations/package.json packages/integrations/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @online-vip-crm/api...

FROM deps AS build
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY packages/database packages/database
COPY packages/integrations packages/integrations
COPY apps/api apps/api
RUN pnpm --filter @online-vip-crm/shared build \
  && pnpm --filter @online-vip-crm/database generate \
  && pnpm --filter @online-vip-crm/database build \
  && pnpm --filter @online-vip-crm/integrations build \
  && pnpm --filter @online-vip-crm/api build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
