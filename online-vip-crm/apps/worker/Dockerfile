# Online VIP CRM — Worker
FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter @online-vip-crm/worker...

FROM deps AS build
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY packages/database packages/database
COPY apps/worker apps/worker
RUN pnpm --filter @online-vip-crm/shared build \
  && pnpm --filter @online-vip-crm/database generate \
  && pnpm --filter @online-vip-crm/database build \
  && pnpm --filter @online-vip-crm/worker build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
