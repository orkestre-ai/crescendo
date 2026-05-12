# Docker Setup Guide

**Created**: 2025-10-17  
**Last Updated**: 2025-11-26  
**Status**: Active

Complete guide for running PostgreSQL and pgAdmin using Docker for local development.

**Time estimate**: 10-15 minutes (first time)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Starting the Database](#starting-the-database)
3. [Accessing pgAdmin](#accessing-pgadmin)
4. [Connecting pgAdmin to PostgreSQL](#connecting-pgadmin-to-postgresql)
5. [Verifying the Setup](#verifying-the-setup)
6. [Stopping the Database](#stopping-the-database)
7. [Data Persistence](#data-persistence)
8. [Cleanup and Reset](#cleanup-and-reset)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Install Docker Desktop

Docker Desktop includes Docker Engine and Docker Compose, which are both required.

#### Mac

1. Download Docker Desktop for Mac:
   - **Apple Silicon (M1/M2/M3)**: [Download ARM64](https://desktop.docker.com/mac/main/arm64/Docker.dmg)
   - **Intel**: [Download AMD64](https://desktop.docker.com/mac/main/amd64/Docker.dmg)
2. Open the downloaded `.dmg` file
3. Drag Docker to Applications folder
4. Open Docker from Applications
5. Follow setup wizard
6. Docker icon will appear in menu bar when running

#### Windows

1. **Enable WSL 2** (Windows Subsystem for Linux):
   - Open PowerShell as Administrator
   - Run: `wsl --install`
   - Restart computer if prompted
2. Download Docker Desktop for Windows:
   - [Download](https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe)
3. Run the installer
4. Follow setup wizard (enable WSL 2 backend when prompted)
5. Restart computer if prompted
6. Launch Docker Desktop from Start menu

#### Linux

1. Follow official installation guide for your distribution:
   - Ubuntu: [Install Docker Engine](https://docs.docker.com/engine/install/ubuntu/)
   - Debian: [Install Docker Engine](https://docs.docker.com/engine/install/debian/)
   - Fedora: [Install Docker Engine](https://docs.docker.com/engine/install/fedora/)
2. Install Docker Compose:
   ```bash
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

### Verify Installation

Check that Docker is installed correctly:

```bash
# Check Docker version
docker --version
# Expected: Docker version 24.0.0 or higher

# Check Docker Compose version
docker-compose --version
# Expected: Docker Compose version v2.20.0 or higher

# Verify Docker is running
docker ps
# Expected: Empty list or running containers (no errors)
```

---

## Starting the Database

The `docker-compose.yml` file defines two services:

- **postgres**: PostgreSQL 15 database
- **pgadmin**: pgAdmin 4 web interface

### Start All Services

From the project root directory:

```bash
docker-compose up -d
```

**Flags explained**:

- `up`: Start services defined in docker-compose.yml
- `-d`: Detached mode (run in background)

**Expected output**:

```
[+] Running 3/3
 ✔ Network crescendo-network    Created
 ✔ Container crescendo-db        Started
 ✔ Container crescendo-pgadmin   Started
```

### Verify Services Are Running

```bash
docker-compose ps
```

**Expected output**:

```
NAME                   IMAGE                  STATUS
crescendo-db        postgres:15-alpine     Up (healthy)
crescendo-pgadmin   dpage/pgadmin4:latest  Up
```

**Key indicators**:

- STATUS should be "Up" for both services
- postgres should show "(healthy)" after 10-15 seconds

### View Service Logs

To see what's happening:

```bash
# View all logs
docker-compose logs

# Follow logs in real-time
docker-compose logs -f

# View logs for specific service
docker-compose logs postgres
docker-compose logs pgadmin

# Last 50 lines
docker-compose logs --tail=50
```

**Tip**: Use `Ctrl+C` to exit log view (services keep running)

---

## Accessing pgAdmin

pgAdmin is a web-based PostgreSQL management tool that lets you visually explore and manage your database.

### Open pgAdmin

1. Make sure services are running: `docker-compose ps`
2. Open your web browser
3. Navigate to: [http://localhost:50500](http://localhost:50500)
4. Login with default credentials:
   - **Email**: `admin@localhost.com`
   - **Password**: `admin`

**Note**: These are local-only credentials. Change them in production.

### First-Time Setup

On first login, pgAdmin may show a setup wizard. You can skip it and proceed to connect to the database.

---

## Connecting pgAdmin to PostgreSQL

Once logged into pgAdmin, you need to register your PostgreSQL server.

### Add New Server

1. In pgAdmin, right-click **"Servers"** in the left sidebar
2. Select **"Create"** → **"Server..."**
3. In the popup dialog, fill in the **General** tab:
   - **Name**: `Crescendo Local`

4. Switch to the **Connection** tab:
   - **Host name/address**: `postgres` (this is the Docker service name)
   - **Port**: `5432` (internal Docker port - use 5432 here)
   - **Maintenance database**: `crescendo`
   - **Username**: `postgres`
   - **Password**: `postgres`
   - **Save password**: Check this box

5. Click **"Save"**

**Note**: When connecting from pgAdmin (running inside Docker), use port `5432` (the internal Docker port). When connecting from your host machine (like your app), use port `54320` (the mapped host port).

### Verify Connection

You should now see "Crescendo Local" in the left sidebar under Servers. Click to expand:

```
Servers
  └─ Crescendo Local
      └─ Databases (1)
          └─ crescendo
```

**Common Issues**:

- If connection fails, verify PostgreSQL is running: `docker-compose ps`
- Wait 30 seconds for PostgreSQL to fully initialize
- Check PostgreSQL logs: `docker-compose logs postgres`

---

## Verifying the Setup

### Test Database Connection

#### Option 1: Using psql (Command Line)

```bash
# Connect to PostgreSQL from host machine
docker exec -it crescendo-db psql -U postgres -d crescendo
```

**In the psql prompt**:

```sql
-- Check connection
SELECT version();

-- List databases
\l

-- List tables (will be empty before Prisma migration)
\dt

-- Exit psql
\q
```

#### Option 2: Using pgAdmin (Visual)

1. In pgAdmin, expand: **Crescendo Local** → **Databases** → **crescendo**
2. Right-click **crescendo** → **Query Tool**
3. Run a test query:
   ```sql
   SELECT version();
   ```
4. Click **Execute** (▶️ button or F5)
5. You should see PostgreSQL version information

### Check Docker Network

```bash
# List Docker networks
docker network ls

# Inspect crescendo network
docker network inspect crescendo-network
```

You should see both containers connected to the network.

---

## Stopping the Database

### Stop Services (Preserve Data)

To stop the containers but keep all data:

```bash
docker-compose stop
```

This stops the containers but keeps volumes intact. Data persists when you restart.

### Start Again

```bash
docker-compose start
```

Containers resume with all previous data.

### Stop and Remove Containers

```bash
docker-compose down
```

This:

- Stops all containers
- Removes containers
- Removes network
- **Keeps volumes** (data is preserved)

---

## Data Persistence

### How Data Persists

Docker volumes store database data outside containers:

```bash
# List volumes
docker volume ls | grep crescendo

# Expected output:
# crescendo_postgres_data
# crescendo_pgadmin_data
```

**Key Points**:

- Data survives container restarts
- Data survives `docker-compose down`
- Data is deleted only with `docker-compose down -v`

### Backup Database

Create a backup file:

```bash
# Backup to SQL file
docker exec -it crescendo-db pg_dump -U postgres crescendo > backup.sql

# Backup with compression
docker exec -it crescendo-db pg_dump -U postgres crescendo | gzip > backup.sql.gz
```

### Restore Database

Restore from backup file:

```bash
# Restore from SQL file
docker exec -i crescendo-db psql -U postgres crescendo < backup.sql

# Restore from compressed backup
gunzip -c backup.sql.gz | docker exec -i crescendo-db psql -U postgres crescendo
```

---

## Cleanup and Reset

### Remove Everything (Including Data)

**WARNING**: This deletes all database data permanently.

```bash
# Stop and remove containers, networks, AND volumes
docker-compose down -v
```

### Confirm Deletion

```bash
# Verify volumes are gone
docker volume ls | grep crescendo

# Should return nothing
```

### Start Fresh

```bash
# Recreate everything from scratch
docker-compose up -d

# Wait for health check
docker-compose ps

# Apply migrations (creates all tables on a fresh DB; idempotent on existing)
npx prisma migrate deploy
```

> Crescendo uses a managed migration workflow. To make schema changes:
> 1. Edit `prisma/schema.prisma`
> 2. Run `npx prisma migrate dev --name <descriptive_name>` to generate a migration
> 3. Commit both `schema.prisma` and the new `prisma/migrations/<timestamp>_<name>/` directory

---

## Troubleshooting

### PostgreSQL Won't Start

#### Symptoms

- `docker-compose ps` shows postgres as "Restarting" or "Unhealthy"
- Can't connect to database

#### Solutions

1. **Check logs**:

   ```bash
   docker-compose logs postgres
   ```

2. **Port conflict** (Port 54320 already in use):

   ```bash
   # Check what's using port 54320
   lsof -i :54320  # Mac/Linux
   netstat -ano | findstr :54320  # Windows

   # Stop conflicting service
   # On Mac: brew services stop postgresql
   # On Linux: sudo systemctl stop postgresql
   ```

3. **Permission issues** (especially on Linux):

   ```bash
   # Fix volume permissions
   sudo chown -R $USER:$USER ~/.docker
   ```

4. **Corrupted volume**:
   ```bash
   # Remove and recreate
   docker-compose down -v
   docker-compose up -d
   ```

### pgAdmin Won't Start

#### Symptoms

- Can't access http://localhost:50500
- pgAdmin shows "Connection refused"

#### Solutions

1. **Check if pgAdmin is running**:

   ```bash
   docker-compose ps pgadmin
   ```

2. **Port conflict** (Port 50500 already in use):

   ```bash
   # Edit docker-compose.yml and change port mapping
   # From: "50500:80"
   # To: "50501:80"
   # Then restart: docker-compose up -d
   ```

3. **Wait for PostgreSQL**:
   - pgAdmin depends on PostgreSQL
   - Wait for postgres to be "healthy" first
   ```bash
   # Watch health status
   watch docker-compose ps
   ```

### Can't Connect to Database from App

#### Symptoms

- Prisma can't connect
- "Connection refused" or "Cannot connect to database"

#### Solutions

1. **Verify connection string in .env.local**:

   ```env
   # Must match docker-compose.yml settings
   # Use port 54320 (host port), not 5432 (internal Docker port)
   POSTGRES_URL="postgresql://postgres:postgres@localhost:54320/crescendo"
   ```

2. **Check PostgreSQL is accessible**:

   ```bash
   # Test connection from host
   psql postgresql://postgres:postgres@localhost:54320/crescendo
   ```

3. **Firewall blocking connection**:
   - Mac: System Preferences → Security & Privacy → Firewall
   - Windows: Windows Defender Firewall → Allow an app
   - Linux: `sudo ufw allow 54320`

### Slow Performance

#### Symptoms

- Queries take a long time
- Docker consuming high CPU/memory

#### Solutions

1. **Increase Docker resources**:
   - Docker Desktop → Preferences → Resources
   - Increase CPUs: 4+
   - Increase Memory: 4GB+

2. **Check Docker stats**:

   ```bash
   docker stats crescendo-db
   ```

3. **Optimize PostgreSQL config** (advanced):
   - Edit `docker-compose.yml`
   - Add under postgres environment:
     ```yaml
     command:
       - 'postgres'
       - '-c'
       - 'shared_buffers=256MB'
       - '-c'
       - 'max_connections=100'
     ```

### Docker Desktop Not Starting

#### Mac

```bash
# Reset Docker Desktop
rm -rf ~/Library/Group\ Containers/group.com.docker
rm -rf ~/Library/Containers/com.docker.docker
rm -rf ~/.docker

# Reinstall Docker Desktop
```

#### Windows

```bash
# Reset Docker Desktop
# Settings → Troubleshoot → Reset to factory defaults
```

### "No space left on device"

#### Solution

```bash
# Clean up Docker system
docker system prune -a --volumes

# This removes:
# - Stopped containers
# - Unused networks
# - Unused images
# - Unused volumes
```

---

## Advanced Configuration

### Change Database Credentials

Edit `docker-compose.yml`:

```yaml
environment:
  POSTGRES_USER: myuser # Change this
  POSTGRES_PASSWORD: mypassword # Change this
  POSTGRES_DB: my_database # Change this
```

**Important**: Also update `.env.local` connection strings to match.

### Access PostgreSQL from Other Machines

By default, PostgreSQL only accepts local connections. To allow remote access:

1. Add to `docker-compose.yml` under postgres:

   ```yaml
   environment:
     - POSTGRES_HOST_AUTH_METHOD=md5
   ports:
     - '0.0.0.0:54320:5432' # Listen on all interfaces (host:container)
   ```

2. Update connection string:
   ```env
   POSTGRES_URL="postgresql://postgres:postgres@YOUR_MACHINE_IP:54320/crescendo"
   ```

**Security Warning**: Only do this on trusted networks. Use strong passwords.

### Use Different PostgreSQL Version

Edit `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine # Change version here
```

Supported versions: 12, 13, 14, 15, 16

---

## Quick Reference

### Common Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose stop

# Restart services
docker-compose restart

# View logs
docker-compose logs -f

# Check status
docker-compose ps

# Remove containers (keep data)
docker-compose down

# Remove everything (including data)
docker-compose down -v

# Connect to PostgreSQL
docker exec -it crescendo-db psql -U postgres -d crescendo

# Backup database
docker exec -it crescendo-db pg_dump -U postgres crescendo > backup.sql

# Restore database
docker exec -i crescendo-db psql -U postgres crescendo < backup.sql
```

### URLs

- **pgAdmin**: http://localhost:50500
- **PostgreSQL**: localhost:54320

### Default Credentials

**PostgreSQL**:

- User: `postgres`
- Password: `postgres`
- Database: `crescendo`

**pgAdmin**:

- Email: `admin@localhost.com`
- Password: `admin`

---

## Next Steps

After Docker setup is complete:

1. **Obtain API credentials**: Follow [Credential Setup Guide](./credential-setup.md)
2. **Create .env.local**: Copy from .env.example and add your credentials
3. **Initialize database**: Run `./src/scripts/init-db.sh`
4. **Start development**: Run `npm run dev`

---

## Related Documentation

- [Credential Setup Guide](./credential-setup.md) - Set up API credentials
- [Engaging Networks API Reference](../api/engaging-networks.md) - EN API documentation

---

## Additional Resources

- **Docker Documentation**: https://docs.docker.com
- **Docker Compose Documentation**: https://docs.docker.com/compose
- **PostgreSQL Documentation**: https://www.postgresql.org/docs
- **pgAdmin Documentation**: https://www.pgadmin.org/docs
