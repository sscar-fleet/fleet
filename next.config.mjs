/** @type {import('next').NextConfig} */
const config = {
  // Adresses courtes ou mal tapées qui mènent toutes à l'appli
  async redirects() {
    return ['/appli', '/application', '/mobile', '/telephone', '/apps', '/App', '/APP'].map((source) => ({ source, destination: '/app', permanent: false }));
  },
  // L'appli téléphone (version navigateur) est servie sous /app : toute adresse de l'appli renvoie vers sa page
  async rewrites() {
    return { fallback: [{ source: '/app/:chemin*', destination: '/app/index.html' }] };
  },
};
export default config;
