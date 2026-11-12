import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Localization, type LanguagePreference } from '../../../shared/i18n/Localization';

type LocalizationValue = Localization & {
  preference: LanguagePreference;
  setPreference: (value: LanguagePreference) => void;
};
const Context = createContext<LocalizationValue | null>(null);

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(() =>
    Localization.preference(localStorage.getItem('collection-studio-language')),
  );
  const [languages, setLanguages] = useState<readonly string[]>(navigator.languages);
  useEffect(() => {
    void window.studio.getSystemLanguages().then(setLanguages);
  }, []);
  const locale = Localization.resolve(preference, languages);
  const translator = useMemo(() => new Localization(locale), [locale]);
  useEffect(() => {
    localStorage.setItem('collection-studio-language', preference);
    document.documentElement.lang = locale;
    void window.studio.setLanguage(locale);
  }, [locale, preference]);
  const value = useMemo(
    () => ({ locale: translator.locale, t: translator.t, text: translator.text, preference, setPreference }),
    [translator, preference],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLocalization(): LocalizationValue {
  const value = useContext(Context);
  if (!value) throw new Error('LocalizationProvider is missing.');
  return value;
}
