#!/bin/sh
set -e
# Writes METRICS_BEARER_TOKEN from the environment so prom.yml can use bearer_token_file.
# Set the same variable on the Prometheus Railway service as on mockcoach-ai.
# Path is under /etc/prometheus (not /tmp): /tmp is often tmpfs and can confuse tooling.
SECRETS_DIR=/etc/prometheus/secrets
mkdir -p "$SECRETS_DIR"
umask 077
printf '%s' "${METRICS_BEARER_TOKEN:-}" >"$SECRETS_DIR/mockcoach-ai-bearer"
# Railway health checks hit $PORT; Prometheus defaults to 9090 → "service unavailable" if they differ.
LISTEN_PORT="${PORT:-9090}"
# Self-scrape job uses localhost:9090 in prom.yml; align with LISTEN_PORT (writable copy; prom.yml is root-owned).
RUNTIME_CFG=/tmp/prom.runtime.yml
sed -e "s/localhost:9090/localhost:${LISTEN_PORT}/g" /etc/prometheus/prom.yml >"$RUNTIME_CFG"
# Clear Custom Start Command in Railway so this entrypoint runs (bearer file + flags).
exec /bin/prometheus \
  --config.file="$RUNTIME_CFG" \
  --storage.tsdb.path=/prometheus \
  --web.listen-address="0.0.0.0:${LISTEN_PORT}" \
  --web.enable-remote-write-receiver
