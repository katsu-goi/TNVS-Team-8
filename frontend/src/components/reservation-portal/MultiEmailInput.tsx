import React, { useRef, useState } from 'react';
import { Mail, X } from 'lucide-react';

type MultiEmailInputProps = {
  value: string[];
  onChange: (emails: string[]) => void;
  disabled?: boolean;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MultiEmailInput: React.FC<MultiEmailInputProps> = ({ value, onChange, disabled = false }) => {
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addEmails = (rawValue: string) => {
    const candidates = rawValue.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (!candidates.length) return;
    const invalid = candidates.find((email) => !emailPattern.test(email));
    if (invalid) {
      setMessage(`${invalid} is not a valid email address.`);
      return;
    }
    const nextEmails = [...value];
    for (const email of candidates) {
      if (!nextEmails.includes(email)) nextEmails.push(email);
    }
    onChange(nextEmails);
    setDraft('');
    setMessage('');
  };

  const removeEmail = (email: string) => {
    onChange(value.filter((item) => item !== email));
    setMessage('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === ',' || event.key === ';') {
      event.preventDefault();
      addEmails(draft);
    } else if (event.key === 'Backspace' && !draft && value.length) {
      removeEmail(value[value.length - 1]);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextDraft = event.target.value;
    if (/[\s,;]/.test(nextDraft)) {
      addEmails(nextDraft);
      return;
    }
    setDraft(nextDraft);
    setMessage('');
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (/[\s,;]+/.test(pasted)) {
      event.preventDefault();
      addEmails(pasted);
    }
  };

  return (
    <div>
      <div className={`flex min-h-[48px] flex-wrap items-center gap-2 rounded-xl border bg-white px-3 py-2 transition focus-within:border-red-700 focus-within:ring-2 focus-within:ring-red-700/10 ${message ? 'border-rose-300' : 'border-slate-200'}`} onClick={() => inputRef.current?.focus()}>
        {value.map((email) => (
          <span key={email} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-800">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{email}</span>
            <button type="button" onClick={() => removeEmail(email)} disabled={disabled} className="rounded-full p-0.5 text-red-500 hover:bg-red-100 hover:text-red-800 disabled:opacity-50" aria-label={`Remove ${email}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input ref={inputRef} value={draft} onChange={handleChange} onKeyDown={handleKeyDown} onBlur={() => draft && addEmails(draft)} onPaste={handlePaste} disabled={disabled} type="email" className="min-w-[180px] flex-1 border-0 bg-transparent px-1 py-1 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed" placeholder={value.length ? 'Add another email' : 'Type an email and press Enter'} />
      </div>
      {message && <p className="mt-1.5 text-xs font-medium text-rose-600">{message}</p>}
      <p className="mt-1.5 text-[11px] text-slate-400">Press Enter, Space, comma, or semicolon to add each invitee.</p>
    </div>
  );
};

export default MultiEmailInput;
