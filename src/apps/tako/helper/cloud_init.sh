#!/usr/bin/env bash
set -euox pipefail

TS_ARGS=(--accept-routes --ssh --snat-subnet-routes=false)

install_tailscale() {
  TS_AUTH_KEY=${TS_AUTH_KEY:?"TS_AUTH_KEY env var is not set"}
  TIMEZONE=${TIMEZONE:-""}
  PRIVATE_IF=${PRIVATE_IF:-""}

  if [[ -n "${TIMEZONE}" ]]; then
    timedatectl set-timezone "${TIMEZONE}"
  else
    # Set timezone to the one returned by ipinfo.io, or default to America/New_York
    # if the request fails.
    # Note: This requires curl and sed to be installed.
    timedatectl set-timezone "$(curl -s https://ipinfo.io/timezone | sed 's/^;//' || echo 'America/New_York')"
  fi

  cat <<EOF >/etc/sysctl.d/99-tailscale.conf
net.ipv4.ip_forward = 1
net.ipv6.conf.all.disable_ipv6 = 1
fs.inotify.max_user_instances = 8192
fs.inotify.max_user_watches = 524288
EOF
  sysctl -p /etc/sysctl.d/99-tailscale.conf
  chattr -i /etc/resolv.conf || true

  # Install tailscale
  if systemctl list-units --type=service --all --no-pager --no-legend | grep -qF "tailscaled.service"; then
    echo "tailscaled service already exists, skipping installation" >&2
  else
    echo "Installing Tailscale..." >&2
    curl -fsSL https://tailscale.com/install.sh | sh
    tailscale up --auth-key="${TS_AUTH_KEY}"
  fi

  tailscale set "${TS_ARGS[@]}" --auto-update

  local public_if
  public_if=$(ip -o -4 route get 8.8.8.8 | awk '{for(i=1;i<=NF;i++) if($i=="dev") print $(i+1)}') || { echo "Failed to obtain public interface" >&2; exit 1; }

  # Check if /sbin/ethtool exists, if not, install it
  if ! command -v ethtool &>/dev/null; then
    echo "ethtool not found, installing..." >&2
    if command -v apt-get &>/dev/null; then
      apt-get install -y ethtool
    elif command -v yum &>/dev/null; then
      yum install -y ethtool
    else
      echo "Neither apt-get or yum was available to install ethtool" >&2
      exit 1
    fi
  fi

  cat <<EOF >/bin/k3s-post-network-init.sh
#!/bin/bash
/sbin/iptables -t mangle -A FORWARD -o tailscale0 -p tcp -m tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
/sbin/ethtool -K ${public_if} rx-udp-gro-forwarding on rx-gro-list off
EOF

  if [[ -n "${PRIVATE_IF}" ]]; then
    echo "/sbin/ethtool -K ${PRIVATE_IF} rx-udp-gro-forwarding on rx-gro-list off" >>/bin/k3s-post-network-init.sh
  fi

  chmod +x /bin/k3s-post-network-init.sh
  cat <<EOF >/etc/systemd/system/k3s-post-network-init.service
[Unit]
Description=Apply iptables rule for Tailscale on boot
After=network.target

[Service]
Type=oneshot
ExecStart=/bin/k3s-post-network-init.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now k3s-post-network-init.service || {
    journalctl -u k3s-post-network-init.service --no-pager -n 1000
    exit 1
  }
}

install_k3s_server() {
  PRIVATE_NET_ID=${PRIVATE_NET_ID:-""}
  TS_AUTH_KEY=${TS_AUTH_KEY:?"TS_AUTH_KEY env var is not set"}
  K3S_TOKEN=${K3S_TOKEN:?"K3S_TOKEN env var is not set"}
  K3S_CLUSTER_INIT=${K3S_CLUSTER_INIT:?"K3S_CLUSTER_INIT env var is not set"}
  K3S_SERVICE_NETWORK_CIDR=${K3S_SERVICE_NETWORK_CIDR:?"K3S_SERVICE_NETWORK_CIDR env var is not set"}
  K3S_KUBE_APISERVER_IP=${K3S_KUBE_APISERVER_IP:?"K3S_KUBE_APISERVER_IP env var is not set"}
  K3S_KUBE_APISERVER_PORT=${K3S_KUBE_APISERVER_PORT:?"K3S_KUBE_APISERVER_PORT env var is not set"}
  K3S_POD_NETWORK_CIDR=${K3S_POD_NETWORK_CIDR:?"K3S_POD_NETWORK_CIDR env var is not set"}
  K3S_VERSION=${K3S_VERSION:?"K3S_VERSION env var is not set"}
  K3S_NODE_LABEL=${K3S_NODE_LABEL:-"helmet.run/workload=cp"}
  K3S_NODE_TAINT=${K3S_NODE_TAINT:-"helmet.run/workload=cp:NoSchedule"}
  ETCD_VERSION=${ETCD_VERSION:-"v3.5.18"}

  local tailscale_ipv4
  tailscale_ipv4=$(tailscale ip -4) || (echo "Failed obtaining tailscale IPv4" && exit 1)

  local public_ipv4
  public_ipv4=$(ip -o -4 route get 8.8.8.8 | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}') || (echo "Failed obtaining public IP" && exit 1)

  mkdir -p /etc/systemd/resolved.conf.d/
  cat <<EOL >/etc/systemd/resolved.conf.d/k3s-server.conf
[Resolve]
DNSStubListenerExtra=${tailscale_ipv4}
EOL
  systemctl restart systemd-resolved

  mkdir -p /etc/rancher/k3s

  cat <<EOL >/etc/rancher/k3s/flannel.json
{
  "Network": "${K3S_POD_NETWORK_CIDR}",
  "EnableIPv6": false,
  "EnableIPv4": true,
  "IPv6Network": "::/0",
  "Backend": {
    "Type": "extension",
    "PostStartupCommand": "tailscale set --advertise-routes=\$SUBNET,${K3S_SERVICE_NETWORK_CIDR}",
    "ShutdownCommand": ""
  }
}
EOL

  cat <<EOL >/etc/rancher/k3s/config.yaml
cluster-cidr: ${K3S_POD_NETWORK_CIDR}
service-cidr: ${K3S_SERVICE_NETWORK_CIDR}
node-ip: ${tailscale_ipv4}
node-external-ip: ${tailscale_ipv4}
tls-san: 127.0.0.1,${K3S_KUBE_APISERVER_IP}
kube-controller-manager-arg:
  - node-monitor-period=5s
  - node-monitor-grace-period=15s
kubelet-arg:
  - node-status-update-frequency=5s
  - kube-reserved=cpu=250m,memory=256Mi,ephemeral-storage=5Gi
  - system-reserved=cpu=250m,memory=256Mi,ephemeral-storage=5Gi
kube-apiserver-arg:
  - default-not-ready-toleration-seconds=15
  - default-unreachable-toleration-seconds=15
flannel-conf: /etc/rancher/k3s/flannel.json
egress-selector-mode: disabled
disable:
  - coredns
  - traefik
  - metrics-server
  - local-storage
node-label:
$([ -n "$K3S_NODE_LABEL" ] && echo "$K3S_NODE_LABEL" | tr ' ' '\n' | sed 's/^/  - /')
  - net.helmet.run/public-ipv4=${public_ipv4}
$([ -n "$PRIVATE_NET_ID" ] && echo "  - net.helmet.run/private-id=${PRIVATE_NET_ID}")  
$([ -n "$K3S_NODE_TAINT" ] && echo "node-taint:" && echo "$K3S_NODE_TAINT" | tr ' ' '\n' | sed 's/^/  - /')
EOL

  if [[ "${K3S_CLUSTER_INIT}" == "1" ]]; then
    echo "cluster-init: true" >>/etc/rancher/k3s/config.yaml
  else
    echo "server: https://${K3S_KUBE_APISERVER_IP}:${K3S_KUBE_APISERVER_PORT}" >>/etc/rancher/k3s/config.yaml
  fi

  echo "Installing k3s server..." >&2
  curl -sfL "https://raw.githubusercontent.com/k3s-io/k3s/refs/tags/${K3S_VERSION}/install.sh" |
    INSTALL_K3S_VERSION="${K3S_VERSION}" INSTALL_K3S_EXEC="server" K3S_TOKEN="${K3S_TOKEN}" sh -s - || true

  echo "Installing etcdctl..." >&2
  local etcd_arch
  etcd_arch=$(uname -m)

  case $etcd_arch in
  x86_64) etcd_arch="amd64" ;;
  aarch64) etcd_arch="arm64" ;;
  *) echo "Unsupported architecture: $etcd_arch" && exit 1 ;;
  esac

  curl -sL "https://storage.googleapis.com/etcd/${ETCD_VERSION}/etcd-${ETCD_VERSION}-linux-${etcd_arch}.tar.gz" |
    tar xz -C /usr/local/bin --strip-components=1 "etcd-${ETCD_VERSION}-linux-${etcd_arch}/etcdctl"

  cat <<EOL >>/etc/environment
ETCDCTL_ENDPOINTS="https://127.0.0.1:2379"
ETCDCTL_CACERT="/var/lib/rancher/k3s/server/tls/etcd/server-ca.crt"
ETCDCTL_CERT="/var/lib/rancher/k3s/server/tls/etcd/client.crt"
ETCDCTL_KEY="/var/lib/rancher/k3s/server/tls/etcd/client.key"
EOL
}

install_k3s_agent() {
  PRIVATE_NET_ID=${PRIVATE_NET_ID:-""}
  TS_AUTH_KEY=${TS_AUTH_KEY:?"TS_AUTH_KEY env var is not set"}
  K3S_TOKEN=${K3S_TOKEN:?"K3S_TOKEN env var is not set"}
  K3S_KUBE_APISERVER_IP=${K3S_KUBE_APISERVER_IP:?"K3S_KUBE_APISERVER_IP env var is not set"}
  K3S_KUBE_APISERVER_PORT=${K3S_KUBE_APISERVER_PORT:?"K3S_KUBE_APISERVER_PORT env var is not set"}
  K3S_POD_NETWORK_CIDR=${K3S_POD_NETWORK_CIDR:?"K3S_POD_NETWORK_CIDR env var is not set"}
  K3S_VERSION=${K3S_VERSION:?"K3S_VERSION env var is not set"}
  K3S_NODE_LABEL=${K3S_NODE_LABEL:-""}
  K3S_NODE_TAINT=${K3S_NODE_TAINT:-""}

  local tailscale_ipv4
  tailscale_ipv4=$(tailscale ip --4) || (echo "Failed obtaining tailscale IPv4" && exit 1)

  local public_ipv4
  public_ipv4=$(ip -o -4 route get 8.8.8.8 | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}') || (echo "Failed obtaining public IP" && exit 1)

  mkdir -p /etc/rancher/k3s
  cat <<EOL >/etc/rancher/k3s/flannel.json
{
  "Network": "${K3S_POD_NETWORK_CIDR}",
  "EnableIPv6": false,
  "EnableIPv4": true,
  "IPv6Network": "::/0",
  "Backend": {
    "Type": "extension",
    "PostStartupCommand": "tailscale set --advertise-routes=\$SUBNET",
    "ShutdownCommand": ""
  }
}
EOL

  cat <<EOL >/etc/rancher/k3s/config.yaml
node-ip: ${tailscale_ipv4}
node-external-ip: ${tailscale_ipv4}
kubelet-arg:
  - node-status-update-frequency=5s
  - kube-reserved=cpu=250m,memory=256Mi,ephemeral-storage=5Gi
  - system-reserved=cpu=250m,memory=256Mi,ephemeral-storage=5Gi
flannel-conf: /etc/rancher/k3s/flannel.json
server: https://${K3S_KUBE_APISERVER_IP}:${K3S_KUBE_APISERVER_PORT}
disable-apiserver-lb: true
node-label:
$([ -n "$K3S_NODE_LABEL" ] && echo "$K3S_NODE_LABEL" | tr ' ' '\n' | sed 's/^/  - /')
  - net.helmet.run/public-ipv4=${public_ipv4}
$([ -n "$PRIVATE_NET_ID" ] && echo "  - net.helmet.run/private-id=${PRIVATE_NET_ID}")  
$([ -n "$K3S_NODE_TAINT" ] && echo "node-taint:" && echo "$K3S_NODE_TAINT" | tr ' ' '\n' | sed 's/^/  - /')
EOL

  echo "Installing k3s agent..." >&2
  curl -sfL "https://raw.githubusercontent.com/k3s-io/k3s/refs/tags/${K3S_VERSION}/install.sh" |
    INSTALL_K3S_VERSION="${K3S_VERSION}" INSTALL_K3S_EXEC="agent" K3S_TOKEN="${K3S_TOKEN}" sh -s -
}

setup_ufw() {
  K3S_KUBE_APISERVER_IP=${K3S_KUBE_APISERVER_IP:?"K3S_KUBE_APISERVER_IP env var is not set"}
  UFW_ALLOW_IN_IFACES=${UFW_ALLOW_IN_IFACES:-""}

  local public_if
  public_if=$(ip -o route get 8.8.8.8 | cut -f 5 -d " ") || (echo "Failed obtaining public interface" && exit 1)

  echo "Configuring ufw..." >&2
  ufw disable
  ufw --force reset

  ufw enable
  ufw default deny incoming
  ufw default allow outgoing

  UFW_ALLOW_IN_IFACES="tailscale0 ${UFW_ALLOW_IN_IFACES}"

  for iface in $UFW_ALLOW_IN_IFACES; do
    ufw allow in on "$iface"
  done

  ufw allow in on "${public_if}" from "${K3S_KUBE_APISERVER_IP}" to any port 6443 proto tcp
  ufw reload

  systemctl disable --now ssh.socket
  systemctl disable --now ssh
}

install_keepalived() {
  K3S_KUBE_APISERVER_IP=${K3S_KUBE_APISERVER_IP:?"K3S_KUBE_APISERVER_IP env var is not set"}

  local node_ip
  node_ip="$(ip -o route get 8.8.8.8 | cut -f 7 -d " ")"

  local if_name
  if_name="$(ip -o route get 8.8.8.8 | cut -f 5 -d " ")"
  
  local priority
  priority=$((255 - (${node_ip##*.} % 10)))

  mkdir -p /etc/keepalived/

  cat <<EOL >/etc/keepalived/check-k3s-api-server.sh
#!/usr/bin/env bash
set -euo pipefail
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
test "\$(timeout 2 kubectl get --raw=/readyz)" == "ok"
EOL

  chmod +x /etc/keepalived/check-k3s-api-server.sh

  cat <<EOL >/etc/keepalived/keepalived.conf
global_defs {
  enable_script_security
  script_user root
}
vrrp_script check_k3s_api_server {
    script "/etc/keepalived/check-k3s-api-server.sh"
    interval 2
    rise 1
    fall 2
}
vrrp_instance k3s_api_server_vip {
    interface ${if_name}
    state BACKUP
    priority ${priority}
    virtual_router_id 51
    virtual_ipaddress {
        ${K3S_KUBE_APISERVER_IP}/24
    }
    track_script {
        check_k3s_api_server
    }
}
EOL

  apt install -y keepalived
}

"$@"
