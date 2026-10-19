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
import { readFileSync, writeFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';
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
// Fonctionne sans réseau (parking, sous-sol) : l'appli est gardée sur le téléphone par un « service worker »
html = html.replace('</body>', `<script>if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/app/sw.js',{scope:'/app/'}).catch(function(){})})}</script></body>`);
writeFileSync(page, html);
const fichiers = [];
const parcourir = (dossier, prefixe) => {
  for (const nom of readdirSync(dossier)) {
    const chemin = dossier + '/' + nom;
    if (statSync(chemin).isDirectory()) parcourir(chemin, prefixe + nom + '/');
    else if (!/\.map$/.test(nom) && nom !== 'sw.js') fichiers.push('/app/' + prefixe + nom);
  }
};
parcourir('public/app', '');
const version = Date.now().toString(36);
writeFileSync('public/app/sw.js', `// Généré à la construction : garde l'appli sur le téléphone pour l'ouvrir sans réseau
const CACHE = 'fleet-app-${version}';
const FICHIERS = ${JSON.stringify(['/app', ...fichiers.filter((f) => f !== '/app/index.html'), '/app/index.html'])};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FICHIERS.map((f) => c.add(new Request(f, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k.startsWith('fleet-app-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || !u.pathname.startsWith('/app')) return;
  // Pages de l'appli : le réseau d'abord (version à jour), sinon la copie gardée
  if (r.mode === 'navigate') {
    e.respondWith(Promise.race([fetch(r), new Promise((_, ko) => setTimeout(ko, 4000))])
      .then((rep) => { const copie = rep.clone(); caches.open(CACHE).then((c) => c.put('/app/index.html', copie)); return rep; })
      .catch(() => caches.match('/app/index.html')));
    return;
  }
  // Code, images, polices : la copie gardée d'abord (instantané, et marche sans réseau)
  e.respondWith(caches.match(r).then((ok) => ok || fetch(r).then((rep) => { if (rep.ok) { const copie = rep.clone(); caches.open(CACHE).then((c) => c.put(r, copie)); } return rep; })));
});
`);
