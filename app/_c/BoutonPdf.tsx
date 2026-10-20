'use client';
import { useState } from 'react';
import { livrer } from '@/lib/pdf';
import * as docs from '@/lib/documents-pdf';

type Genre = 'contrat' | 'facture' | 'edl' | 'dommages' | 'bilan' | 'devis' | 'fps_facture' | 'fps_mandat' | 'fps_demeure';

// Bouton qui fabrique le PDF dans le navigateur, puis le télécharge (PC) ou ouvre le partage (téléphone : WhatsApp…)
export default function BoutonPdf({ genre, donnees, nom, libelle, classe = 'bouton' }:
  { genre: Genre; donnees: any; nom: string; libelle: string; classe?: string }) {
  const [etat, setEtat] = useState('');
  async function fabriquer() {
    setEtat('…');
    try {
      const { agence: a, location: l, vehicule: v, client: c, edl, dommages } = donnees;
      const octets =
        genre === 'contrat' ? await docs.contratPdf(a, l, v, c)
        : genre === 'facture' ? await docs.facturePdf(a, l, v, c)
        : genre === 'edl' ? await docs.edlPdf(a, l, v, c, edl, dommages ?? [])
        : genre === 'bilan' ? await docs.bilanPdf(a, donnees.bilan)
        : genre === 'devis' ? await docs.devisPdf(a, donnees.devis)
        : genre === 'fps_facture' ? await docs.facturationFpsPdf(a, donnees.fps, v, c)
        : genre === 'fps_mandat' ? await docs.mandatFpsPdf(a, donnees.fps, v, c)
        : genre === 'fps_demeure' ? await docs.miseEnDemeureFpsPdf(a, donnees.fps, v, c)
        : await docs.dommagesPdf(a, v, dommages ?? [], l, c);
      await livrer(octets, nom, true);
      setEtat('');
    } catch (e: any) {
      setEtat('Erreur : ' + (e?.message ?? 'PDF impossible'));
    }
  }
  return (
    <>
      <button type="button" className={classe} onClick={fabriquer} disabled={etat === '…'}>
        {etat === '…' ? 'Préparation…' : libelle}
      </button>
      {etat.startsWith('Erreur') && <span className="erreur">{etat}</span>}
    </>
  );
}
