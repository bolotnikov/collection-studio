import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { Contracts, type Run } from '../src/shared/Contracts';
import { Localization } from '../src/shared/i18n/Localization';
import { RunProgress } from '../src/renderer/src/viewmodels/RunProgress';
import { RunProgressView } from '../src/renderer/src/RunProgressView';
import { SlotRequirements } from '../src/renderer/src/SlotRequirements';
import { CompositionFixture } from './fixtures/CompositionFixture';

vi.mock('../src/renderer/src/i18n/LocalizationContext', () => ({
  useLocalization: () => new Localization('ru'),
}));

class ProgressFixture {
  static run(): Run {
    return Contracts.run.parse({
      id: '00000000-0000-4000-8000-000000000001',
      createdAt: '',
      updatedAt: '',
      brief: {
        theme: 'Fixture',
        wishes: '',
        variants: 1,
        quality: 'low',
        maxImageCalls: 30,
        autoRepair: true,
      },
      status: 'generating',
      stage: 'Generating',
      imageCalls: 0,
      variants: [CompositionFixture.create().variant],
      imageModel: 'fixture',
      textModel: 'fixture',
      events: [],
      selectedVariantId: null,
    });
  }
  static approveCards(run: Run) {
    for (const variant of run.variants)
      for (const card of variant.cards) {
        const index = variant.cards.indexOf(card);
        const target = variant.artContract?.composition?.targets[index];
        card.selectedAttemptId = card.id;
        card.attempts = [
          Contracts.attempt.parse({
            id: card.id,
            master: 'fixture.png',
            preview: 'fixture.png',
            prompt: '',
            model: 'fixture',
            createdAt: '',
            elapsedMs: 0,
            requestId: null,
            usage: null,
            reviewError: null,
            review: {
              passed: true,
              style: 5,
              readability: 5,
              subjectMatch: 5,
              categoryMatch: true,
              findings: [],
              correction: '',
              compositionMatch: true,
              observedComposition: {
                contextDensity: 'minimal',
                camera: 'three-quarter',
                subjectScale: 'large',
                ...target?.required,
              },
            },
          }),
        ];
      }
  }
}

it('counts accepted milestones, never request time, and reserves completion for set acceptance', () => {
  const run = ProgressFixture.run();
  expect(RunProgress.snapshot({ ...run, variants: [] }).percent).toBe(0);
  expect(RunProgress.snapshot(run).completed).toBe(1);
  run.imageCalls = 30;
  expect(RunProgress.snapshot(run).completed).toBe(1);
  ProgressFixture.approveCards(run);
  expect(RunProgress.snapshot(run)).toMatchObject({ verified: 10, completed: 21, total: 22, percent: 95 });
  const variant = run.variants[0];
  if (!variant) throw new Error('Fixture');
  variant.review = { passed: true, coherence: 5, findings: [], outlierCardIds: [] };
  expect(RunProgress.snapshot(run).percent).toBe(100);
  const card = variant.cards[0];
  if (!card) throw new Error('Fixture');
  const attempt = card.attempts[0];
  if (!attempt?.review) throw new Error('Fixture');
  attempt.review.compositionMatch = false;
  attempt.review.passed = false;
  expect(RunProgress.snapshot(run)).toMatchObject({ verified: 9, completed: 20, percent: 90 });
  card.attempts.push({ ...attempt, id: 'retry', review: null });
  card.selectedAttemptId = 'retry';
  expect(RunProgress.snapshot(run).completed).toBe(20);
  run.brief.variants = 2;
  expect(RunProgress.snapshot(run)).toMatchObject({ total: 44, cards: 20, percent: 45 });
});

it('shows both current operations and retries, but hides stale activity on pause', () => {
  const run = ProgressFixture.run();
  run.activities = [
    { key: 'one', kind: 'generation', subject: 'Projector', index: 2, total: 10, attempt: 2 },
    { key: 'two', kind: 'card-review', subject: 'Popcorn', index: 3, total: 10 },
  ];
  const html = renderToStaticMarkup(createElement(RunProgressView, { run }));
  expect(html).toContain('<progress');
  expect(html).toContain('Projector');
  expect(html).toContain('Popcorn');
  expect(html).toContain(new Localization('ru').t('Attempt {number}', { number: 2 }));
  run.status = 'paused';
  run.stage = 'Paused. Finished cards are saved.';
  expect(renderToStaticMarkup(createElement(RunProgressView, { run }))).not.toContain('Projector');
});

it('groups parallel cards under one stage explanation and keeps card numbers in grid order', () => {
  const run = ProgressFixture.run();
  run.activities = [
    { key: 'second', kind: 'generation', subject: 'Cowboy belt', index: 2, total: 10 },
    { key: 'first', kind: 'generation', subject: 'Mail stagecoach', index: 1, total: 10 },
  ];
  const html = renderToStaticMarkup(createElement(RunProgressView, { run }));
  const t = new Localization('ru').t;
  expect(html.split(t('Waiting for images from the model.'))).toHaveLength(2);
  expect(html.split(t('Generating images'))).toHaveLength(2);
  expect(html.indexOf('Mail stagecoach')).toBeLessThan(html.indexOf('Cowboy belt'));
  expect(html).toContain(t('Card {number}', { number: 1 }));
  expect(html).toContain(t('Card {number}', { number: 2 }));
  expect(html).toContain(t('Overall progress'));
  expect(html).toContain(t('Currently working on'));
});

it('keeps planned and observed patterns distinct and exposes discrepancies', () => {
  const target = CompositionFixture.create().variant.artContract?.composition?.targets[0];
  if (!target) throw new Error('Fixture');
  const html = renderToStaticMarkup(
    createElement(SlotRequirements, {
      target,
      observed: { ...target.required, pattern: 'none' },
    }),
  );
  const t = new Localization('ru').t;
  expect(html).toContain(t('Planned slot tags'));
  expect(html).toContain(t('Detected in selected image'));
  expect(html).toContain(t('Required tags differ'));
});

it('shows an indeterminate planning phase and elapsed time instead of a frozen zero percent', () => {
  const run = ProgressFixture.run();
  run.variants = [];
  run.status = 'planning';
  run.stage = 'Choosing the set concept and subjects';
  run.events = [{ at: new Date(Date.now() - 65000).toISOString(), message: run.stage }];
  const html = renderToStaticMarkup(createElement(RunProgressView, { run }));
  expect(html).toContain(new Localization('ru').t('Preparing the set plan'));
  expect(html).toContain('1:05');
  expect(html).not.toContain('0%');
  expect(html).not.toContain('value="0"');
});

it('finishes progress at 100 percent with warnings without presenting rejected checks as passed', () => {
  const run = ProgressFixture.run();
  run.planningPolicy = {
    qualityMode: 'best-effort-v1',
    maxPlanRepairs: 1,
    minimumPlanScore: 4,
    productionConcurrency: 2,
  };
  ProgressFixture.approveCards(run);
  const variant = run.variants[0];
  if (!variant) throw new Error('Missing fixture');
  for (const card of variant.cards) {
    const attempt = card.attempts[0];
    if (!attempt?.review) throw new Error('Missing fixture review');
    attempt.review.passed = false;
    attempt.review.compositionMatch = false;
  }
  variant.review = {
    passed: false,
    coherence: 3,
    findings: ['Unresolved palette mismatch'],
    outlierCardIds: [],
  };
  run.status = 'completed';
  run.qualityWarnings = ['Unresolved palette mismatch'];
  expect(RunProgress.snapshot(run)).toMatchObject({ percent: 100, verified: 0 });
});
