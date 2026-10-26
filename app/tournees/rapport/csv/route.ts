import { utilisateurCourant } from '@/lib/agence';
import { ajouterJours } from '@/lib/transport';
import { rapportJour, heureParis } from '@/lib/rapportTransport';

export const dynamic = 'force-dynamic';

// Rapport d'une journée en fichier pour Excel (séparateur point-virgule, accents conservés)
export async function GET(request: Request) {
  const { supabase } = await utilisateurCourant();
  const aujourdhui = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const j = new URL(request.url).searchParams.get('jour');
  const jour = j && /^\d{4}-\d{2}-\d{2}$/.test(j) ? j : ajouterJours(aujourdhui, -1);
  const { lignes } = await rapportJour(supabase, jour);
  const c = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const texte = [['Jour', 'Camion', 'Modèle', 'Chauffeur(s)', 'Départ', 'Fin', 'Km', 'Tournées', 'Chiffre (€)', 'À regarder'].map(c).join(';'),
    ...lignes.map((l) => [jour, l.plaque, l.modele, l.chauffeurs, heureParis(l.depart), heureParis(l.fin), l.km ?? '', l.tournees, l.chiffre.toFixed(2).replace('.', ','), l.anomalies.join(' · ')].map(c).join(';'))].join('\r\n');
  return new Response('﻿' + texte, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="rapport-${jour}.csv"` } });
}
