// Lien WhatsApp avec message déjà écrit. Numéro français 06… converti en 336…
export function lienWhatsApp(telephone: string | null | undefined, message: string) {
  let n = (telephone ?? '').replace(/[^\d+]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  else if (n.startsWith('00')) n = n.slice(2);
  else if (n.startsWith('0')) n = '33' + n.slice(1);
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

const tz = { timeZone: 'Europe/Paris' } as const;
const jour = (d: string) => {
  const x = new Date(d);
  const auj = new Date().toLocaleDateString('fr-FR', tz);
  const dem = new Date(Date.now() + 864e5).toLocaleDateString('fr-FR', tz);
  const j = x.toLocaleDateString('fr-FR', tz);
  return j === auj ? 'aujourd’hui' : j === dem ? 'demain' : 'le ' + x.toLocaleDateString('fr-FR', { ...tz, weekday: 'long', day: 'numeric', month: 'long' });
};
const heure = (d: string) => new Date(d).toLocaleTimeString('fr-FR', { ...tz, hour: '2-digit', minute: '2-digit' }).replace(':', 'h');

export function messageDepart(prenom: string | null, voiture: string, debut: string, agence: string) {
  return `Bonjour${prenom ? ' ' + prenom : ''}, c'est ${agence}. Je vous confirme le départ de la ${voiture} ${jour(debut)} à ${heure(debut)}. Pensez à prendre votre permis et votre pièce d'identité. À bientôt !`;
}
export function messageRetour(prenom: string | null, voiture: string, fin: string) {
  return `Bonjour${prenom ? ' ' + prenom : ''}, petit rappel : retour de la ${voiture} ${jour(fin)} à ${heure(fin)}. Merci de la rendre avec le même niveau de carburant. Bonne journée !`;
}
export function messageRetard(prenom: string | null, voiture: string, fin: string) {
  return `Bonjour${prenom ? ' ' + prenom : ''}, la ${voiture} devait être rendue ${jour(fin)} à ${heure(fin)}. Pouvez-vous me dire à quelle heure vous la ramenez ? Merci.`;
}
