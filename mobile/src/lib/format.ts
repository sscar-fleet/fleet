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
