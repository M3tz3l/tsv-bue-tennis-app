# Observability stack

Self-hosted log history for the TSV Tennis app:

- **Grafana Alloy** discovers Docker containers and ships their stdout/stderr to Loki.
- **Loki** stores logs on a persistent volume with configurable retention.
- **Grafana** provides search and a provisioned "TSV Tennis logs" dashboard.

The stack runs as its own Compose project, so app deployments do not restart
the logging services.

## Prerequisites

1. Create a DNS `A` (or `AAAA`) record for `grafana.tsv-bue-tennis.de` pointing
   at the VPS. Traefik obtains the TLS certificate automatically.
2. The external `traefik_proxy` Docker network must already exist.
3. `/var/run/docker.sock` must be readable by the Docker daemon's client (the
   stack mounts it read-only into Alloy).

## Deploy

The `Deploy to VPS` workflow copies this directory to
`/opt/stacks/observability` and starts it on every push to
`main`. On the first run it creates `/opt/stacks/observability/.env` with a
random Grafana admin password if the file does not exist.

Retrieve the generated password once:

```bash
sudo cat /opt/stacks/observability/.env
```

Then open <https://grafana.tsv-bue-tennis.de> and log in as `admin`.

To change the hostname, password, or retention, edit
`/opt/stacks/observability/.env` and run:

```bash
cd /opt/stacks/observability
docker-compose -f compose.yaml up -d
```

## Manual startup

```bash
cd observability
cp .env.example .env
# edit .env and set GRAFANA_ADMIN_PASSWORD
docker-compose -f compose.yaml up -d
```

## Data and retention

- Loki data: Docker volume `observability_loki_data`
- Grafana data: Docker volume `observability_grafana_data`
- Alloy positions: Docker volume `observability_alloy_data`
- Default retention: 30 days (`LOKI_RETENTION=720h`)

Loki runs the compactor with retention enabled, so expired chunks are deleted
from disk.

## Security notes

Alloy mounts the Docker socket read-only, but Docker API access is still
powerful. Keep the host restricted to trusted administrators. Grafana is exposed
through Traefik with authentication enabled; do not enable anonymous access.

## Useful queries

```logql
# Everything from the app
{service="tsv-tennis-app"}

# Only warnings and errors (requires LOG_FORMAT=json)
{service="tsv-tennis-app"} | json | level=~"WARN|ERROR"

# Find one request by ID
{service="tsv-tennis-app"} |= "REQUEST_ID_HERE"
```
