// Clients : recherche instantanée, appel ou WhatsApp en un geste
import { useState } from 'react';
import { router } from 'expo-router';
import { Ecran, Carte, Texte, Chargement, BandeauHorsLigne, Vide } from '@/composants/ui';
import { Recherche } from '@/composants/champs';
import { chargerClients } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { useCouleurs } from '@/lib/theme';
import { nomClient } from '@/lib/format';

export default function Clients() {
  const c = useCouleurs();
  const { donnees, horsLigne, majLe, enChargement, recharger } = useDonnees(chargerClients);
  const [q, setQ] = useState('');
  const liste = (donnees ?? []).filter((x) => !q || `${x.prenom ?? ''} ${x.nom} ${x.telephone ?? ''} ${x.email ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Ecran titre="Clients" sousTitre={`${donnees?.length ?? 0} clients`} rafraichir={recharger} enChargement={enChargement && !!donnees}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      <Recherche valeur={q} onChange={setQ} placeholder="Nom, téléphone, e-mail…" />
      {!donnees ? <Chargement /> : liste.length ? liste.slice(0, 100).map((x) => (
        <Carte key={x.id} accent={x.liste_noire ? c.rouge : undefined} onPress={() => router.push({ pathname: '/client/[id]', params: { id: x.id } })}>
          <Texte gras>{nomClient(x)}</Texte>
          <Texte gris>{x.telephone ?? '—'}{x.liste_noire ? ' · Liste noire' : x.permis_path && x.piece_identite_path ? ' · papiers OK' : ' · papiers à compléter'}</Texte>
        </Carte>
      )) : <Vide titre="Aucun client trouvé" />}
    </Ecran>
  );
}
