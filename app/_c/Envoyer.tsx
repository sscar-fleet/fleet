'use client';
import { useFormStatus } from 'react-dom';

export default function Envoyer({ children, className = 'bouton principal', name, value }:
  { children: React.ReactNode; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} name={name} value={value}>
      {pending ? 'Un instant…' : children}
    </button>
  );
}
