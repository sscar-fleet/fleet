import { NextResponse } from 'next/server';
import { adminConfigure, supabaseAdmin } from '@/lib/supabaseAdmin';
import { envoyerPush, type MessagePush } from '@/lib/push';
import { alertesTraccar, demarragesTraccar, etatsTraccar } from '@/lib/traccar';
import { rapportJour, heureParis as heureDe } from '@/lib/rapportTransport';
import { reglesDe } from '@/lib/planning';
import { ajouterJours, nomChauffeur } from '@/lib/transport';
import { calculerNotifications, resumeDuJour } from '@/lib/notifications';
import { plaque } from '@/lib/format';
import { choixComplets, familleDeCle, jamaisEnPush } from '@/lib/choixPush';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Tournée des notifications, lancée chaque minute par la base (pg_cron) :
//  1. alertes des boîtiers qui peuvent signaler un vol (vibration, remorquage, débranché, brouillage, sortie de zone) : tout de suite, jour et nuit
//  2. nouvelles urgences de la cloche (retard, départ sans caution, FPS qui va être majoré…) : toutes les 5 min, de 7 h à 22 h
//  3. les retours prévus dans l'heure, et le point du jour une fois par matin à partir de 8 h 30
// Chaque notification n'est envoyée qu'une fois par personne (table push_envoyes), et seulement si la personne
// a gardé cette famille de notifications (Mon compte > Notifications).
const heureParis = () => { const p = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' })); return { h: p.getHours(), m: p.getMinutes(), jour: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }) }; };
const MAX_PAR_TOURNEE = 3;

async function tournee(request: Request) {
  if (!adminConfigure()) return NextResponse.json({ erreur: 'Clé serveur Supabase absente.' }, { status: 503 });
  const db = supabaseAdmin();
  const { data: cle } = await db.from('interne').select('valeur').eq('cle', 'jeton_tournee').maybeSingle();
  if (!cle?.valeur || request.headers.get('x-jeton') !== cle.valeur) return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });

  const { data: appareils } = await db.from('appareils_push').select('jeton, utilisateur_id, agence_id').eq('actif', true);
  if (!appareils?.length) return NextResponse.json({ ok: true, envoyes: 0 });
  const parUtilisateur = new Map<string, { agence_id: string; jetons: string[] }>();
  appareils.forEach((a: any) => { const u = parUtilisateur.get(a.utilisateur_id) ?? { agence_id: a.agence_id as string, jetons: [] as string[] }; u.jetons.push(a.jeton); parUtilisateur.set(a.utilisateur_id, u); });
  const ids = [...parUtilisateur.keys()];
  const [{ data: utilisateurs }, { data: deja }, { data: prefs }] = await Promise.all([
    db.from('utilisateurs').select('id, role, agence_id, acces').in('id', ids).neq('acces', 'chauffeur'),
    db.from('push_envoyes').select('utilisateur_id, cle').in('utilisateur_id', ids).gt('envoye_le', new Date(Date.now() - 30 * 864e5).toISOString()),
    db.from('preferences_push').select('utilisateur_id, choix').in('utilisateur_id', ids),
  ]);
  const choixDe = new Map<string, ReturnType<typeof choixComplets>>((prefs ?? []).map((p: any) => [p.utilisateur_id as string, choixComplets(p.choix)]));
  const veut = (u: any, cle: string) => (choixDe.get(u.id) ?? choixComplets(null))[familleDeCle(cle)];
  const envoye = new Set((deja ?? []).map((d: any) => `${d.utilisateur_id}|${d.cle}`));
  const messages: MessagePush[] = [];
  const notes: { utilisateur_id: string; agence_id: string; cle: string }[] = [];
  const pour = (u: any, cle: string, m: Omit<MessagePush, 'to'>) => {
    if (envoye.has(`${u.id}|${cle}`)) return false;
    if (jamaisEnPush(cle) || (!cle.startsWith('groupe-') && !veut(u, cle))) return false;
    envoye.add(`${u.id}|${cle}`);
    parUtilisateur.get(u.id)!.jetons.forEach((to) => messages.push({ ...m, to }));
    notes.push({ utilisateur_id: u.id, agence_id: u.agence_id, cle });
    return true;
  };

  // 1. Alertes des boîtiers (notre serveur GPS, temps réel)
  const alertes = (await alertesTraccar(6 / 60).catch(() => [])).filter((a) => a.critique && a.imei);
  if (alertes.length) {
    const agences = [...new Set((utilisateurs ?? []).map((u: any) => u.agence_id))];
    const { data: vehicules } = await db.from('vehicules').select('id, agence_id, immatriculation, marque, modele, traceurs(imei)').in('agence_id', agences).neq('statut', 'sorti');
    const parImei = new Map((vehicules ?? []).filter((v: any) => v.traceurs?.imei).map((v: any) => [String(v.traceurs.imei), v]));
    for (const a of alertes) {
      const v: any = parImei.get(String(a.imei)); if (!v) continue;
      for (const u of (utilisateurs ?? []).filter((x: any) => x.agence_id === v.agence_id)) {
        pour(u, `gps-${a.id}`, { title: `${plaque(v.immatriculation)} : ${a.libelle}`, body: `${[v.marque, v.modele].filter(Boolean).join(' ')} · touchez pour la voir sur la carte`.trim(), data: { href: `/carte?vehicule=${v.id}` }, urgent: true });
      }
    }
  }

  // Version transport : démarrages, prise de poste (jour et nuit) et rapport du matin
  const { h, m, jour } = heureParis();
  const agencesIds = [...new Set((utilisateurs ?? []).map((u: any) => u.agence_id))];
  // (si la base n'a pas encore la version transport, la requête échoue sans bloquer le reste de la tournée)
  const { data: agencesT } = agencesIds.length ? await db.from('agences').select('id, metier, regles_transport').in('id', agencesIds).eq('metier', 'transport').then((r: any) => (r.error ? { data: [] } : r)) : { data: [] as any[] };
  if ((agencesT ?? []).length) {
    const idsT = (agencesT ?? []).map((a: any) => a.id);
    const [demarrages, etats, { data: camions }, { data: tourneesJour }, { data: chauffeursT }] = await Promise.all([
      demarragesTraccar(3).catch(() => []), etatsTraccar().catch(() => []),
      db.from('vehicules').select('id, agence_id, immatriculation, traceurs(imei)').in('agence_id', idsT).neq('statut', 'sorti'),
      db.from('tournees').select('id, agence_id, jour, debut, fin, chauffeur_id, vehicule_id, statut').in('agence_id', idsT).in('jour', [ajouterJours(jour, -1), jour]).neq('statut', 'annulee'),
      db.from('chauffeurs').select('id, prenom, nom').in('agence_id', idsT),
    ]);
    const parImeiT = new Map((camions ?? []).filter((v: any) => v.traceurs?.imei).map((v: any) => [String(v.traceurs.imei), v]));
    const etatDe = new Map(etats.map((e) => [e.imei, e]));
    const minParis = h * 60 + m;
    const mn = (x: string) => { const [a, b] = String(x).split(':').map(Number); return a * 60 + b; };
    // Créneau d'une tournée en minutes depuis minuit aujourd'hui (une tournée d'hier qui finit après minuit compte aussi)
    const creneau = (t: any) => { let d = mn(t.debut), f = mn(t.fin); if (f <= d) f += 1440; if (t.jour !== jour) { d -= 1440; f -= 1440; } return [d, f]; };
    const chNom = (id?: string | null) => nomChauffeur((chauffeursT ?? []).find((c: any) => c.id === id));
    for (const ev of demarrages) {
      const v: any = parImeiT.get(ev.imei); if (!v) continue;
      const avance = reglesDe((agencesT ?? []).find((a: any) => a.id === v.agence_id)?.regles_transport).prisePosteMinutes;
      const t: any = (tourneesJour ?? []).find((x: any) => x.vehicule_id === v.id && (() => { const [d, f] = creneau(x); return minParis >= d - avance - 30 && minParis <= f + 30; })());
      const quand = heureDe(ev.le);
      for (const u of (utilisateurs ?? []).filter((x: any) => x.agence_id === v.agence_id)) {
        if (t) pour(u, `dem-${ev.id}`, { title: `${plaque(v.immatriculation)} a démarré`, body: `${chNom(t.chauffeur_id) || 'Chauffeur non indiqué'} · tournée de ${String(t.debut).slice(0, 5)} · ${quand}`, data: { href: `/carte?vehicule=${v.id}` } });
        else pour(u, `hors-${ev.id}`, { title: `${plaque(v.immatriculation)} démarre hors tournée`, body: `Aucune tournée prévue à cette heure · ${quand}`, data: { href: `/carte?vehicule=${v.id}` }, urgent: true });
      }
    }
    // Prise de poste : la tournée commence dans le délai réglé et le camion n'a pas bougé
    for (const t of (tourneesJour ?? []).filter((x: any) => x.jour === jour && x.statut === 'prevue' && x.vehicule_id)) {
      const reg = reglesDe((agencesT ?? []).find((a: any) => a.id === t.agence_id)?.regles_transport);
      if (!reg.prisePosteMinutes) continue;
      const [d] = creneau(t);
      if (minParis < d - reg.prisePosteMinutes || minParis > d + 20) continue;
      const v: any = (camions ?? []).find((x: any) => x.id === t.vehicule_id);
      const e = v?.traceurs?.imei ? etatDe.get(String(v.traceurs.imei)) : undefined;
      if (!e || !e.enLigne || e.enMouvement || e.contact === true) continue; // pas de donnée fiable, ou déjà parti
      for (const u of (utilisateurs ?? []).filter((x: any) => x.agence_id === t.agence_id)) {
        pour(u, `prise-${t.id}`, { title: `${chNom(t.chauffeur_id) || 'Un chauffeur'} n’est pas encore parti`, body: `Tournée de ${String(t.debut).slice(0, 5)} · ${plaque(v.immatriculation)} à l’arrêt`, data: { href: '/' }, urgent: true });
      }
    }
    // Rapport du matin, une fois par jour à partir de 9 h
    if (minParis >= 9 * 60 && minParis < 12 * 60) {
      for (const a of agencesT ?? []) {
        const destinataires = (utilisateurs ?? []).filter((u: any) => u.agence_id === a.id && !envoye.has(`${u.id}|rapport-${jour}`) && veut(u, `rapport-${jour}`));
        if (!destinataires.length) continue;
        const r = await rapportJour(db, ajouterJours(jour, -1), a.id).catch(() => null);
        if (!r || !r.total.tournees) continue;
        for (const u of destinataires) pour(u, `rapport-${jour}`, { title: 'Le rapport d’hier', body: `${r.total.tournees} tournée${r.total.tournees > 1 ? 's' : ''} · ${r.total.km.toLocaleString('fr-FR')} km${r.total.anomalies ? ` · ${r.total.anomalies} camion${r.total.anomalies > 1 ? 's' : ''} à regarder` : ' · rien d’anormal'}`, data: { href: `/tournees/rapport?jour=${ajouterJours(jour, -1)}` } });
      }
    }
  }

  // 2 et 3. Urgences de la cloche et point du matin
  const minutes = h * 60 + m;
  if (minutes >= 7 * 60 && minutes < 22 * 60) {
    for (const u of utilisateurs ?? []) {
      const matin = minutes >= 8 * 60 + 30 && minutes < 11 * 60 && !envoye.has(`${u.id}|matin-${jour}`);
      if (!matin && m % 5 !== 0) continue;
      const { notifications } = await calculerNotifications(db, u, { parAgence: true }).catch(() => ({ notifications: [] as any[] }));
      // Rouge : toujours (si la famille est gardée) ; orange : seulement pour les familles qu'on choisit soi-même
      const nouvelles = notifications.filter((n: any) => !envoye.has(`${u.id}|${n.cle}`) && !jamaisEnPush(n.cle) && veut(u, n.cle)
        && (n.niveau === 'rouge' || (n.niveau === 'orange' && ['argent', 'papiers', 'atelier', 'sinistres'].includes(familleDeCle(n.cle)))));
      if (nouvelles.length > MAX_PAR_TOURNEE) {
        pour(u, `groupe-${jour}-${nouvelles.map((n: any) => n.cle).sort().join(',').slice(0, 300)}`, { title: `${nouvelles.length} urgences à traiter`, body: nouvelles.slice(0, 3).map((n: any) => n.titre).join(' · '), data: { href: '/notifications' } });
        nouvelles.forEach((n: any) => { envoye.add(`${u.id}|${n.cle}`); notes.push({ utilisateur_id: u.id, agence_id: u.agence_id, cle: n.cle }); });
      } else {
        nouvelles.forEach((n: any) => {
          const lien = n.actions.find((a: any) => a.type === 'lien' && a.href.startsWith('/'));
          pour(u, n.cle, { title: n.titre, body: n.detail, data: { href: lien?.href ?? '/notifications' } });
        });
      }
      if (m % 5 === 0 && veut(u, 'retour-')) {
        const { data: retours } = await db.from('locations').select('id, numero, fin_prevue, vehicules(immatriculation, marque, modele), clients(nom, prenom)')
          .eq('agence_id', u.agence_id).eq('statut', 'en_cours').gt('fin_prevue', new Date().toISOString()).lt('fin_prevue', new Date(Date.now() + 3600e3).toISOString());
        (retours ?? []).forEach((l: any) => {
          const h = new Date(l.fin_prevue).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
          pour(u, `retour-${l.id}-${l.fin_prevue}`, { title: `${plaque(l.vehicules?.immatriculation ?? '')} rentre à ${h}`,
            body: `${[l.clients?.prenom, l.clients?.nom].filter(Boolean).join(' ')} · location n° ${l.numero ?? '—'} · préparez le retour`, data: { href: `/locations/${l.id}` } });
        });
      }
      if (matin && notifications.some((n: any) => n.niveau !== 'gris')) {
        const texte = await resumeDuJour(db, u.agence_id, u.role, notifications).catch(() => null);
        if (texte) pour(u, `matin-${jour}`, { title: 'Le point du jour', body: texte, data: { href: '/notifications' } });
      }
    }
  }

  // 4. Accrochage déclaré par un chauffeur depuis l'appli : le responsable est prévenu tout de suite
  const agencesU = [...new Set((utilisateurs ?? []).map((u: any) => u.agence_id))];
  if (agencesU.length) {
    const { data: accrochages } = await db.from('sinistres').select('id, agence_id, description, vehicules(immatriculation), chauffeurs(prenom, nom)')
      .in('agence_id', agencesU).eq('source', 'appli').gt('created_at', new Date(Date.now() - 2 * 3600e3).toISOString()).then((r: any) => (r.error ? { data: [] } : r));
    for (const x of accrochages ?? []) {
      for (const u of (utilisateurs ?? []).filter((y: any) => y.agence_id === x.agence_id)) {
        pour(u, `accrochage-${x.id}`, { title: `Accrochage : ${nomChauffeur(x.chauffeurs) || 'un chauffeur'} · ${plaque(x.vehicules?.immatriculation ?? '')}`.trim(), body: `${x.description ? x.description.slice(0, 120) + ' · ' : ''}photos dans le dossier sinistre`, data: { href: `/sinistres/${x.id}` }, urgent: true });
      }
    }
  }

  // 5. Appli chauffeur : planning du lendemain (19 h), changements de planning (regroupés), rappel photo du permis
  const { data: chauffeursU } = await db.from('utilisateurs').select('id, role, agence_id, acces').in('id', ids).eq('acces', 'chauffeur');
  if ((chauffeursU ?? []).length) {
    const idsU = (chauffeursU ?? []).map((u: any) => u.id);
    const { data: fiches } = await db.from('chauffeurs').select('id, agence_id, prenom, utilisateur_id, permis_valide_le').in('utilisateur_id', idsU).eq('actif', true).then((r: any) => (r.error ? { data: [] } : r));
    const uDe = (ch: any) => (chauffeursU ?? []).find((u: any) => u.id === ch.utilisateur_id);
    const jourCourt = (j: string) => new Date(j + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const idsCh = (fiches ?? []).map((c: any) => c.id);
    if (idsCh.length) {
      const demain = ajouterJours(jour, 1);
      const [{ data: tDemain }, { data: changements }] = await Promise.all([
        h === 19 && m < 30 ? db.from('tournees').select('chauffeur_id, debut, fin, libelle, donneurs_ordre(nom), depots(nom), vehicules(immatriculation)').in('chauffeur_id', idsCh).eq('jour', demain).neq('statut', 'annulee').order('debut') : Promise.resolve({ data: [] as any[] }),
        db.from('tournees_changements').select('*').in('chauffeur_id', idsCh).is('envoye_le', null).order('created_at').then((r: any) => (r.error ? { data: [] } : r)),
      ]);
      for (const ch of fiches ?? []) {
        const u = uDe(ch); if (!u) continue;
        // La veille au soir
        const siens = (tDemain ?? []).filter((t: any) => t.chauffeur_id === ch.id);
        if (siens.length) {
          const t: any = siens[0];
          pour(u, `demain-${ch.id}-${demain}`, { title: `Demain, ${String(t.debut).slice(0, 5)}`, body: `${[t.donneurs_ordre?.nom ?? t.libelle, t.depots?.nom].filter(Boolean).join(' · ')}${t.vehicules ? ` · camion ${plaque(t.vehicules.immatriculation)}` : ''}${siens.length > 1 ? ` (+${siens.length - 1} autre${siens.length > 2 ? 's' : ''})` : ''}`, data: { href: '/' } });
        }
        // Changements : on attend 2 minutes de calme pour regrouper une série de modifications
        const ch2 = (changements ?? []).filter((x: any) => x.chauffeur_id === ch.id);
        if (ch2.length && Date.now() - new Date(ch2[ch2.length - 1].created_at).getTime() > 2 * 60e3) {
          const jours = [...new Set(ch2.map((x: any) => x.jour))].sort() as string[];
          const un = ch2.length === 1 ? ch2[0] : null;
          const titre = un ? (un.genre === 'nouvelle' ? 'Nouvelle tournée' : un.genre === 'retiree' ? 'Tournée retirée' : un.detail === 'camion' ? 'Changement de camion' : un.detail === 'horaire' ? 'Changement d’horaire' : 'Tournée modifiée') : 'Ton planning a changé';
          pour(u, `planif-${ch2[ch2.length - 1].id}`, { title: titre, body: `${jours.slice(0, 3).map(jourCourt).join(', ')}${jours.length > 3 ? '…' : ''} · ouvre l’appli pour voir`, data: { href: '/' } });
          await db.from('tournees_changements').update({ envoye_le: new Date().toISOString() }).in('id', ch2.map((x: any) => x.id));
        }
        // Permis : preuve de plus de 3 mois, rappel une fois par semaine à 10 h
        const vieux = !ch.permis_valide_le || Date.now() - new Date(ch.permis_valide_le).getTime() > 90 * 864e5;
        if (vieux && h === 10 && m < 30) {
          const semaine = Math.floor(Date.now() / (7 * 864e5));
          pour(u, `permis-ch-${ch.id}-${semaine}`, { title: 'Photo de ton permis', body: 'Ton responsable a besoin d’une photo récente de ton permis : 10 secondes dans l’appli.', data: { href: '/permis' } });
        }
      }
    }
    // Ménage : les changements des chauffeurs sans appli ne s'accumulent pas
    if (m === 30) await db.from('tournees_changements').delete().lt('created_at', new Date(Date.now() - 14 * 864e5).toISOString());
  }

  const envoyes = messages.length ? await envoyerPush(messages, db) : 0;
  // Rien n'est parti (service Expo injoignable) : on ne note rien, la prochaine tournée réessaie
  if (notes.length && (envoyes > 0 || !messages.length)) await db.from('push_envoyes').upsert(notes.map((n) => ({ ...n, envoye_le: new Date().toISOString() })), { onConflict: 'utilisateur_id,cle' });
  // Ménage : on oublie ce qui a plus de 30 jours
  if (m === 0 && h === 4) await db.from('push_envoyes').delete().lt('envoye_le', new Date(Date.now() - 31 * 864e5).toISOString());
  return NextResponse.json({ ok: true, prevus: messages.length, envoyes, alertes: alertes.length });
}

export const POST = tournee;
export const GET = tournee;
