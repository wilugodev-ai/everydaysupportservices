FROM node:24.19.0-bookworm-slim AS workspace
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN npm install --global pnpm@12.5.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

FROM workspace AS api-dependencies
RUN pnpm install --frozen-lockfile --prod --filter @everydaysupportservices/api...

FROM workspace AS api-build
RUN pnpm install --frozen-lockfile --prod=false --filter @everydaysupportservices/api...
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/api/src ./apps/api/src
RUN pnpm --filter @everydaysupportservices/api build

FROM node:24.19.0-bookworm-slim AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIRECTORY=/tmp/everyday-runtime
WORKDIR /app
COPY --from=api-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=api-dependencies --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=api-build --chown=node:node /app/apps/api/dist ./apps/api/dist
USER node
WORKDIR /app/apps/api
EXPOSE 8080
CMD ["node", "dist/main.js"]

FROM workspace AS web-build
RUN pnpm install --frozen-lockfile --prod=false --filter @everydaysupportservices/web...
COPY apps/web/tsconfig.json apps/web/next-env.d.ts apps/web/next.config.ts ./apps/web/
COPY apps/web/app ./apps/web/app
RUN CLOUD_RUN_BUILD=1 pnpm --filter @everydaysupportservices/web build

FROM node:24.19.0-bookworm-slim AS web
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=8080 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
