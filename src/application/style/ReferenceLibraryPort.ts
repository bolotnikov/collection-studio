import type { LibraryItem, ReferenceEdit, ReferenceAnalysis } from '../../shared/StyleContracts';

export interface ReferenceLibraryPort {
  get(id: string): LibraryItem;
  editMetadata(input: ReferenceEdit): Promise<void>;
  importImage(file: string): Promise<LibraryItem>;
}
export interface ReferenceAnalysisPort {
  analyzeReference(item: LibraryItem): Promise<ReferenceAnalysis>;
}
