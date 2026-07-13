'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

export function PasswordFields({ password, confirmation, onPassword, onConfirmation, disabled = false }: { password: string; confirmation: string; onPassword: (value: string) => void; onConfirmation: (value: string) => void; disabled?: boolean }) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  return <div className="space-y-4">
    <PasswordInput id="new-password" label="New password" value={password} onChange={onPassword} show={showPassword} onToggle={() => setShowPassword(value => !value)} disabled={disabled}/>
    <PasswordInput id="confirm-password" label="Confirm new password" value={confirmation} onChange={onConfirmation} show={showConfirmation} onToggle={() => setShowConfirmation(value => !value)} disabled={disabled}/>
    <p id="password-guidance" className="text-xs leading-5 text-slate-400">Use at least 10 characters. A longer, unique passphrase is strongest.</p>
  </div>;
}

function PasswordInput({ id, label, value, onChange, show, onToggle, disabled }: { id: string; label: string; value: string; onChange: (value: string) => void; show: boolean; onToggle: () => void; disabled: boolean }) {
  return <div><label htmlFor={id} className="block text-sm text-slate-300">{label}</label><div className="relative mt-2"><input id={id} className="field w-full pr-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={10} required disabled={disabled} aria-describedby="password-guidance" value={value} onChange={e => onChange(e.target.value)}/><button type="button" onClick={onToggle} disabled={disabled} aria-label={`${show ? 'Hide' : 'Show'} ${label.toLowerCase()}`} className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div>;
}
