FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/web/package.json ./packages/web/
COPY packages/engine/package.json ./packages/engine/
COPY packages/worker/package.json ./packages/worker/
RUN pnpm install --frozen-lockfile

# Build engine
FROM base AS engine-build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/engine/node_modules ./packages/engine/node_modules
COPY packages/engine ./packages/engine
COPY tsconfig.json ./
RUN cd packages/engine && pnpm build

# Web target
FROM base AS web
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=engine-build /app/packages/engine/dist ./packages/engine/dist
COPY --from=engine-build /app/packages/engine/package.json ./packages/engine/
COPY packages/web ./packages/web
COPY tsconfig.json ./
RUN cd packages/web && pnpm build
EXPOSE 3000
CMD ["node", "packages/web/.next/standalone/server.js"]

# Worker target — includes static analysis tools
FROM base AS worker

# Install system deps for static analysis tools
RUN apk add --no-cache \
    python3 \
    py3-pip \
    git \
    curl \
    bash

# Install static analysis tools
RUN pip3 install --break-system-packages \
    slither-analyzer \
    semgrep

# Install gitleaks
RUN GITLEAKS_VERSION=$(curl -s https://api.github.com/repos/gitleaks/gitleaks/releases/latest | grep -o '"tag_name": "v[^"]*"' | grep -o 'v[^"]*') && \
    curl -sSL "https://github.com/gitleaks/gitleaks/releases/download/${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION#v}_linux_x64.tar.gz" | tar -xz -C /usr/local/bin gitleaks && \
    chmod +x /usr/local/bin/gitleaks

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/worker/node_modules ./packages/worker/node_modules
COPY --from=engine-build /app/packages/engine/dist ./packages/engine/dist
COPY --from=engine-build /app/packages/engine/package.json ./packages/engine/
COPY packages/worker ./packages/worker
COPY tsconfig.json ./
RUN cd packages/worker && pnpm build
CMD ["node", "packages/worker/dist/index.js"]
