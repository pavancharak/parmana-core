# syntax=docker/dockerfile:1
#
# Multi-stage build for @parmana/api. Platform-agnostic (Dockerfile-first):
# builds a single container image that runs the HTTP API (docker/entrypoint.sh
# starts it and forwards termination signals to it).
# Works unmodified on any Docker-based PaaS (Railway, Render, Fly, a bare
# `docker run`, ...).
#
# The list of packages/*/package.json COPY lines below is intentionally
# explicit rather than a single `COPY packages ./packages` glob: it lets
# stage 1 (deps) cache correctly on dependency changes without being
# invalidated by every source edit, which a whole-directory copy would
# defeat.

################################################################################
# Stage 1: deps -- full (dev+prod) install, needed to run `tsc -b` across
# the whole TypeScript project-reference graph.
################################################################################
FROM node:24@sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0 AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/approval/package.json packages/approval/package.json
COPY packages/capability-registry/package.json packages/capability-registry/package.json
COPY packages/connector-github/package.json packages/connector-github/package.json
COPY packages/connector-hubspot/package.json packages/connector-hubspot/package.json
COPY packages/connector-paytm/package.json packages/connector-paytm/package.json
COPY packages/connector-sdk/package.json packages/connector-sdk/package.json
COPY packages/connector-slack/package.json packages/connector-slack/package.json
COPY packages/crypto/package.json packages/crypto/package.json
COPY packages/envelope-verifier/package.json packages/envelope-verifier/package.json
COPY packages/execution-control/package.json packages/execution-control/package.json
COPY packages/execution-gateway/package.json packages/execution-gateway/package.json
COPY packages/execution-system/package.json packages/execution-system/package.json
COPY packages/governance-ui/package.json packages/governance-ui/package.json
COPY packages/policy/package.json packages/policy/package.json
COPY packages/replay/package.json packages/replay/package.json
COPY packages/runtime/package.json packages/runtime/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY typescript/package.json typescript/package.json

RUN npm ci

################################################################################
# Stage 2: build -- compiles every workspace package to dist/ via tsc -b,
# the same command local dev and CI use (npm run build:verbose without the
# openapi bundling step -- openapi/openapi.bundled.yaml is committed and
# copied forward as-is in the runtime stage; regenerating it needs
# `redocly bundle`, a docs/spec-authoring concern, not a runtime one).
################################################################################
FROM deps AS build
WORKDIR /app

COPY tsconfig.json ./
COPY packages ./packages
COPY typescript ./typescript

# Compile only parmana-api and its dependencies, with TypeScript 7 (the
# typescript7 alias; the typescript package stays on 6 for tools that need
# the compiler API, see docs/adr/ADR-0015).
RUN node node_modules/typescript7/bin/tsc --build packages/api

################################################################################
# Stage 3: prod-deps -- a second, independent `npm ci --omit=dev`. Kept as
# its own fresh install (not a prune of stage 1's tree) because correctly
# pruning an npm-workspaces node_modules in place is fragile with
# hoisting; a second install from the same lockfile is simpler and more
# reliable, at the cost of a slower build (acceptable trade-off here).
################################################################################
FROM node:24@sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0 AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/approval/package.json packages/approval/package.json
COPY packages/capability-registry/package.json packages/capability-registry/package.json
COPY packages/connector-github/package.json packages/connector-github/package.json
COPY packages/connector-hubspot/package.json packages/connector-hubspot/package.json
COPY packages/connector-paytm/package.json packages/connector-paytm/package.json
COPY packages/connector-sdk/package.json packages/connector-sdk/package.json
COPY packages/connector-slack/package.json packages/connector-slack/package.json
COPY packages/crypto/package.json packages/crypto/package.json
COPY packages/envelope-verifier/package.json packages/envelope-verifier/package.json
COPY packages/execution-control/package.json packages/execution-control/package.json
COPY packages/execution-gateway/package.json packages/execution-gateway/package.json
COPY packages/execution-system/package.json packages/execution-system/package.json
COPY packages/governance-ui/package.json packages/governance-ui/package.json
COPY packages/policy/package.json packages/policy/package.json
COPY packages/replay/package.json packages/replay/package.json
COPY packages/runtime/package.json packages/runtime/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY typescript/package.json typescript/package.json

RUN npm ci --omit=dev

################################################################################
# Stage 4: runtime -- the image the platform actually runs.
#
# node:24-slim, not -alpine: docker/entrypoint.sh is a small bash
# supervisor (see that file's own comment for why bash specifically --
# `wait -n`, not available in POSIX sh/dash or BusyBox ash), and
# node:24-slim ships bash by default. Chasing alpine's smaller base would
# mean `apk add bash` anyway, for savings this stage doesn't need.
#
# Runs as the non-root `node` user node:24-slim already provides (uid
# 1000) -- never root.
################################################################################
FROM node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Fixed paths within this image (policies/ is baked in; keys/ starts
# empty -- see the keys/ comment below). Overridable if a platform
# mounts a different policy set or key location, but a sensible default
# so most deployments don't need to set these at all.
ENV PARMANA_POLICY_DIR=./policies
ENV PARMANA_KEY_DIR=./keys

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY package.json package-lock.json ./
COPY openapi ./openapi
COPY docs/site/parmana-handbook.pdf ./docs/site/parmana-handbook.pdf
COPY policies ./policies
COPY scripts ./scripts
COPY docker/entrypoint.sh ./docker/entrypoint.sh

# keys/ is deliberately NOT copied from the build context (see
# .dockerignore) -- signing key material must never be baked into an
# image. An empty directory here satisfies FileKeyProvider's existsSync
# check structurally; assertSigningKeyMaterialConfigured.ts fails closed
# at boot if it's still empty and PARMANA_KEY_MATERIAL_JSON is also
# unset. See docs/site/deployment/production.mdx for the mount-vs-env-var production paths.
RUN mkdir -p /app/keys \
  && chmod +x ./docker/entrypoint.sh \
  && chown -R node:node /app

USER node

EXPOSE 3000

ENTRYPOINT ["/app/docker/entrypoint.sh"]
