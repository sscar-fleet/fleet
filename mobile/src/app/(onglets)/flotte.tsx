// La flotte d'un coup d'œil : qui est dispo, qui est dehors, ce qui expire
import { useState } from 'react';
import { router } from 'expo-router';
import { Ecran, Carte, Ligne, Texte, Chargement, BandeauHorsLigne, Vide } from '@/composants/ui';
import { Puce, Puces, Recherche } from '@/composants/champs';
import LogoMarque from '@/composants/LogoMarque';
import { chargerVehicules } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { useCouleurs } from '@/lib/theme';
import { echeance, km, statutVehicule } from '@/lib/format';

export default function Flotte() {
  const c = useCouleurs();
  const { donnees, horsLigne, majLe, enChargement, recharger } = useDonnees(chargerVehicules);
  const [filtre, setFiltre] = useState('tous');
  const [q, setQ] = useState('');
  const tous = donnees ?? [];
  const nb = (s: string) => tous.filter((v) => v.statut === s).length;
  const liste = tous.filter((v) => (filtre === 'tous' || v.statut === filtre)
    && (!q || `${v.immatriculation} ${v.marque ?? ''} ${v.modele ?? ''}`.toLowerCase().includes(q.toLowerCase().replace(/[\s-]/g, ''))));
  const couleurStatut: Record<string, string> = { disponible: c.vert, loue: c.accent, maintenance: c.orange, hors_service: c.rouge };

  return (
    <Ecran titre="Flotte" sousTitre={`${nb('disponible')} disponible${nb('disponible') > 1 ? 's' : ''} sur ${tous.length}`} rafraichir={recharger} enChargement={enChargement && !!donnees}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      <Recherche valeur={q} onChange={setQ} placeholder="Immatriculation, marque…" />
      <Puces>
        <Puce titre={`Tous ${tous.length}`} actif={filtre === 'tous'} onPress={() => setFiltre('tous')} />
        <Puce titre={`Dispo ${nb('disponible')}`} actif={filtre === 'disponible'} onPress={() => setFiltre('disponible')} />
        <Puce titre={`Loués ${nb('loue')}`} actif={filtre === 'loue'} onPress={() => setFiltre('loue')} />
        {nb('maintenance') > 0 && <Puce titre={`Atelier ${nb('maintenance')}`} actif={filtre === 'maintenance'} onPress={() => setFiltre('maintenance')} />}
      </Puces>
      {!donnees ? <Chargement /> : liste.length ? liste.map((v) => {
        const alerte = [echeance(v.assurance_echeance) && 'Assurance', echeance(v.ct_echeance) && 'Contrôle technique'].filter(Boolean).join(' · ');
        return (
          <Carte key={v.id} accent={couleurStatut[v.statut]} onPress={() => router.push({ pathname: '/vehicule/[id]', params: { id: v.id } })}>
            <Ligne style={{ flexWrap: 'nowrap', gap: 14 }}>
              <LogoMarque marque={v.marque} modele={v.modele} />
              <Ligne style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <Texte gras taille={19}>{v.immatriculation}</Texte>
                <Texte gris>{[v.marque, v.modele].filter(Boolean).join(' ') || '—'} · {km(v.km)}</Texte>
              </Ligne>
              <Texte gras taille={14} couleur={couleurStatut[v.statut]}>{statutVehicule[v.statut] ?? v.statut}</Texte>
            </Ligne>
            {alerte ? <Texte taille={14} couleur={c.orange}>À renouveler : {alerte}</Texte> : null}
          </Carte>
        );
      }) : <Vide titre="Aucun véhicule ici" />}
    </Ecran>
  );
}
