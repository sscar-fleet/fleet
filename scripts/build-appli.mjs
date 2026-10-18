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

// Écran d'accueil de l'iPhone : icône, nom, plein écran, couleur de la barre
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
copyFileSync('public/icone-512.png', 'public/app/icone-512.png');
writeFileSync('public/app/manifest.webmanifest', JSON.stringify({
  name: 'SS CAR FLEET', short_name: 'Fleet', start_url: '/app', scope: '/app', display: 'standalone',
  background_color: '#0b0f12', theme_color: '#0b0f12', lang: 'fr',
  icons: [{ src: '/app/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
}));
const page = 'public/app/index.html';
let html = readFileSync(page, 'utf8');
html = html.replace(/<title>[^<]*<\/title>/, '<title>SS CAR FLEET</title>').replace('</head>', [
  '<link rel="manifest" href="/app/manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="/app/icone-512.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="Fleet">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="theme-color" content="#0b0f12">',
  '<style>html,body{background:#0b0f12}</style>',
  '</head>'].join(''));
html = html.replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">');
writeFileSync(page, html);
