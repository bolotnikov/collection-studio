import { StyleContracts, type ReferenceEdit } from '../../shared/StyleContracts';
import type { ReferenceAnalysisPort, ReferenceLibraryPort } from './ReferenceLibraryPort';

/** Curated metadata is authoritative; automatic analysis proposes an editable value. */
export class ReferenceLibraryService {
  constructor(
    private readonly library: ReferenceLibraryPort,
    private readonly analyzer: () => ReferenceAnalysisPort,
  ) {}
  async edit(input: ReferenceEdit): Promise<void> {
    await this.library.editMetadata(StyleContracts.referenceEdit.parse(input));
  }
  async analyze(id: string) {
    const item = this.library.get(id);
    const result = await this.analyzer().analyzeReference(item);
    if (!result.eligible || result.category === '5')
      throw new Error(result.exclusionReason || 'This image is unsuitable for ordinary card references.');
    return StyleContracts.referenceMetadata.parse({
      category: result.category,
      description: result.subject,
    });
  }
  async import(file: string) {
    return this.library.importImage(file);
  }
}
