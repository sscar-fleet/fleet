'use client';
import { useState } from 'react';

// Kilomètres inclus : si un forfait est fixé, le prix du km en plus devient obligatoire,
// sinon les kilomètres en trop ne seraient jamais facturés au retour.
export default function KmInclus({ km: kmDefaut, prix: prixDefaut }: { km?: number | null; prix?: number | null }) {
  const [km, setKm] = useState(kmDefaut != null ? String(kmDefaut) : '');
  return (
    <div className="grille" style={{ marginTop: 10 }}>
      <label>Km inclus<input name="km_inclus" type="number" min={0} placeholder="Illimités si vide" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} /></label>
      <label>Prix du km en plus (€){km ? ' *' : ''}
        <input name="prix_km_sup" type="number" step="0.01" min={0} inputMode="decimal" defaultValue={prixDefaut ?? ''} required={!!km}
          placeholder={km ? 'Ex. 0,30' : 'Seulement avec un forfait'} disabled={!km} />
      </label>
    </div>
  );
}
