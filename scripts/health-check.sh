#!/bin/bash
# Post-deploy smoke test.
# Requires env vars: DOMAIN_NAME, DB_PRIVATE_IP, DB_PASSWORD, REDIS_PASSWORD
set -uo pipefail

echo "=== MedZ Health Check ==="

echo "PM2:"; pm2 status || true

echo "Nginx:"; systemctl is-active nginx || true

echo "Redis:"
redis-cli -a "${REDIS_PASSWORD}" --no-auth-warning ping || true

echo "App /api/health:"
curl -sf "https://${DOMAIN_NAME}/api/health" | python3 -m json.tool || echo "unhealthy"

echo "DB:"
PGPASSWORD="${DB_PASSWORD}" psql \
  "host=${DB_PRIVATE_IP} port=6432 dbname=medz_db user=medz_user sslmode=disable" \
  -c "SELECT 'connected' AS db_status;" 2>&1 | tail -1

echo "=== Done ==="
