/** @type {import('next').NextConfig} */
const config = {
  // Import de la flotte : l'aperçu validé peut contenir plusieurs centaines de lignes (Vercel accepte 4,5 Mo au plus)
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  // Adresses courtes ou mal tapées qui mènent toutes à l'appli
  async redirects() {
    return ['/appli', '/application', '/mobile', '/telephone', '/apps'].map((source) => ({ source, destination: '/app', permanent: false }));
  },
  // L'appli téléphone (version navigateur) est servie sous /app : toute adresse de l'appli renvoie vers sa page
  async rewrites() {
    return {
      beforeFiles: [{ source: '/sscs', destination: '/sscs/index.html' }, { source: '/sscs/', destination: '/sscs/index.html' }],
      fallback: [{ source: '/app/:chemin*', destination: '/app/index.html' }, { source: '/apercu-appli/:chemin*', destination: '/apercu-appli/index.html' }],
    };
  },
};
export default config;
