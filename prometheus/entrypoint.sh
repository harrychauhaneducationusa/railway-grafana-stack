#!/bin/sh
set -e
# Writes METRICS_BEARER_TOKEN from the environment so prom.yml can use bearer_token_file.
# Set the same variable on the Prometheus Railway service as on mockcoach-ai.
# Path is under /etc/prometheus (not /tmp): /tmp is often tmpfs and can confuse tooling.
SECRETS_DIR=/etc/prometheus/secrets
mkdir -p "$SECRETS_DIR"
umask 077
printf '%s' "${METRICS_BEARER_TOKEN:-}" >"$SECRETS_DIR/mockcoach-ai-bearer"
# Hardcode args so scraping works even if the platform does not pass Docker CMD through.
exec /bin/prometheus \
  --config.file=/etc/prometheus/prom.yml \
  --storage.tsdb.path=/prometheus
