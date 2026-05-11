#!/bin/sh
set -e
# Writes METRICS_BEARER_TOKEN from the environment to a file so prom.yml never
# contains the secret. Set the same variable on the Prometheus Railway service
# as on mockcoach-ai (identical value).
# Use /tmp so the file always exists beside TSDB; some hosts make /prometheus tricky at boot.
SECRETS_DIR=/tmp/prometheus-secrets
mkdir -p "$SECRETS_DIR"
umask 077
printf '%s' "${METRICS_BEARER_TOKEN:-}" >"$SECRETS_DIR/mockcoach-ai-bearer"
exec /bin/prometheus "$@"
