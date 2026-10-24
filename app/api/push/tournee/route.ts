import { NextResponse } from 'next/server';
import { adminConfigure, supabaseAdmin } from '@/lib/supabaseAdmin';
import { envoyerPush, type MessagePush } from '@/lib/push';
import { alertesTraccar } from '@/lib/traccar';
import { calculerNotifications, resumeDuJour } from '@/lib/notifications';
import { plaque } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Tournée des notifications, lancée chaque minute par la base (pg_cron) :
//  1. alertes des boîtiers qui peuvent signaler un vol (vibration, remorquage, débranché, brouillage, sortie de zone) : tout de suite, jour et nuit
//  2. nouvelles urgences de la cloche (retard, départ sans caution, FPS qui va être majoré…) : toutes les 5 min, de 7 h à 22 h
//  3. le point du jour, une fois par matin à partir de 8 h 30
// Chaque notification n'est envoyée qu'une fois par personne (table push_envoyes).
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
  const [{ data: utilisateurs }, { data: deja }] = await Promise.all([
    db.from('utilisateurs').select('id, role, agence_id').in('id', ids),
    db.from('push_envoyes').select('utilisateur_id, cle').in('utilisateur_id', ids).gt('envoye_le', new Date(Date.now() - 30 * 864e5).toISOString()),
  ]);
  const envoye = new Set((deja ?? []).map((d: any) => `${d.utilisateur_id}|${d.cle}`));
  const messages: MessagePush[] = [];
  const notes: { utilisateur_id: string; agence_id: string; cle: string }[] = [];
  const pour = (u: any, cle: string, m: Omit<MessagePush, 'to'>) => {
    if (envoye.has(`${u.id}|${cle}`)) return false;
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

  // 2 et 3. Urgences de la cloche et point du matin
  const { h, m, jour } = heureParis();
  const minutes = h * 60 + m;
  if (minutes >= 7 * 60 && minutes < 22 * 60) {
    for (const u of utilisateurs ?? []) {
      const matin = minutes >= 8 * 60 + 30 && minutes < 11 * 60 && !envoye.has(`${u.id}|matin-${jour}`);
      if (!matin && m % 5 !== 0) continue;
      const { notifications } = await calculerNotifications(db, u, { parAgence: true }).catch(() => ({ notifications: [] as any[] }));
      const nouvelles = notifications.filter((n: any) => n.niveau === 'rouge' && !envoye.has(`${u.id}|${n.cle}`));
      if (nouvelles.length > MAX_PAR_TOURNEE) {
        pour(u, `groupe-${jour}-${nouvelles.map((n: any) => n.cle).sort().join(',').slice(0, 300)}`, { title: `${nouvelles.length} urgences à traiter`, body: nouvelles.slice(0, 3).map((n: any) => n.titre).join(' · '), data: { href: '/notifications' } });
        nouvelles.forEach((n: any) => { envoye.add(`${u.id}|${n.cle}`); notes.push({ utilisateur_id: u.id, agence_id: u.agence_id, cle: n.cle }); });
      } else {
        nouvelles.forEach((n: any) => {
          const lien = n.actions.find((a: any) => a.type === 'lien' && a.href.startsWith('/'));
          pour(u, n.cle, { title: n.titre, body: n.detail, data: { href: lien?.href ?? '/notifications' } });
        });
      }
      if (matin && notifications.some((n: any) => n.niveau !== 'gris')) {
        const texte = await resumeDuJour(db, u.agence_id, u.role, notifications).catch(() => null);
        if (texte) pour(u, `matin-${jour}`, { title: 'Le point du jour', body: texte, data: { href: '/notifications' } });
      }
    }
  }

  const envoyes = messages.length ? await envoyerPush(messages, db) : 0;
  // Rien n'est parti (service Expo injoignable) : on ne note rien, la prochaine tournée réessaie
  if (notes.length && (envoyes > 0 || !messages.length)) await db.from('push_envoyes').upsert(notes.map((n) => ({ ...n, envoye_le: new Date().toISOString() })), { onConflict: 'utilisateur_id,cle' });
  // Ménage : on oublie ce qui a plus de 30 jours
  if (m === 0 && h === 4) await db.from('push_envoyes').delete().lt('envoye_le', new Date(Date.now() - 31 * 864e5).toISOString());
  return NextResponse.json({ ok: true, envoyes, alertes: alertes.length });
}

export const POST = tournee;
export const GET = tournee;
