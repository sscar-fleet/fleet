// Les locations dehors et à venir, avec recherche instantanée et filtres au pouce
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Ecran, Vide, Chargement, BandeauHorsLigne, Segments, BoutonRond } from '@/composants/ui';
import { Recherche } from '@/composants/champs';
import CarteLocation from '@/composants/CarteLocation';
import { chargerLocations } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { useCouleurs } from '@/lib/theme';
import { useGps } from '@/lib/gps';
import { enRetard, nomClient } from '@/lib/format';

type Filtre = 'encours' | 'avenir' | 'retard';

export default function Locations() {
  const c = useCouleurs();
  const params = useLocalSearchParams<{ filtre?: Filtre }>();
  const { gps } = useGps();
  const { donnees, horsLigne, majLe, enChargement, recharger } = useDonnees(chargerLocations);
  const [filtre, setFiltre] = useState<Filtre>(params.filtre ?? 'encours');
  const [q, setQ] = useState('');
  useEffect(() => { if (params.filtre) setFiltre(params.filtre); }, [params.filtre]);

  const tout = donnees ?? [];
  const enCours = tout.filter((l) => l.statut === 'en_cours').sort((a, b) => a.fin_prevue.localeCompare(b.fin_prevue));
  const retard = enCours.filter((l) => enRetard(l.fin_prevue));
  const aVenir = tout.filter((l) => l.statut === 'reservee').sort((a, b) => a.debut.localeCompare(b.debut));
  const cherche = q.trim().toLowerCase().replace(/[\s-]/g, '');
  const correspond = (l: (typeof tout)[number]) => !cherche || `${nomClient(l.clients)}${l.vehicules?.immatriculation}${l.vehicules?.marque}${l.vehicules?.modele}${l.numero ?? ''}${l.clients?.telephone ?? ''}`.toLowerCase().replace(/[\s-]/g, '').includes(cherche);
  const liste = (cherche ? tout : filtre === 'encours' ? enCours : filtre === 'retard' ? retard : aVenir).filter(correspond);

  return (
    <Ecran titre="Locations" sousTitre={`${enCours.length} dehors · ${aVenir.length} à venir`} rafraichir={recharger} enChargement={enChargement && !!donnees}
      actions={<BoutonRond icone="ajout" label="Nouvelle location" onPress={() => router.push('/nouvelle')} />}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      <Recherche valeur={q} onChange={setQ} placeholder="Client, immatriculation, n° de contrat…" />
      {!cherche && <Segments<Filtre> valeur={filtre} onChange={setFiltre} options={[
        { cle: 'encours', titre: 'Dehors', n: enCours.length },
        { cle: 'avenir', titre: 'À venir', n: aVenir.length },
        { cle: 'retard', titre: 'Retard', n: retard.length, couleur: c.rouge },
      ]} />}
      {!donnees ? <Chargement /> : liste.length ? liste.map((l) => (
        <CarteLocation key={l.id} l={l} genre={l.statut === 'en_cours' ? 'retour' : 'depart'} gps={l.vehicules ? gps.parVehicule[l.vehicules.id] : undefined} />
      )) : <Vide icone={cherche ? 'recherche' : filtre === 'retard' ? 'ok' : 'locations'}
        titre={cherche ? 'Aucun résultat' : filtre === 'retard' ? 'Aucun retard' : filtre === 'encours' ? 'Aucune voiture dehors' : 'Aucune réservation'}
        texte={filtre === 'avenir' && !cherche ? 'Touchez le + au centre : dates, voiture, client, c’est fait.' : undefined} />}
    </Ecran>
  );
}
