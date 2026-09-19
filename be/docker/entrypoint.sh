#!/bin/sh
set -eu

# Production CI/CD runs migration before replacing the application.
# Local full-stack Compose can opt in explicitly.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  npx prisma migrate deploy
fi
exec node dist/src/main.js
