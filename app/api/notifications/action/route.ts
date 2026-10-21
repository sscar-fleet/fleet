import { NextResponse } from 'next/server';
import { clientApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Actions en un clic depuis une notification : rendre une caution, prolonger ou terminer une maintenance
export async function POST(request: Request) {
  const c = await clientApi(request);
  if (!c) return NextResponse.json({ erreur: 'Connexion expirée.' }, { status: 401 });
  const { data: profil } = await c.supabase.from('utilisateurs').select('id, role, agence_id').eq('id', c.user.id).maybeSingle();
  const { action, id, jours } = await request.json().catch(() => ({}));
  if (!profil || typeof id !== 'string') return NextResponse.json({ erreur: 'Demande invalide.' }, { status: 400 });
  const journal = (vehicule_id: string | null, location_id: string | null, quoi: string, detail?: string) =>
    c.supabase.from('historique').insert({ agence_id: profil.agence_id, vehicule_id, location_id, action: quoi, detail: detail ? `${detail} · depuis les notifications` : 'depuis les notifications', auteur: profil.id });

  if (action === 'rendre_caution') {
    if (profil.role !== 'gerant') return NextResponse.json({ erreur: 'Réservé au gérant.' }, { status: 403 });
    const { data: l } = await c.supabase.from('locations').select('vehicule_id, caution_statut, statut').eq('id', id).single();
    if (!l || l.statut !== 'terminee' || l.caution_statut !== 'prise') return NextResponse.json({ erreur: 'Cette caution n’est plus à rendre.' }, { status: 400 });
    const { error } = await c.supabase.from('locations').update({ caution_statut: 'rendue' }).eq('id', id);
    if (error) return NextResponse.json({ erreur: error.message }, { status: 400 });
    await journal(l.vehicule_id, id, 'Caution rendue');
    return NextResponse.json({ message: 'Caution notée comme rendue' });
  }
  if (action === 'prolonger_maintenance') {
    const n = [1, 3, 7, 14].includes(Number(jours)) ? Number(jours) : 3;
    const { data: e } = await c.supabase.from('entretiens').select('vehicule_id, retour_prevu').eq('id', id).single();
    if (!e) return NextResponse.json({ erreur: 'Maintenance introuvable.' }, { status: 404 });
    const base = Math.max(Date.now(), e.retour_prevu ? new Date(e.retour_prevu).getTime() : 0);
    const nouvelle = new Date(base + n * 864e5).toISOString();
    const { error } = await c.supabase.from('entretiens').update({ retour_prevu: nouvelle }).eq('id', id);
    if (error) return NextResponse.json({ erreur: error.message }, { status: 400 });
    await c.supabase.from('entretien_suivi').insert({ agence_id: profil.agence_id, entretien_id: id, genre: 'date', texte: `Sortie repoussée de ${n} jours`, retour_prevu: nouvelle, auteur: profil.id });
    await journal(e.vehicule_id, null, 'Maintenance : nouvelle date de sortie', `+${n} jours`);
    return NextResponse.json({ message: `Sortie prévue le ${new Date(nouvelle).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' })}` });
  }
  if (action === 'terminer_maintenance') {
    const { data: e } = await c.supabase.from('entretiens').select('*').eq('id', id).single();
    if (!e || e.statut === 'termine') return NextResponse.json({ erreur: 'Déjà terminée.' }, { status: 400 });
    const maj: any = { statut: 'termine', fin: new Date().toISOString() };
    if (e.tarif && e.tarif_unite === 'jour' && e.debut) maj.montant_recu = Number(e.tarif) * Math.max(1, Math.ceil((Date.now() - new Date(e.debut).getTime()) / 864e5));
    const { error } = await c.supabase.from('entretiens').update(maj).eq('id', id);
    if (error) return NextResponse.json({ erreur: error.message }, { status: 400 });
    const { data: v } = await c.supabase.from('vehicules').select('statut').eq('id', e.vehicule_id).single();
    if (v?.statut === 'maintenance') await c.supabase.from('vehicules').update({ statut: 'disponible' }).eq('id', e.vehicule_id);
    await journal(e.vehicule_id, null, e.type === 'transfert' ? 'Revenu de prêt' : 'Maintenance terminée');
    return NextResponse.json({ message: 'Voiture de nouveau disponible' });
  }
  return NextResponse.json({ erreur: 'Action inconnue.' }, { status: 400 });
}
