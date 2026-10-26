// Amendes : photo de l'avis → lecture automatique → conducteur retrouvé → à désigner
import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ecran, GrosBouton, Carte, Ligne, Vide, Chargement, BandeauHorsLigne, Etiquette, Segments } from '@/composants/ui';
import { chargerAmendes, type AmendeLigne } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { euros, jour, heure, nomClient, statutAmende } from '@/lib/format';
import { useCouleurs } from '@/lib/theme';
import { formatImmat } from '@/composants/Plaque';

export default function Amendes() {
  const c = useCouleurs();
  const { donnees, horsLigne, majLe, enChargement, recharger } = useDonnees(chargerAmendes);
  const [vue, setVue] = useState<'traiter' | 'traitees'>('traiter');
  const aTraiter = (donnees ?? []).filter((a) => ['a_designer', 'infos_manquantes'].includes(a.statut));
  const autres = (donnees ?? []).filter((a) => !['a_designer', 'infos_manquantes'].includes(a.statut));
  const total = aTraiter.reduce((s, a) => s + Number(a.montant ?? 0), 0);
  const couleur = (s: string) => ({ a_designer: c.orange, infos_manquantes: c.rouge, designee: c.vert, payee: c.gris, refusee: c.rouge })[s] ?? c.gris;

  const ligne = (a: AmendeLigne) => (
    <Carte key={a.id} accent={couleur(a.statut)}>
      <Ligne style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: c.texte, fontSize: 17, fontWeight: '800' }}>{a.type ?? 'Infraction'}</Text>
        <Text style={{ color: c.texte, fontSize: 18, fontWeight: '800' }}>{euros(a.montant)}</Text>
      </Ligne>
      <Text style={{ color: c.gris, fontSize: 14 }}>{formatImmat(a.vehicules?.immatriculation) || 'Véhicule ?'} · {jour(a.date_infraction)} {heure(a.date_infraction)}{a.lieu ? ' · ' + a.lieu : ''}</Text>
      <Ligne style={{ marginTop: 4 }}>
        <Etiquette titre={statutAmende[a.statut] ?? a.statut} couleur={couleur(a.statut)} />
        {(() => { const p = a.clients ?? a.chauffeurs; return <Etiquette titre={p ? nomClient(p) : 'Conducteur non retrouvé'} couleur={p ? c.texte2 : c.rouge} icone={p ? 'client' : 'alerte'} />; })()}
      </Ligne>
    </Carte>
  );

  return (
    <Ecran titre="Amendes" sousTitre={aTraiter.length ? `${aTraiter.length} à traiter · ${euros(total)}` : 'Tout est traité'} rafraichir={recharger} enChargement={enChargement && !!donnees}
      bas={<GrosBouton icone="photo" titre="Photographier un avis" sousTitre="Amende ou FPS : tout se remplit tout seul" onPress={() => router.push("/amende")} />}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      <Segments valeur={vue} onChange={setVue} options={[{ cle: 'traiter', titre: 'À traiter', n: aTraiter.length, couleur: c.orange }, { cle: 'traitees', titre: 'Traitées', n: autres.length }]} />
      {!donnees ? <Chargement /> : (vue === 'traiter' ? aTraiter : autres).length ? (vue === 'traiter' ? aTraiter : autres).map(ligne)
        : <Vide icone={vue === 'traiter' ? 'ok' : 'amendes'} titre={vue === 'traiter' ? 'Rien à traiter' : 'Aucune amende traitée'} texte={vue === 'traiter' ? 'Photographiez un avis : l’immatriculation, la date et le conducteur sont retrouvés tout seuls.' : undefined} />}
      {vue === 'traiter' && aTraiter.length > 0 && <View style={{ height: 4 }} />}
    </Ecran>
  );
}
