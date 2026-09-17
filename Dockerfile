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

# The same three Supabase vars the Hostinger build uses. VITE_API_BASE is gone with
# cache-api: search and product detail call the Supabase edge functions directly now,
# exactly as production does.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

RUN bun run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
