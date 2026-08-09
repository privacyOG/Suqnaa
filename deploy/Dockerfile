# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-bookworm-slim
ARG PNPM_VERSION=9.12.0

FROM node:${NODE_VERSION} AS node-base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /workspace

FROM node-base AS build-deps
ENV NODE_ENV=development
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM build-deps AS source
COPY . .

FROM source AS api-build
RUN pnpm --filter suqnaa-api build

FROM source AS web-build
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_CHALLENGE_SCRIPT_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_CHALLENGE_SCRIPT_URL=${NEXT_PUBLIC_CHALLENGE_SCRIPT_URL}
RUN pnpm --filter suqnaa-web build

FROM node-base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --prod --ignore-scripts=false

FROM node:${NODE_VERSION} AS api
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=4000
WORKDIR /workspace
COPY --from=prod-deps /workspace/node_modules ./node_modules
COPY --from=prod-deps /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=api-build /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=api-build /workspace/apps/api/dist ./apps/api/dist
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]

FROM api AS worker
CMD ["node", "apps/api/dist/workers/notification-delivery-worker.js"]

FROM node:${NODE_VERSION} AS web
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /workspace
COPY --from=prod-deps /workspace/node_modules ./node_modules
COPY --from=prod-deps /workspace/apps/web/node_modules ./apps/web/node_modules
COPY --from=web-build /workspace/apps/web ./apps/web
COPY --from=web-build /workspace/package.json ./package.json
COPY --from=web-build /workspace/pnpm-workspace.yaml ./pnpm-workspace.yaml
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "apps/web", "-H", "0.0.0.0", "-p", "3000"]

FROM node:${NODE_VERSION} AS migrate
ENV NODE_ENV=production
WORKDIR /workspace
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY scripts/migrate-database.mjs scripts/migrate-database.mjs
COPY scripts/migration-lib.mjs scripts/migration-lib.mjs
COPY infra/db/migration-manifest.json infra/db/migration-manifest.json
COPY infra/db/migrations infra/db/migrations
USER node
CMD ["node", "scripts/migrate-database.mjs"]
