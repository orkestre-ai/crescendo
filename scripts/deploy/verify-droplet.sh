#!/usr/bin/env bash
# Server-side gates for a docker-compose.prod.yml deployment. Run as root on the host.
#
#   verify-droplet.sh egress <expected-ipv4>  outbound IP from inside crescendo-app matches
#   verify-droplet.sh en                      EN REST API accepts the configured token
#   verify-droplet.sh ports                   nothing listens beyond loopback and Tailscale
#
# Exits 0 on success, non-zero with a one-line reason otherwise.
set -euo pipefail

APP=crescendo-app

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

case "${1:-}" in
  egress)
    expected="${2:?usage: verify-droplet.sh egress <expected-ipv4>}"
    # api64 is dual-stack, so IPv6 egress shows up as a mismatch instead of hiding.
    actual="$(docker exec "$APP" node -e "
      fetch('https://api64.ipify.org')
        .then((r) => r.text())
        .then((t) => console.log(t.trim()))
        .catch((e) => { console.log(e.message); process.exit(1); });
    ")" || fail "could not reach api64.ipify.org from $APP: ${actual:-no output}"
    [ "$actual" = "$expected" ] || fail "egress IP is $actual, expected $expected"
    echo "OK: egress IP is $actual"
    ;;

  en)
    message="$(docker exec "$APP" node -e "
      fetch('http://127.0.0.1:3000/api/settings/test-en', { method: 'POST' })
        .then((r) => r.json())
        .then((j) => { console.log(j.message); process.exit(j.success === true ? 0 : 1); })
        .catch((e) => { console.log(e.message); process.exit(1); });
    ")" || fail "EN test failed: ${message:-no output}"
    echo "OK: $message"
    ;;

  ports)
    listeners="$(ss -Htlnp)" || fail "ss could not list listening sockets"
    python3 -c '
import ipaddress, sys

allowed = [ipaddress.ip_network("100.64.0.0/10"), ipaddress.ip_network("fd7a:115c:a1e0::/48")]
public = []
for line in sys.stdin.read().splitlines():
    if not line.strip():
        continue
    fields = line.split()
    local = fields[3]
    host = local.rsplit(":", 1)[0].split("%")[0].strip("[]")
    if host != "*":
        ip = ipaddress.ip_address(host)
        if ip.is_loopback or any(ip in net for net in allowed):
            continue
    public.append(local + " " + " ".join(fields[5:]))
if public:
    print("FAIL: public listeners: " + "; ".join(public), file=sys.stderr)
    sys.exit(1)
print("OK: no listeners outside loopback and Tailscale")
' <<<"$listeners"
    ;;

  *)
    fail "usage: verify-droplet.sh egress <expected-ipv4> | en | ports"
    ;;
esac
