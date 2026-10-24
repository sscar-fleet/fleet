// Fleet AI : l'agent qui répond sur la flotte et prépare les actions.
// Il lit les données de l'agence (droits de l'utilisateur connecté) et ne modifie jamais rien lui-même :
// chaque action est proposée avec un bouton, et c'est l'utilisateur qui confirme (voir executerAction).
import { lienWhatsApp } from './whatsapp';
import { plaque, euros, dateHeure, debutJour as jourParis } from './format';
import { calculerPilotage } from './pilotage';

export type Message = { role: 'user' | 'assistant'; content: string };
export type Proposition =
  | { type: 'prolonger'; location_id: string; fin: string; prix?: number | null; libelle: string }
  | { type: 'caution_prise'; location_id: string; libelle: string }
  | { type: 'annuler'; location_id: string; libelle: string }
  | { type: 'statut_vehicule'; vehicule_id: string; statut: 'disponible' | 'maintenance'; libelle: string }
  | { type: 'whatsapp'; lien: string; libelle: string }
  | { type: 'appeler'; telephone: string; libelle: string }
  | { type: 'ouvrir'; lien: string; libelle: string };

const nom = (c: any) => (c ? [c.prenom, c.nom].filter(Boolean).join(' ') : null);
const voiture = (v: any) => (v ? `${[v.marque, v.modele].filter(Boolean).join(' ')} ${plaque(v.immatriculation)}`.trim() : null);
const loc = (l: any) => ({
  id: l.id, numero: l.numero, statut: l.statut, depart: dateHeure(l.debut), retour: dateHeure(l.fin_prevue), retour_iso: l.fin_prevue,
  prix: l.prix_total, caution: l.caution_montant ? `${euros(l.caution_montant)} (${l.caution_statut})` : 'aucune',
  vehicule: voiture(l.vehicules), vehicule_id: l.vehicule_id, client: nom(l.clients), client_id: l.client_id, telephone: l.clients?.telephone ?? null,
  lien: `/locations/${l.id}`,
});
const CHAMPS_LOC = 'id, numero, statut, debut, fin_prevue, prix_total, caution_montant, caution_statut, vehicule_id, client_id, vehicules(immatriculation, marque, modele), clients(nom, prenom, telephone)';

const OUTILS = [
  { name: 'rechercher', description: 'Cherche des véhicules, des clients ou des locations à partir d’un texte libre (immatriculation, modèle, marque, nom, téléphone, numéro de contrat).',
    input_schema: { type: 'object', properties: { texte: { type: 'string' } }, required: ['texte'] } },
  { name: 'locations', description: 'Liste des locations. filtre : en_cours, reservees, aujourdhui (départs et retours du jour), demain, retards, recentes.',
    input_schema: { type: 'object', properties: { filtre: { type: 'string', enum: ['en_cours', 'reservees', 'aujourdhui', 'demain', 'retards', 'recentes'] } }, required: ['filtre'] } },
  { name: 'vehicules', description: 'Liste de la flotte avec statut, kilométrage, échéances d’assurance et de contrôle technique, prix par jour.',
    input_schema: { type: 'object', properties: {} } },
  { name: 'a_traiter', description: 'Amendes à désigner et FPS à refacturer ou à relancer.',
    input_schema: { type: 'object', properties: {} } },
  { name: 'chiffres', description: 'Encaissé, dépensé, bénéfice et occupation du mois en cours et du mois précédent.',
    input_schema: { type: 'object', properties: {} } },
  { name: 'proposer_action', description: 'Propose une action que l’utilisateur confirmera d’un bouton. Ne jamais dire qu’elle est faite : elle attend sa confirmation. Types : prolonger (location_id, fin au format ISO, prix facultatif), caution_prise (location_id), annuler (location_id, seulement une réservation), statut_vehicule (vehicule_id, statut disponible ou maintenance), whatsapp (telephone, message rédigé en français), appeler (telephone), ouvrir (lien interne du logiciel commençant par /).',
    input_schema: { type: 'object', properties: {
      type: { type: 'string', enum: ['prolonger', 'caution_prise', 'annuler', 'statut_vehicule', 'whatsapp', 'appeler', 'ouvrir'] },
      location_id: { type: 'string' }, vehicule_id: { type: 'string' }, fin: { type: 'string' }, prix: { type: 'number' },
      statut: { type: 'string' }, telephone: { type: 'string' }, message: { type: 'string' }, lien: { type: 'string' }, libelle: { type: 'string', description: 'Texte court du bouton' },
    }, required: ['type', 'libelle'] } },
];

async function outil(supabase: any, nomOutil: string, e: any, propositions: Proposition[]): Promise<unknown> {
  const maintenant = new Date().toISOString();
  if (nomOutil === 'rechercher') {
    const t = String(e.texte ?? '').trim();
    const motif = `%${t.replace(/[%,()]/g, ' ')}%`;
    const p = `%${t.toUpperCase().replace(/[\s-]/g, '')}%`;
    const num = /^\d{1,6}$/.test(t) ? Number(t) : null;
    const [v, c, l] = await Promise.all([
      supabase.from('vehicules').select('id, immatriculation, marque, modele, statut, km').neq('statut', 'sorti').or(`immatriculation.ilike.${p},marque.ilike.${motif},modele.ilike.${motif}`).limit(10),
      supabase.from('clients').select('id, nom, prenom, telephone, email, liste_noire').or(`nom.ilike.${motif},prenom.ilike.${motif},telephone.ilike.${motif},email.ilike.${motif}`).limit(10),
      num !== null ? supabase.from('locations').select(CHAMPS_LOC).eq('numero', num).limit(3) : Promise.resolve({ data: [] }),
    ]);
    // Pour chaque véhicule ou client trouvé : sa location en cours ou à venir
    const ids = (v.data ?? []).map((x: any) => x.id), idc = (c.data ?? []).map((x: any) => x.id);
    const { data: actives } = ids.length || idc.length
      ? await supabase.from('locations').select(CHAMPS_LOC).in('statut', ['reservee', 'en_cours']).or([ids.length ? `vehicule_id.in.(${ids.join(',')})` : '', idc.length ? `client_id.in.(${idc.join(',')})` : ''].filter(Boolean).join(','))
      : { data: [] };
    return {
      vehicules: (v.data ?? []).map((x: any) => ({ ...x, immatriculation: plaque(x.immatriculation), lien: `/vehicules/${x.id}` })),
      clients: (c.data ?? []).map((x: any) => ({ ...x, lien: `/clients/${x.id}` })),
      locations: [...(l.data ?? []), ...(actives ?? [])].map(loc),
    };
  }
  if (nomOutil === 'locations') {
    const debutJour = new Date(jourParis(0)), finJour = new Date(jourParis(1)), finDemain = new Date(jourParis(2));
    let q = supabase.from('locations').select(CHAMPS_LOC);
    switch (e.filtre) {
      case 'en_cours': q = q.eq('statut', 'en_cours').order('fin_prevue'); break;
      case 'reservees': q = q.eq('statut', 'reservee').order('debut'); break;
      case 'retards': q = q.eq('statut', 'en_cours').lt('fin_prevue', maintenant); break;
      case 'aujourdhui': q = q.in('statut', ['reservee', 'en_cours']).or(`and(debut.gte.${debutJour.toISOString()},debut.lt.${finJour.toISOString()}),and(fin_prevue.gte.${debutJour.toISOString()},fin_prevue.lt.${finJour.toISOString()})`); break;
      case 'demain': q = q.in('statut', ['reservee', 'en_cours']).or(`and(debut.gte.${finJour.toISOString()},debut.lt.${finDemain.toISOString()}),and(fin_prevue.gte.${finJour.toISOString()},fin_prevue.lt.${finDemain.toISOString()})`); break;
      default: q = q.order('debut', { ascending: false });
    }
    const { data } = await q.limit(30);
    return (data ?? []).map(loc);
  }
  if (nomOutil === 'vehicules') {
    const { data } = await supabase.from('vehicules').select('id, immatriculation, marque, modele, statut, km, prix_jour, assurance_echeance, ct_echeance').neq('statut', 'sorti').order('immatriculation');
    return (data ?? []).map((x: any) => ({ ...x, immatriculation: plaque(x.immatriculation), lien: `/vehicules/${x.id}` }));
  }
  if (nomOutil === 'a_traiter') {
    const [a, f] = await Promise.all([
      supabase.from('amendes').select('id, type, montant, date_infraction, echeance, statut, vehicules(immatriculation), clients(nom, prenom)').in('statut', ['a_designer', 'infos_manquantes']),
      supabase.from('fps').select('id, montant, frais_gestion, date_constat, statut, limite_paiement, paye_tresor, refacture_le, relance1_le, relance2_le, vehicules(immatriculation), clients(nom, prenom, telephone)').in('statut', ['a_refacturer', 'client_inconnu', 'refacture']),
    ]);
    return {
      amendes: (a.data ?? []).map((x: any) => ({ ...x, vehicule: plaque(x.vehicules?.immatriculation), conducteur: nom(x.clients), lien: '/amendes' })),
      fps: (f.data ?? []).map((x: any) => ({ ...x, vehicule: plaque(x.vehicules?.immatriculation), client: nom(x.clients), telephone: x.clients?.telephone, lien: '/fps' })),
    };
  }
  if (nomOutil === 'chiffres') {
    const p = await calculerPilotage(supabase, 'mois');
    const [prec, mois] = p.periodes.slice(-2);
    const r = (x: any) => x && ({ encaisse: x.recettes, depense: x.couts, benefice: x.resultat, departs: x.departs, retours: x.retours });
    return { mois_en_cours: r(mois), mois_precedent: r(prec) };
  }
  if (nomOutil === 'proposer_action') {
    const libelle = String(e.libelle ?? 'Confirmer').slice(0, 80);
    let p: Proposition | null = null;
    if (e.type === 'prolonger' && e.location_id && e.fin) p = { type: 'prolonger', location_id: e.location_id, fin: e.fin, prix: e.prix ?? null, libelle };
    if (e.type === 'caution_prise' && e.location_id) p = { type: 'caution_prise', location_id: e.location_id, libelle };
    if (e.type === 'annuler' && e.location_id) p = { type: 'annuler', location_id: e.location_id, libelle };
    if (e.type === 'statut_vehicule' && e.vehicule_id && ['disponible', 'maintenance'].includes(e.statut)) p = { type: 'statut_vehicule', vehicule_id: e.vehicule_id, statut: e.statut, libelle };
    if (e.type === 'whatsapp' && e.telephone && e.message) p = { type: 'whatsapp', lien: lienWhatsApp(e.telephone, e.message), libelle };
    if (e.type === 'appeler' && e.telephone) p = { type: 'appeler', telephone: e.telephone, libelle };
    if (e.type === 'ouvrir' && typeof e.lien === 'string' && e.lien.startsWith('/')) p = { type: 'ouvrir', lien: e.lien, libelle };
    if (!p) return { erreur: 'Action incomplète.' };
    propositions.push(p);
    return { ok: true, note: 'Bouton affiché : l’utilisateur doit confirmer.' };
  }
  return { erreur: 'Outil inconnu.' };
}

export async function demanderAgent(supabase: any, agence: string, historique: Message[]): Promise<{ reponse: string; propositions: Proposition[]; erreur?: string }> {
  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) return { reponse: '', propositions: [], erreur: 'Fleet AI n’est pas encore activé.' };
  const propositions: Proposition[] = [];
  const maintenant = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const systeme = `Tu es Fleet AI, l'assistant du logiciel SS CAR FLEET pour l'agence de location « ${agence} ». Nous sommes le ${maintenant} (heure de Paris).
Tu réponds en français, court et concret, comme un collègue efficace : la réponse d'abord, les détails utiles ensuite. Pas d'emoji.
Utilise toujours les outils pour lire les vraies données avant de répondre ; n'invente jamais un nom, un numéro ou un montant.
Quand l'utilisateur demande une action (prolonger, prévenir un client, noter une caution, envoyer un message, mettre une voiture à l'atelier…), utilise proposer_action : un bouton s'affiche et c'est lui qui confirme. Dis « je vous prépare… » ou « confirmez avec le bouton », jamais « c'est fait ».
Pour une prolongation, calcule la nouvelle date de retour en ISO (heure de Paris, ex. 2026-10-23T09:00:00+02:00) et le nouveau prix si le prix par jour est connu.
Pour un message WhatsApp au client, rédige-le poliment, vouvoiement, signé du nom de l'agence.
Quand tu cites une location, un client ou un véhicule, ajoute un lien au format [texte](/chemin) avec le lien fourni par les outils.
N'écris rien avant d'appeler un outil (pas de « je vais vérifier »). Si la demande contient plusieurs questions, réponds à chacune dans ta réponse finale. Le texte peut venir d'une dictée vocale : interprète les fautes de transcription (plaques épelées, noms approximatifs).`;
  const messages: any[] = historique.slice(-12).map((m) => ({ role: m.role, content: m.content }));
  const dits: string[] = [];
  for (let tour = 0; tour < 6; tour++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.IA_MODELE || 'claude-haiku-4-5-20251001', max_tokens: 1200, system: systeme, tools: OUTILS, messages }),
    });
    if (!r.ok) return { reponse: '', propositions, erreur: 'Fleet AI ne répond pas pour le moment. Réessayez dans un instant.' };
    const rep = await r.json();
    messages.push({ role: 'assistant', content: rep.content });
    const appels = (rep.content ?? []).filter((b: any) => b.type === 'tool_use');
    const texte = (rep.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    if (texte) dits.push(texte);
    if (rep.stop_reason !== 'tool_use' || !appels.length) {
      const reponse = dits.join('\n\n').trim();
      // Réponse vide : on le dit clairement plutôt que de demander de reformuler
      if (!reponse && !propositions.length) return { reponse: '', propositions, erreur: 'Fleet AI ne répond pas pour le moment. Réessayez dans un instant.' };
      return { reponse, propositions };
    }
    const resultats = [];
    for (const a of appels) {
      let contenu: unknown;
      try { contenu = await outil(supabase, a.name, a.input ?? {}, propositions); } catch (err: any) { contenu = { erreur: err?.message ?? 'Erreur' }; }
      resultats.push({ type: 'tool_result', tool_use_id: a.id, content: JSON.stringify(contenu).slice(0, 30000) });
    }
    messages.push({ role: 'user', content: resultats });
  }
  return { reponse: 'Je n’ai pas réussi à aller au bout. Pouvez-vous reformuler ?', propositions };
}

// L'utilisateur a confirmé : on exécute avec ses droits, en revérifiant tout
export async function executerAction(supabase: any, userId: string, p: Proposition): Promise<string> {
  const { data: u } = await supabase.from('utilisateurs').select('agence_id').eq('id', userId).single();
  const journal = (location_id: string | null, vehicule_id: string | null, action: string, detail?: string) =>
    supabase.from('historique').insert({ agence_id: u?.agence_id, location_id, vehicule_id, action, detail: (detail ? detail + ' · ' : '') + 'via Fleet AI', auteur: userId });
  if (p.type === 'prolonger') {
    const { data: l } = await supabase.from('locations').select('vehicule_id, debut, statut').eq('id', p.location_id).single();
    if (!l || !['reservee', 'en_cours'].includes(l.statut)) throw new Error('Cette location ne peut plus être prolongée.');
    const fin = new Date(p.fin);
    if (isNaN(fin.getTime()) || fin <= new Date(l.debut)) throw new Error('Date de retour invalide.');
    const { data: conflit } = await supabase.from('locations').select('numero').eq('vehicule_id', l.vehicule_id).in('statut', ['reservee', 'en_cours'])
      .neq('id', p.location_id).lt('debut', fin.toISOString()).gt('fin_prevue', l.debut).limit(1);
    if (conflit?.length) throw new Error(`La voiture est déjà réservée ensuite (contrat n° ${conflit[0].numero}).`);
    const { error } = await supabase.from('locations').update({ fin_prevue: fin.toISOString(), ...(p.prix != null ? { prix_total: p.prix } : {}) }).eq('id', p.location_id);
    if (error) throw new Error(error.message);
    await journal(p.location_id, l.vehicule_id, 'Prolongation', `retour le ${fin.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`);
    return `Prolongée jusqu’au ${fin.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`;
  }
  if (p.type === 'caution_prise') {
    const { error } = await supabase.from('locations').update({ caution_statut: 'prise' }).eq('id', p.location_id);
    if (error) throw new Error(error.message);
    await journal(p.location_id, null, 'Caution', 'prise');
    return 'Caution notée comme prise.';
  }
  if (p.type === 'annuler') {
    const { data: l } = await supabase.from('locations').select('statut').eq('id', p.location_id).single();
    if (l?.statut !== 'reservee') throw new Error('Seule une réservation pas encore partie peut être annulée.');
    const { error } = await supabase.from('locations').update({ statut: 'annulee' }).eq('id', p.location_id);
    if (error) throw new Error(error.message);
    await journal(p.location_id, null, 'Réservation annulée');
    return 'Réservation annulée.';
  }
  if (p.type === 'statut_vehicule') {
    const { error } = await supabase.from('vehicules').update({ statut: p.statut }).eq('id', p.vehicule_id);
    if (error) throw new Error(error.message);
    await journal(null, p.vehicule_id, p.statut === 'maintenance' ? 'Envoyé à l’atelier' : 'Remis disponible');
    return p.statut === 'maintenance' ? 'Véhicule passé en maintenance.' : 'Véhicule remis disponible.';
  }
  throw new Error('Action inconnue.');
}
