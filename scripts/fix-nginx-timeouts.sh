#!/bin/sh
# Таймауты + буфер заголовков: иначе 302 с supabase-cookies даёт 502
# (upstream sent too big header), хотя Node уже написал session ok.
# Запуск: bash scripts/fix-nginx-timeouts.sh
set -e

CONF=""
for f in /etc/nginx/sites-enabled/yomoyo.conf /etc/nginx/sites-enabled/default /etc/nginx/conf.d/yomoyo.conf; do
  if [ -f "$f" ]; then CONF="$f"; break; fi
done

if [ -z "$CONF" ]; then
  echo "nginx site config not found"
  ls -la /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null || true
  exit 1
fi

echo "using $CONF"
mkdir -p /root/nginx-bak
cp "$CONF" "/root/nginx-bak/$(basename "$CONF").bak.$(date +%s)"

set_or_insert() {
  key="$1"
  value="$2"
  if grep -q "$key" "$CONF"; then
    sed -i "s|$key.*|$value|" "$CONF"
  else
    sed -i "/proxy_pass/a\\        $value" "$CONF"
  fi
}

set_or_insert 'proxy_connect_timeout' 'proxy_connect_timeout 30s;'
set_or_insert 'proxy_send_timeout' 'proxy_send_timeout 120s;'
set_or_insert 'proxy_read_timeout' 'proxy_read_timeout 120s;'
set_or_insert 'proxy_buffer_size' 'proxy_buffer_size 32k;'
set_or_insert 'proxy_buffers' 'proxy_buffers 8 32k;'
set_or_insert 'proxy_busy_buffers_size' 'proxy_busy_buffers_size 64k;'

nginx -t
systemctl reload nginx
echo "nginx updated"
grep -n 'proxy_.*timeout\|proxy_buffer\|proxy_pass\|server_name' "$CONF" | head -30
