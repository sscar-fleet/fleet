// Fiche véhicule : l'état, les échéances, la location en cours, et un gros bouton pour la suite
import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Ecran, Carte, GrosBouton, Ligne, Texte, Titre, Chargement, BandeauHorsLigne } from '@/composants/ui';
import CarteLocation from '@/composants/CarteLocation';
import LogoMarque from '@/composants/LogoMarque';
import { chargerVehicule } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { mettreEnFile } from '@/lib/hors-ligne';
import { useCouleurs } from '@/lib/theme';
import { dateCourte, echeance, euros, km, statutVehicule } from '@/lib/format';

export default function FicheVehicule() {
  const c = useCouleurs();
  const { id } = useLocalSearchParams<{ id: string }>();
  const charger = useCallback(() => chargerVehicule(id), [id]);
  const { donnees, horsLigne, majLe, recharger } = useDonnees(charger);
  if (!donnees?.vehicule) return <Ecran titre="Véhicule"><Chargement /></Ecran>;
  const { vehicule: v, locations } = donnees;

  const statut = async (s: string) => { await mettreEnFile({ genre: 'maj', table: 'vehicules', id: v.id, champs: { statut: s } }); recharger(); };
  const couleurEch = (d: string | null) => (echeance(d) === 'depasse' ? c.rouge : echeance(d) === 'proche' ? c.orange : undefined);

  return (
    <Ecran titre={v.immatriculation} sousTitre={[v.marque, v.modele].filter(Boolean).join(' ')} rafraichir={recharger}
      haut={<LogoMarque marque={v.marque} modele={v.modele} taille={72} />}
      bas={v.statut === 'disponible'
        ? <GrosBouton titre="Louer ce véhicule" onPress={() => router.push({ pathname: '/nouvelle', params: { vehicule: v.id } })} />
        : v.statut === 'maintenance' || v.statut === 'hors_service' ? <GrosBouton titre="Remettre disponible" onPress={() => statut('disponible')} /> : undefined}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      <Carte>
        <Ligne style={{ justifyContent: 'space-between' }}><Texte gris>Statut</Texte><Texte gras>{statutVehicule[v.statut] ?? v.statut}</Texte></Ligne>
        <Ligne style={{ justifyContent: 'space-between' }}><Texte gris>Kilométrage</Texte><Texte gras>{km(v.km)}</Texte></Ligne>
        <Ligne style={{ justifyContent: 'space-between' }}><Texte gris>Prix par jour</Texte><Texte gras>{euros(v.prix_jour)}</Texte></Ligne>
        <Ligne style={{ justifyContent: 'space-between' }}><Texte gris>Assurance</Texte><Texte gras couleur={couleurEch(v.assurance_echeance)}>{dateCourte(v.assurance_echeance)}</Texte></Ligne>
        <Ligne style={{ justifyContent: 'space-between' }}><Texte gris>Contrôle technique</Texte><Texte gras couleur={couleurEch(v.ct_echeance)}>{dateCourte(v.ct_echeance)}</Texte></Ligne>
      </Carte>
      {locations.length > 0 && <><Titre>Locations</Titre>{locations.map((l) => <CarteLocation key={l.id} l={l} genre={l.statut === 'en_cours' ? 'retour' : 'depart'} />)}</>}
      {v.statut === 'disponible' && <GrosBouton secondaire titre="Envoyer à l'atelier" onPress={() => statut('maintenance')} />}
      <Texte gris taille={14}>Position GPS, kilométrage automatique et coupure moteur s'afficheront ici dès que le traceur sera relié.</Texte>
    </Ecran>
  );
}
