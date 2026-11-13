import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { Run } from '../../shared/Contracts';
import type { MessageKey } from '../../shared/i18n/Localization';
import { useLocalization } from './i18n/LocalizationContext';
import { RunProgress } from './viewmodels/RunProgress';
import { Assets } from './Assets';

export function RunProgressView({ run }: { run: Run }) {
  const { t, text } = useLocalization();
  const progress = RunProgress.snapshot(run);
  const activityGroups = RunProgress.activityGroups(run);
  const planningActive = Assets.active(run) && run.variants.length === 0;
  const catalogueFlow =
    Boolean(run.compositionDraft?.slotPlans?.length) ||
    run.variants.some((variant) => variant.planValidation === 'deterministic-slots-first-v1');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!planningActive) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [planningActive]);
  const started = [...run.events].reverse().find((event) => event.message === run.stage)?.at ?? run.updatedAt;
  const elapsed = Math.max(0, Math.floor((now - Date.parse(started)) / 1000)) || 0;
  const duration = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const labels: Record<NonNullable<Run['activities']>[number]['kind'], [MessageKey, MessageKey]> = {
    references: [
      'Selecting card references',
      catalogueFlow
        ? 'Selecting visual examples for this card from the prepared library.'
        : 'Finding category and pattern matches and checking the selected reference images.',
    ],
    generation: ['Generating images', 'Waiting for images from the model.'],
    'card-review': [
      'Verifying the card',
      'The image is ready. Checking the subject, background, pattern and placement.',
    ],
    'set-references': [
      'Preparing set comparison',
      catalogueFlow
        ? 'Selecting clean reference sheets for whole-set comparison from the prepared catalogue.'
        : 'Loading the accepted source prototype and complementary reference sets.',
    ],
    assembly: ['Assembling the set', 'Building the ten-card sheet from the selected image versions.'],
    'set-review': [
      'Verifying the whole set',
      'Checking the visual rhythm, backgrounds and style of all ten cards together.',
    ],
  };
  const legacyPlanning: Record<string, MessageKey> = {
    ...(run.stage === 'Choosing source sets'
      ? {
          'Choosing source sets':
            'Finding relevant source collections without reanalyzing the library.' as MessageKey,
        }
      : {
          'Loading aggregate composition statistics':
            'Reading the joint category and pattern distribution across the full prepared source corpus.' as MessageKey,
        }),
    'Choosing the set concept and subjects':
      'Proposing a connected story, ten subjects and compatible reserve subjects.',
    ...(run.stage === 'Matching subjects to source composition slots'
      ? {
          'Matching subjects to source composition slots':
            'Selecting an existing composition pattern and assigning compatible subjects to its slots.' as MessageKey,
        }
      : {
          'Assigning subjects to aggregate composition slots':
            'Fitting ten joint slot patterns to the source corpus and assigning compatible subjects.' as MessageKey,
        }),
    'Describing the assigned card slots':
      'Writing concrete descriptions inside the locked categories and visual patterns.',
    'Reviewing the set plan': 'Checking the complete plan before spending any image-generation calls.',
  };
  const planning: Record<string, MessageKey> = catalogueFlow
    ? {
        'Loading aggregate composition statistics':
          'Reading the joint category and pattern distribution across the full prepared source corpus.',
        'Ten composition slots and reference candidates are ready':
          'The slot constraints and matching reference candidates are fixed before model design.',
        'Designing the concept and subjects for the fixed slots':
          'Waiting for the planning model to propose one concept and ten subjects. Image generation starts next.',
        'Set plans validated': 'The slot assignments and set structure have been validated by code.',
      }
    : legacyPlanning;
  const planningDescription = planning[run.stage];
  const planningIndex = Object.keys(planning).indexOf(run.stage);
  return (
    <section className="run-progress-detail" aria-live="polite">
      <div className="collection-progress-heading">
        <div>
          <span className="progress-label">{t('Overall progress')}</span>
          <h2>
            {t(
              run.status === 'completed'
                ? 'Collection ready'
                : run.status === 'paused'
                  ? 'Collection paused'
                  : run.status === 'failed'
                    ? 'Collection interrupted'
                    : 'Creating the collection',
            )}
          </h2>
        </div>
        {planningActive ? (
          <span className="progress-preparing">{t('Preparing the set plan')}</span>
        ) : (
          <strong className="progress-percent">
            {progress.percent}
            <span>%</span>
          </strong>
        )}
      </div>
      <progress
        value={planningActive ? undefined : progress.completed}
        max={progress.total}
        aria-label={t('Overall progress')}
      />
      {!planningActive && (
        <dl className="progress-totals">
          <div>
            <dt>{t('Images ready')}</dt>
            <dd>
              {progress.generated}
              <span> / {progress.cards}</span>
            </dd>
          </div>
          {run.repairPolicy?.maxCardRegenerations !== 0 && (
            <div>
              <dt>{t('Checks processed')}</dt>
              <dd>
                {progress.reviewed}
                <span> / {progress.cards}</span>
              </dd>
            </div>
          )}
        </dl>
      )}
      {Assets.active(run) ? (
        <div className="progress-current">
          <span className="progress-label">{t('Currently working on')}</span>
          <div className="run-activity-groups">
            {activityGroups.length ? (
              activityGroups.map((group) => (
                <article className="run-activity-group" key={group.kind}>
                  <div className="progress-stage-heading">
                    <LoaderCircle size={16} className="spin" aria-hidden="true" />
                    <h3>{t(labels[group.kind][0])}</h3>
                  </div>
                  <p className="progress-stage-description">{t(labels[group.kind][1])}</p>
                  <ul className="progress-subjects">
                    {group.items.map((activity) => (
                      <li key={activity.key}>
                        <span
                          className="progress-subject-index"
                          aria-label={t('Card {number}', { number: activity.index })}
                        >
                          {String(activity.index).padStart(2, '0')}
                        </span>
                        <strong>{activity.subject}</strong>
                        {activity.attempt && activity.attempt > 1 && (
                          <span className="progress-attempt">
                            {t('Attempt {number}', { number: activity.attempt })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              ))
            ) : (
              <article className="run-activity-group">
                <div className="progress-stage-heading">
                  <LoaderCircle size={16} className="spin" aria-hidden="true" />
                  <h3>{text(run.stage)}</h3>
                </div>
                {planningDescription && (
                  <p className="progress-stage-description">{t(planningDescription)}</p>
                )}
              </article>
            )}
          </div>
          {planningActive && (
            <div className="progress-stage-meta">
              {planningIndex >= 0 && (
                <span>
                  {t('Planning step {step}/{total}', {
                    step: planningIndex + 1,
                    total: Object.keys(planning).length,
                  })}
                </span>
              )}
              <span>{t('Current step duration: {duration}', { duration })}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="progress-outcome">
          {run.status === 'completed'
            ? t('All images are ready. Open a card to view its slot or make a revision.')
            : text(run.stage)}
        </p>
      )}
    </section>
  );
}
