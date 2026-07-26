#!/bin/bash
# MedZ DB droplet bootstrap.
#
# Idempotent-ish: safe to re-run, but do NOT re-run after real users
# exist without commenting out the CREATE DATABASE block first.
#
# Replace the placeholders before running:
#   DB_PRIVATE_IP    — the droplet's internal IP
#   APP_PRIVATE_IP   — the app droplet's internal IP (allowed source)
#   DB_PASSWORD      — a 32+ char random string
set -euo pipefail

: "${DB_PRIVATE_IP:?set DB_PRIVATE_IP}"
: "${APP_PRIVATE_IP:?set APP_PRIVATE_IP}"
: "${DB_PASSWORD:?set DB_PASSWORD (>= 32 chars)}"

echo "=== MedZ DB Droplet Setup ==="

apt-get update -y && apt-get upgrade -y
apt-get install -y curl gnupg2 ufw pgbouncer lsb-release ca-certificates

# --- PostgreSQL 15 ---------------------------------------------------------
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list
apt-get update -y
apt-get install -y postgresql-15 postgresql-contrib-15

# Tuned for 16GB RAM.
cat > /etc/postgresql/15/main/postgresql.conf <<PGCONF
listen_addresses = 'localhost,${DB_PRIVATE_IP}'
port = 5432
max_connections = 200
shared_buffers = 4GB
effective_cache_size = 12GB
work_mem = 64MB
maintenance_work_mem = 1GB
wal_buffers = 64MB
checkpoint_completion_target = 0.9
random_page_cost = 1.1
effective_io_concurrency = 200
log_min_duration_statement = 500
log_connections = on
PGCONF

cat > /etc/postgresql/15/main/pg_hba.conf <<PGHBA
local all postgres peer
local all all peer
host all all 127.0.0.1/32 scram-sha-256
host medz_db medz_user ${APP_PRIVATE_IP}/32 scram-sha-256
PGHBA

systemctl restart postgresql
systemctl enable postgresql

sudo -u postgres psql <<SQL
CREATE USER medz_user WITH PASSWORD '${DB_PASSWORD}';
CREATE DATABASE medz_db OWNER medz_user;
GRANT ALL PRIVILEGES ON DATABASE medz_db TO medz_user;
\\c medz_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
GRANT ALL ON SCHEMA public TO medz_user;
SQL

# --- PgBouncer -------------------------------------------------------------
cat > /etc/pgbouncer/pgbouncer.ini <<BOUNCER
[databases]
medz_db = host=localhost port=5432 dbname=medz_db

[pgbouncer]
listen_port = 6432
listen_addr = *
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
reserve_pool_size = 10
server_idle_timeout = 600
BOUNCER

printf '"medz_user" "%s"\n' "${DB_PASSWORD}" > /etc/pgbouncer/userlist.txt
chown postgres:postgres /etc/pgbouncer/userlist.txt
chmod 640 /etc/pgbouncer/userlist.txt

systemctl restart pgbouncer
systemctl enable pgbouncer

# --- Firewall --------------------------------------------------------------
ufw default deny incoming
ufw default allow outgoing
ufw allow 22
ufw allow from "${APP_PRIVATE_IP}" to any port 5432
ufw allow from "${APP_PRIVATE_IP}" to any port 6432
ufw --force enable

echo "=== DB Setup Complete ==="
