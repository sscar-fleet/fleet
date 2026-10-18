// Fiche d'une location : l'essentiel en haut, un seul gros bouton pour l'étape suivante
import { Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Ecran, GrosBouton, Carte, Ligne, Pastille, Texte, Titre, Chargement, BandeauHorsLigne } from '@/composants/ui';
import { chargerLocation, voyantsDepart } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { euros, heure, jour, nomClient, nomVehicule } from '@/lib/format';
import { mettreEnFile } from '@/lib/hors-ligne';

const tel = (t?: string | null) => (t ?? '').replace(/[^\d+]/g, '').replace(/^0/, '33').replace(/^\+/, '');

export default function FicheLocation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const charger = useCallback(() => chargerLocation(id), [id]);
  const { donnees: l, horsLigne, majLe, recharger } = useDonnees(charger);
  if (!l) return <Ecran titre="Location"><Chargement /></Ecran>;

  const c = l.clients;
  const depart = l.statut === 'reservee';
  const edlFait = (type: string) => l.etats_des_lieux.some((e) => e.type === type && e.statut !== 'en_attente');
  const voyants = depart ? voyantsDepart(l) : [];
  const message = depart
    ? `Bonjour ${c?.prenom ?? ''}, votre ${nomVehicule(l.vehicules)} vous attend ${jour(l.debut)} à ${heure(l.debut)}. Pensez à votre permis et votre pièce d'identité.`
    : `Bonjour ${c?.prenom ?? ''}, petit rappel : retour de la ${nomVehicule(l.vehicules)} ${jour(l.fin_prevue)} à ${heure(l.fin_prevue)}. Merci !`;

  const principal = depart
    ? { titre: edlFait('depart') ? 'État des lieux de départ fait' : 'Faire l’état des lieux de départ', type: 'depart' }
    : l.statut === 'en_cours' ? { titre: 'Faire l’état des lieux de retour', type: 'retour' } : null;

  return (
    <Ecran titre={nomVehicule(l.vehicules)} sousTitre={`${l.vehicules?.immatriculation} · contrat n° ${l.numero ?? '—'}`} rafraichir={recharger}
      bas={principal ? <GrosBouton titre={principal.titre} desactive={depart && edlFait('depart')}
        onPress={() => router.push({ pathname: '/edl/[id]', params: { id: l.id, type: principal.type } })} /> : undefined}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      <Carte>
        <Texte gras taille={20}>{nomClient(c)}</Texte>
        <Texte gris>Du {jour(l.debut)} {heure(l.debut)} au {jour(l.fin_prevue)} {heure(l.fin_prevue)}</Texte>
        <Texte>{euros(l.prix_total)} · caution {euros(l.caution_montant)}</Texte>
        {voyants.length > 0 && <Ligne style={{ marginTop: 6 }}>{voyants.map((v) => <Pastille key={v.titre} {...v} />)}</Ligne>}
      </Carte>

      {depart && l.caution_montant && l.caution_statut !== 'prise' ? (
        <GrosBouton secondaire titre={`Caution de ${euros(l.caution_montant)} prise`} onPress={async () => {
          await mettreEnFile({ genre: 'maj', table: 'locations', id: l.id, champs: { caution_statut: 'prise' } });
          recharger();
        }} />
      ) : null}

      <Titre>Contacter le client</Titre>
      <Ligne>
        {c?.telephone ? <GrosBouton secondaire titre="WhatsApp" style={{ flex: 1 }} onPress={() => Linking.openURL(`https://wa.me/${tel(c.telephone)}?text=${encodeURIComponent(message)}`)} /> : null}
        {c?.email ? <GrosBouton secondaire titre="E-mail" style={{ flex: 1 }} onPress={() => Linking.openURL(`mailto:${c.email}?subject=${encodeURIComponent('Votre location')}&body=${encodeURIComponent(message)}`)} /> : null}
        {c?.telephone ? <GrosBouton secondaire titre="Appeler" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${c.telephone}`)} /> : null}
      </Ligne>
    </Ecran>
  );
}
