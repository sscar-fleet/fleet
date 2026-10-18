'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { attestationPdf } from '@/lib/documents-pdf';
import { livrer } from '@/lib/pdf';

export default function FormulaireFourriere({ action, agence, vehicule }: {
  action: (personne: string, fourriere: string) => Promise<{ erreur?: string } | void>; agence: any; vehicule: any;
}) {
  const router = useRouter();
  const [personne, setPersonne] = useState('');
  const [fourriere, setFourriere] = useState('');
  const [etat, setEtat] = useState('');

  async function generer(e: React.FormEvent) {
    e.preventDefault();
    setEtat('Préparation du PDF…');
    try {
      const octets = await attestationPdf(agence, vehicule, personne.trim(), fourriere.trim());
      const r = await action(personne.trim(), fourriere.trim());
      if (r && r.erreur) throw new Error(r.erreur);
      await livrer(octets, `bon-de-pouvoir-${vehicule.immatriculation}.pdf`, true);
      setEtat('PDF prêt.');
      router.refresh();
    } catch (err: any) {
      setEtat('Erreur : ' + (err?.message ?? 'PDF impossible'));
    }
  }

  return (
    <form onSubmit={generer} className="grille" style={{ gridTemplateColumns: '1fr' }}>
      <p style={{ margin: 0, lineHeight: 1.6 }}>
        Je soussigné <b>{agence.gerant_nom || '[gérant à renseigner]'}</b>, représentant <b>{agence.nom}</b>, autorise
        <b> {personne || '…'}</b> à récupérer le véhicule <b>{vehicule.immatriculation}</b>.
      </p>
      <label>Personne autorisée (convoyeur, salarié…) *<input value={personne} onChange={(e) => setPersonne(e.target.value)} placeholder="Prénom NOM" required /></label>
      <label>Fourrière<input value={fourriere} onChange={(e) => setFourriere(e.target.value)} placeholder="Ex. Fourrière de Pantin" /></label>
      <button className="bouton principal" type="submit" disabled={etat === 'Préparation du PDF…'}>Générer le PDF signé</button>
      <span className="gris" style={{ fontSize: 13 }}>Sur téléphone, le PDF s&apos;ouvre dans le partage : choisissez WhatsApp.</span>
      {etat && <span className={etat.startsWith('Erreur') ? 'erreur' : 'succes'}>{etat}</span>}
    </form>
  );
}
