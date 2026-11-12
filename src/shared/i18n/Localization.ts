import en from './en.json';
import ru from './ru.json';

export type Locale = 'en' | 'ru';
export type LanguagePreference = Locale | 'system';
export type MessageKey = keyof typeof en;
export type MessageParameters = Readonly<Record<string, string | number>>;

/** Presentation-only translation. User content and provider payloads stay unchanged. */
export class Localization {
  private static readonly russian: Record<MessageKey, string> = ru;
  static preference(value: string | null): LanguagePreference {
    return value === 'en' || value === 'ru' ? value : 'system';
  }
  static resolve(preference: LanguagePreference, deviceLanguages: readonly string[]): Locale {
    if (preference !== 'system') return preference;
    for (const tag of deviceLanguages) {
      const language = tag.toLowerCase().split(/[-_]/)[0];
      if (language === 'ru' || language === 'en') return language;
    }
    return 'en';
  }
  constructor(readonly locale: Locale) {}
  t = (key: MessageKey, parameters: MessageParameters = {}): string => {
    const template = this.locale === 'ru' ? Localization.russian[key] : en[key];
    return template.replace(/\{(\w+)\}/g, (token, name: string) => String(parameters[name] ?? token));
  };
  /** Dynamic system/profile text uses the catalog; unknown provider diagnostics remain verbatim. */
  text = (message: string): string => {
    if (Object.hasOwn(en, message)) return this.t(message as MessageKey);
    if (this.locale === 'en') return message;
    const sourceCard = /^Source card (\d+)$/.exec(message);
    if (sourceCard?.[1]) return this.t('Source card {number}', { number: sourceCard[1] });
    const analysisProgress = /^Reference library: (\d+)\/(\d+) analyzed$/.exec(message);
    if (analysisProgress?.[1] && analysisProgress[2]) {
      return this.t('Reference library: {done}/{total} analyzed', {
        done: analysisProgress[1],
        total: analysisProgress[2],
      });
    }
    const contextPrefix = 'Preparing reference context: ';
    if (message.startsWith(contextPrefix)) {
      return this.t('Preparing reference context: {subject}', {
        subject: message.slice(contextPrefix.length),
      });
    }
    for (const prefix of [
      'Generating: ',
      'Reviewing: ',
      'Generating ',
      'Reviewing ',
      'Repairing ',
      'Failed: ',
      'Paused: ',
    ]) {
      if (message.startsWith(prefix)) return this.t(prefix as MessageKey) + message.slice(prefix.length);
    }
    return message;
  };
}
