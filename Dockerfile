# Stage 1: Builder
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY pkgs/contract/package.json ./pkgs/contract/package.json
COPY pkgs/cli/package.json ./pkgs/cli/package.json

RUN npm ci

COPY pkgs/contract/ ./pkgs/contract/
COPY pkgs/cli/ ./pkgs/cli/

RUN npm run build

# Stage 2: Production
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/pkgs/contract/package.json ./pkgs/contract/package.json
COPY --from=builder /app/pkgs/contract/dist ./pkgs/contract/dist
COPY --from=builder /app/pkgs/cli/package.json ./pkgs/cli/package.json
COPY --from=builder /app/pkgs/cli/dist ./pkgs/cli/dist
COPY --from=builder /app/pkgs/cli/public ./pkgs/cli/public
COPY --from=builder /app/node_modules ./node_modules

VOLUME /app/db

ENV PRIVATE_STATE_DIR=/app/db

EXPOSE 3000

CMD ["node", "pkgs/cli/dist/index.js", "relayer"]
