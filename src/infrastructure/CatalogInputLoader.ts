import { CatalogCurationContracts } from '../shared/CatalogCurationContracts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { KnowledgeContracts } from '../shared/KnowledgeContracts';
import { StyleContracts } from '../shared/StyleContracts';
import { VisualCatalogContracts } from '../shared/VisualCatalogContracts';
import type { CatalogInput } from '../application/knowledge/CatalogAnalysisPort';
import { CatalogClassificationRules } from '../shared/CatalogClassificationRules';

/** Read-only inventory and explicit lineage, shared by release CLI and desktop sync. */
export class CatalogInputLoader {
  constructor(private readonly resources: string) {}
  async load(
    model: string,
    prompts: Readonly<Record<string, string>>,
    rules: unknown = CatalogInputLoader.rules(),
  ): Promise<CatalogInput> {
    const knowledge = KnowledgeContracts.corpus.parse(
      JSON.parse(await fs.readFile(path.join(this.resources, 'knowledge/catalog.json'), 'utf8')),
    );
    const library = StyleContracts.libraryItem
      .array()
      .parse(JSON.parse(await fs.readFile(path.join(this.resources, 'library.json'), 'utf8')));
    const additional = z
      .object({
        version: z.literal(1),
        method: z.literal('developer-visual-correspondence-v1'),
        sets: z.array(VisualCatalogContracts.set.pick({ id: true, sourceSha256: true, cards: true })),
      })
      .parse(
        JSON.parse(await fs.readFile(path.join(this.resources, 'additional-set-membership.json'), 'utf8')),
      );
    const memberships = [
      ...(knowledge.cleanSets ?? []).map((set) => ({
        id: set.sourceImageId,
        cards: set.cards.map(({ slot, id, sha256 }) => ({ slot, id, sha256 })),
      })),
      ...additional.sets,
    ];
    for (const set of additional.sets)
      if (!knowledge.images.some((source) => source.id === set.id && source.sha256 === set.sourceSha256))
        throw new Error('Additional set source identity mismatch.');
    for (const decision of CatalogCurationContracts.values.decisions) {
      const source = knowledge.images.find(
        (image) => image.sha256 === decision.evidenceSourceSha256 && image.role === 'collection-example',
      );
      const member = memberships.find((set) => set.id === source?.id)?.cards[decision.slot - 1];
      if (!source || member?.id !== decision.id || member.sha256 !== decision.sha256)
        throw new Error('Catalog curation evidence no longer matches source membership.');
    }
    const dependencyHash = createHash('sha256')
      .update(
        JSON.stringify({
          model,
          prompts,
          knowledge,
          library,
          memberships,
          rules,
          decisions: CatalogCurationContracts.values.decisions,
        }),
      )
      .digest('hex');
    return {
      model,
      dependencyHash,
      knowledge,
      library,
      memberships,
      rules,
      decisions: CatalogCurationContracts.values.decisions,
    };
  }
  static rules() {
    return CatalogClassificationRules.snapshot();
  }
}
