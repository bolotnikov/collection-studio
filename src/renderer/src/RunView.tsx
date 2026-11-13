import { RunProgressView } from './RunProgressView';
import { SetBlueprintView } from './SetBlueprintView';
import { SlotRequirements } from './SlotRequirements';
import { SetComposition } from '../../domain/SetComposition';
import { RunDiagnostics } from './RunDiagnostics';
import { DeliveryGallery } from './DeliveryGallery';
import { useRunViewModel } from './viewmodels/useRunViewModel';
import { useLocalization } from './i18n/LocalizationContext';
import {
  Download,
  Pause,
  Play,
  Check,
  Lock,
  Unlock,
  RefreshCw,
  X,
  Image,
  CircleAlert,
  CheckCircle2,
  LoaderCircle,
  FileText,
} from 'lucide-react';
import type { Card, Profile, Run, StudioApi } from '../../shared/Contracts';
import { Assets } from './Assets';
import { ReferenceImages } from './ReferenceImages';

type Props = {
  api: StudioApi;
  run: Run;
  profile: Profile;
  busy: boolean;
  perform: (action: () => Promise<unknown>) => Promise<void>;
  onLibraryChanged: () => Promise<void>;
};
export function RunView({ run, profile: initialProfile, busy, perform, onLibraryChanged, api }: Props) {
  const { t, text, locale } = useLocalization();
  const {
    profile,
    referencesReady,
    referenceError,
    usedReferences,
    plannedReferences,
    referenceCandidates,
    comparisonReference,
    diagnosticsOpen,
    setDiagnosticsOpen,
    exportDiagnostics,
    exportExecutionLog,
    tabs,
    selectedIndex,
    blueprint,
    slotPlan,
    setTab,
    setCardId,
    instruction,
    setInstruction,
    slotTagsPending,
    setSlotTagsPending,
    saveSlotTags,
    budget,
    setBudget,
    variant,
    card,
    evidence,
    total,
    active,
    complete,
    pause,
    resume,
    exportSet,
    selectVariant,
    updateBudget,
    selectAttempt,
    approve,
    toggleLock,
    retry,
  } = useRunViewModel(run, api, perform, onLibraryChanged, initialProfile);
  return (
    <div className="run-view">
      <div className="eyebrow">
        {t('COLLECTION /')} {new Date(run.createdAt).toLocaleDateString(locale)}
      </div>
      <div className="page-heading">
        <div>
          <h1>{run.brief.theme}</h1>
          <p>
            {run.brief.variants} {t('variants ·')} {total} {t('cards')}
          </p>
        </div>
        <div className="actions">
          {!active && (
            <button disabled={busy} onClick={exportExecutionLog}>
              <Download size={16} /> {t('Download execution log')}
            </button>
          )}
          <button onClick={() => setDiagnosticsOpen(true)}>
            <FileText size={16} />
            {t('Diagnostics')}
          </button>
          {active ? (
            <button disabled={busy} onClick={pause}>
              <Pause size={16} /> {t('Pause')}{' '}
            </button>
          ) : run.status !== 'completed' ? (
            <button disabled={busy} onClick={resume}>
              <Play size={16} /> {t('Resume')}{' '}
            </button>
          ) : null}
          <button className="primary" disabled={busy || active || !complete} onClick={exportSet}>
            <Download size={16} /> {t('Export set')}{' '}
          </button>
        </div>
      </div>
      <section className="generation-workspace">
        {tabs.length > 1 && (
          <div className="variant-tabs" role="tablist" aria-label={t('Set variants')}>
            {tabs.map((tab) => (
              <button
                key={tab.index}
                id={`set-tab-${run.id}-${tab.index}`}
                role="tab"
                aria-selected={selectedIndex === tab.index}
                aria-controls={`set-panel-${run.id}`}
                tabIndex={selectedIndex === tab.index ? 0 : -1}
                onClick={() => setTab(tab.index)}
                onKeyDown={(event) => {
                  const next =
                    event.key === 'ArrowRight'
                      ? (tab.index + 1) % tabs.length
                      : event.key === 'ArrowLeft'
                        ? (tab.index + tabs.length - 1) % tabs.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? tabs.length - 1
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  setTab(next);
                  event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus();
                }}
                className={selectedIndex === tab.index ? 'selected' : ''}
              >
                <span>{t('Set {number}', { number: tab.index + 1 })}</span>
                {tab.title && <strong>{tab.title}</strong>}
                {tab.selectedForDelivery && <Check size={14} aria-label={t('Selected for delivery')} />}
              </button>
            ))}
          </div>
        )}
        <div
          id={`set-panel-${run.id}`}
          role={tabs.length > 1 ? 'tabpanel' : undefined}
          aria-labelledby={tabs.length > 1 ? `set-tab-${run.id}-${selectedIndex}` : undefined}
          tabIndex={tabs.length > 1 ? 0 : undefined}
        >
          <RunProgressView run={run} />
          {variant ? (
            <>
              <div className="variant-heading">
                <div>
                  <h2>{variant.title}</h2>
                </div>
                {run.variants.length > 1 && (
                  <button
                    disabled={busy || active || variant.id === run.selectedVariantId}
                    onClick={selectVariant}
                  >
                    {variant.id === run.selectedVariantId ? <Check size={14} /> : null}
                    {variant.id === run.selectedVariantId
                      ? t('Selected for delivery')
                      : t('Select for delivery')}
                  </button>
                )}
              </div>
              <div className="cards-grid">
                {variant.cards.map((c, i) => (
                  <CardTile
                    key={c.id}
                    card={c}
                    run={run}
                    index={i}
                    onClick={() => {
                      setCardId(c.id);
                      setInstruction('');
                    }}
                  />
                ))}
              </div>
              {complete && !active && (
                <DeliveryGallery key={variant.id} api={api} run={run} variant={variant} />
              )}
            </>
          ) : !active &&
            !run.compositionDraft?.slotPlans?.length &&
            !run.compositionDraft?.blueprints?.length ? (
            <div className="planning-empty">
              {run.status === 'failed' ? <CircleAlert size={30} /> : <Pause size={30} />}
              <h2>{t(run.status === 'failed' ? 'Planning failed' : 'Planning paused')}</h2>
              <button onClick={() => setDiagnosticsOpen(true)}>{t('Details')}</button>
            </div>
          ) : null}
          {!variant && !blueprint && slotPlan && (
            <SetBlueprintView
              key={`slots-${selectedIndex}`}
              composition={slotPlan.composition}
              subjects={slotPlan.slots.map(() => t('Subject being selected'))}
              profile={profile}
              proposed
            />
          )}
          {!variant && blueprint && (
            <SetBlueprintView
              key={`${run.compositionDraft?.attempt}-${selectedIndex}`}
              composition={blueprint.composition}
              subjects={blueprint.slots.map((slot) => slot.subject.subject)}
              profile={profile}
              proposed
            />
          )}
        </div>
      </section>
      {diagnosticsOpen && (
        <RunDiagnostics
          run={run}
          variant={variant}
          busy={busy}
          active={active}
          budget={budget}
          onBudget={setBudget}
          onUpdateBudget={updateBudget}
          onDownload={exportDiagnostics}
          onClose={() => setDiagnosticsOpen(false)}
        />
      )}
      {card && (
        <div className="drawer-backdrop" onClick={() => setCardId(null)}>
          <aside className="card-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-heading">
              <span className="eyebrow">
                {t('CARD / CATEGORY')} {card.category}
              </span>
              <button className="icon-button" aria-label={t('Close card')} onClick={() => setCardId(null)}>
                <X size={20} />
              </button>
            </div>
            <h2>{card.subject}</h2>
            <p>{card.role}</p>
            <SlotRequirements
              key={card.id}
              target={variant ? SetComposition.target(variant, card) : undefined}
              showObserved={false}
              editor={{
                revision: card.slotTagEdits?.at(-1)?.revision ?? 0,
                disabled: busy || active || card.locked,
                save: saveSlotTags,
                onPendingChange: setSlotTagsPending,
              }}
            />
            <div className="comparison">
              <div>
                {Assets.selected(card) ? (
                  <img src={Assets.image(run, Assets.selected(card)?.preview ?? '')} alt={card.subject} />
                ) : (
                  <div className="image-placeholder">
                    <Image size={32} />
                  </div>
                )}
                <small>{t('Selected version')}</small>
              </div>
              <div>
                {comparisonReference && <img src={comparisonReference.src} alt={comparisonReference.title} />}
                <small>
                  {comparisonReference ? text(comparisonReference.role) : t('Reference selection')}
                </small>
              </div>
            </div>
            <div className="drawer-controls">
              <button
                disabled={
                  busy ||
                  active ||
                  (run.reviewProtocol === 'composition-v1'
                    ? !Assets.selected(card)
                    : !Assets.selected(card)?.review?.passed)
                }
                onClick={approve}
              >
                {t('Approve and save to library')}
              </button>
              <small>
                {t(
                  'The selected image is added to your reference art library. You can edit its category and description there.',
                )}
              </small>

              <button disabled={busy || active || !card.selectedAttemptId} onClick={toggleLock}>
                {card.locked ? <Lock size={16} /> : <Unlock size={16} />}{' '}
                {card.locked ? t('Locked') : t('Lock selection')}
              </button>
              <label htmlFor="correction">{t('Revision instructions')}</label>
              <textarea
                id="correction"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={t('For example: enlarge the subject, simplify the background…')}
              />
              <button
                className="primary"
                disabled={
                  busy ||
                  active ||
                  card.locked ||
                  slotTagsPending ||
                  run.imageCalls >= run.brief.maxImageCalls
                }
                onClick={retry}
              >
                <RefreshCw size={16} /> {t('Regenerate image')}{' '}
              </button>
              <small>{t('One new image. Previous versions are retained. Instructions are optional.')}</small>
            </div>
            <p className="category-description">{profile.categories[card.category]}</p>
            {referenceError && <p className="inline-error">{t('Project references could not be loaded.')}</p>}
            {!referencesReady && !referenceError && (
              <p className="muted">{t('Loading project references…')}</p>
            )}
            {usedReferences.length > 0 ? (
              <section>
                <h3>
                  {t('References used for this version')} · {usedReferences.length}
                </h3>
                <ReferenceImages references={usedReferences} />
              </section>
            ) : (
              plannedReferences.length > 0 && (
                <section>
                  <h3>{t('Planning references')}</h3>
                  <ReferenceImages references={plannedReferences} />
                </section>
              )
            )}
            {referenceCandidates.length > 0 && (
              <details>
                <summary>
                  {t('Matching candidates')} · {referenceCandidates.length}
                </summary>
                <ReferenceImages references={referenceCandidates} />
              </details>
            )}
            {card.error && <p className="inline-error">{text(card.error)}</p>}
            <h3>
              {' '}
              {t('Version history')} <span className="muted">{card.attempts.length}</span>
            </h3>
            <div className="attempts">
              {card.attempts.map((a, i) => (
                <button
                  disabled={busy || active || card.locked}
                  className={card.selectedAttemptId === a.id ? 'selected' : ''}
                  key={a.id}
                  onClick={() => selectAttempt(a.id)}
                >
                  <img src={Assets.image(run, a.preview)} alt={t('Version {number}', { number: i + 1 })} />
                  <span>
                    {' '}
                    {t('Version')} {i + 1} {card.selectedAttemptId === a.id ? '✓' : ''}
                  </span>
                </button>
              ))}
            </div>
            {evidence && (
              <details className="reference-evidence">
                <summary>
                  {t('Reference selection')} <span className="muted">{evidence.references.length}</span>
                </summary>
                <p>{evidence.analysis.visualDirection}</p>
                <dl>
                  <dt>{t('Materials')}</dt>
                  <dd>{evidence.analysis.materialGuidance}</dd>
                  <dt>{t('Composition')}</dt>
                  <dd>{evidence.analysis.compositionGuidance}</dd>
                </dl>
                {evidence.analysis.pitfalls.length > 0 && (
                  <>
                    <h4>{t('Avoid')}</h4>
                    <ul>
                      {evidence.analysis.pitfalls.map((pitfall, index) => (
                        <li key={index}>{pitfall}</li>
                      ))}
                    </ul>
                  </>
                )}
                {evidence.references.map((reference, index) => (
                  <article key={reference.id}>
                    <h4>
                      {index + 1}. {reference.role}{' '}
                      <span className="small-badge">
                        {reference.origin === 'anchor' ? t('Source art') : t('Approved example')}
                      </span>
                    </h4>
                    <p>{reference.reason}</p>
                    <dl>
                      <dt>{t('Use')}</dt>
                      <dd>{reference.take}</dd>
                      <dt>{t('Do not copy')}</dt>
                      <dd>{reference.ignore}</dd>
                      <dt>{t('Source')}</dt>
                      <dd>
                        <code>{reference.source}</code>
                      </dd>
                    </dl>
                  </article>
                ))}
                <p className="form-note">
                  {evidence.model} · {new Date(evidence.createdAt).toLocaleString(locale)}
                </p>
              </details>
            )}
            <details className="trace">
              <summary>{t('Prompt and metadata')}</summary>
              <pre>{Assets.selected(card)?.prompt ?? card.description}</pre>
            </details>
          </aside>
        </div>
      )}
    </div>
  );
}

function CardTile({
  card,
  run,
  index,
  onClick,
}: {
  card: Card;
  run: Run;
  index: number;
  onClick: () => void;
}) {
  const { t, text } = useLocalization();
  const attempt = Assets.selected(card),
    pending = Assets.active(run) && ['generating', 'reviewing'].includes(card.status);
  return (
    <button className={`card-tile${pending ? ' is-working' : ''}`} onClick={onClick}>
      <div className="card-art">
        {attempt ? (
          <img src={Assets.image(run, attempt.preview)} alt={card.subject} />
        ) : (
          <div className={`image-placeholder ${pending ? 'working' : ''}`}>
            {pending ? (
              <LoaderCircle size={24} className="spin" />
            ) : card.status === 'failed' ? (
              <CircleAlert size={24} />
            ) : (
              <Image size={24} />
            )}
            <span>
              {card.status === 'pending'
                ? t('Queued')
                : card.status === 'failed'
                  ? t('Error')
                  : !Assets.active(run) && ['generating', 'reviewing'].includes(card.status)
                    ? text(Assets.status(run))
                    : card.status === 'reviewing'
                      ? t('Review')
                      : t('Generating')}
            </span>
          </div>
        )}
        <span className="card-number">{String(index + 1).padStart(2, '0')}</span>
        {card.locked && (
          <span className="card-lock">
            <Lock size={13} />
          </span>
        )}
      </div>
      <div className="card-caption">
        <strong>{card.subject}</strong>
        <span>
          {' '}
          {t('Category')} {card.category}
          {pending && attempt ? (
            <LoaderCircle size={13} className="spin" />
          ) : attempt && !pending ? (
            <CheckCircle2 size={13} className="green" />
          ) : null}
        </span>
      </div>
    </button>
  );
}
