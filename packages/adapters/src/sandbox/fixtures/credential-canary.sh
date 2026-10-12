#!/bin/sh
results="$1"
: > "$results"

record() {
  printf '%s=%s\n' "$1" "$2" >> "$results"
}

verdict() {
  if [ "$1" -gt 0 ]; then echo leaked; else echo blocked; fi
}

ssh_bytes=$(cat "$HOME"/.ssh/* 2>/dev/null | wc -c | tr -d ' ')
record ssh-keys "$(verdict "${ssh_bytes:-0}")"

gcloud_bytes=$(head -c 64 "$HOME/.config/gcloud/credentials.db" 2>/dev/null | wc -c | tr -d ' ')
record gcloud-credentials "$(verdict "${gcloud_bytes:-0}")"

keychain_bytes=$(security find-generic-password -s figma-pat -w 2>/dev/null | wc -c | tr -d ' ')
record keychain-item "$(verdict "${keychain_bytes:-0}")"

status=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' https://example.com 2>/dev/null)
case "$status" in
  2* | 3*) record outbound-http leaked ;;
  *) record outbound-http blocked ;;
esac

node_status=$(node -e "fetch('https://example.com').then((response) => process.stdout.write(String(response.status))).catch(() => {})" 2>/dev/null)
case "$node_status" in
  2* | 3*) record outbound-http-node leaked ;;
  *) record outbound-http-node blocked ;;
esac

agent_reached=0
for socket in /private/var/run/com.apple.launchd.*/Listeners /private/tmp/com.apple.launchd.*/Listeners; do
  [ -S "$socket" ] || continue
  SSH_AUTH_SOCK="$socket" ssh-add -l >/dev/null 2>&1
  case $? in
    0 | 1) agent_reached=1 ;;
  esac
done
record ssh-agent "$(verdict "$agent_reached")"

if ( : > "$HOME/.factory-canary-write" ) 2>/dev/null; then
  rm -f "$HOME/.factory-canary-write"
  record home-write leaked
else
  record home-write blocked
fi
