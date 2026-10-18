// Libellés et mises en forme communs à tous les écrans

export const statutVehicule: Record<string, string> = {
  disponible: 'Disponible', loue: 'Loué', maintenance: 'Maintenance', hors_service: 'Hors service',
};
export const statutLocation: Record<string, string> = {
  reservee: 'Réservée', en_cours: 'En cours', terminee: 'Terminée', annulee: 'Annulée',
};
export const statutCaution: Record<string, string> = {
  a_prendre: 'À prendre', prise: 'Prise', rendue: 'Rendue', encaissee: 'Retenue', litige: 'Litige',
};
export const statutAmende: Record<string, string> = {
  a_designer: 'À désigner', infos_manquantes: 'Infos manquantes', designee: 'Désignée', refusee: 'Refusée', payee: 'Payée',
};
export const statutEntretien: Record<string, string> = { prevu: 'Prévu', en_cours: 'En cours', termine: 'Terminé' };
export const statutEdl: Record<string, string> = { en_attente: 'En attente', a_comparer: 'À comparer', termine: 'Terminé' };
export const typeDommage: Record<string, string> = { rayure: 'Rayure', bosse: 'Bosse', impact: 'Impact', jante: 'Jante', autre: 'Autre' };
export const graviteDommage: Record<string, string> = { leger: 'Léger', moyen: 'Moyen', grave: 'Grave' };
export const carburants: Record<string, string> = {
  essence: 'Essence', diesel: 'Diesel', hybride: 'Hybride', electrique: 'Électrique', gpl: 'GPL',
};

// Les 10 photos guidées + le compteur, toujours dans le même ordre
export const photosGuidees: { position: string; libelle: string }[] = [
  { position: 'face_avant', libelle: 'Face avant' },
  { position: 'lateral_gauche_avant', libelle: 'Côté gauche, avant' },
  { position: 'lateral_gauche_arriere', libelle: 'Côté gauche, arrière' },
  { position: 'face_arriere', libelle: 'Face arrière' },
  { position: 'lateral_droit_arriere', libelle: 'Côté droit, arrière' },
  { position: 'lateral_droit_avant', libelle: 'Côté droit, avant' },
  { position: 'roue_avant_gauche', libelle: 'Roue avant gauche' },
  { position: 'roue_arriere_gauche', libelle: 'Roue arrière gauche' },
  { position: 'roue_arriere_droite', libelle: 'Roue arrière droite' },
  { position: 'roue_avant_droite', libelle: 'Roue avant droite' },
  { position: 'compteur', libelle: 'Compteur moteur allumé (km, carburant, voyants)' },
];
export const libellePosition = Object.fromEntries(photosGuidees.map((p) => [p.position, p.libelle]));

export const checklistEdl: { cle: string; libelle: string }[] = [
  { cle: 'voyant', libelle: 'Voyant allumé au tableau de bord' },
  { cle: 'badge', libelle: 'Badge parking' },
  { cle: 'kit', libelle: 'Kit anti-crevaison' },
  { cle: 'accessoires', libelle: 'Accessoires (siège bébé…)' },
  { cle: 'proprete', libelle: 'Véhicule propre' },
];

const fr = 'fr-FR';
export const date = (d?: string | null) => (d ? new Date(d).toLocaleDateString(fr, { timeZone: 'Europe/Paris' }) : '—');
export const dateHeure = (d?: string | null) =>
  d ? new Date(d).toLocaleString(fr, { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const heure = (d?: string | null) =>
  d ? new Date(d).toLocaleTimeString(fr, { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }) : '—';
export const euros = (n?: number | string | null) =>
  n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString(fr, { style: 'currency', currency: 'EUR' });
export const km = (n?: number | null) => (n === null || n === undefined ? '—' : `${n.toLocaleString(fr)} km`);

export const JOUR = 24 * 3600 * 1000;
export const joursEntre = (a: string | Date, b: string | Date) =>
  Math.max(1, Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / JOUR));

// Échéance : 'depasse' (rouge), 'proche' (< 30 jours, orange) ou ''
export function echeance(d?: string | null, jours = 30) {
  if (!d) return '';
  const reste = new Date(d).getTime() - Date.now();
  if (reste < 0) return 'depasse';
  return reste < jours * JOUR ? 'proche' : '';
}

// Le serveur tourne en UTC : toutes les dates saisies et affichées sont en heure de Paris
const TZ = 'Europe/Paris';
function partiesParis(d: Date) {
  const o: Record<string, string> = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach((p) => { o[p.type] = p.value; });
  return o;
}
// ISO -> valeur d'un champ datetime-local (heure de Paris)
export function versLocal(d?: string | null) {
  if (!d) return '';
  const o = partiesParis(new Date(d));
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}
// ISO -> valeur d'un champ date (jour à Paris)
export function versJour(d?: string | Date | null) {
  if (!d) return '';
  const o = partiesParis(new Date(d));
  return `${o.year}-${o.month}-${o.day}`;
}
// "2026-10-18T14:00" saisi à Paris -> ISO
export function depuisParis(s: string | null) {
  if (!s) return null;
  const brut = new Date((s.length === 10 ? s + 'T00:00' : s) + ':00Z');
  if (isNaN(brut.getTime())) return null;
  const o = partiesParis(brut);
  const vuParis = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute);
  return new Date(brut.getTime() - (vuParis - brut.getTime())).toISOString();
}
// Début du jour à Paris, décalé de n jours
export function debutJour(n = 0) {
  const j = versJour(new Date(Date.now() + n * JOUR));
  return depuisParis(j + 'T00:00')!;
}

export const texte = (v: FormDataEntryValue | null) => {
  const s = v === null ? '' : String(v).trim();
  return s === '' ? null : s;
};
export const nombre = (v: FormDataEntryValue | null) => {
  const s = texte(v);
  if (s === null) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
export const immat = (v: FormDataEntryValue | null) => String(v ?? '').toUpperCase().replace(/[\s-]/g, '');
