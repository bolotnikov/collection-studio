import { SetPlanDetails } from './SetPlanDetails';
import { useRunViewModel } from './viewmodels/useRunViewModel';
import { SetReviewDetails } from './SetReviewDetails';
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
  ChevronRight,
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
    done,
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
      <div className={`progress-panel ${run.status === 'failed' ? 'failure' : ''}`}>
        <div className="progress-heading">
          <span>
            {active ? (
              <LoaderCircle className="spin" size={18} />
            ) : run.status === 'completed' ? (
              <CheckCircle2 size={18} />
            ) : (
              <Pause size={18} />
            )}{' '}
            {text(run.stage)}
          </span>
          <strong>
            {done} <em>/ {total}</em>
          </strong>
        </div>
        <div className="progress-track">
          <div style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <div className="progress-meta">
          <span>
            {text(Assets.status(run))} {t('· all changes saved')}
          </span>
          <span>
            {' '}
            {t('Used')} {run.imageCalls} {t('of')} {run.brief.maxImageCalls} {t('image calls')}{' '}
          </span>
        </div>
      </div>
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
              <p>{variant.concept}</p>
            </div>
            <button disabled={busy || active || variant.id === run.selectedVariantId} onClick={selectVariant}>
              {variant.id === run.selectedVariantId ? <Check size={14} /> : null}
              {variant.id === run.selectedVariantId ? t('Selected for delivery') : t('Select for delivery')}
            </button>
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
          <div className="review-panel">
            <div>
              <span className="eyebrow">{t('SET REVIEW')}</span>
              <h3>
                {variant.review
                  ? variant.review.passed
                    ? t('Set review passed')
                    : t('Needs attention')
                  : active
                    ? t('Review follows generation')
                    : t('Not reviewed')}
              </h3>
              <p>{t('Automated review supports selection. Final art direction remains yours.')}</p>
            </div>
            <ul>
              {variant.review?.findings.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
              {variant.reviewError && <li>{text(variant.reviewError)}</li>}
              {variant.review && (
                <li>
                  {t('Coherence:')} {variant.review.coherence}/5
                </li>
              )}
            </ul>
          </div>
          <SetReviewDetails variant={variant} />
        </>
      ) : (
        <div className="planning-empty">
          <LoaderCircle className="spin" size={30} />
          <h2>{t('Planning the collection')}</h2>
          <p>
            {' '}
            {t('Selecting subjects, four composition categories')} <br />{' '}
            {t('and a distinct concept for each variant.')}{' '}
          </p>
        </div>
      )}
      <SetPlanDetails run={run} variant={variant} />
      <details className="trace">
        <summary>
          {' '}
          {t('Production log & limits')} <ChevronRight size={14} />
        </summary>
        <p>{run.brief.wishes}</p>
        <div className="budget-controls">
          <label htmlFor="run-budget">{t('Image request limit')}</label>
          <input
            id="run-budget"
            type="number"
            min={Math.max(run.imageCalls, total)}
            max={150}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
          />
          <button disabled={busy || active || budget === run.brief.maxImageCalls} onClick={updateBudget}>
            {' '}
            {t('Update limit')}{' '}
          </button>
        </div>
        {run.events.slice(-30).map((e, i) => (
          <div key={i}>
            <time>{new Date(e.at).toLocaleTimeString(locale)}</time>
            {text(e.message)}
          </div>
        ))}
        <p>
          {' '}
          {t('Provider:')} {run.provider} {t('· Images:')} {run.imageModel} {t('· Planning / review:')}{' '}
          {run.textModel} {t('· Run:')} {run.id}
        </p>
      </details>
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
            <p className="category-description">{text(profile.categories[card.category])}</p>
            {Assets.selected(card)?.review && (
              <div className="card-review">
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
              </div>
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
                {t('Only a verified version can become an approved example. Source anchors remain primary.')}
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
