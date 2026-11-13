import type { Profile, Run } from '../shared/Contracts';
import { ExecutionJournal } from './ExecutionJournal';

/** Exports stored evidence only. No model requests are made while exporting. */
export class ExecutionLogExporter {
  constructor(private readonly journal: ExecutionJournal) {}
  private block(value: unknown): string {
    const content = JSON.stringify(ExecutionJournal.sanitize(value), null, 2) ?? 'null';
    const runs = content.match(/`+/g) ?? [];
    const fence = '`'.repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
    return `${fence}json\n${content}\n${fence}`;
  }
  async render(run: Run, profile: Profile): Promise<string> {
    const entries = await this.journal.entries(run.id);
    const sections = [
      '# Collection Studio — execution log',
      `Run: ${run.id}\n\nExported: ${new Date().toISOString()}\n\nStatus: ${run.status}\n\nProvider: ${run.provider}\n\nText model: ${run.textModel}\n\nImage model: ${run.imageModel}\n\nImage requests: ${run.imageCalls}`,
      '## Reading this log',
      'This document contains observable requests, responses, tool activity and persisted decisions. `request.started` and `request.completed` share a call ID; failures include the provider error. `state.changed` records deterministic workflow decisions as JSON paths with before/after values. Reference evidence contains selection reasons, required tags, candidate scores and numbered input roles. Scores and findings are recorded model judgments.',
      entries.length
        ? `Detailed recording begins at ${entries[0]?.at}. Earlier operations, if any, are represented only by the saved evidence below. A started request without a completion has an unknown outcome (for example after interruption). Cached context has saved evidence but no new provider request.`
        : 'This run predates detailed execution recording. Its saved plans, prompts, reviews and reference evidence are included below. Original provider requests/responses that were not stored cannot be reconstructed.',
      'Image bytes, credentials and private model reasoning are excluded. Binary attachment metadata/hashes identify inputs; the image files remain in the project. This export does not make any LLM calls.',
      '## Request and policy',
      this.block({
        brief: run.brief,
        productionPolicy: run.productionPolicy,
        planningPolicy: run.planningPolicy,
        workflowVersion: run.workflowVersion,
        reviewProtocol: run.reviewProtocol,
      }),
      '## Stage timeline',
      ...run.events.map((event) => `- ${event.at} — ${event.message}`),
      '## Chronological execution journal',
      ...entries.flatMap((entry, index) => [
        `### ${index + 1}. ${entry.executor} · ${entry.action}`,
        entry.at,
        this.block(entry.data),
      ]),
      '## Planning and composition decisions',
      this.block({
        compositionDraft: run.compositionDraft,
        planHistory: run.planHistory,
        selectedVariantId: run.selectedVariantId,
      }),
    ];
    for (const [index, variant] of run.variants.entries()) {
      sections.push(
        `## Set ${index + 1}`,
        this.block({
          id: variant.id,
          title: variant.title,
          concept: variant.concept,
          artContract: variant.artContract,
          planReview: variant.planReview,
          planSignature: variant.planSignature,
          pilotAttemptId: variant.pilotAttemptId,
          sourceEvidence: variant.sourceEvidence,
        }),
      );
      for (const [slot, card] of variant.cards.entries()) {
        sections.push(
          `### Slot ${slot + 1} — category ${card.category}`,
          this.block({ ...card, attempts: undefined }),
        );
        for (const [attemptIndex, attempt] of card.attempts.entries())
          sections.push(`#### Attempt ${attemptIndex + 1}`, this.block(attempt));
      }
      sections.push(
        '### Whole-set verification',
        this.block({
          review: variant.review,
          reviewError: variant.reviewError,
          reviewHistory: variant.reviewHistory,
          reviewSheet: variant.reviewSheet,
        }),
      );
    }
    sections.push('## Configuration and knowledge snapshot', this.block(profile));
    return ExecutionJournal.text(sections.join('\n\n') + '\n');
  }
}
