#!/bin/bash
# MedZ app droplet bootstrap.
#
# Placeholders required before running:
#   DOMAIN_NAME, GITHUB_REPO, DB_PRIVATE_IP, DB_PASSWORD,
#   REDIS_PASSWORD, JWT_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY,
#   SERVICE_ROLE_KEY, IP_SALT
set -euo pipefail

: "${DOMAIN_NAME:?}" "${GITHUB_REPO:?}" "${DB_PRIVATE_IP:?}"
: "${DB_PASSWORD:?}" "${REDIS_PASSWORD:?}" "${JWT_SECRET:?}"
: "${SUPABASE_URL:?}" "${SUPABASE_ANON_KEY:?}" "${SERVICE_ROLE_KEY:?}"
: "${IP_SALT:?}"

echo "=== MedZ App Droplet Setup ==="

apt-get update -y && apt-get upgrade -y
apt-get install -y curl git nginx certbot python3-certbot-nginx ufw \
  redis-server ca-certificates gnupg

# --- Node.js 20 ------------------------------------------------------------
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pm2

# --- Redis (local cache + rate limiter fallback) ---------------------------
cat > /etc/redis/redis.conf <<REDIS
bind 127.0.0.1
requirepass ${REDIS_PASSWORD}
maxmemory 1gb
maxmemory-policy allkeys-lru
appendonly yes
REDIS
systemctl restart redis-server
systemctl enable redis-server

# --- App -------------------------------------------------------------------
mkdir -p /var/www/medz /var/log/medz
cd /var/www/medz
if [ ! -d .git ]; then
  git clone "${GITHUB_REPO}" .
fi
npm ci --production=false

cat > .env.production <<ENV
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://${DOMAIN_NAME}
DATABASE_URL=postgresql://medz_user:${DB_PASSWORD}@${DB_PRIVATE_IP}:6432/medz_db
REDIS_URL=redis://:${REDIS_PASSWORD}@127.0.0.1:6379
JWT_SECRET=${JWT_SECRET}
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
IP_SALT=${IP_SALT}
ENV
chmod 600 .env.production

npm run build

cat > ecosystem.config.js <<PM2
module.exports = {
  apps: [{
    name: 'medz',
    script: 'node_modules/.bin/next',
    args: 'start',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: { NODE_ENV: 'production', PORT: 3000 },
    max_memory_restart: '1G',
    error_file: '/var/log/medz/error.log',
    out_file: '/var/log/medz/out.log',
  }],
};
PM2

pm2 start ecosystem.config.js --env production
pm2 startup systemd -u root --hp /root | tail -1 | bash
pm2 save

# --- Firewall --------------------------------------------------------------
ufw default deny incoming
ufw default allow outgoing
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

echo "=== App Setup Complete ==="
echo "Next: place nginx/medz.conf, then run certbot --nginx -d ${DOMAIN_NAME}"
