# VPS Deployment With Docker And Nginx

This deployment path is designed for a simple single-server pilot.

## What This Setup Does

- runs the Next.js app in Docker
- stores SQLite in a persistent Docker volume
- initializes the SQLite schema on first start
- optionally seeds demo data on first start
- puts Nginx in front of the app on port `80`

## Prerequisites

- Ubuntu 22.04 or 24.04 VPS
- Docker Engine installed
- Docker Compose plugin installed
- a domain or server IP

## Files Used

- `Dockerfile`
- `docker-compose.vps.yml`
- `.env.production.example`
- `deploy/docker/entrypoint.sh`
- `deploy/nginx/default.conf`

## Server Setup

1. Copy the app folder to the VPS.
2. On the server, create the production env file:

```bash
cp .env.production.example .env.production
```

3. Edit `.env.production`:

```env
DATABASE_URL="file:/app/data/app.db"
NEXTAUTH_SECRET="replace-with-a-long-random-secret"
NEXTAUTH_URL="http://your-server-ip-or-domain"
SEED_DEMO_DATA="false"
```

Notes:

- Set `NEXTAUTH_URL` to your real server URL.
- Use `SEED_DEMO_DATA="true"` only if you want the demo accounts on first boot.
- For a real deployment, leave seeding off and create users manually later.
- Do not enable demo seeding against an existing database volume.

## Start The Stack

```bash
docker compose -f docker-compose.vps.yml up -d --build
```

Then open:

- `http://your-server-ip-or-domain/login`

## Useful Commands

View logs:

```bash
docker compose -f docker-compose.vps.yml logs -f
```

Restart:

```bash
docker compose -f docker-compose.vps.yml restart
```

Stop:

```bash
docker compose -f docker-compose.vps.yml down
```

Rebuild after code changes:

```bash
docker compose -f docker-compose.vps.yml up -d --build
```

## Firewall

Open port `80` on the VPS firewall and cloud firewall.

Example with UFW:

```bash
sudo ufw allow 80/tcp
sudo ufw enable
```

## Persistence

SQLite is stored in the Docker volume `app_data`.

That means:

- app restarts do not remove the database
- container recreation does not remove the database
- deleting the volume will remove all app data

## HTTPS

This simple stack is HTTP-only by default.

For public use, add one of these in front:

- Cloudflare proxy with origin locked down
- host-level Nginx + Certbot
- a later deployment pass that adds TLS certificates into the Docker Nginx setup

## Limits Of This Simple VPS Mode

- single-server only
- SQLite only
- not horizontally scalable
- suitable for pilots and internal use, not a hardened multi-instance production setup
