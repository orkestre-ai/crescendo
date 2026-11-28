# DigitalOcean Deployment Guide

Run a private Crescendo instance on one DigitalOcean droplet. Nothing on the droplet is reachable from the internet: users come in through a Cloudflare Tunnel guarded by Cloudflare Access, you administer it over Tailscale SSH, and calls to Engaging Networks leave from the droplet's own IPv4, which EN has on its allow list.

Crescendo has no login of its own, so the tunnel must stay the only way in. Every step below keeps it that way.

Placeholders: `<name>` is a short label for the instance (for example the client's name), `<EGRESS_IPV4>` is the droplet's public IPv4, and `<hostname>` is the public hostname users open.

```
User --HTTPS--> Cloudflare Access --tunnel--> cloudflared --> app:3000 --> postgres
                                                               |
                                                               +--> EN API (from <EGRESS_IPV4>), GA4, Anthropic
You --Tailscale SSH--> droplet (no inbound ports)
```

Repo pieces this guide uses:

- `docker-compose.prod.yml`: production overlay. It publishes no ports, puts pgAdmin behind the `debug` profile, takes the DB password from `.env` and adds the `cloudflared` service.
- `.env.production.example`: every variable the server's `.env` needs, with how to generate each secret.
- `scripts/deploy/verify-droplet.sh`: server-side checks `egress`, `en` and `ports`.
- `scripts/deploy/check-prod-compose.sh`: local static check of the overlay.

---

## 1. Provision the droplet

Recommended spec: Ubuntu 24.04 LTS, Basic 2 vCPU / 4 GB (`s-2vcpu-4gb`), a region close to your EN data centre (`tor1` for EN Canada, `nyc3` for EN US), weekly Backups on, **IPv6 off**.

Keep IPv6 off. If the droplet has an IPv6 address and EN resolves over AAAA, API calls leave from an address EN has never seen and fail with 401, which looks like a bad token.

Don't allow-list a Reserved IP. It's an inbound address; outbound traffic still leaves from the droplet's primary IPv4. That IPv4 stays fixed for the droplet's lifetime, including power cycles, resizes and Rebuilds.

### Create it with Tailscale already joined

The firewall below has no inbound rules, so public SSH never works. Join Tailscale during first boot with cloud-init. Create a one-off, pre-approved auth key in the Tailscale admin console, then:

```bash
cat > user-data.sh <<'EOF'
#!/bin/sh
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --ssh --hostname=crescendo-<name> --authkey=<one-off-tailscale-auth-key>
EOF

doctl compute droplet create crescendo-<name> \
  --region tor1 --size s-2vcpu-4gb --image ubuntu-24-04-x64 \
  --ssh-keys <your-key-fingerprint> --enable-backups \
  --user-data-file user-data.sh --wait
rm user-data.sh
```

If cloud-init fails, use the droplet's **Recovery Console** in the DO control panel to run the same two commands. The browser Droplet Console connects over SSH, so the firewall blocks it.

### Attach a Cloud Firewall with no inbound rules

The Cloud Firewall is enforced outside the droplet, so Docker's iptables rules can't open a hole in it.

```bash
doctl compute firewall create --name crescendo-<name>-fw \
  --outbound-rules "protocol:tcp,ports:all,address:0.0.0.0/0,address:::/0 protocol:udp,ports:all,address:0.0.0.0/0,address:::/0 protocol:icmp,address:0.0.0.0/0,address:::/0" \
  --droplet-ids "$(doctl compute droplet get crescendo-<name> --format ID --no-header)"
```

### Prepare the host

Over Tailscale (`ssh root@crescendo-<name>`):

```bash
# Docker Engine + compose plugin: follow https://docs.docker.com/engine/install/ubuntu/
apt-get install -y unattended-upgrades && dpkg-reconfigure -f noninteractive unattended-upgrades

# 2 GB swap: building the image installs Chromium and 4 GB is tight during `next build`
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Local time for the backup cron below. Use the organisation's time zone; the app's
# own schedules follow the time zone set in Settings → Organisation, not this one.
timedatectl set-timezone America/Toronto

# Tailscale SSH replaces sshd. Stop it listening on public interfaces
# (verify-droplet.sh ports fails while it does). Recovery Console is the fallback.
systemctl disable --now ssh.socket ssh.service

git clone https://github.com/orkestre-ai/crescendo /opt/crescendo
```

### Record the egress IP

```bash
doctl compute droplet get crescendo-<name> --format PublicIPv4,PublicIPv6,Region --no-header
```

The IPv6 column must be empty. Store the IPv4 as `<EGRESS_IPV4>` in your password manager next to the instance's other secrets.

### Check

```bash
nc -vz -w 5 <EGRESS_IPV4> 22; nc -vz -w 5 <EGRESS_IPV4> 3000   # both must time out
ssh root@crescendo-<name> 'docker compose version && test -d /opt/crescendo/.git'
```

---

## 2. Allow-list the IP in Engaging Networks and deploy

### EN API user

In the EN account: **Hello [name] → Account Settings → API Users**. Create a dedicated API user (for example `crescendo`), or edit an existing one, add `<EGRESS_IPV4>` to its whitelisted IP addresses, and copy its token. You need an EN user who can manage API users.

For NetDonor fundraising data, also get the Public API token (`EN_PUBLIC_TOKEN`).

Write down which API user it is and the date you allow-listed the IP. When this breaks later, a 401 or 403 almost always means the IP changed, not the token.

### Write `.env`

```bash
cd /opt/crescendo
cp .env.production.example .env && chmod 600 .env
openssl rand -hex 32        # POSTGRES_PASSWORD
openssl rand -hex 32        # ENCRYPTION_KEY
openssl rand -base64 36     # CRON_SECRET
```

Generate the secrets on the droplet so they never pass through a chat or the repo, and keep a copy in your password manager. Fill in `NEXT_PUBLIC_APP_URL=https://<hostname>`, `EN_API_TOKEN`, `EN_REGION` and `EN_BASE_URL` (both must match the EN account's data centre; see the template), `GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_KEY` (one line of JSON in single quotes) and `ANTHROPIC_API_KEY`. Until section 3, set `CLOUDFLARE_TUNNEL_TOKEN` to any placeholder; `cloudflared` restart-loops until it gets a real one, which is expected.

`.env` is the source of truth for credentials. Keys saved from the Settings page are stored encrypted in Postgres under `ENCRYPTION_KEY`, so a DB dump and that key have to travel together. Anyone Access admits can view and change those settings, so admit only people you'd trust with the EN token.

`POSTGRES_PASSWORD` only takes effect when the database volume is first created. To change it later, run `ALTER USER` first (see `.env.production.example`), then edit `.env`.

### Deploy

```bash
cd /opt/crescendo
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Migrations run in the container entrypoint on every start. The in-process scheduler runs the daily and nightly jobs; `CRON_SECRET` only guards manual triggers of `/api/cron/*`.

### Verify

Run the egress check first. A failed EN test with the wrong egress IP needs a different fix from a failed EN test with the right one.

```bash
/opt/crescendo/scripts/deploy/verify-droplet.sh egress <EGRESS_IPV4>
/opt/crescendo/scripts/deploy/verify-droplet.sh en
/opt/crescendo/scripts/deploy/verify-droplet.sh ports
```

Also check that screenshots are served: run a DEEP scan of a single page, then request the screenshot URL it returns. A 404 there is worth recording as a follow-up, but doesn't block the deployment.

---

## 3. Cloudflare Access and Tunnel

Access goes first. A tunnel route with no Access application in front of it is public the moment `cloudflared` connects, and Crescendo has no login of its own, so never start `cloudflared` with a real token before the Access application exists.

### Access

In Cloudflare **Zero Trust → Access → Applications**, create the application for `<hostname>`:

- Self-hosted application covering the whole hostname, with no path exclusions
- Policy: Allow, with an explicit list of email addresses. Don't use an email-domain rule unless you control every address in that domain
- Login methods: one-time PIN, plus Google if you've set it up
- Session duration: 24 hours

A single-level subdomain of a zone you run in Cloudflare (`<name>-crescendo.example.com`) is covered by free Universal SSL; a two-level one (`<name>.crescendo.example.com`) needs Advanced Certificate Manager.

### Tunnel

In **Zero Trust → Networks → Tunnels**, create a cloudflared tunnel named `crescendo-<name>` and copy its token. Add the public hostname `<hostname>` with service `http://app:3000`. Creating the route this way also creates the proxied DNS record.

Put the token in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`. If `NEXT_PUBLIC_APP_URL` doesn't already hold the hostname, set it too. Then:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

This starts `cloudflared` with the real token and recreates any container whose environment changed. The tunnel should show HEALTHY in the dashboard.

### Verify

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://<hostname>/api/settings
```

Expect a 302 to `*.cloudflareaccess.com`, never settings JSON. Then log in with an allowed email and confirm the dashboard loads, and try an address that isn't on the list and confirm it is refused.

---

## 4. Operations

### Nightly database dumps

DO's weekly Backups capture the whole disk, including these dumps. Add to root's crontab (`crontab -e`):

```cron
30 3 * * * mkdir -p /var/backups/crescendo && docker exec crescendo-db pg_dump -U postgres -Fc crescendo > /var/backups/crescendo/tmp.dump && mv /var/backups/crescendo/tmp.dump /var/backups/crescendo/crescendo-$(date +\%F).dump && find /var/backups/crescendo -name 'crescendo-*.dump' -mtime +14 -delete
```

Prove a dump restores once, then drop the scratch database:

```bash
DUMP="$(ls -1t /var/backups/crescendo/crescendo-*.dump | head -1)"
docker exec crescendo-db createdb -U postgres crescendo_restore_test
docker exec -i crescendo-db pg_restore -U postgres -d crescendo_restore_test < "$DUMP"
docker exec crescendo-db psql -U postgres -d crescendo_restore_test -c 'SELECT count(*) FROM "FundraisingPage"'
docker exec crescendo-db dropdb -U postgres crescendo_restore_test
```

### Updates

```bash
cd /opt/crescendo && git pull && \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
for c in egress en ports; do scripts/deploy/verify-droplet.sh $c <EGRESS_IPV4> || break; done
```

DO **Rebuild** keeps the droplet's IPv4. **Destroy + Create** gives you a new one, which means repeating the EN allow-list step in section 2.

### Debugging the database

pgAdmin is off by default. To use it, start it on loopback and reach it through an SSH tunnel:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile debug up -d pgadmin
ssh -L 50500:127.0.0.1:50500 root@crescendo-<name>   # then open http://localhost:50500
```

Stop it again when you're done (`docker compose ... stop pgadmin`).

### Handover

Send users the URL and explain the login: Access emails them a one-time PIN. Ask the EN account's admins to tell you before they rotate the API user or edit its IP list.

---

## Troubleshooting

| Symptom                                                    | Likely cause                                                    | Check                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| EN test returns 401/403                                    | Egress IP not on the API user's allow list                      | `verify-droplet.sh egress <EGRESS_IPV4>`, then the EN API user's IP list |
| `up` fails with `required variable ... is missing a value` | `.env` missing `POSTGRES_PASSWORD` or `CLOUDFLARE_TUNNEL_TOKEN` | `.env` next to `docker-compose.yml`                                      |
| App can't reach the DB after changing `POSTGRES_PASSWORD`  | The volume kept the old password                                | `ALTER USER` as in `.env.production.example`                             |
| `cloudflared` restarting                                   | Placeholder or revoked tunnel token                             | `docker logs crescendo-cloudflared`                                      |
| `verify-droplet.sh ports` fails on `:22`                   | sshd still listening                                            | `systemctl disable --now ssh.socket ssh.service`                         |
