# Stage 1: Install & Build
FROM oven/bun:1.3.9-slim AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .

# Stage 2: Production Runner
FROM oven/bun:1.3.9-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

USER bun
EXPOSE 10000
CMD ["bun", "run", "src/index.ts"]
