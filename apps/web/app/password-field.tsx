'use client';
import { InputHTMLAttributes, useId, useState } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string };

export default function PasswordField({ label, id, ...props }: Props) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [visible, setVisible] = useState(false);
  return <div className="password-field"><label htmlFor={inputId}>{label}</label><div className="password-control"><input {...props} id={inputId} type={visible ? 'text' : 'password'} /><button type="button" className="password-toggle" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-controls={inputId} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button></div></div>;
}
