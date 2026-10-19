'use client';
import { useState } from 'react';

export const voyants: Record<string, string> = {
  moteur: 'Moteur (orange)', huile: 'Huile', batterie: 'Batterie', freins: 'Freins', airbag: 'Airbag', pneus: 'Pression des pneus',
  temperature: 'Température', abs: 'ABS / ESP', entretien: 'Entretien / vidange', autre: 'Autre',
};
const items: [string, string][] = [['badge', 'Badge parking'], ['kit', 'Kit anti-crevaison'], ['accessoires', 'Accessoires (siège bébé…)'], ['proprete', 'Véhicule propre']];

// Compteur façon tableau de bord : gros chiffres pour le km, jauge à toucher pour le carburant, voyants précis
export default function CompteurEdl({ km, carburant, checklist, kmDepart, kmInclus }: {
  km: number | null; carburant: number | null; checklist: Record<string, any>; kmDepart?: number | null; kmInclus?: number | null;
}) {
  const [valeur, setValeur] = useState(km != null ? String(km) : '');
  const [niveau, setNiveau] = useState<number | null>(carburant != null ? Math.round(carburant / 12.5) : null);
  const [voyant, setVoyant] = useState(!!checklist?.voyant);
  const n = Number(valeur);
  const parcourus = kmDepart != null && valeur ? n - kmDepart : null;
  const trop = parcourus != null && kmInclus != null ? parcourus - kmInclus : null;

  return (
    <div className="compteur-edl pleine">
      <label className="odometre">Kilométrage au compteur
        <span className="odometre-cadre">
          <input name="km" value={valeur} onChange={(e) => setValeur(e.target.value.replace(/\D/g, '').slice(0, 7))}
            inputMode="numeric" pattern="\d*" required placeholder="000000" aria-label="Kilométrage" />
          <span className="unite">km</span>
        </span>
      </label>
      {parcourus != null && (
        <p className={parcourus < 0 ? 'erreur' : trop != null && trop > 0 ? 'retard' : 'gris'} style={{ margin: 0 }}>
          {parcourus < 0 ? 'Moins qu’au départ : vérifiez le chiffre.' : `${parcourus.toLocaleString('fr-FR')} km parcourus`}
          {trop != null && parcourus >= 0 ? (trop > 0 ? ` · ${trop.toLocaleString('fr-FR')} km au-dessus du forfait` : ` · reste ${(-trop).toLocaleString('fr-FR')} km sur le forfait`) : ''}
        </p>
      )}

      <div className="jauge-carburant">
        <span className="champ-titre">Carburant {niveau != null ? `· ${niveau === 8 ? 'plein' : niveau === 0 ? 'vide' : `${niveau}/8`}` : '· touchez la jauge'}</span>
        <div className="segments">
          <span className="lettre">E</span>
          {Array.from({ length: 8 }, (_, i) => (
            <button key={i} type="button" aria-label={`${i + 1}/8`} className={niveau != null && i < niveau ? 'plein' : ''} onClick={() => setNiveau(niveau === i + 1 ? i : i + 1)} />
          ))}
          <span className="lettre">F</span>
        </div>
        <input type="hidden" name="carburant" value={niveau != null ? String(niveau * 12.5) : ''} />
      </div>

      <div className="verifs">
        <label className="case"><input type="checkbox" name="voyant" checked={voyant} onChange={(e) => setVoyant(e.target.checked)} />Un voyant est allumé</label>
        {voyant && (
          <label className="pleine">Quel voyant ? (facultatif)<select name="voyant_type" defaultValue={checklist?.voyant_type ?? ''}>
            <option value="">Choisir…</option>
            {Object.entries(voyants).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        )}
        {items.map(([cle, lib]) => <label key={cle} className="case"><input type="checkbox" name={cle} defaultChecked={!!checklist?.[cle]} />{lib}</label>)}
      </div>
    </div>
  );
}
