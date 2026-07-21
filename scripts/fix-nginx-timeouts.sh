#!/bin/sh
# Увеличивает таймауты nginx для длинного VK callback.
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

# если уже есть — обновим значения, иначе вставим в location /
if grep -q 'proxy_read_timeout' "$CONF"; then
  sed -i 's/proxy_read_timeout.*/proxy_read_timeout 120s;/' "$CONF"
  sed -i 's/proxy_connect_timeout.*/proxy_connect_timeout 30s;/' "$CONF" || true
  sed -i 's/proxy_send_timeout.*/proxy_send_timeout 120s;/' "$CONF" || true
else
  # вставим после proxy_pass
  sed -i '/proxy_pass/a\        proxy_connect_timeout 30s;\n        proxy_send_timeout 120s;\n        proxy_read_timeout 120s;' "$CONF"
fi

nginx -t
systemctl reload nginx
echo "nginx timeouts updated"
grep -n 'proxy_.*timeout\|proxy_pass\|server_name' "$CONF" | head -20
