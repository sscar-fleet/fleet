const fr = 'fr-FR';
export const heure = (d?: string | null) => (d ? new Date(d).toLocaleTimeString(fr, { hour: '2-digit', minute: '2-digit' }) : '—');
export const jour = (d?: string | null) => (d ? new Date(d).toLocaleDateString(fr, { weekday: 'short', day: 'numeric', month: 'short' }) : '—');
export const euros = (n?: number | null) => (n == null ? '—' : Number(n).toLocaleString(fr, { style: 'currency', currency: 'EUR' }));
export const nomClient = (c?: { nom: string; prenom: string | null } | null) => (c ? [c.prenom, c.nom].filter(Boolean).join(' ') : '—');
export const nomVehicule = (v?: { marque: string | null; modele: string | null; immatriculation: string } | null) =>
  v ? [v.marque, v.modele].filter(Boolean).join(' ') || v.immatriculation : '—';
export const estAujourdhui = (d: string) => new Date(d).toDateString() === new Date().toDateString();
export const enRetard = (d: string) => new Date(d).getTime() < Date.now();
export const statutAmende: Record<string, string> = { a_designer: 'À désigner', infos_manquantes: 'Infos manquantes', designee: 'Désignée', refusee: 'Refusée', payee: 'Payée' };
export const statutVehicule: Record<string, string> = { disponible: 'Disponible', loue: 'Loué', maintenance: 'Maintenance', hors_service: 'Hors service', sorti: 'Sorti' };
export const km = (n?: number | null) => (n == null ? '—' : `${n.toLocaleString(fr)} km`);
export const dateCourte = (d?: string | null) => (d ? new Date(d).toLocaleDateString(fr, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
// Échéance : rouge si dépassée, orange à moins de 30 jours
export const echeance = (d?: string | null) => { if (!d) return ''; const r = new Date(d).getTime() - Date.now(); return r < 0 ? 'depasse' : r < 30 * 864e5 ? 'proche' : ''; };
export const telInternational = (t?: string | null) => (t ?? '').replace(/[^\d+]/g, '').replace(/^0/, '33').replace(/^\+/, '');
// « dans 35 min », « dans 2 h 10 », « depuis 1 h 20 »
export const duree = (ms: number) => {
  const min = Math.round(Math.abs(ms) / 60000);
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) { const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`; }
  return `${Math.round(min / 1440)} j`;
};
export const relatif = (d: string) => { const ms = new Date(d).getTime() - Date.now(); return ms >= 0 ? `dans ${duree(ms)}` : `depuis ${duree(ms)}`; };
export const nbJours = (a: string, b: string) => Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5));
export const prenom = (c?: { prenom: string | null; nom: string } | null) => c?.prenom || c?.nom || '';
// Plaque : AB123CD -> AB-123-CD ; téléphone : 0612345678 -> 06 12 34 56 78
export const plaque = (v?: string | null) => { const s = String(v ?? '').toUpperCase().replace(/[\s-]/g, ''); const m = s.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/); return m ? `${m[1]}-${m[2]}-${m[3]}` : (v ?? ''); };
export const tel = (v?: string | null) => {
  if (!v) return '';
  const d = String(v).replace(/[^\d+]/g, '');
  if (/^0\d{9}$/.test(d)) return d.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  const m = d.match(/^\+33(\d)(\d{8})$/);
  return m ? `+33 ${m[1]} ${m[2].replace(/(\d{2})(?=\d)/g, '$1 ').trim()}` : String(v).trim();
};
export const cleNom = (v?: string | null) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const sousSuite = (a: string, b: string) => { let i = 0; for (const ch of b) if (ch === a[i]) i++; return i === a.length; };
// Même personne probable : même téléphone, ou même prénom et un nom contenu dans l'autre (BRGT / BERGERET)
export function memePersonne(a: { nom?: string | null; prenom?: string | null; telephone?: string | null }, b: { nom?: string | null; prenom?: string | null; telephone?: string | null }) {
  const ta = String(a.telephone ?? '').replace(/\D/g, '').replace(/^33/, '0'), tb = String(b.telephone ?? '').replace(/\D/g, '').replace(/^33/, '0');
  if (ta.length >= 9 && ta === tb) return true;
  const na = cleNom(a.nom), nb = cleNom(b.nom), pa = cleNom(a.prenom), pb = cleNom(b.prenom);
  if (na.length < 3 || nb.length < 3) return false;
  const nomsProches = na === nb || (na.length <= nb.length ? sousSuite(na, nb) : sousSuite(nb, na));
  return nomsProches && (na === nb ? pa === pb || !pa || !pb : !!pa && pa === pb);
}
