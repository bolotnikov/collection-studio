import groups from '../../resources/material-aliases.json';

/** Matches only literal catalogue material terms or configured bilingual equivalents. */
export class MaterialVocabulary {
  static matches(requested: string, observed: string[]): boolean {
    const request = requested.normalize('NFKC').toLowerCase();
    const sources = observed.map((value) => value.normalize('NFKC').toLowerCase());
    const contains = (value: string, alias: string) =>
      (value.match(/[\p{L}\p{N}]+/gu) ?? []).some((word) => word.startsWith(alias));
    const aliases = Object.values(groups).filter((aliases) =>
      aliases.some((alias) => contains(request, alias)),
    );
    return sources.some(
      (source) =>
        source === request || aliases.some((group) => group.some((alias) => contains(source, alias))),
    );
  }
}
