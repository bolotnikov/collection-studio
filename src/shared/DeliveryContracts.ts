import { z } from 'zod';
import config from '../../resources/delivery-layout.json';

export class DeliveryContracts {
  private static readonly rectangle = z.object({
    left: z.number().int().nonnegative(),
    top: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  });
  static readonly layout = z
    .object({
      version: z.literal(1),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      viewport: DeliveryContracts.rectangle,
      slots: z.array(DeliveryContracts.rectangle).length(10),
      templates: z
        .array(
          z.object({
            id: z.enum(['orange', 'pink', 'violet', 'blue']),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          }),
        )
        .length(4),
    })
    .superRefine((value, context) => {
      for (const rectangle of [value.viewport, ...value.slots])
        if (rectangle.left + rectangle.width > value.width || rectangle.top + rectangle.height > value.height)
          context.addIssue({ code: 'custom', message: 'Delivery rectangle exceeds the template canvas.' });
      if (new Set(value.templates.map((item) => item.id)).size !== 4)
        context.addIssue({ code: 'custom', message: 'Delivery template IDs must be unique.' });
    });
  static readonly preview = z.object({
    id: z.enum(['orange', 'pink', 'violet', 'blue']),
    filename: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    templateSha256: z.string().regex(/^[a-f0-9]{64}$/),
  });
  static defaults() {
    return this.layout.parse(config);
  }
}
export type DeliveryPreview = z.infer<typeof DeliveryContracts.preview>;
export type DeliveryLayout = z.infer<typeof DeliveryContracts.layout>;
