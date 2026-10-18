/** @type {import('next').NextConfig} */
const config = {
  // L'appli téléphone (version navigateur) est servie sous /app : toute adresse de l'appli renvoie vers sa page
  async rewrites() {
    return { fallback: [{ source: '/app/:chemin*', destination: '/app/index.html' }] };
  },
};
export default config;
