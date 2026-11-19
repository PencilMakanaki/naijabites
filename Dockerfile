# One container that serves both the API and the React app (same address, so cookies just work).
# Build:  docker build -t naijabites .
# Run:    docker run --env-file .env -p 3000:3000 naijabites     (set APP_ORIGIN and NODE_ENV=production)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY shared shared
COPY client client
RUN npm run build -w client

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --workspace=server --workspace=shared --include-workspace-root=false; else npm install --omit=dev --workspace=server --workspace=shared --include-workspace-root=false; fi
COPY shared shared
COPY server server
COPY --from=build /app/client/dist client/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/v1/health || exit 1
CMD ["node", "server/src/index.js"]
