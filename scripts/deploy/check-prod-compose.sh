#!/usr/bin/env bash
# Static check of the production compose overlay. Renders the merged config with
# dummy secrets and asserts: no published ports outside the debug profile, a
# cloudflared service, and no default postgres:postgres connection URL.
set -euo pipefail
cd "$(dirname "$0")/../.."

POSTGRES_PASSWORD=check-prod-compose-dummy \
CLOUDFLARE_TUNNEL_TOKEN=check-prod-compose-dummy \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile debug \
  config --format json | python3 -c '
import json, sys

services = json.load(sys.stdin)["services"]
DB_URLS = ("POSTGRES_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING")
errors = []
for name, svc in services.items():
    ports = svc.get("ports")
    if ports and "debug" not in (svc.get("profiles") or []):
        errors.append(f"service {name} publishes ports: {ports}")
    env = svc.get("environment") or {}
    for key in DB_URLS:
        if "postgres:postgres@" in str(env.get(key, "")):
            errors.append(f"service {name} {key} uses the default postgres password")
if (services.get("postgres", {}).get("environment") or {}).get("POSTGRES_PASSWORD") == "postgres":
    errors.append("postgres service uses the default password")
if "cloudflared" not in services:
    errors.append("no cloudflared service")
if "debug" not in (services.get("pgadmin", {}).get("profiles") or []):
    errors.append("pgadmin is not behind the debug profile")

for e in errors:
    print(f"FAIL: {e}")
if errors:
    sys.exit(1)
print(f"OK: {len(services)} services, no public ports outside debug, cloudflared present, no default DB password")
'
