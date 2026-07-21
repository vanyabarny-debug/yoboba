#!/bin/sh
# Проверка сети контейнера до VK ID. Запуск на сервере:
#   bash scripts/check-vk-net.sh
set -e
cd "$(dirname "$0")/.."

echo "COMMIT=$(git log -1 --oneline)"
echo "NODE_OPTIONS_IN_COMPOSE=$(grep NODE_OPTIONS docker-compose.yml || true)"

docker compose up -d >/dev/null
sleep 2

docker compose exec -T web node <<'NODE'
console.log('NODE_OPTIONS=', process.env.NODE_OPTIONS || '(empty)');
fetch('https://id.vk.ru/oauth2/auth', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=authorization_code&client_id=1&code=x&code_verifier=x&device_id=x&redirect_uri=https://yomoyo.su/auth/vk/callback',
})
  .then(async (r) => {
    console.log('VK_STATUS=', r.status);
  })
  .catch((e) => {
    console.log('VK_FAIL=', e.message, String(e.cause || ''));
    process.exitCode = 1;
  });
NODE
