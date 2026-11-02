#!/usr/bin/env bash
set -euo pipefail

USAGE="usage: $0 [--hostname <tailnet name>] [--pgbackrest]"
NAME="clean-stack"
PGBACKREST=false
REBOOT_AT="05:30"
CONFIG_DIR="/etc/clean-stack"
LOCAL="$CONFIG_DIR/host.local.nft"
CLOUDFLARE="$CONFIG_DIR/cloudflare.nft"
PGBACKREST_ENV="$CONFIG_DIR/pgbackrest.env"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hostname)
      NAME="${2:-}"
      shift 2 || shift
      ;;
    --pgbackrest)
      PGBACKREST=true
      shift
      ;;
    *)
      echo "$USAGE" >&2
      exit 1
      ;;
  esac
done

if [[ ! "$NAME" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]]; then
  echo "$USAGE: the hostname is lower-case letters, digits and dashes" >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "needs root" >&2
  exit 1
fi

# shellcheck source=/dev/null
. /etc/os-release
if [[ "$ID" != "debian" || "$VERSION_CODENAME" != "trixie" ]]; then
  echo "expects Debian 13 (trixie), found $PRETTY_NAME" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$LOCAL" ]]; then
  echo "missing $LOCAL: copy infra/vps/host.local.nft.example there and set the public NIC" >&2
  exit 1
fi

if [[ "$PGBACKREST" == true ]]; then
  if [[ ! -f "$PGBACKREST_ENV" ]]; then
    echo "missing $PGBACKREST_ENV: copy infra/vps/pgbackrest.env.example there and set PGBACKREST_CONTAINERS" >&2
    exit 1
  fi

  # shellcheck source=/dev/null
  if ! (. "$PGBACKREST_ENV" && [[ -n "${PGBACKREST_CONTAINERS:-}" ]]); then
    echo "PGBACKREST_CONTAINERS is empty in $PGBACKREST_ENV: set the container names of the Coolify Postgres resources" >&2
    exit 1
  fi
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl nftables unattended-upgrades apt-listchanges

cat >/etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

cat >/etc/apt/apt.conf.d/52clean-stack-reboot <<'CONF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-WithUsers "true";
Unattended-Upgrade::Automatic-Reboot-Time "now";
CONF

mkdir -p /etc/systemd/system/apt-daily-upgrade.timer.d
cat >/etc/systemd/system/apt-daily-upgrade.timer.d/clean-stack-slot.conf <<CONF
[Timer]
OnCalendar=
OnCalendar=*-*-* $REBOOT_AT:00 UTC
RandomizedDelaySec=0
CONF

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
cat >/etc/apt/sources.list.d/docker.sources <<CONF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $VERSION_CODENAME
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
CONF

curl -fsSL "https://pkgs.tailscale.com/stable/debian/$VERSION_CODENAME.noarmor.gpg" \
  -o /usr/share/keyrings/tailscale-archive-keyring.gpg
curl -fsSL "https://pkgs.tailscale.com/stable/debian/$VERSION_CODENAME.tailscale-keyring.list" \
  -o /etc/apt/sources.list.d/tailscale.list

mkdir -p /etc/docker
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat >/etc/docker/daemon.json <<'CONF'
{
  "firewall-backend": "iptables"
}
CONF
fi

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin tailscale

if ! tailscale status --peers=false >/dev/null 2>&1; then
  tailscale up --ssh --auth-key="${TS_AUTHKEY:?set TS_AUTHKEY to a one off Tailscale auth key}" \
    --hostname="$NAME" --advertise-tags="tag:server"
fi
tailscale set --ssh
tailscale status --peers=false >/dev/null

check_public_interfaces() {
  local listed route_interface interface
  local -a interfaces

  listed="$(nft list set inet clean_stack_host public_interfaces | tr '\n' ' ' | sed -n 's/.*elements = {\([^}]*\)}.*/\1/p' | tr -d ' "')"
  IFS=, read -r -a interfaces <<<"$listed"

  if [[ ${#interfaces[@]} -eq 0 ]]; then
    echo "FAIL: public_interfaces is empty in $LOCAL, published ports would not be dropped" >&2
    return 1
  fi

  for interface in "${interfaces[@]}"; do
    if [[ ! -e "${CLEAN_STACK_SYS_CLASS_NET:-/sys/class/net}/$interface" ]]; then
      echo "FAIL: $interface in $LOCAL is not an interface of this host (ip -br link)" >&2
      return 1
    fi
  done

  route_interface="$(ip -o route get 1.1.1.1 | sed -n 's/.* dev \([^ ]*\).*/\1/p')"

  if [[ ! " ${interfaces[*]} " == *" $route_interface "* ]]; then
    echo "FAIL: the default route leaves through $route_interface, missing from public_interfaces in $LOCAL" >&2
    return 1
  fi
}

cloudflare_elements() {
  local family="$1" pattern="$2" ranges
  ranges="$(curl -fsSL "https://www.cloudflare.com/ips-$family" | tr -d '\r')"

  if [[ -z "$ranges" ]] || grep -Evq "$pattern" <<<"$ranges"; then
    echo "the Cloudflare $family ranges are empty or malformed, the firewall stays as it was" >&2
    exit 1
  fi

  echo "add element inet clean_stack_host cloudflare_$family { $(paste -sd, - <<<"$ranges" | sed 's/,/, /g') }"
}

{
  cloudflare_elements v4 '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$'
  cloudflare_elements v6 '^[0-9a-f:]+/[0-9]{1,3}$'
} >"$CLOUDFLARE.new"
mv "$CLOUDFLARE.new" "$CLOUDFLARE"

install -m 0644 "$HERE/host.nft" "$CONFIG_DIR/host.nft"
nft -c -f "$CONFIG_DIR/host.nft"

cat >/etc/systemd/system/clean-stack-host-firewall.service <<UNIT
[Unit]
Description=clean-stack host firewall
Wants=network-pre.target
After=network-pre.target nftables.service
Before=docker.service
ReloadPropagatedFrom=nftables.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/sbin/nft -f $CONFIG_DIR/host.nft
ExecReload=/usr/sbin/nft -f $CONFIG_DIR/host.nft

[Install]
WantedBy=multi-user.target
RequiredBy=docker.service
UNIT

systemctl daemon-reload
systemctl enable --now clean-stack-host-firewall
systemctl reload clean-stack-host-firewall
systemctl restart apt-daily-upgrade.timer

check_public_interfaces

if [[ "$PGBACKREST" == true ]]; then
  chown root:root "$PGBACKREST_ENV"
  chmod 0600 "$PGBACKREST_ENV"
  install -m 0755 "$HERE/pgbackrest-run.sh" /usr/local/sbin/pgbackrest-run.sh

  cat >/etc/systemd/system/clean-stack-pgbackrest@.service <<'UNIT'
[Unit]
Description=clean-stack pgBackRest %i
Wants=docker.service
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/pgbackrest-run.sh %i
UNIT

  while read -r KIND CALENDAR; do
    cat >"/etc/systemd/system/clean-stack-pgbackrest-$KIND.timer" <<UNIT
[Unit]
Description=clean-stack pgBackRest $KIND

[Timer]
OnCalendar=$CALENDAR
Persistent=true
Unit=clean-stack-pgbackrest@$KIND.service

[Install]
WantedBy=timers.target
UNIT
  done <<'TIMERS'
full Sun *-*-* 00:00:00 UTC
diff Mon..Sat *-*-* 00:00:00 UTC
check *-*-* 05:00:00 UTC
TIMERS

  systemctl daemon-reload
  systemctl enable --now clean-stack-pgbackrest-full.timer clean-stack-pgbackrest-diff.timer clean-stack-pgbackrest-check.timer
  systemctl restart clean-stack-pgbackrest-full.timer clean-stack-pgbackrest-diff.timer clean-stack-pgbackrest-check.timer
  echo "pgBackRest timers on: full Sunday 00:00 UTC, diff Monday to Saturday 00:00 UTC, check daily 05:00 UTC"
fi

echo "host $NAME ready: unattended upgrades reboot at $REBOOT_AT UTC, firewall loaded, Tailscale SSH on"
