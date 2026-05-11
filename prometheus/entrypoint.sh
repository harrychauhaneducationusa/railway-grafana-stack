#!/bin/sh
set -e
# Writes METRICS_BEARER_TOKEN from the environment so prom.yml can use bearer_token_file.
# Set the same variable on the Prometheus Railway service as on mockcoach-ai.
# Path is under /etc/prometheus (not /tmp): /tmp is often tmpfs and can confuse tooling.
SECRETS_DIR=/etc/prometheus/secrets
mkdir -p "$SECRETS_DIR"
umask 077
printf '%s' "${METRICS_BEARER_TOKEN:-}" >"$SECRETS_DIR/mockcoach-ai-bearer"
# Keep flags in sync with what you used in Railway "Custom Start Command" before:
# that field replaces the image ENTRYPOINT, so the bearer file above never ran.
# Clear Custom Start Command in Railway and rely on this script instead.
exec /bin/prometheus \
  --config.file=/etc/prometheus/prom.yml \
  --storage.tsdb.path=/prometheus \
  --web.enable-remote-write-receiver
