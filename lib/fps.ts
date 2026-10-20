// Suivi d'un FPS refacturé : quand relancer le client, et avec quel message
import { dateHeure, date, euros, plaque, JOUR } from './format';

export type FpsSuivi = {
  statut: string; refacture_le?: string | null; relance1_le?: string | null; relance2_le?: string | null; mise_en_demeure_le?: string | null;
  limite_paiement?: string | null; paye_tresor?: boolean | null; montant?: number | null; frais_gestion?: number | null; date_constat: string;
};

export const totalFps = (f: { montant?: number | null; frais_gestion?: number | null }) => Number(f.montant ?? 0) + Number(f.frais_gestion ?? 0);
const depuis = (d?: string | null) => (d ? (Date.now() - new Date(d).getTime()) / JOUR : 0);

// Prochaine relance due : J+7 après l'envoi de la facture, J+15 (8 jours après la première), puis dernier recours
export function relanceDue(f: FpsSuivi): 1 | 2 | 3 | null {
  if (f.statut !== 'refacture') return null;
  if (!f.relance1_le) return depuis(f.refacture_le) >= 7 ? 1 : null;
  if (!f.relance2_le) return depuis(f.relance1_le) >= 8 ? 2 : null;
  if (!f.mise_en_demeure_le) return depuis(f.relance2_le) >= 8 ? 3 : null;
  return null;
}

// À payer par le loueur bientôt (10 jours avant la majoration) ou déjà en retard
export function aPayerBientot(f: FpsSuivi) {
  if (f.paye_tresor || f.statut === 'abandonne' || !f.limite_paiement) return false;
  return new Date(f.limite_paiement + 'T23:59:59').getTime() - Date.now() < 10 * JOUR;
}

export function messageRelance(niveau: 1 | 2, o: { prenom?: string | null; voiture: string; immat?: string | null; date_constat: string; total: number; agence: string }) {
  const bonjour = `Bonjour${o.prenom ? ' ' + o.prenom : ''}`;
  const quoi = `le forfait post-stationnement de la ${o.voiture}${o.immat ? ' (' + plaque(o.immat) + ')' : ''} du ${dateHeure(o.date_constat)}, soit ${euros(o.total)}`;
  return niveau === 1
    ? `${bonjour}, petit rappel : ${quoi}, reste à régler. Merci de faire le nécessaire dès que possible. Bonne journée, ${o.agence}`
    : `${bonjour}, malgré notre premier rappel, ${quoi}, n'est toujours pas réglé. Sans règlement sous 8 jours, nous serons contraints de le retenir sur votre dépôt de garantie ou d'engager une procédure de recouvrement. ${o.agence}`;
}

export const libelleRelance = { 1: 'Relance 1 : rappel', 2: 'Relance 2 : ferme', 3: 'Dernier recours' } as const;
export const limitePaiementTexte = (d?: string | null) => (d ? date(d) : '—');
