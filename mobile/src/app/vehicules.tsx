// Liste des véhicules : statut, kilométrage, papiers qui expirent (ouverte depuis l'espace Suivi)
import VisuelVehicule from '@/composants/VisuelVehicule';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ecran, Carte, Ligne, Chargement, BandeauHorsLigne, Vide, Etiquette, Segments, BoutonRond } from '@/composants/ui';
import { Recherche } from '@/composants/champs';
import { BadgeSport } from '@/composants/LogoMarque';
import Plaque from '@/composants/Plaque';
import MiniCarte from '@/composants/MiniCarte';
import { logoMarque } from '@/lib/logoMarque';
import { chargerVehicules } from '@/lib/donnees';
import { useDonnees } from '@/lib/useDonnees';
import { useCouleurs } from '@/lib/theme';
import { useGps, libelleGps, couleurGps } from '@/lib/gps';
import { echeance, km, statutVehicule, nomVehicule, plaque } from '@/lib/format';

type Filtre = 'tous' | 'disponible' | 'loue' | 'atelier';

export default function Vehicules() {
  const c = useCouleurs();
  const { gps } = useGps();
  const { donnees, horsLigne, majLe, enChargement, recharger } = useDonnees(chargerVehicules);
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [q, setQ] = useState('');
  const tous = donnees ?? [];
  const atelier = (s: string) => s === 'maintenance' || s === 'hors_service';
  const nb = (f: Filtre) => tous.filter((v) => f === 'tous' || (f === 'atelier' ? atelier(v.statut) : v.statut === f)).length;
  const cherche = q.toLowerCase().replace(/[\s-]/g, '');
  const liste = tous.filter((v) => (filtre === 'tous' || (filtre === 'atelier' ? atelier(v.statut) : v.statut === filtre))
    && (!cherche || `${plaque(v.immatriculation)}${v.marque ?? ''}${v.modele ?? ''}`.toLowerCase().replace(/[\s-]/g, '').includes(cherche)));
  const couleurStatut: Record<string, string> = { disponible: c.vert, loue: c.accent, maintenance: c.orange, hors_service: c.rouge };
  const points = tous.map((v) => ({ v, e: gps.parVehicule[v.id] })).filter((x) => x.e?.lat != null && x.e?.lng != null)
    .map((x) => ({ id: x.v.id, lat: x.e!.lat!, lng: x.e!.lng!, couleur: couleurGps(x.e!, c), titre: x.v.immatriculation, logo: logoMarque(x.v.marque, x.v.modele) }));

  return (
    <Ecran retour titre="Véhicules" sousTitre={`${nb('disponible')} libre${nb('disponible') > 1 ? 's' : ''} · ${nb('loue')} dehors · ${tous.length} au total`} rafraichir={recharger} enChargement={enChargement && !!donnees}
      actions={points.length ? <BoutonRond icone="carte" label="Carte GPS" onPress={() => router.push('/carte')} /> : undefined}>
      {horsLigne && <BandeauHorsLigne majLe={majLe} />}
      {points.length > 0 && <View style={{ gap: 6 }}>
        <MiniCarte points={points} hauteur={170} onPress={() => router.push('/carte')} />
        {gps.demo && <Text style={{ color: c.gris, fontSize: 12 }}>Aperçu : positions fictives en attendant les clés du fournisseur GPS.</Text>}
      </View>}
      <Recherche valeur={q} onChange={setQ} placeholder="Immatriculation, marque, modèle…" />
      <Segments<Filtre> valeur={filtre} onChange={setFiltre} options={[
        { cle: 'tous', titre: 'Tous', n: nb('tous') }, { cle: 'disponible', titre: 'Libres', n: nb('disponible') },
        { cle: 'loue', titre: 'Dehors', n: nb('loue') }, ...(nb('atelier') ? [{ cle: 'atelier' as Filtre, titre: 'Atelier', n: nb('atelier'), couleur: c.orange }] : []),
      ]} />
      {!donnees ? <Chargement /> : liste.length ? liste.map((v) => {
        const alerte = [echeance(v.assurance_echeance) && 'assurance', echeance(v.ct_echeance) && 'contrôle technique'].filter(Boolean).join(' et ');
        const depasse = echeance(v.assurance_echeance) === 'depasse' || echeance(v.ct_echeance) === 'depasse';
        const e = gps.parVehicule[v.id];
        return (
          <Carte key={v.id} accent={couleurStatut[v.statut]} onPress={() => router.push({ pathname: '/vehicule/[id]', params: { id: v.id } })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <VisuelVehicule v={v} taille={44} />
              <View style={{ flex: 1, gap: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text numberOfLines={1} style={{ flexShrink: 1, color: c.texte, fontSize: 17, fontWeight: '800' }}>{nomVehicule(v)}</Text><BadgeSport marque={v.marque} modele={v.modele} petit /></View>
                <Plaque immat={plaque(v.immatriculation)} taille={0.7} />
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ color: couleurStatut[v.statut] ?? c.gris, fontWeight: '800', fontSize: 14 }}>{statutVehicule[v.statut] ?? v.statut}</Text>
                <Text style={{ color: c.gris, fontSize: 13 }}>{km(e?.km_estime ?? v.km)}</Text>
              </View>
            </View>
            {(e || alerte) && <Ligne style={{ marginTop: 4 }}>
              {e && <Etiquette titre={libelleGps(e)} couleur={couleurGps(e, c)} />}
              {alerte ? <Etiquette titre={`${depasse ? 'Expiré' : 'À renouveler'} : ${alerte}`} couleur={depasse ? c.rouge : c.orange} icone="alerte" /> : null}
            </Ligne>}
          </Carte>
        );
      }) : <Vide icone="voiture" titre="Aucun véhicule ici" />}
    </Ecran>
  );
}
