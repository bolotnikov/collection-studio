import { VisualPatterns } from '../../domain/VisualPatterns';
import type { VisualFacets } from '../../shared/VisualCatalogContracts';
import { useLocalization } from './i18n/LocalizationContext';
export function PatternChips({ facets }: { facets: Partial<VisualFacets> }) {
  const { text } = useLocalization();
  return (
    <div className="pattern-chips">
      {VisualPatterns.tags(facets).map((tag) => (
        <span key={tag}>{text(VisualPatterns.label(tag))}</span>
      ))}
    </div>
  );
}
