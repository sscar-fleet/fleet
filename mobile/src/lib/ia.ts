// L'IA de Fleet tourne sur le serveur du site (la clé reste là-bas, jamais dans le téléphone) :
// l'appli envoie une photo, le serveur répond avec des champs remplis.
import { api } from './site';
import { DEMO } from './demo';

type Champs = Record<string, string | number | null>;

export async function lirePapier(image: string, genre: 'permis' | 'identite' | 'carte_grise'): Promise<Champs> {
  if (DEMO) { await new Promise((r) => setTimeout(r, 1200)); return { nom: 'MARTIN', prenom: 'Lucas', date_naissance: '1994-03-08', numero_permis: '12AB34567', date_permis: '2013-06-20' }; }
  return (await api<{ champs: Champs }>('lire', { image, genre })).champs;
}

export async function lireAmende(image: string): Promise<Champs> {
  if (DEMO) { await new Promise((r) => setTimeout(r, 1200)); const d = new Date(Date.now() - 2 * 864e5); d.setHours(15, 42, 0, 0); const loc = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T15:42`; return { immatriculation: 'IJ789KL', date_infraction: loc, lieu: 'Bd Périphérique, Paris 17e', type: 'Excès de vitesse', montant: 135, numero_avis: '1234567890' }; }
  return (await api<{ champs: Champs }>('lire', { image, genre: 'amende' })).champs;
}
