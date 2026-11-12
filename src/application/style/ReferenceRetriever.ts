import type { LibraryItem, ReferenceAnalysis } from '../../shared/StyleContracts';

type SearchField = { weight: number; terms: string[] };
type SearchDocument = { item: LibraryItem; analysis: ReferenceAnalysis | undefined; fields: SearchField[] };

/** Weighted lexical retrieval over analyzed metadata, followed by visual reranking. */
export class ReferenceRetriever {
  private static readonly stopWords = new Set(
    'the and for with from into that this these those only same image images card cards reference references source employer collection object objects style use using create generate must should not without avoid keep all each its are was has have will can main scene subject new simple'.split(
      ' ',
    ),
  );

  rank(
    query: string,
    category: string,
    items: LibraryItem[],
    analyses: ReadonlyMap<string, ReferenceAnalysis>,
    limit: number,
  ): LibraryItem[] {
    this.validateLimit(limit);
    const tokens = new Set(this.tokens(query));
    const documents = this.unique(items)
      .filter(
        (item) =>
          this.eligible(item) &&
          analyses.get(item.id)?.eligible !== false &&
          analyses.get(item.id)?.category !== '5',
      )
      .map((item): SearchDocument => {
        const analysis = analyses.get(item.id);
        return {
          item,
          analysis,
          // Material and subject evidence outweigh generic rendering vocabulary in long briefs.
          fields: [
            this.field(item.title, 6),
            this.field(item.tags.join(' '), 3),
            this.field(analysis?.subject ?? '', 7),
            this.field(analysis?.materials.join(' ') ?? '', 8),
            this.field(analysis?.silhouette ?? '', 2),
            this.field(analysis?.background ?? '', 1.5),
            this.field(analysis?.rendering ?? '', 0.15),
            this.field(analysis?.lighting ?? '', 0.25),
            this.field(analysis?.palette ?? '', 0.25),
          ],
        };
      });
    const frequency = new Map<string, number>();
    for (const document of documents) {
      const terms = new Set(document.fields.flatMap((field) => field.terms));
      for (const term of tokens) if (terms.has(term)) frequency.set(term, (frequency.get(term) ?? 0) + 1);
    }
    const averageLengths =
      documents[0]?.fields.map(
        (_, index) =>
          documents.reduce((sum, document) => sum + (document.fields[index]?.terms.length ?? 0), 0) /
          documents.length,
      ) ?? [];
    return documents
      .map((document) => {
        let score = (document.analysis?.category ?? document.item.category) === category ? 4 : 0;
        if (document.item.origin === 'anchor') score += 0.5;
        for (const [index, field] of document.fields.entries()) {
          const counts = new Map<string, number>();
          for (const term of field.terms) counts.set(term, (counts.get(term) ?? 0) + 1);
          for (const term of tokens) {
            const count = counts.get(term) ?? 0;
            if (!count) continue;
            const documentFrequency = frequency.get(term) ?? 0;
            const idf = Math.log(
              1 + (documents.length - documentFrequency + 0.5) / (documentFrequency + 0.5),
            );
            const average = averageLengths[index] || 1;
            const normalization = 1.2 * (0.25 + (0.75 * field.terms.length) / average);
            score += (field.weight * idf * (count * 2.2)) / (count + normalization);
          }
        }
        return { item: document.item, score };
      })
      .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
      .slice(0, limit)
      .map(({ item }) => item);
  }

  select(ranked: LibraryItem[], selectedIds: string[], limit: number): LibraryItem[] {
    this.validateLimit(limit);
    if (limit < 4) throw new Error('Reference selection requires room for four original anchors.');
    const unique = this.unique(ranked);
    const byId = new Map(unique.map((item) => [item.id, item]));
    const eligible = unique.filter((item) => this.eligible(item));
    const selected: LibraryItem[] = [];
    const usedHashes = new Set<string>();
    const add = (item: LibraryItem | undefined) => {
      if (!item || !this.eligible(item) || usedHashes.has(item.sha256) || selected.length >= limit) return;
      if (
        item.origin === 'user' &&
        selected.filter((r) => r.origin === 'user').length >= Math.floor(limit / 4)
      )
        return;
      selected.push(item);
      usedHashes.add(item.sha256);
    };
    // Fixed source anchors remain authoritative, including known category diversity.
    for (const category of ['1', '2', '3', '4'])
      add(eligible.find((item) => item.origin === 'anchor' && item.category === category));
    for (const id of selectedIds) {
      const item = byId.get(id);
      if (!item) throw new Error(`Reference selector returned an unknown ID: ${id}`);
      add(item);
    }
    for (const item of eligible) add(item);
    if (selected.filter((item) => item.origin === 'anchor').length < 4)
      throw new Error('At least four distinct original anchors are required.');
    return selected;
  }

  private eligible(item: LibraryItem): boolean {
    return item.approved && !item.tags.includes('exclude:ordinary-card-generation');
  }
  private unique(items: LibraryItem[]): LibraryItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }
  private field(value: string, weight: number): SearchField {
    return { weight, terms: this.tokens(value) };
  }
  private tokens(value: string): string[] {
    return (
      value
        .normalize('NFKC')
        .toLowerCase()
        .match(/[\p{L}\p{N}]{3,}/gu) ?? []
    ).filter((token) => !ReferenceRetriever.stopWords.has(token));
  }
  private validateLimit(limit: number): void {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new Error('Reference limit must be a positive integer.');
  }
}
