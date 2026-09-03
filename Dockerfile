# Staging-only image for the VPS instance. Production still deploys via the existing
# GitHub Actions -> Hostinger FTP workflow (.github/workflows/deploy.yml); this file has
# no effect on that path.

# Matches .github/workflows/deploy.yml exactly (oven-sh/setup-bun + bun install/build):
# this repo's canonical lockfile is bun.lock. package-lock.json exists in the tree but
# has drifted out of sync with package.json, and `npm ci` refuses to build against a
# stale lock — building with bun avoids that entire class of failure and keeps this
# image's dependency resolution identical to what already ships to production.
FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Same three Supabase vars the existing Hostinger build uses, plus VITE_API_BASE, which
# points the search/product-detail hot paths at this instance's cache-api instead of the
# Supabase edge functions. Left unset, alibaba1688Api falls back to the edge functions —
# see src/lib/api/alibaba1688.ts.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_API_BASE=/api
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_API_BASE=$VITE_API_BASE

RUN bun run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
