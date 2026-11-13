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

type Props = {
  api: StudioApi;
  run: Run;
  profile: Profile;
  busy: boolean;
  perform: (action: () => Promise<unknown>) => Promise<void>;
  onLibraryChanged: () => Promise<void>;
};
export function RunView({ run, profile, busy, perform, onLibraryChanged, api }: Props) {
  const { t, text, locale } = useLocalization();
  const {
    diagnosticsOpen,
    setDiagnosticsOpen,
    exportDiagnostics,
    exportExecutionLog,
    setTab,
    setCardId,
    instruction,
    setInstruction,
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
  } = useRunViewModel(run, api, perform, onLibraryChanged);
  return (
    <div className="run-view">
      <div className="eyebrow">
        {t('COLLECTION /')} {new Date(run.createdAt).toLocaleDateString(locale)}
      </div>
      <div className="page-heading">
        <div>
          <h1>{run.brief.theme}</h1>
          <p>
            {run.brief.variants} {t('variants ·')} {total} {t('cards ·')}{' '}
            {run.brief.quality === 'low'
              ? t('Draft quality')
              : run.brief.quality === 'medium'
                ? t('Standard quality')
                : t('High quality')}
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
      <RunProgressView run={run} />
      {variant ? (
        <>
          <div className="variant-tabs">
            {run.variants.map((v, i) => (
              <button
                key={v.id}
                onClick={() => {
                  setTab(v.id);
                  setCardId(null);
                }}
                className={variant.id === v.id ? 'selected' : ''}
              >
                <span>0{i + 1}</span>
                {v.title}
                {v.id === run.selectedVariantId && <Check size={14} />}
              </button>
            ))}
          </div>
          <div className="variant-heading">
            <div>
              <h2>{variant.title}</h2>
            </div>
            <button disabled={busy || active || variant.id === run.selectedVariantId} onClick={selectVariant}>
              {variant.id === run.selectedVariantId ? <Check size={14} /> : null}
              {variant.id === run.selectedVariantId ? t('Selected for delivery') : t('Select for delivery')}
            </button>
          </div>
          <SetBlueprintView
            composition={variant.artContract?.composition}
            subjects={variant.cards.map((card) => card.subject)}
            profile={profile}
          />
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
          <div className={`set-status ${complete ? 'green' : 'amber'}`} role="status">
            {complete ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
            <span>
              {complete
                ? t('Ready for delivery')
                : active
                  ? t('Review follows generation')
                  : t('Needs attention')}
            </span>
            {!complete && !active && <button onClick={() => setDiagnosticsOpen(true)}>{t('Details')}</button>}
          </div>
          {complete && !active && <DeliveryGallery api={api} run={run} variant={variant} />}
        </>
      ) : (
        <div className="planning-empty">
          {active ? (
            <>
              <LoaderCircle className="spin" size={30} />
              <h2>{t('Planning the collection')}</h2>
              <p>
                {t(
                  run.brief.includeGold
                    ? 'Selecting subjects and composition categories 1–5, including gold cards'
                    : 'Selecting subjects and composition categories 1–4',
                )}{' '}
                <br />
                {t('and a distinct concept for each variant.')}
              </p>
            </>
          ) : (
            <>
              {run.status === 'failed' ? <CircleAlert size={30} /> : <Pause size={30} />}
              <h2>{t(run.status === 'failed' ? 'Planning failed' : 'Planning paused')}</h2>
              <p>{text(run.stage)}</p>
              <button onClick={() => setDiagnosticsOpen(true)}>{t('Details')}</button>
            </>
          )}
        </div>
      )}
      {!variant &&
        run.compositionDraft?.blueprints?.map((blueprint, index) => (
          <SetBlueprintView
            key={`${run.compositionDraft?.attempt}-${index}`}
            composition={blueprint.composition}
            subjects={blueprint.slots.map((slot) => slot.subject.subject)}
            profile={profile}
            proposed
          />
        ))}
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
              target={variant ? SetComposition.target(variant, card) : undefined}
              observed={Assets.selected(card)?.review?.observedComposition}
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
                {profile.references
                  .filter((r) => r.category === card.category)
                  .slice(0, 1)
                  .map((r) => (
                    <img
                      src={Assets.reference(r.filename)}
                      key={r.id}
                      alt={t('Reference: {title}', { title: text(r.title) })}
                    />
                  ))}
                <small>
                  {t('Category reference')} {card.category}
                </small>
              </div>
            </div>
            <p className="category-description">{profile.categories[card.category]}</p>
            {Assets.selected(card)?.review && (
              <details className="card-review">
                <summary>{t('Review details')}</summary>
                <strong>
                  {Assets.selected(card)?.review?.passed
                    ? t('Automated review passed')
                    : t('Needs art review')}
                </strong>
                <div className="score-row">
                  <span>
                    {' '}
                    {t('Style')} <b>{Assets.selected(card)?.review?.style}/5</b>
                  </span>
                  <span>
                    {' '}
                    {t('Readability')} <b>{Assets.selected(card)?.review?.readability}/5</b>
                  </span>
                  <span>
                    {' '}
                    {t('Subject')} <b>{Assets.selected(card)?.review?.subjectMatch}/5</b>
                  </span>
                </div>
                <ul>
                  {Assets.selected(card)?.review?.findings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </details>
            )}
            {(card.error || Assets.selected(card)?.reviewError) && (
              <p className="inline-error">{text(card.error || Assets.selected(card)?.reviewError || '')}</p>
            )}
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
            <div className="drawer-controls">
              <button disabled={busy || active || !Assets.selected(card)?.review?.passed} onClick={approve}>
                {t('Approve and save to library')}
              </button>
              <small>
                {t(
                  'The verified image is added to your reference art library. You can edit its category and description there.',
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
                disabled={busy || active || card.locked || run.imageCalls >= run.brief.maxImageCalls}
                onClick={retry}
              >
                <RefreshCw size={16} /> {t('Generate revision')}{' '}
              </button>
              <small>{t('One image call + review. Previous versions are retained.')}</small>
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
  const { t } = useLocalization();
  const attempt = Assets.selected(card),
    pending = ['generating', 'reviewing'].includes(card.status);
  return (
    <button className="card-tile" onClick={onClick}>
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
          {attempt &&
            (attempt.review?.passed ? (
              <CheckCircle2 size={13} className="green" />
            ) : (
              <CircleAlert size={13} className="amber" />
            ))}
        </span>
      </div>
    </button>
  );
}
