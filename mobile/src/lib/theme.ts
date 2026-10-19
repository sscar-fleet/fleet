// Couleurs et tailles de l'appli : mêmes teintes que le site, en plus gros pour le pouce
import { useColorScheme } from 'react-native';

const sombre = {
  fond: '#0b0f12', panneau: '#12181d', panneau2: '#182027', bord: '#1f2a31',
  texte: '#eef3f5', texte2: '#c9d3d9', gris: '#8a99a3',
  accent: '#19f7d6', surAccent: '#00140f', vert: '#22c55e', orange: '#f59e0b', rouge: '#ef4444', bleu: '#60a5fa',
  voile: 'rgba(4,8,10,.72)',
};
const clair: typeof sombre = {
  fond: '#f3f5f7', panneau: '#ffffff', panneau2: '#eef2f4', bord: '#d9e0e5',
  texte: '#0b1215', texte2: '#2a3840', gris: '#56656e',
  accent: '#0ea896', surAccent: '#ffffff', vert: '#15803d', orange: '#c2410c', rouge: '#dc2626', bleu: '#2563eb',
  voile: 'rgba(10,20,25,.5)',
};
export type Couleurs = typeof sombre;

export function useCouleurs(): Couleurs {
  return useColorScheme() === 'light' ? clair : sombre;
}

// Cible tactile minimale : 60 px pour le bouton principal, 48 px ailleurs
export const T = { bouton: 60, cible: 48, rayon: 18, marge: 16, titre: 30, texte: 17, petit: 14 };
