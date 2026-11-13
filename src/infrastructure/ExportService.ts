import { DeliveryReadiness } from '../domain/DeliveryReadiness';
import { DeliveryPreviewService } from './DeliveryPreviewService';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { Run } from '../shared/Contracts';
import { ImageFiles } from './ImageFiles';
import { ExecutionLogExporter } from './ExecutionLogExporter';
import { Contracts } from '../shared/Contracts';

export class ExportService {
  constructor(
    private readonly images: ImageFiles,
    private readonly delivery?: DeliveryPreviewService,
    private readonly executionLog?: ExecutionLogExporter,
  ) {}
  async export(run: Run, variantId: string, folder: string, destination: string): Promise<void> {
    const variant = run.variants.find((v) => v.id === variantId);
    if (!variant || variant.cards.length !== 10 || variant.cards.some((c) => !c.selectedAttemptId))
      throw new Error('Export requires all ten images in the variant.');
    if (!DeliveryReadiness.accepts(run, variant))
      throw new Error('Production export requires passed card and set reviews.');
    const sheet = await this.images.sheet(folder, variant, variant.sourceEvidence?.cleanSets?.[0]?.layout);
    if (run.reviewProtocol === 'set-v3' && path.basename(sheet) !== variant.reviewSheet)
      throw new Error('Export sheet no longer matches the reviewed image bytes.');
    const zip = new AdmZip();
    for (const [index, card] of variant.cards.entries()) {
      const attempt = this.images.selected(card);
      if (!attempt) throw new Error('Selected attempt missing.');
      const prefix = String(index + 1).padStart(2, '0');
      zip.addFile(`cards/${prefix}.png`, await this.images.read(folder, attempt, 'preview'));
      zip.addFile(`masters/${prefix}.png`, await this.images.read(folder, attempt, 'master'));
      for (const history of card.attempts)
        zip.addFile(
          `history/${card.id}/${history.id}.png`,
          await this.images.read(folder, history, 'preview'),
        );
    }
    zip.addFile('contact-sheet.png', await fs.readFile(sheet));
    if (this.delivery) {
      const previews = await this.delivery.create(run, variantId, folder);
      for (const preview of previews)
        zip.addFile(`delivery/${preview.id}.png`, await fs.readFile(path.join(folder, preview.filename)));
      zip.addFile(
        'delivery/manifest.json',
        Buffer.from(
          JSON.stringify(
            {
              variantId,
              selectedAttemptIds: variant.cards.map((card) => card.selectedAttemptId),
              previews,
              note: 'Original template captions and game counters are retained.',
            },
            null,
            2,
          ),
        ),
      );
    }
    zip.addFile('run.json', Buffer.from(JSON.stringify(run, null, 2)));
    zip.addFile('selection.json', Buffer.from(JSON.stringify({ variantId, variant }, null, 2)));
    zip.addFile('style-profile.json', await fs.readFile(path.join(folder, 'style-profile.json')));
    if (this.executionLog) {
      const profile = Contracts.profile.parse(
        JSON.parse(await fs.readFile(path.join(folder, 'style-profile.json'), 'utf8')),
      );
      zip.addFile('execution-log.md', Buffer.from(await this.executionLog.render(run, profile)));
    }
    const cardReports = variant.cards.map((card, index) => {
      const selected = this.images.selected(card),
        review = selected?.review;
      const state = review
        ? review.passed
          ? 'Automated checks passed'
          : 'NEEDS ART REVIEW'
        : 'NOT REVIEWED';
      return `### ${index + 1}. ${card.subject}\n\nCategory: ${card.category}. ${card.role}\n\nStatus: ${state}. Locked: ${card.locked}. Selected attempt: ${card.selectedAttemptId}. Versions: ${card.attempts.length}.\n\n${review ? `Style: ${review.style}/5; readability: ${review.readability}/5; subject: ${review.subjectMatch}/5; category match: ${review.categoryMatch}.` : ''}\n\n${review?.findings.join('\n') || selected?.reviewError || 'No additional findings.'}`;
    });
    const report = `# ${variant.title}\n\n${variant.concept}\n\nTheme: ${run.brief.theme}\nWishes: ${run.brief.wishes}\nProvider: ${run.provider}\nImage model: ${run.imageModel}\nPlanning/review model: ${run.textModel}\nImage requests (whole run): ${run.imageCalls}\n\n## Set review\n\nStatus: ${variant.review ? (variant.review.passed ? 'Automated checks passed' : 'NEEDS ART REVIEW') : 'NOT REVIEWED'}. Coherence: ${variant.review?.coherence ?? 'unavailable'}/5.\n\n${variant.review?.findings.join('\n') || variant.reviewError || 'No additional set findings.'}\n\n## Cards\n\n${cardReports.join('\n\n')}\n\nModel review is advisory; final production approval requires visual inspection. Source art is employer-supplied reference material and is not included in this archive. Codex quality settings are prompt preferences, not guaranteed rendering parameters.\n`;
    zip.addFile('report.md', Buffer.from(report));
    await fs.writeFile(destination, zip.toBuffer());
  }
}
