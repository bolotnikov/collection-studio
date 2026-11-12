import { z } from 'zod';
import defaults from '../../resources/set-sheet-layout.json';

export class SetSheetLayout {
  static readonly schema = z.object({
    columns: z.literal(5),
    rows: z.literal(2),
    cardWidth: z.number().int().min(215).max(860),
    cardHeight: z.number().int().min(240).max(960),
    gap: z.number().int().min(0).max(64),
    margin: z.number().int().min(0).max(64),
    background: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  });
  static dimensions(layout: SheetLayout): { width: number; height: number } {
    return {
      width: layout.columns * layout.cardWidth + (layout.columns - 1) * layout.gap + 2 * layout.margin,
      height: layout.rows * layout.cardHeight + (layout.rows - 1) * layout.gap + 2 * layout.margin,
    };
  }
  static defaults() {
    return this.schema.parse(defaults);
  }
}
export type SheetLayout = z.infer<typeof SetSheetLayout.schema>;
