import { describe, expect, it } from 'vitest';
import en from '../src/shared/i18n/en.json';
import ru from '../src/shared/i18n/ru.json';
import profile from '../resources/style-profile.json';
import { Localization } from '../src/shared/i18n/Localization';

describe('Localization', () => {
  it('honors explicit choices and resolves regional device locales with an English fallback', () => {
    expect(Localization.resolve('en', ['ru-RU'])).toBe('en');
    expect(Localization.resolve('ru', ['en-US'])).toBe('ru');
    expect(Localization.resolve('system', ['ru-RU', 'en-US'])).toBe('ru');
    expect(Localization.resolve('system', ['de-DE', 'en-US'])).toBe('en');
    expect(Localization.resolve('system', [])).toBe('en');
    expect(Localization.preference('invalid')).toBe('system');
  });
  it('keeps complete catalogs with identical interpolation tokens', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    const english: Record<string, string> = en;
    for (const [key, translation] of Object.entries(ru)) {
      expect(translation.trim(), key).not.toBe('');
      expect(translation.match(/\{\w+\}/g) ?? [], key).toEqual(english[key]?.match(/\{\w+\}/g) ?? []);
    }
  });
  it('localizes interface stages while preserving canonical English generator rules', () => {
    const russian: Record<string, string> = ru;
    for (const source of [profile.name, ...profile.references.map((r) => r.title)]) {
      expect(russian[source], source).toBeDefined();
    }
    const localization = new Localization('ru');
    for (const rule of [...profile.rules, ...Object.values(profile.categories)])
      expect(localization.text(rule)).toBe(rule);
    expect(localization.text('Generating: My custom subject')).toBe('Генерация: My custom subject');
    expect(localization.text('A user-authored brief')).toBe('A user-authored brief');
    expect(localization.t('Saved: {path}', { path: '/tmp/art.png' })).toBe('Сохранено: /tmp/art.png');
  });
});
