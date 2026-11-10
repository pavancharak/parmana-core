#!/usr/bin/env bash
# Smoke test for the parmana CLI image. Needs a running Docker daemon.
# Makes no network calls and needs no token: every check is --help, a dry
# run, or an inspection of the image.
set -euo pipefail

IMAGE="${1:-parmana-cli:2.0.1}"
run() { docker run --rm "$IMAGE" "$@"; }

echo "1. The command starts and lists its commands"
run --help | grep -q "policy status" && echo "   ok"

echo "2. A command's help names its options and environment"
run policy propose --help | grep -q -- "--reason" && echo "   ok"

echo "3. A dry run prints the request with the token masked, and needs no token"
out="$(docker run --rm -e PARMANA_API_URL=https://example.test "$IMAGE" \
  policy status customer-refund 1.3.0 --dry-run)"
echo "$out" | grep -q "Authorization: Bearer \*\*\*" && echo "   ok"

echo "4. The image runs as a non-root user"
uid="$(docker run --rm --entrypoint id "$IMAGE" -u)"
[ "$uid" != "0" ] && echo "   ok (uid $uid)"

echo "5. No token is baked into the image"
if docker image inspect "$IMAGE" --format '{{json .Config.Env}}' | grep -q "PARMANA_TOKEN"; then
  echo "   FAIL: PARMANA_TOKEN is set in the image"; exit 1
fi
echo "   ok"

echo "All checks passed."
