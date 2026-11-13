import { afterEach, expect, it, vi } from 'vitest';
import { CodexRunner } from '../src/infrastructure/CodexRunner';
import { CodexProvider } from '../src/infrastructure/CodexProvider';
import { Contracts } from '../src/shared/Contracts';
import { CompositionPlanningPrompts } from '../src/application/prompts/CompositionPlanningPrompts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('routes the initial design to Terra while composition verification remains on the review runner', async () => {
  const runner = new CodexRunner('/unused', '/unused', 'gpt-6.1-sol');
  const planner = new CodexRunner('/unused', '/unused', 'gpt-6.1-terra');
  const design = vi.spyOn(planner, 'run').mockImplementation(async (_prompt, schema) => ({
    value: schema.parse({ variants: [] }),
    folder: '',
    usage: null,
    threadId: null,
  }));
  const review = vi.spyOn(runner, 'run').mockImplementation(async (_prompt, schema) => ({
    value: schema.parse({
      subjectPresent: true,
      completeSilhouette: true,
      compositionDescriptionMatch: true,
      observedCategory: '1',
      findings: [],
      confirmedViolations: [],
      observedComposition: {
        support: 'none',
        backdrop: 'pattern',
        pattern: 'rays',
        depth: 'shallow',
        contextDensity: 'none',
        camera: 'front',
        subjectScale: 'large',
        characterCount: 0,
        backgroundColor: 'blue',
        subjectPosition: 'center',
      },
    }),
    folder: '',
    usage: null,
    threadId: null,
  }));
  vi.spyOn(CompositionPlanningPrompts, 'design').mockReturnValue('Exact design request');
  const profile = Contracts.profile.parse({
    id: 'fixture',
    name: 'Fixture',
    rules: [],
    categories: { '1': 'Float', '2': 'Plane', '3': 'Surface', '4': 'Environment' },
    references: [],
  });
  const brief = Contracts.brief.parse({
    theme: 'Fixture',
    wishes: '',
    quality: 'low',
    maxImageCalls: 10,
    autoRepair: false,
  });
  const provider = new CodexProvider(runner, undefined, planner);
  // A malformed mocked reply still proves which worker was invoked; it must fail schema decoding.
  await expect(provider.designSlotSet(brief, profile, [], [], '')).rejects.toThrow();
  await provider.verifyComposition('Inspect only the pattern', '/fixture.png', []);
  expect(design).toHaveBeenCalledOnce();
  expect(review).toHaveBeenCalledOnce();
  expect(design.mock.calls[0]?.[4]).toBe('CodexProvider.designSlotSet');
  expect(review.mock.calls[0]?.[4]).toBe('CodexProvider.verifyComposition');
});
