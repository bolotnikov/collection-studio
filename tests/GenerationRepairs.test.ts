import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { SettingsStore } from '../src/main/SettingsStore';
import { Contracts } from '../src/shared/Contracts';
import { CompositionRepairRules } from '../src/domain/CompositionRepairRules';
import { CompositionFixture } from './fixtures/CompositionFixture';
import { GenerationRepairContracts } from '../src/shared/GenerationRepairContracts';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});

it('requires a repair for an observed silhouette conflict even without a model correction, and combines changes to one card', () => {
  const { variant } = CompositionFixture.create();
  const observation = GenerationRepairContracts.setObservation.parse({
    findings: ['Сейф и тайник различаются материалами, но имеют близкие силуэты.'],
    corrections: [],
    silhouetteConflicts: [
      {
        cardId: 'compartment',
        similarToCardId: 'safe',
        evidence: 'Открытые прямоугольные ниши с боковой створкой.',
        instruction: 'Измени форму деревянного тайника.',
      },
    ],
  });
  const corrections = CompositionRepairRules.setCorrections(observation, variant);
  expect(corrections).toMatchObject([{ cardId: 'compartment', kind: 'duplicate-silhouette' }]);
  expect(observation.corrections).toEqual([]);
  observation.corrections.push({
    cardId: 'compartment',
    kind: 'adjacent-color',
    evidence: 'Соседние фоны совпали.',
    instruction: 'Восстанови назначенный коричневый фон.',
  });
  const combined = CompositionRepairRules.setCorrections(observation, variant);
  expect(combined).toHaveLength(1);
  expect(combined[0]?.instruction).toContain('Измени форму деревянного тайника.');
  expect(combined[0]?.instruction).toContain('Восстанови назначенный коричневый фон.');
  const legacy = { findings: ['Historical note'], corrections: [] };
  expect(GenerationRepairContracts.setObservation.parse(legacy)).toEqual(legacy);
  expect(CompositionRepairRules.setCorrections(legacy, variant)).toEqual([]);
});
it('defaults to Terra and disabled verification at both stages, and migrates legacy settings without reading credentials', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-settings-'));
  folders.push(root);
  const defaults = new SettingsStore(root);
  await defaults.init();
  expect(defaults.settings).toMatchObject({
    codexModel: 'gpt-6.1-terra',
    maxCardRegenerations: 0,
    maxSetRegenerationRounds: 0,
  });
  await fs.writeFile(
    path.join(root, 'settings.json'),
    JSON.stringify({
      provider: 'openai',
      imageModel: 'old-image',
      textModel: 'old-text',
      codexModel: 'gpt-6.1-sol',
    }),
  );
  await fs.writeFile(path.join(root, 'credential.bin'), 'untouched legacy credential');
  const migrated = new SettingsStore(root);
  await migrated.init();
  expect(migrated.settings.codexModel).toBe('gpt-6.1-sol');
  await migrated.save({ ...migrated.settings, maxCardRegenerations: 0, maxSetRegenerationRounds: 3 });
  const saved = JSON.parse(await fs.readFile(path.join(root, 'settings.json'), 'utf8'));
  expect(saved).toEqual({
    codexPath: '',
    codexModel: 'gpt-6.1-sol',
    maxCardRegenerations: 0,
    maxSetRegenerationRounds: 3,
  });
  expect(await fs.readFile(path.join(root, 'credential.bin'), 'utf8')).toBe('untouched legacy credential');
  const reopened = new SettingsStore(root);
  await reopened.init();
  expect(reopened.settings).toEqual(saved);
  for (const invalid of [-1, 1.5, NaN, Infinity])
    expect(Contracts.settings.safeParse({ maxCardRegenerations: invalid }).success).toBe(false);
});

it.each([
  'wrong-subject',
  'clipped-silhouette',
  'forbidden-character',
  'wrong-category',
  'wrong-background',
] as const)('requires explicit consistent evidence for %s and ignores description-only drift', (kind) => {
  const { variant } = CompositionFixture.create();
  const card = variant.cards[0];
  const target = variant.artContract?.composition?.targets[0];
  if (!card || !target) throw new Error('Missing fixture');
  target.appearance = { backgroundColor: 'blue', subjectScale: 'large' };
  const attempt = Contracts.attempt.parse({
    id: 'candidate',
    master: 'master.png',
    preview: 'preview.png',
    prompt: 'fixture',
    model: 'fixture',
    createdAt: 'fixture',
    elapsedMs: 0,
    requestId: null,
    usage: null,
    review: null,
    reviewError: null,
    compositionCheck: {
      subjectPresent: kind !== 'wrong-subject',
      completeSilhouette: kind !== 'clipped-silhouette',
      compositionDescriptionMatch: false,
      observedCategory: kind === 'wrong-category' ? '2' : card.category,
      observedComposition: {
        ...target.required,
        contextDensity: 'minimal',
        camera: 'front',
        subjectScale: 'large',
        characterCount: kind === 'forbidden-character' ? 1 : 0,
        subjectPosition: 'center',
        backgroundColor: kind === 'wrong-background' ? 'pink' : 'blue',
      },
      confirmedViolations: [{ kind, evidence: 'Конкретное видимое нарушение' }],
      findings: ['Описание отличается'],
      matches: false,
    },
  });
  expect(CompositionRepairRules.violations(variant, card, attempt)).toHaveLength(1);
  const check = attempt.compositionCheck;
  if (!check) throw new Error('Missing check');
  check.confirmedViolations = [];
  expect(CompositionRepairRules.violations(variant, card, attempt)).toEqual([]);
  check.confirmedViolations = [{ kind, evidence: 'Contradicts observation' }];
  check.subjectPresent = true;
  check.completeSilhouette = true;
  check.observedCategory = card.category;
  check.observedComposition = { ...check.observedComposition, characterCount: 0, backgroundColor: 'blue' };
  expect(CompositionRepairRules.violations(variant, card, attempt)).toEqual([]);
});
