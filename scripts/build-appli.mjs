// Construit la version navigateur de l'appli téléphone dans public/app, avant le site.
// Elle utilise la même base Supabase que le site (mêmes variables d'environnement Vercel).
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

if (!existsSync('mobile/package.json')) process.exit(0);
const env = {
  ...process.env,
  EXPO_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  EXPO_PUBLIC_FLEET_URL: '',
  EXPO_OFFLINE: '1',
  CI: '1',
};
rmSync('public/app', { recursive: true, force: true });
const run = (cmd) => execSync(cmd, { cwd: 'mobile', stdio: 'inherit', env });
run('npm ci --no-audit --no-fund');
run('npx expo export --platform web --output-dir ../public/app');
