import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

const account_id = '49df6932e6b14cf8a47c5b1d107a376e';
const repo = 'vanyabarny-debug/yoboba';

function wrangler_oauth() {
  const cfg = readFileSync(join(homedir(), 'Library/Preferences/.wrangler/config/default.toml'), 'utf8');
  const m = cfg.match(/oauth_token = "([^"]+)"/);
  if (!m) throw new Error('wrangler not logged in — run: npx wrangler login');
  return m[1];
}

async function cf(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${wrangler_oauth()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(JSON.stringify(json.errors || json));
  }
  return json.result;
}

function load_dev_vars() {
  const env = {};
  for (const line of readFileSync('.dev.vars', 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

function gh_secret(name, value) {
  execSync(`gh secret set ${name} --repo ${repo}`, {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  console.log(`set secret ${name}`);
}

const workers_groups = [
  'Workers Scripts Write',
  'Workers Scripts Read',
  'Account Settings Read',
  'User Details Read',
  'Workers Routes Write',
  'Workers Routes Read',
  'Workers Tail Read',
  'Workers KV Storage Write',
  'Workers KV Storage Read',
];

const groups = await cf('/user/tokens/permission_groups');
const picked = groups.filter((g) => workers_groups.includes(g.name));

const token = await cf('/user/tokens', {
  method: 'POST',
  body: JSON.stringify({
    name: `github-actions-${repo.split('/')[1]}-${Date.now()}`,
    policies: [
      {
        effect: 'allow',
        resources: { 'com.cloudflare.api.account.*': account_id },
        permission_groups: picked.map((g) => ({ id: g.id })),
      },
    ],
  }),
});

gh_secret('CLOUDFLARE_API_TOKEN', token.value);
gh_secret('CLOUDFLARE_ACCOUNT_ID', account_id);

const vars = load_dev_vars();
gh_secret('NEXT_PUBLIC_SUPABASE_URL', vars.NEXT_PUBLIC_SUPABASE_URL);
gh_secret('NEXT_PUBLIC_SUPABASE_ANON_KEY', vars.NEXT_PUBLIC_SUPABASE_ANON_KEY);
gh_secret('SUPABASE_SERVICE_ROLE_KEY', vars.SUPABASE_SERVICE_ROLE_KEY);
gh_secret('NEXT_PUBLIC_SITE_URL', 'https://koppux.vanyabarny-debug.workers.dev');

console.log('done — trigger: gh workflow run deploy-cloudflare.yml --repo', repo);
