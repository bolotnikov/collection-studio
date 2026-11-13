import { useEffect, useState } from 'react';
import type { Run } from '../../shared/Contracts';
import type { MessageKey } from '../../shared/i18n/Localization';
import { useLocalization } from './i18n/LocalizationContext';
import { RunProgress } from './viewmodels/RunProgress';
import { Assets } from './Assets';

export function RunProgressView({ run }: { run: Run }) {
  const { t, text } = useLocalization();
  const progress = RunProgress.snapshot(run);
  const planningActive = Assets.active(run) && run.variants.length === 0;
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
      'Finding category and pattern matches and checking the selected reference images.',
    ],
    generation: [
      'Generating the image',
      'Drawing the assigned subject with the fixed slot requirements and original style references.',
    ],
    'card-review': [
      'Verifying the card',
      'Comparing the actual image with its required tags, subject and reference style.',
    ],
    'set-references': [
      'Preparing set comparison',
      'Loading the accepted source prototype and complementary reference sets.',
    ],
    assembly: ['Assembling the set', 'Building the ten-card sheet from the selected image versions.'],
    'set-review': [
      'Verifying the whole set',
      'Checking the visual rhythm, backgrounds and style of all ten cards together.',
    ],
  };
  const planning: Record<string, MessageKey> = {
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
  const planningDescription = planning[run.stage];
  const planningIndex = Object.keys(planning).indexOf(run.stage);
  return (
    <section className="run-progress-detail" aria-live="polite">
      <div className="progress-heading">
        <strong>{t('Overall progress')}</strong>
        <span>
          {planningActive ? (
            t('Preparing the set plan')
          ) : (
            <>
              {progress.percent}% ·{' '}
              {t('Verified cards: {done}/{total}', { done: progress.verified, total: progress.cards })}
            </>
          )}
        </span>
      </div>
      <progress
        value={planningActive ? undefined : progress.completed}
        max={progress.total}
        aria-label={t('Overall progress')}
      />
      {planningActive && (
        <p className="muted">
          {planningIndex >= 0 && (
            <>
              {t('Planning step {step}/{total}', {
                step: planningIndex + 1,
                total: Object.keys(planning).length,
              })}{' '}
              ·{' '}
            </>
          )}
          {t('Current step duration: {duration}', { duration })}
          <br />
          {t('Waiting for the model response. Images start after the plan passes review.')}
        </p>
      )}
      {Assets.active(run) ? (
        run.activities?.length ? (
          <div className="run-activities">
            {run.activities.map((activity) => (
              <article key={activity.key}>
                <strong>
                  {t(labels[activity.kind][0])} · {activity.index}/{activity.total} · {activity.subject}
                </strong>
                <p>
                  {t(labels[activity.kind][1])}
                  {activity.attempt && activity.attempt > 1
                    ? ` ${t('Attempt {number}', { number: activity.attempt })}`
                    : ''}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="run-activities">
            <article>
              <strong>{text(run.stage)}</strong>
              {planningDescription && <p>{t(planningDescription)}</p>}
            </article>
          </div>
        )
      ) : (
        <p>{text(run.stage)}</p>
      )}
    </section>
  );
}
