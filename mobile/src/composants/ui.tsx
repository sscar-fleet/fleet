// Briques d'écran : tout est gros, lisible et se touche au pouce
import { FondDegrade } from './Ambiance';
import { ActivityIndicator, Pressable, ScrollView, Text, View, RefreshControl, Platform, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useCouleurs, T } from '@/lib/theme';
import Icone, { type NomIcone } from './Icone';

const vibrer = (fort = false) => { (fort ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) : Haptics.selectionAsync()).catch(() => {}); };
const ombre = Platform.OS === 'web' ? ({ boxShadow: '0 -12px 24px rgba(0,0,0,.18)' } as object) : {};

export function Ecran({ titre, sousTitre, surTitre, children, rafraichir, enChargement = false, bas, haut, retour = false, fermer = false, actions, ambiance = false }: {
  titre: string; sousTitre?: string; surTitre?: ReactNode; children: ReactNode; rafraichir?: () => void; enChargement?: boolean; bas?: ReactNode; haut?: ReactNode;
  retour?: boolean; fermer?: boolean; actions?: ReactNode; ambiance?: boolean; // ambiance : fond dégradé de l'appli SS CAR SYSTEM
}) {
  const c = useCouleurs();
  const marges = useSafeAreaInsets();
  const defil = useTirerPourActualiser(rafraichir, enChargement, c.accent, c.panneau, c.bord, marges.top);
  return (
    <View style={{ flex: 1, backgroundColor: c.fond }}>
      {ambiance && <FondDegrade />}
      <ScrollView ref={defil} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: T.marge, paddingTop: marges.top + 10, paddingBottom: bas ? 130 + marges.bottom : 40, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        refreshControl={rafraichir ? <RefreshControl refreshing={enChargement} onRefresh={rafraichir} tintColor={c.accent} /> : undefined}>
        {(retour || fermer || actions) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
            {retour || fermer ? (
              <Pressable accessibilityLabel={fermer ? 'Fermer' : 'Retour'} hitSlop={12}
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: c.panneau2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                <Icone nom={fermer ? 'fermer' : 'retour'} couleur={c.texte} taille={22} />
              </Pressable>
            ) : <View />}
            <View style={{ flexDirection: 'row', gap: 8 }}>{actions}</View>
          </View>
        )}
        {haut}
        <View style={{ marginBottom: 4 }}>
          {surTitre}
          <Text style={{ color: c.texte, fontSize: T.titre, fontWeight: '800', letterSpacing: -0.5 }}>{titre}</Text>
          {sousTitre ? <Text style={{ color: c.gris, fontSize: 15, marginTop: 3 }}>{sousTitre}</Text> : null}
        </View>
        {children}
      </ScrollView>
      {bas ? (
        <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: T.marge, paddingTop: 12, paddingBottom: marges.bottom + 12, backgroundColor: c.fond, borderTopWidth: 1, borderTopColor: c.bord }, ombre]}>
          <View style={{ maxWidth: 720, width: '100%', alignSelf: 'center', gap: 8 }}>{bas}</View>
        </View>
      ) : null}
    </View>
  );
}

// Tirer vers le bas pour actualiser, dans la version navigateur de l'appli (RefreshControl n'y fonctionne pas).
// Tout se fait directement sur la page pendant le geste, pour que ça suive le doigt sans saccade.
const SEUIL = 72;
function useTirerPourActualiser(rafraichir: (() => void) | undefined, enChargement: boolean, accent: string, fond: string, bord: string, haut: number) {
  const defil = useRef<any>(null);
  const appel = useRef(rafraichir);
  appel.current = rafraichir;
  const fini = useRef<() => void>(() => {});
  useEffect(() => { if (!enChargement) fini.current(); }, [enChargement]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !rafraichir || typeof document === 'undefined') return;
    const noeud: HTMLElement | null = defil.current?.getScrollableNode?.() ?? null;
    const contenu = noeud?.firstElementChild as HTMLElement | null;
    if (!noeud || !contenu) return;
    noeud.style.overscrollBehaviorY = 'contain';
    if (!document.getElementById('tirer-style')) {
      const st = document.createElement('style'); st.id = 'tirer-style';
      st.textContent = '@keyframes tirer-tourne{to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
    const rond = document.createElement('div');
    rond.style.cssText = `position:absolute;left:50%;top:${haut + 8}px;width:40px;height:40px;margin-left:-20px;border-radius:20px;background:${fond};border:1px solid ${bord};box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;z-index:20;pointer-events:none;opacity:0;transform:translateY(-60px)`;
    rond.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>`;
    rond.style.color = '#8a99a3';
    const svg = rond.firstElementChild as HTMLElement;
    noeud.parentElement?.appendChild(rond);

    let depart = -1, departX = 0, tirage = 0, verrou: '' | 'v' | 'h' = '', charge = false;
    const poser = (t: number, anime: boolean) => {
      const tr = anime ? 'transform .28s cubic-bezier(.2,.8,.2,1), opacity .2s' : 'none';
      contenu.style.transition = tr; rond.style.transition = tr;
      contenu.style.transform = t ? `translateY(${t}px)` : '';
      rond.style.transform = `translateY(${Math.min(t, SEUIL) - 60 + Math.min(t, SEUIL) * 0.35}px)`;
      rond.style.opacity = String(Math.min(1, t / (SEUIL * 0.6)));
    };
    const relacher = () => { charge = false; svg.style.animation = ''; rond.style.color = '#8a99a3'; poser(0, true); };
    fini.current = () => { if (charge) setTimeout(relacher, 350); };
    const debut = (e: TouchEvent) => {
      if (charge || noeud.scrollTop > 0) { depart = -1; return; }
      depart = e.touches[0].clientY; departX = e.touches[0].clientX; tirage = 0; verrou = '';
    };
    const bouge = (e: TouchEvent) => {
      if (depart < 0) return;
      const dy = e.touches[0].clientY - depart, dx = e.touches[0].clientX - departX;
      if (!verrou) { if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return; verrou = Math.abs(dy) > Math.abs(dx) && dy > 0 ? 'v' : 'h'; }
      if (verrou !== 'v' || noeud.scrollTop > 0) { if (tirage) { tirage = 0; poser(0, true); } depart = -1; return; }
      if (e.cancelable) e.preventDefault();
      // Résistance : de plus en plus dur à tirer
      const t = Math.min(130, dy * 0.55 - Math.max(0, dy * 0.55 - SEUIL) * 0.45);
      if (t >= SEUIL && tirage < SEUIL) { vibrer(); rond.style.color = accent; }
      if (t < SEUIL && tirage >= SEUIL) rond.style.color = '#8a99a3';
      tirage = t;
      svg.style.transform = `rotate(${(t / SEUIL) * 270}deg)`;
      poser(t, false);
    };
    const fin = () => {
      if (depart < 0 && !tirage) return;
      depart = -1;
      if (tirage >= SEUIL && appel.current) {
        charge = true; poser(56, true);
        svg.style.transform = ''; svg.style.animation = 'tirer-tourne .8s linear infinite'; rond.style.color = accent;
        try { appel.current(); } catch { /* rien */ }
        setTimeout(() => fini.current(), 900);
        setTimeout(() => { if (charge) relacher(); }, 8000);
      } else poser(0, true);
      tirage = 0;
    };
    noeud.addEventListener('touchstart', debut, { passive: true });
    noeud.addEventListener('touchmove', bouge, { passive: false });
    noeud.addEventListener('touchend', fin);
    noeud.addEventListener('touchcancel', fin);
    return () => {
      noeud.removeEventListener('touchstart', debut); noeud.removeEventListener('touchmove', bouge);
      noeud.removeEventListener('touchend', fin); noeud.removeEventListener('touchcancel', fin);
      rond.remove(); contenu.style.transform = '';
    };
  }, [!!rafraichir, accent, fond, bord, haut]); // eslint-disable-line react-hooks/exhaustive-deps
  return defil;
}

// Bouton rond en haut d'écran
export function BoutonRond({ icone, onPress, label, couleur, taille = 44 }: { icone: NomIcone; onPress: () => void; label: string; couleur?: string; taille?: number }) {
  const c = useCouleurs();
  return (
    <Pressable accessibilityLabel={label} hitSlop={8} onPress={() => { vibrer(); onPress(); }}
      style={({ pressed }) => ({ width: taille, height: taille, borderRadius: taille / 2, backgroundColor: couleur ? couleur + '1f' : c.panneau2, borderWidth: couleur ? 1 : 0, borderColor: (couleur ?? '') + '44', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Icone nom={icone} couleur={couleur ?? c.texte} taille={taille > 50 ? 24 : 21} />
    </Pressable>
  );
}

// Le bouton principal : un seul par écran, il dit quoi faire ensuite
export function GrosBouton({ titre, onPress, secondaire = false, danger = false, desactive = false, style, icone, sousTitre, petit = false }: {
  titre: string; onPress: () => void; secondaire?: boolean; danger?: boolean; desactive?: boolean; style?: ViewStyle; icone?: NomIcone; sousTitre?: string; petit?: boolean;
}) {
  const c = useCouleurs();
  const fond = danger ? c.rouge : secondaire ? c.panneau2 : c.accent;
  const texte = danger ? '#fff' : secondaire ? c.texte : c.surAccent;
  return (
    <Pressable accessibilityRole="button" disabled={desactive} onPress={() => { vibrer(true); onPress(); }}
      style={({ pressed }) => [{
        minHeight: petit ? T.cible : secondaire ? T.cible + 6 : T.bouton, borderRadius: T.rayon, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18,
        backgroundColor: fond, opacity: desactive ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }],
        borderWidth: secondaire ? 1 : 0, borderColor: c.bord, flexDirection: 'row', gap: 10,
      }, style]}>
      {icone ? <Icone nom={icone} couleur={texte} taille={petit ? 19 : 22} /> : null}
      <View style={{ alignItems: icone ? 'flex-start' : 'center', flexShrink: 1 }}>
        <Text numberOfLines={1} style={{ color: texte, fontSize: petit ? 15 : secondaire ? 16 : 18, fontWeight: '800' }}>{titre}</Text>
        {sousTitre ? <Text numberOfLines={1} style={{ color: texte, opacity: 0.75, fontSize: 13, fontWeight: '600' }}>{sousTitre}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Carte({ children, onPress, accent, style }: { children: ReactNode; onPress?: () => void; accent?: string; style?: ViewStyle }) {
  const c = useCouleurs();
  const base: ViewStyle = { backgroundColor: c.panneau, borderRadius: T.rayon, padding: 16, gap: 6, borderWidth: 1, borderColor: c.bord, overflow: 'hidden' };
  const barre = accent ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: accent }} /> : null;
  if (!onPress) return <View style={[base, style]}>{barre}{children}</View>;
  return (
    <Pressable onPress={() => { vibrer(); onPress(); }} style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }, style]}>
      {barre}{children}
    </Pressable>
  );
}

export function Ligne({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Texte({ children, gris = false, gras = false, taille = T.texte, couleur, lignes, centre = false }: {
  children: ReactNode; gris?: boolean; gras?: boolean; taille?: number; couleur?: string; lignes?: number; centre?: boolean;
}) {
  const c = useCouleurs();
  return <Text numberOfLines={lignes} style={{ color: couleur ?? (gris ? c.gris : c.texte), fontSize: taille, fontWeight: gras ? '700' : '400', textAlign: centre ? 'center' : undefined, lineHeight: taille * 1.32 }}>{children}</Text>;
}

export function Pastille({ ok, titre, couleur }: { ok: boolean; titre: string; couleur?: string }) {
  const c = useCouleurs();
  return <Etiquette titre={titre} couleur={couleur ?? (ok ? c.vert : c.orange)} icone={ok ? 'ok' : undefined} />;
}

export function Etiquette({ titre, couleur, icone, plein = false }: { titre: string; couleur: string; icone?: NomIcone; plein?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: plein ? couleur : couleur + '22', alignSelf: 'flex-start' }}>
      {icone ? <Icone nom={icone} couleur={plein ? '#fff' : couleur} taille={13} epaisseur={2.6} /> : <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: plein ? '#fff' : couleur }} />}
      <Text style={{ color: plein ? '#fff' : couleur, fontSize: 13, fontWeight: '800' }}>{titre}</Text>
    </View>
  );
}

export function Titre({ children, action, onAction }: { children: ReactNode; action?: string; onAction?: () => void }) {
  const c = useCouleurs();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 }}>
      <Text style={{ color: c.gris, fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>{children}</Text>
      {action && onAction ? <Pressable hitSlop={10} onPress={onAction}><Text style={{ color: c.accent, fontSize: 14, fontWeight: '800' }}>{action}</Text></Pressable> : null}
    </View>
  );
}

// Chiffre clé qu'on touche pour filtrer
export function Tuile({ valeur, libelle, couleur, icone, onPress, alerte = false }: { valeur: number | string; libelle: string; couleur: string; icone: NomIcone; onPress?: () => void; alerte?: boolean }) {
  const c = useCouleurs();
  return (
    <Pressable onPress={() => { vibrer(); onPress?.(); }} disabled={!onPress}
      style={({ pressed }) => ({ flex: 1, minWidth: '46%', backgroundColor: alerte ? couleur + '1c' : c.panneau, borderRadius: T.rayon, padding: 14, gap: 8, borderWidth: 1, borderColor: alerte ? couleur + '66' : c.bord, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: couleur + '22', alignItems: 'center', justifyContent: 'center' }}><Icone nom={icone} couleur={couleur} taille={19} /></View>
        <Text style={{ color: alerte ? couleur : c.texte, fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{valeur}</Text>
      </View>
      <Text style={{ color: c.texte2, fontSize: 14, fontWeight: '700' }}>{libelle}</Text>
    </Pressable>
  );
}

// Raccourci rond avec son nom dessous
export function Action({ icone, titre, onPress, couleur, desactive = false }: { icone: NomIcone; titre: string; onPress: () => void; couleur?: string; desactive?: boolean }) {
  const c = useCouleurs();
  const coul = couleur ?? c.accent;
  return (
    <Pressable disabled={desactive} onPress={() => { vibrer(); onPress(); }} style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 7, opacity: desactive ? 0.4 : pressed ? 0.7 : 1, minWidth: 64 })}>
      <View style={{ width: 56, height: 56, borderRadius: 20, backgroundColor: coul + '1f', borderWidth: 1, borderColor: coul + '44', alignItems: 'center', justifyContent: 'center' }}>
        <Icone nom={icone} couleur={coul} taille={24} />
      </View>
      <Text numberOfLines={1} style={{ color: c.texte2, fontSize: 12.5, fontWeight: '700' }}>{titre}</Text>
    </Pressable>
  );
}

// Ligne de liste : icône, titre, détail, valeur à droite
export function Rangee({ icone, couleur, titre, sous, droite, onPress, fin = false, chevron = !!onPress }: {
  icone?: NomIcone; couleur?: string; titre: string; sous?: string; droite?: ReactNode; onPress?: () => void; fin?: boolean; chevron?: boolean;
}) {
  const c = useCouleurs();
  const coul = couleur ?? c.gris;
  const contenu = (
    <>
      {icone ? <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: coul + '1f', alignItems: 'center', justifyContent: 'center' }}><Icone nom={icone} couleur={coul} taille={20} /></View> : null}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: c.texte, fontSize: 16, fontWeight: '700' }}>{titre}</Text>
        {sous ? <Text style={{ color: c.gris, fontSize: 14 }}>{sous}</Text> : null}
      </View>
      {typeof droite === 'string' ? <Text style={{ color: c.texte, fontSize: 16, fontWeight: '800' }}>{droite}</Text> : droite}
      {chevron ? <Icone nom="chevron" couleur={c.gris} taille={18} /> : null}
    </>
  );
  const style: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 8, borderBottomWidth: fin ? 0 : 1, borderBottomColor: c.bord };
  if (!onPress) return <View style={style}>{contenu}</View>;
  return <Pressable onPress={() => { vibrer(); onPress(); }} style={({ pressed }) => [style, { opacity: pressed ? 0.7 : 1 }]}>{contenu}</Pressable>;
}

// Choix exclusif en barre (En cours · À venir · En retard)
export function Segments<K extends string>({ options, valeur, onChange }: { options: { cle: K; titre: string; n?: number; couleur?: string }[]; valeur: K; onChange: (k: K) => void }) {
  const c = useCouleurs();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.panneau2, borderRadius: 14, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const actif = o.cle === valeur;
        return (
          <Pressable key={o.cle} onPress={() => { vibrer(); onChange(o.cle); }}
            style={{ flex: 1, minHeight: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: actif ? c.panneau : 'transparent', flexDirection: 'row', gap: 6, borderWidth: actif ? 1 : 0, borderColor: c.bord }}>
            <Text style={{ color: actif ? c.texte : c.gris, fontWeight: '800', fontSize: 14 }}>{o.titre}</Text>
            {o.n != null ? <Text style={{ color: o.couleur && o.n ? o.couleur : actif ? c.accent : c.gris, fontWeight: '800', fontSize: 14 }}>{o.n}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Barre({ part, couleur, hauteur = 6 }: { part: number; couleur?: string; hauteur?: number }) {
  const c = useCouleurs();
  return (
    <View style={{ height: hauteur, borderRadius: hauteur, backgroundColor: c.panneau2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, part)) * 100}%`, height: '100%', backgroundColor: couleur ?? c.accent, borderRadius: hauteur }} />
    </View>
  );
}

// Étapes numérotées (assistant d'état des lieux, nouvelle location) : pastilles reliées, coche quand c'est fait
export function Etapes({ etapes, etape, onChoix }: { etapes: readonly string[]; etape: number; onChoix?: (i: number) => void }) {
  const c = useCouleurs();
  return (
    <View style={{ backgroundColor: c.panneau, borderRadius: T.rayon, borderWidth: 1, borderColor: c.bord, paddingVertical: 14, paddingHorizontal: 6 }}>
      <View style={{ flexDirection: 'row' }}>
        {etapes.map((e, i) => {
          const fait = i < etape, actuelle = i === etape;
          return (
            <Pressable key={e} disabled={!onChoix || i > etape} onPress={() => { vibrer(); onChoix?.(i); }} style={{ flex: 1, alignItems: 'center', gap: 7 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i === 0 ? 'transparent' : i <= etape ? c.accent : c.bord }} />
                <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: actuelle ? c.accent : fait ? c.accent + '26' : c.panneau2, borderWidth: actuelle ? 0 : 1.5, borderColor: fait ? c.accent : c.bord,
                  ...(actuelle && Platform.OS === 'web' ? ({ boxShadow: `0 0 0 5px ${c.accent}33` } as object) : {}) }}>
                  {fait ? <Icone nom="ok" couleur={c.accent} taille={17} epaisseur={3} />
                    : <Text style={{ color: actuelle ? c.surAccent : c.gris, fontWeight: '900', fontSize: 15 }}>{i + 1}</Text>}
                </View>
                <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i === etapes.length - 1 ? 'transparent' : i < etape ? c.accent : c.bord }} />
              </View>
              <Text numberOfLines={1} style={{ color: actuelle ? c.texte : fait ? c.accent : c.gris, fontSize: 13, fontWeight: actuelle ? '800' : '700' }}>{e}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Vide({ titre, texte, icone }: { titre: string; texte?: string; icone?: NomIcone }) {
  const c = useCouleurs();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 26, paddingHorizontal: 20, gap: 8, borderRadius: T.rayon, borderWidth: 1, borderStyle: 'dashed', borderColor: c.bord }}>
      {icone ? <Icone nom={icone} couleur={c.gris} taille={28} /> : null}
      <Text style={{ color: c.texte2, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{titre}</Text>
      {texte ? <Text style={{ color: c.gris, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>{texte}</Text> : null}
    </View>
  );
}

export function Chargement() {
  const c = useCouleurs();
  return (
    <View style={{ gap: 12 }}>
      {[0, 1, 2].map((i) => <View key={i} style={{ height: 96, borderRadius: T.rayon, backgroundColor: c.panneau, opacity: 1 - i * 0.25, borderWidth: 1, borderColor: c.bord }} />)}
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

export function BandeauHorsLigne({ majLe }: { majLe?: string }) {
  const c = useCouleurs();
  return (
    <View style={{ backgroundColor: c.orange + '1c', borderRadius: 14, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <Icone nom="nuage" couleur={c.orange} taille={22} />
      <Text style={{ color: c.orange, fontWeight: '700', flex: 1, lineHeight: 20 }}>Pas de réseau. Affichage de {majLe ? `${new Date(majLe.replace(' ', 'T') + 'Z').toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'la dernière version'}. Continuez : tout part au retour du réseau.</Text>
    </View>
  );
}
