import { NextResponse } from 'next/server';
import { clientApi, quotaIa } from '@/lib/api';
import { extraire, reconnaitreColonnes, type Contexte } from '@/lib/importFlotte';
import { nettoyerLot, maintenantParis } from '@/lib/importCommun';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// Une source de l'import (un texte, une photo, un PDF, ou les colonnes d'un tableur) : lue par Fleet AI.
// Les photos et PDF sont d'abord déposés dans le stockage de l'agence, puis relus ici (pas de limite de taille d'envoi).
export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée. Rechargez la page.' }, { status: 401 });
  const plafond = await quotaIa(c.supabase);
  if (plafond) return NextResponse.json({ erreur: plafond }, { status: 429 });
  const corps = await request.json().catch(() => ({}));
  const nom = String(corps?.nom ?? 'document').slice(0, 120);

  const { data: u } = await c.supabase.from('utilisateurs').select('id, agence_id, agences(metier)').eq('id', c.user.id).single();
  if (!u) return NextResponse.json({ erreur: 'Agence introuvable.' }, { status: 400 });
  const { data: vs } = await c.supabase.from('vehicules').select('immatriculation').neq('statut', 'sorti').limit(500);
  const maintenant = maintenantParis();
  const contexte: Contexte = {
    metier: (u as any).agences?.metier === 'transport' ? 'transport' : 'location',
    aujourdhui: maintenant.slice(0, 10), jour: JOURS[new Date(maintenant.slice(0, 10) + 'T12:00:00Z').getUTCDay()],
    plaques: (vs ?? []).map((v: any) => v.immatriculation),
  };

  try {
    if (corps?.mode === 'colonnes') {
      const ech = String(corps?.echantillon ?? '').slice(0, 12_000);
      if (!ech.trim()) return NextResponse.json({ erreur: 'Tableur vide.' }, { status: 400 });
      return NextResponse.json({ colonnes: await reconnaitreColonnes(ech, nom, contexte) });
    }
    let piece: { genre: 'texte' | 'image' | 'pdf'; contenu: string; nom: string };
    let document: string | null = null;
    if (typeof corps?.chemin === 'string') {
      const chemin: string = corps.chemin;
      if (!chemin.startsWith(`${u.agence_id}/import/`) || chemin.includes('..')) return NextResponse.json({ erreur: 'Fichier refusé.' }, { status: 400 });
      const { data, error } = await c.supabase.storage.from('documents').download(chemin);
      if (error || !data) return NextResponse.json({ erreur: 'Fichier introuvable : déposez-le à nouveau.' }, { status: 404 });
      const octets = Buffer.from(await data.arrayBuffer());
      const pdf = chemin.endsWith('.pdf');
      piece = { genre: pdf ? 'pdf' : 'image', contenu: `data:${pdf ? 'application/pdf' : 'image/jpeg'};base64,${octets.toString('base64')}`, nom };
      document = chemin;
    } else {
      piece = { genre: 'texte', contenu: String(corps?.texte ?? ''), nom };
    }
    const brut = await extraire(piece, contexte);
    const lot = nettoyerLot(brut, nom, document);
    const total = lot.vehicules.length + lot.clients.length + lot.locations.length + lot.chauffeurs.length;
    if (!total) await trace(c.supabase, u, false, { nom, erreur: 'rien trouvé' });
    return NextResponse.json({ lot, type: brut?.type_document ?? null });
  } catch (e: any) {
    const erreur = e instanceof SyntaxError ? 'Document non reconnu. Essayez une photo plus nette ou collez le texte.' : (e?.message || 'Lecture impossible.');
    await trace(c.supabase, u, false, { nom, erreur });
    return NextResponse.json({ erreur }, { status: 422 });
  }
}

// Lecture ratée : gardée pour que SS CAR FLEET repère les agences qui ont du mal (page admin)
async function trace(supabase: any, u: any, ok: boolean, detail: Record<string, unknown>) {
  try { await supabase.from('imports_flotte').insert({ agence_id: u.agence_id, genre: 'lecture', ok, detail, cree_par: u.id }); } catch { /* table pas encore installée */ }
}
