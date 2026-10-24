import { useCallback, useEffect, useRef, useState } from 'react';

type VoiceLanguage = 'en-PH' | 'fil-PH';

type VoicePreferences = {
  enabled: boolean;
  muted: boolean;
  language: VoiceLanguage;
  voiceURI: string;
  rate: number;
  volume: number;
};

const STORAGE_KEY = 'hirna:qr-scanner-voice:v1';
const defaults: VoicePreferences = {
  enabled: false,
  muted: false,
  language: 'en-PH',
  voiceURI: '',
  rate: 0.95,
  volume: 1,
};

function loadPreferences(): VoicePreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<VoicePreferences>;
    return {
      ...defaults,
      ...saved,
      rate: Math.min(1.25, Math.max(0.75, Number(saved.rate ?? defaults.rate))),
      volume: Math.min(1, Math.max(0, Number(saved.volume ?? defaults.volume))),
    };
  } catch {
    return defaults;
  }
}

export function useQrVoiceGuidance() {
  const [preferences, setPreferences] = useState<VoicePreferences>(loadPreferences);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const supported = typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof window.SpeechSynthesisUtterance !== 'undefined';
  const preferencesRef = useRef(preferences);
  const lastAnnouncementRef = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    preferencesRef.current = preferences;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* optional preference only */ }
  }, [preferences]);

  useEffect(() => {
    if (!supported) return undefined;
    const synth = window.speechSynthesis;
    const refresh = () => setVoices(synth.getVoices());
    refresh();
    synth.addEventListener?.('voiceschanged', refresh);
    return () => {
      synth.removeEventListener?.('voiceschanged', refresh);
      synth.cancel();
    };
  }, [supported]);

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  const speak = useCallback((key: string, english: string, filipino?: string, priority: 'GUIDANCE' | 'OUTCOME' = 'GUIDANCE') => {
    const current = preferencesRef.current;
    if (!supported || !current.enabled || current.muted) return;
    const now = Date.now();
    const cooldown = priority === 'OUTCOME' ? 1500 : 7000;
    if (lastAnnouncementRef.current?.key === key && now - lastAnnouncementRef.current.at < cooldown) return;
    lastAnnouncementRef.current = { key, at: now };

    const utterance = new window.SpeechSynthesisUtterance(current.language === 'fil-PH' && filipino ? filipino : english);
    const exactVoice = voices.find((voice) => voice.voiceURI === current.voiceURI);
    const preferredVoice = voices.find((voice) => voice.lang.toLowerCase() === current.language.toLowerCase())
      ?? (current.language === 'en-PH' ? voices.find((voice) => voice.lang.toLowerCase().startsWith('en-ph')) : undefined)
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(current.language === 'fil-PH' ? 'fil' : 'en'));
    utterance.voice = exactVoice ?? preferredVoice ?? null;
    utterance.lang = (exactVoice ?? preferredVoice)?.lang ?? current.language;
    utterance.rate = current.rate;
    utterance.volume = current.volume;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [supported, voices]);

  const enable = useCallback(() => {
    const next = { ...preferencesRef.current, enabled: true, muted: false };
    preferencesRef.current = next;
    setPreferences(next);
    if (supported) {
      const utterance = new window.SpeechSynthesisUtterance('Voice guidance enabled.');
      utterance.rate = next.rate;
      utterance.volume = next.volume;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  }, [supported]);

  const update = useCallback(<K extends keyof VoicePreferences>(key: K, value: VoicePreferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  }, []);

  return { supported, preferences, voices, enable, update, speak, cancel };
}
