import { ProductionRules } from '../domain/ProductionRules';
import { SetRules } from '../domain/SetRules';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { Run } from '../shared/Contracts';
import { ImageFiles } from './ImageFiles';

export class ExportService {
  constructor(private readonly images: ImageFiles) {}
  async export(run: Run, variantId: string, folder: string, destination: string): Promise<void> {
    const variant = run.variants.find((v) => v.id === variantId);
    if (!variant || variant.cards.length !== 10 || variant.cards.some((c) => !c.selectedAttemptId))
      throw new Error('Export requires all ten images in the variant.');
    if (
      (run.workflowVersion &&
        !ProductionRules.readyForExport(
          variant,
          run.productionPolicy?.styleThreshold ?? 4,
          run.planningPolicy,
        )) ||
      !SetRules.acceptsSetReview(
        variant.review,
        run.productionPolicy?.styleThreshold ?? 4,
        run.reviewProtocol === 'set-v2',
      ) ||
      !SetRules.reviewMatchesSelection(variant, run.reviewProtocol === 'set-v2') ||
      variant.reviewError ||
      variant.cards.some((card) => {
        const attempt = this.images.selected(card);
        return (
          !SetRules.acceptsReview(attempt?.review, run.productionPolicy?.styleThreshold ?? 4) ||
          Boolean(attempt?.reviewError)
        );
      })
    )
      throw new Error('Production export requires passed card and set reviews.');
    const zip = new AdmZip();
    for (const [index, card] of variant.cards.entries()) {
      const attempt = this.images.selected(card);
      if (!attempt) throw new Error('Selected attempt missing.');
      const prefix = String(index + 1).padStart(2, '0');
      zip.addFile(`cards/${prefix}.png`, await fs.readFile(path.join(folder, attempt.preview)));
      zip.addFile(`masters/${prefix}.png`, await fs.readFile(path.join(folder, attempt.master)));
      for (const history of card.attempts)
        zip.addFile(
          `history/${card.id}/${history.id}.png`,
          await fs.readFile(path.join(folder, history.preview)),
        );
    }
    zip.addFile('contact-sheet.png', await fs.readFile(await this.images.sheet(folder, variant)));
    zip.addFile('run.json', Buffer.from(JSON.stringify(run, null, 2)));
    zip.addFile('selection.json', Buffer.from(JSON.stringify({ variantId, variant }, null, 2)));
    zip.addFile('style-profile.json', await fs.readFile(path.join(folder, 'style-profile.json')));
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
