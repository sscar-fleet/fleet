import { NextResponse } from 'next/server';
import { utilisateurCourant } from '@/lib/agence';
import { statutVehicule, statutLocation, statutCaution, statutAmende, statutEntretien, date, dateHeure } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Export CSV (ouvrable dans Excel) de chaque liste
const listes: Record<string, { select: string; ordre: string; colonnes: [string, (r: any) => unknown][] }> = {
  vehicules: { select: '*', ordre: 'immatriculation', colonnes: [
    ['Immatriculation', (r) => r.immatriculation], ['Marque', (r) => r.marque], ['Modèle', (r) => r.modele], ['Statut', (r) => statutVehicule[r.statut]],
    ['Km', (r) => r.km], ['Prix/jour', (r) => r.prix_jour], ['Fin assurance', (r) => date(r.assurance_echeance)], ['Prochain CT', (r) => date(r.ct_echeance)]] },
  clients: { select: '*, locations(id)', ordre: 'nom', colonnes: [
    ['Nom', (r) => r.nom], ['Prénom', (r) => r.prenom], ['Téléphone', (r) => r.telephone], ['E-mail', (r) => r.email], ['Adresse', (r) => r.adresse],
    ['Date de naissance', (r) => date(r.date_naissance)], ['N° permis', (r) => r.numero_permis], ['Permis du', (r) => date(r.date_permis)],
    ['Locations', (r) => r.locations?.length ?? 0], ['Liste noire', (r) => (r.liste_noire ? 'Oui' : '')]] },
  locations: { select: '*, vehicules(immatriculation), clients(nom, prenom)', ordre: 'debut', colonnes: [
    ['N°', (r) => r.numero], ['Client', (r) => `${r.clients?.nom ?? ''} ${r.clients?.prenom ?? ''}`.trim()], ['Véhicule', (r) => r.vehicules?.immatriculation],
    ['Départ', (r) => dateHeure(r.debut)], ['Retour prévu', (r) => dateHeure(r.fin_prevue)], ['Rendu le', (r) => dateHeure(r.fin_reelle)],
    ['Statut', (r) => statutLocation[r.statut]], ['Prix', (r) => r.prix_total], ['Km départ', (r) => r.km_depart], ['Km retour', (r) => r.km_retour],
    ['Caution', (r) => r.caution_montant], ['Statut caution', (r) => statutCaution[r.caution_statut]], ['Retenue', (r) => r.caution_retenue], ['Motif', (r) => r.caution_motif]] },
  amendes: { select: '*, vehicules(immatriculation), clients(nom, prenom)', ordre: 'date_infraction', colonnes: [
    ['Véhicule', (r) => r.vehicules?.immatriculation], ['Date', (r) => dateHeure(r.date_infraction)], ['Infraction', (r) => r.type], ['Lieu', (r) => r.lieu],
    ['Montant', (r) => r.montant], ['Échéance', (r) => date(r.echeance)], ['Conducteur', (r) => `${r.clients?.nom ?? ''} ${r.clients?.prenom ?? ''}`.trim()],
    ['Statut', (r) => statutAmende[r.statut]], ['N° avis', (r) => r.numero_avis]] },
  entretiens: { select: '*, vehicules(immatriculation)', ordre: 'created_at', colonnes: [
    ['Véhicule', (r) => r.vehicules?.immatriculation], ['Raison', (r) => r.raison], ['Garage', (r) => r.garage], ['Statut', (r) => statutEntretien[r.statut]],
    ['Début', (r) => dateHeure(r.debut)], ['Retour prévu', (r) => dateHeure(r.retour_prevu)], ['Fin', (r) => dateHeure(r.fin)], ['Coût', (r) => r.cout], ['Commentaire', (r) => r.commentaire]] },
};

const cellule = (v: unknown) => {
  const s = v === null || v === undefined || v === '—' ? '' : String(v).replace('.', typeof v === 'number' ? ',' : '.');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(_: Request, { params }: { params: { liste: string } }) {
  const def = listes[params.liste];
  if (!def) return new NextResponse('Liste inconnue', { status: 404 });
  const { supabase } = await utilisateurCourant();
  const { data } = await supabase.from(params.liste).select(def.select).order(def.ordre);
  const lignes = [def.colonnes.map(([t]) => t).join(';'), ...(data ?? []).map((r: any) => def.colonnes.map(([, f]) => cellule(f(r))).join(';'))];
  return new NextResponse('﻿' + lignes.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${params.liste}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
