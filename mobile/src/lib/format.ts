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
