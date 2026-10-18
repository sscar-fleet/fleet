'use client';
import { useEffect, useRef } from 'react';

// Enregistre la position GPS du téléphone au moment de l'état des lieux (preuve en cas de litige)
export default function Position({ deja, action }: { deja: boolean; action: (lat: number, lng: number) => Promise<unknown> }) {
  const fait = useRef(false);
  useEffect(() => {
    if (deja || fait.current || !('geolocation' in navigator)) return;
    fait.current = true;
    navigator.geolocation.getCurrentPosition((p) => { action(p.coords.latitude, p.coords.longitude); }, () => {}, { enableHighAccuracy: true, timeout: 15000 });
  }, [deja, action]);
  return null;
}
