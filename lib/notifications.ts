// Notifications utiles, calculées à la volée depuis les données de l'agence.
// Règle d'or : seulement ce qui coûte de l'argent ou crée un risque, avec un bouton pour le régler.
// Une notification par sujet (clé stable), qui disparaît d'elle-même quand le problème est réglé.
import { plaque, euros } from './format';
import { relanceDue, totalFps } from './fps';

export type Niveau = 'rouge' | 'orange' | 'gris';
export type Famille = 'argent' | 'terrain' | 'flotte' | 'papiers';
export type ActionNotif =
  | { type: 'lien'; libelle: string; href: string }
  | { type: 'tel'; libelle: string; numero: string }
  | { type: 'whatsapp'; libelle: string; numero: string; texte: string }
  | { type: 'faire'; libelle: string; action: 'rendre_caution' | 'prolonger_maintenance' | 'terminer_maintenance'; id: string; jours?: number };
export type Notif = { cle: string; niveau: Niveau; famille: Famille; titre: string; detail: string; montant?: number | null; quand?: string | null; actions: ActionNotif[] };

const JOUR = 864e5;
const ORDRE: Record<Niveau, number> = { rouge: 0, orange: 1, gris: 2 };
const dans = (d: string | null | undefined) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / JOUR) : null);
const jourFr = (d: string) => new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short' });
const heureFr = (d: string) => new Date(d).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const nomClient = (c: any) => [c?.prenom, c?.nom].filter(Boolean).join(' ') || 'le client';
const voiture = (v: any) => `${[v?.marque, v?.modele].filter(Boolean).join(' ')} ${plaque(v?.immatriculation ?? '')}`.trim();
const enTemps = (n: number) => (n <= 0 ? 'aujourd’hui' : n === 1 ? 'demain' : `dans ${n} jours`);

// parAgence : appel par la tournée serveur (clé complète, sans règles d'accès) : chaque requête est alors
// limitée explicitement à l'agence de l'utilisateur
export async function calculerNotifications(supabase: any, profil: { id: string; role: string; agence_id: string }, options: { parAgence?: boolean } = {}) {
  const ag = (q: any) => (options.parAgence ? q.eq('agence_id', profil.agence_id) : q);
  const maintenant = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const [
    { data: fps }, { data: amendes }, { data: retards }, { data: departs }, { data: vehicules },
    { data: entretiens }, { data: cautions }, { data: dommages }, { data: locsRecentes }, { data: agence }, { data: etats },
  ] = await Promise.all([
    ag(supabase.from('fps').select('*, vehicules(immatriculation, marque, modele), clients(nom, prenom, telephone)').not('statut', 'in', '(rembourse,abandonne)')),
    ag(supabase.from('amendes').select('id, numero_avis, montant, echeance, statut, vehicules(immatriculation, marque, modele)').in('statut', ['a_designer', 'infos_manquantes'])),
    ag(supabase.from('locations').select('id, numero, fin_prevue, vehicules(immatriculation, marque, modele), clients(nom, prenom, telephone)').eq('statut', 'en_cours').lt('fin_prevue', iso(maintenant - 3600e3))),
    ag(supabase.from('locations').select('id, numero, debut, caution_statut, caution_montant, vehicules(immatriculation, marque, modele), clients(nom, prenom, telephone, permis_path, piece_identite_path)').eq('statut', 'reservee').lt('debut', iso(maintenant + 2 * 3600e3))),
    ag(supabase.from('vehicules').select('*, traceurs(moteur_coupe)').neq('statut', 'sorti')),
    ag(supabase.from('entretiens').select('*, vehicules(id, immatriculation, marque, modele, prix_jour)').in('statut', ['en_cours', 'prevu'])),
    ag(supabase.from('locations').select('id, numero, fin_reelle, caution_montant, vehicules(immatriculation, marque, modele), clients(nom, prenom, telephone)').eq('statut', 'terminee').eq('caution_statut', 'prise').lt('fin_reelle', iso(maintenant - 2 * JOUR))),
    ag(supabase.from('dommages').select('location_id').not('location_id', 'is', null)),
    ag(supabase.from('locations').select('id, numero, vehicule_id, debut, fin_prevue, fin_reelle, statut, clients(nom)').in('statut', ['reservee', 'en_cours', 'terminee']).gt('fin_prevue', iso(maintenant - 60 * JOUR))),
    supabase.from('agences').select('*').eq('id', profil.agence_id).single(),
    supabase.from('notifications_etat').select('cle, jusqua, ignoree').eq('utilisateur_id', profil.id),
  ]);

  const liste: Notif[] = [];
  const locsActives = (locsRecentes ?? []).filter((l: any) => l.statut === 'reservee' || l.statut === 'en_cours');
  const occupee = (vid: string) => locsActives.find((l: any) => l.vehicule_id === vid);

  // ——— FPS : majoration qui approche (20 %, 50 € minimum)
  (fps ?? []).forEach((f: any) => {
    const n = dans(f.limite_paiement);
    if (!f.paye_tresor && n != null && n <= 7) {
      const majoration = Math.max(50, Number(f.montant ?? 0) * 0.2);
      liste.push({ cle: `fps-paiement-${f.id}`, niveau: 'rouge', famille: 'argent', montant: majoration, quand: f.limite_paiement,
        titre: `FPS ${plaque(f.vehicules?.immatriculation ?? '')} à payer ${n < 0 ? 'en retard' : enTemps(n)}`,
        detail: `${euros(f.montant)} · ${n < 0 ? 'majoration déjà appliquée' : `+${euros(majoration)} de majoration après le ${jourFr(f.limite_paiement)}`}`,
        actions: [{ type: 'lien', libelle: 'Payer en ligne', href: 'https://www.stationnement.gouv.fr' }, { type: 'lien', libelle: 'Ouvrir', href: '/fps' }] });
    }
    const relance = relanceDue(f);
    if (relance && f.clients?.telephone) {
      liste.push({ cle: `fps-relance-${f.id}-${relance}`, niveau: 'orange', famille: 'argent', montant: totalFps(f),
        titre: `FPS non remboursé par ${nomClient(f.clients)}`, detail: `${euros(totalFps(f))} · ${relance === 3 ? 'mise en demeure à envoyer' : `relance ${relance} à envoyer`}`,
        actions: [{ type: 'lien', libelle: relance === 3 ? 'Mise en demeure' : 'Relancer', href: '/fps' }] });
    }
  });

  // ——— Amendes : désigner le conducteur avant l'échéance (sinon l'agence paie, plus cher en société)
  (amendes ?? []).forEach((a: any) => {
    const n = dans(a.echeance);
    if (n == null || n > 10) return;
    liste.push({ cle: `amende-${a.id}`, niveau: 'rouge', famille: 'argent', montant: Number(a.montant ?? 0), quand: a.echeance,
      titre: `Amende ${plaque(a.vehicules?.immatriculation ?? '')} : conducteur à désigner ${n < 0 ? '(délai dépassé)' : enTemps(n)}`,
      detail: `${a.montant ? euros(a.montant) + ' · ' : ''}sinon l’agence paie, avec une amende de non-désignation`,
      actions: [{ type: 'lien', libelle: 'Désigner', href: '/amendes' }] });
  });

  // ——— Retards de plus d'une heure
  (retards ?? []).forEach((l: any) => {
    const tel = l.clients?.telephone;
    const h = Math.round((maintenant - new Date(l.fin_prevue).getTime()) / 3600e3);
    liste.push({ cle: `retard-${l.id}`, niveau: 'rouge', famille: 'terrain', quand: l.fin_prevue,
      titre: `${nomClient(l.clients)} en retard de ${h >= 24 ? Math.round(h / 24) + ' j' : h + ' h'}`, detail: `${voiture(l.vehicules)} · retour prévu ${jourFr(l.fin_prevue)} ${heureFr(l.fin_prevue)}`,
      actions: [...(tel ? [{ type: 'tel', libelle: 'Appeler', numero: tel } as ActionNotif, { type: 'whatsapp', libelle: 'WhatsApp', numero: tel, texte: `Bonjour ${l.clients?.prenom ?? ''}, la ${[l.vehicules?.marque, l.vehicules?.modele].filter(Boolean).join(' ')} devait être rendue à ${heureFr(l.fin_prevue)}. Pouvez-vous me dire à quelle heure vous la ramenez ? Merci.` } as ActionNotif] : []),
        { type: 'lien', libelle: 'Ouvrir', href: `/locations/${l.id}` }] });
  });

  // ——— Départ dans moins de 2 h, dossier incomplet
  (departs ?? []).forEach((l: any) => {
    const manque = [!l.clients?.permis_path && 'permis', !l.clients?.piece_identite_path && 'pièce d’identité',
      Number(l.caution_montant) > 0 && l.caution_statut === 'a_prendre' && 'caution'].filter(Boolean);
    if (!manque.length) return;
    liste.push({ cle: `depart-${l.id}`, niveau: 'rouge', famille: 'terrain', quand: l.debut,
      titre: `Départ ${heureFr(l.debut)} : ${manque.join(', ')} manquant${manque.length > 1 ? 's' : ''}`, detail: `${nomClient(l.clients)} · ${voiture(l.vehicules)}`,
      actions: [{ type: 'lien', libelle: 'Compléter', href: `/locations/${l.id}` }] });
  });

  // ——— Papiers des véhicules, moteur coupé sur une voiture louée
  (vehicules ?? []).forEach((v: any) => {
    const loc = occupee(v.id);
    ([['assurance', v.assurance_echeance], ['contrôle technique', v.ct_echeance]] as [string, string | null][]).forEach(([quoi, d]) => {
      const n = dans(d);
      if (n == null) return;
      if (n < 0 && loc) liste.push({ cle: `papier-${quoi}-${v.id}`, niveau: 'rouge', famille: 'papiers', quand: d,
        titre: `${plaque(v.immatriculation)} : ${quoi} expiré${quoi === 'assurance' ? 'e' : ''}`, detail: `La voiture est ${loc.statut === 'en_cours' ? 'en location' : 'réservée'} (n° ${loc.numero})`,
        actions: [{ type: 'lien', libelle: 'Mettre à jour', href: `/vehicules/${v.id}` }] });
      else if (n <= 15) liste.push({ cle: `papier-${quoi}-${v.id}`, niveau: 'orange', famille: 'papiers', quand: d,
        titre: `${plaque(v.immatriculation)} : ${quoi} ${n < 0 ? 'expiré' + (quoi === 'assurance' ? 'e' : '') : 'à renouveler ' + enTemps(n)}`, detail: voiture(v),
        actions: [{ type: 'lien', libelle: 'Mettre à jour', href: `/vehicules/${v.id}` }] });
    });
    if (v.traceurs?.moteur_coupe && loc?.statut === 'en_cours') liste.push({ cle: `moteur-${v.id}`, niveau: 'rouge', famille: 'flotte',
      titre: `${plaque(v.immatriculation)} : moteur coupé pendant une location`, detail: `Location n° ${loc.numero} · ${loc.clients?.nom ?? ''}`,
      actions: [{ type: 'lien', libelle: 'Voir sur la carte', href: `/carte?vehicule=${v.id}` }] });
    // Prêts entre loueurs
    if (v.financement === 'pret' && v.pret_retour) {
      const n = dans(v.pret_retour)!;
      if (n <= 2) liste.push({ cle: `emprunt-${v.id}`, niveau: n < 0 ? 'rouge' : 'orange', famille: 'flotte', quand: v.pret_retour,
        titre: `${plaque(v.immatriculation)} à rendre à ${v.pret_par ?? 'son propriétaire'} ${n < 0 ? '(date dépassée)' : enTemps(n)}`,
        detail: loc ? `Attention : réservée ou louée (n° ${loc.numero})` : voiture(v), actions: [{ type: 'lien', libelle: 'Prêts confrères', href: '/prets' }] });
    }
    // Voiture qui dort : pas louée depuis 15 jours
    if (v.statut === 'disponible' && v.financement !== 'pret') {
      const derniere = (locsRecentes ?? []).filter((l: any) => l.vehicule_id === v.id).map((l: any) => new Date(l.fin_reelle ?? l.fin_prevue).getTime()).sort((a: number, b: number) => b - a)[0];
      const depuis = derniere ?? new Date(v.date_entree ?? v.created_at).getTime();
      const j = Math.floor((maintenant - depuis) / JOUR);
      if (j >= 15 && !occupee(v.id)) liste.push({ cle: `dort-${v.id}-${Math.floor(j / 15)}`, niveau: 'gris', famille: 'flotte',
        titre: `${plaque(v.immatriculation)} pas louée depuis ${j} jours`, detail: v.prix_jour ? `Environ ${euros(Number(v.prix_jour) * j)} de chiffre manqué` : voiture(v),
        actions: [{ type: 'lien', libelle: 'Louer', href: `/locations/nouvelle?vehicule=${v.id}` }] });
    }
  });

  // ——— Maintenance : réservation qui tombe dessus, sortie dépassée, immobilisation longue
  (entretiens ?? []).forEach((e: any) => {
    const v = e.vehicules;
    const tel = e.garage_tel;
    const transfert = e.type === 'transfert';
    const finPrevue = e.retour_prevu ? new Date(e.retour_prevu).getTime() : null;
    const touchee = (locsActives as any[]).find((l) => l.vehicule_id === v?.id && l.statut === 'reservee' && (!finPrevue || new Date(l.debut).getTime() < finPrevue));
    if (e.statut === 'en_cours' && touchee) liste.push({ cle: `maint-resa-${e.id}-${touchee.id}`, niveau: 'rouge', famille: 'flotte', quand: touchee.debut,
      titre: `${plaque(v?.immatriculation ?? '')} ${transfert ? 'prêtée' : 'en maintenance'} mais réservée le ${jourFr(touchee.debut)}`,
      detail: `Réservation n° ${touchee.numero}${touchee.clients?.nom ? ' · ' + touchee.clients.nom : ''} : changez-la de voiture`,
      actions: [{ type: 'lien', libelle: 'Changer de voiture', href: `/locations/${touchee.id}` }, { type: 'lien', libelle: 'Planning', href: '/planning' }] });
    if (e.statut === 'en_cours' && finPrevue && finPrevue < maintenant) {
      const j = Math.ceil((maintenant - finPrevue) / JOUR);
      liste.push({ cle: `maint-sortie-${e.id}-${e.retour_prevu}`, niveau: 'orange', famille: 'flotte', quand: e.retour_prevu,
        titre: transfert ? `${plaque(v?.immatriculation ?? '')} pas revenue de chez ${e.garage ?? 'le confrère'}` : `${plaque(v?.immatriculation ?? '')} devait sortir du garage il y a ${j} j`,
        detail: `${e.garage ?? (transfert ? 'Prêt' : 'Garage')} · sortie prévue ${jourFr(e.retour_prevu)}${v?.prix_jour ? ` · ${euros(Number(v.prix_jour))} de manque à gagner par jour` : ''}`,
        actions: [...(tel ? [{ type: 'tel', libelle: transfert ? 'Appeler le confrère' : 'Appeler le garage', numero: tel } as ActionNotif] : []),
          { type: 'faire', libelle: '+3 jours', action: 'prolonger_maintenance', id: e.id, jours: 3 },
          { type: 'faire', libelle: '+7 jours', action: 'prolonger_maintenance', id: e.id, jours: 7 },
          { type: 'faire', libelle: transfert ? 'Revenue' : 'Sortie du garage', action: 'terminer_maintenance', id: e.id },
          { type: 'lien', libelle: 'Fiche', href: `/entretiens/${e.id}` }] });
    }
    if (e.statut === 'en_cours' && !transfert) {
      const j = Math.floor((maintenant - new Date(e.debut ?? e.created_at).getTime()) / JOUR);
      if (j >= 7) liste.push({ cle: `maint-longue-${e.id}-${Math.floor(j / 7)}`, niveau: 'gris', famille: 'flotte',
        titre: `${plaque(v?.immatriculation ?? '')} immobilisée depuis ${j} jours`, detail: v?.prix_jour ? `${euros(Number(v.prix_jour) * j)} de manque à gagner` : (e.garage ?? 'En maintenance'),
        montant: v?.prix_jour ? Number(v.prix_jour) * j : null, actions: [{ type: 'lien', libelle: 'Fiche maintenance', href: `/entretiens/${e.id}` }] });
    }
  });
  // Véhicules prêtés pas revenus : couvert par la maintenance de type transfert ci-dessus

  // ——— Cautions encore bloquées 48 h après un retour sans dégât
  const avecDegat = new Set((dommages ?? []).map((d: any) => d.location_id));
  (cautions ?? []).filter((l: any) => !avecDegat.has(l.id)).forEach((l: any) => {
    const j = Math.floor((maintenant - new Date(l.fin_reelle).getTime()) / JOUR);
    liste.push({ cle: `caution-${l.id}`, niveau: 'orange', famille: 'argent', montant: Number(l.caution_montant ?? 0),
      titre: `Caution de ${nomClient(l.clients)} toujours bloquée`, detail: `${l.caution_montant ? euros(l.caution_montant) + ' · ' : ''}voiture rendue il y a ${j} jours, sans dégât`,
      actions: [{ type: 'faire', libelle: 'Rendre la caution', action: 'rendre_caution', id: l.id }, { type: 'lien', libelle: 'Ouvrir', href: `/locations/${l.id}` }] });
  });

  // ——— Kbis de plus de 3 mois (gérant)
  if ((agence as any)?.kbis_date && maintenant - new Date((agence as any).kbis_date).getTime() > 92 * JOUR)
    liste.push({ cle: `kbis-${(agence as any).kbis_date}`, niveau: 'orange', famille: 'papiers', titre: 'Extrait Kbis de plus de 3 mois',
      detail: 'Les fourrières et certains partenaires le refusent', actions: [{ type: 'lien', libelle: 'Télécharger', href: 'https://www.infogreffe.fr' }, { type: 'lien', libelle: 'Réglages', href: '/parametres' }] });

  // ——— Filtrage : rôle, reporté, ignoré
  const masque = new Map<string, any>((etats ?? []).map((e: any) => [e.cle, e]));
  const visibles = liste
    .filter((n) => profil.role === 'gerant' || n.famille === 'terrain' || n.famille === 'flotte')
    .filter((n) => { const e = masque.get(n.cle); return !e || (!e.ignoree && (!e.jusqua || new Date(e.jusqua).getTime() < maintenant)); })
    .sort((a, b) => ORDRE[a.niveau] - ORDRE[b.niveau] || Number(b.montant ?? 0) - Number(a.montant ?? 0) || String(a.quand ?? '9').localeCompare(String(b.quand ?? '9')));
  return { notifications: visibles, urgentes: visibles.filter((n) => n.niveau === 'rouge').length };
}

// Résumé du jour en une ou deux phrases (l'IA l'écrit une fois par jour ; sinon une phrase simple)
export function resumeSimple(liste: Notif[]) {
  const r = liste.filter((n) => n.niveau === 'rouge'), o = liste.filter((n) => n.niveau === 'orange');
  if (!r.length && !o.length) return 'Rien d’urgent aujourd’hui. Tout est sous contrôle.';
  const enjeu = liste.reduce((s, n) => s + (n.niveau !== 'gris' ? Number(n.montant ?? 0) : 0), 0);
  return `${r.length ? `${r.length} urgent${r.length > 1 ? 's' : ''}` : 'Rien d’urgent'}${o.length ? `, ${o.length} à traiter cette semaine` : ''}.${enjeu > 0 ? ` En jeu : ${euros(enjeu)}.` : ''} Commencez par : ${(r[0] ?? o[0]).titre.toLowerCase()}.`;
}

export async function resumeDuJour(supabase: any, agenceId: string, role: string, liste: Notif[]) {
  const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const empreinte = 'v2|' + liste.filter((n) => n.niveau !== 'gris').map((n) => n.cle).sort().join('|').slice(0, 2000);
  const { data: deja } = await supabase.from('notifications_resume').select('texte, empreinte').eq('agence_id', agenceId).eq('jour', jour).eq('role', role).maybeSingle();
  if (deja && deja.empreinte === empreinte) return deja.texte as string;
  const cle = process.env.ANTHROPIC_API_KEY;
  let texte = resumeSimple(liste);
  if (cle && liste.some((n) => n.niveau !== 'gris')) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: process.env.IA_MODELE || 'claude-haiku-4-5-20251001', max_tokens: 160,
          messages: [{ role: 'user', content: `Tu es l'assistant d'un loueur de voitures. Écris en français, en 2 phrases courtes (35 mots maximum au total), sans emoji ni liste, le point du jour à partir de ces rappels (du plus urgent au moins urgent). Dis ce qu'il faut faire en premier et le montant en jeu s'il y en a. Tutoiement interdit, ton direct et calme.\n\n${liste.filter((n) => n.niveau !== 'gris').slice(0, 12).map((n) => `- [${n.niveau}] ${n.titre} — ${n.detail}`).join('\n')}` }],
        }),
      });
      if (r.ok) { const j = await r.json(); const t = j?.content?.find((c: any) => c.type === 'text')?.text?.trim(); if (t) texte = t; }
    } catch { /* résumé simple */ }
  }
  await supabase.from('notifications_resume').upsert({ agence_id: agenceId, jour, role, texte, empreinte });
  return texte;
}
