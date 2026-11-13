import { z } from 'zod';
import type { Profile, Run } from '../shared/Contracts';
import { CompositionPlanningContracts } from '../shared/CompositionPlanningContracts';
import { VisualPatterns } from '../domain/VisualPatterns';
import { Localization } from '../shared/i18n/Localization';
import { ExecutionJournal } from './ExecutionJournal';

type Entry = z.infer<typeof ExecutionJournal.entry>;

/** Russian narration of observable evidence; original payloads remain verbatim in disclosures. */
export class ExecutionLogNarrator {
  private readonly localization = new Localization('ru');
  private readonly object = z.record(z.string(), z.unknown());
  private readonly changes = z.array(z.object({ path: z.string(), before: z.unknown(), after: z.unknown() }));
  private readonly labels: Record<string, string> = {
    title: 'Название',
    concept: 'Концепция',
    subject: 'Предмет',
    description: 'Описание',
    role: 'Роль в наборе',
    category: 'Категория',
    observedCategory: 'Фактическая категория',
    findings: 'Наблюдения',
    correction: 'Предложенная правка',
    passed: 'Проверка пройдена',
    subjectPresent: 'Нужный предмет присутствует',
    completeSilhouette: 'Силуэт помещается в кадр',
    compositionDescriptionMatch: 'Композиция соответствует описанию',
    matches: 'Обязательные условия совпадают',
    support: 'Опора',
    backdrop: 'Тип фона',
    pattern: 'Узор',
    depth: 'Глубина',
    contextDensity: 'Количество окружения',
    camera: 'Ракурс',
    subjectScale: 'Масштаб предмета',
    characterCount: 'Число персонажей',
    subjectPosition: 'Положение предмета',
    backgroundColor: 'Цвет фона',
    observedComposition: 'Что обнаружено на изображении',
    confirmedViolations: 'Подтверждённые обязательные нарушения',
    evidence: 'Наблюдаемое основание',
    kind: 'Тип нарушения',
    categoryMatch: 'Категория совпадает',
    compositionMatch: 'Композиция совпадает',
    style: 'Старая оценка стиля',
    readability: 'Старая оценка читаемости',
    subjectMatch: 'Старая оценка предмета',
    coherence: 'Старая оценка связности',
    variants: 'Наборы',
    cards: 'Карточки',
    corrections: 'Предложенные правки',
    instruction: 'Указание',
    lighting: 'Освещение',
    materialTreatment: 'Материалы',
    paletteRhythm: 'Цветовой ритм',
  };
  render(run: Run, profile: Profile, entries: Entry[]): string {
    const status = {
      completed: 'завершена',
      paused: 'приостановлена',
      failed: 'ошибка',
      planning: 'планирование',
      generating: 'создание изображений',
      reviewing: 'проверка',
    }[run.status];
    const lines = [
      `# Журнал работы: ${run.brief.theme}`,
      `Начало: ${this.time(run.createdAt)}. Состояние: ${status}. Создано изображений: ${run.imageCalls}.`,
      `Пожелания: ${run.brief.wishes || 'Не указаны.'}`,
      `Модель планирования: ${run.planningModel ?? run.textModel}. Модель изображений: ${run.imageModel}.`,
      run.reviewProtocol === 'composition-v1'
        ? (run.reviewProtocolHistory?.length
            ? 'После явного продолжения пользователем включён новый режим; прежние оценки и версии сохранены в истории. '
            : '') +
          (run.repairPolicy
            ? `Лимит исправлений одной карточки: ${run.repairPolicy.maxCardRegenerations}. Лимит раундов исправления набора: ${run.repairPolicy.maxSetRegenerationRounds}. Ноль отключает соответствующую проверку. Исправления ограничены явными нарушениями; все версии сохраняются. Художественные баллы не используются.`
            : 'Изображения создаются один раз. Проверяются предмет и композиция без баллов и автоматических перерисовок. Новую версию запрашивает пользователь.')
        : 'Исторический запуск: в нём действовали балльные проверки и автоматические правки. Этот журнал сохраняет их реальные результаты и не применяет к ним новые правила.',
      'Ниже события расположены по времени. Параллельные запросы могут пересекаться; номера запросов связывают отправку с ответом. Причины приведены только там, где они были записаны. Внутренние рассуждения модели не записываются.',
      'Полные запросы и ответы приведены ниже в свёрнутых блоках: раскройте блок, чтобы прочитать исходный текст без сокращений. Оригиналы сохранены на языке отправки: исторические английские ответы не переводятся задним числом. Для новых проверок запрашиваются русские наблюдения. Полные структуры, служебные события, версии настроек и связи с файлами доступны в машинной диагностике.',
      entries.length
        ? ''
        : 'Подробная запись запросов для этого запуска отсутствует. Недостающие запросы и ответы восстановить нельзя; ниже показаны только сохранённые этапы.',
    ];
    const calls = new Map<string, { number: number; purpose: string; request: unknown }>();
    let callNumber = 0;
    let step = 0;
    const timeline = [
      ...run.events.map((event) => ({ at: event.at, event, entry: undefined as Entry | undefined })),
      ...entries.map((entry) => ({ at: entry.at, event: undefined, entry })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    for (const item of timeline) {
      let body = '';
      if (item.event) body = this.stage(item.event.message);
      const entry = item.entry;
      if (entry) {
        const data = this.record(entry.data);
        const id = typeof data.callId === 'string' ? data.callId : '';
        if (entry.action === 'request.started') {
          const request = data.request ?? data.payload;
          const purpose =
            this.purpose(entry.executor, request) + this.requestSubject(run, request, entry.executor);
          const number = ++callNumber;
          calls.set(id, { number, purpose, request });
          const payload = this.record(request);
          const model = typeof payload.model === 'string' ? ` Модель: ${payload.model}.` : '';
          const attachments = Array.isArray(payload.attachments) ? payload.attachments.length : null;
          body = `Отправлен запрос №${number}: ${purpose}.${model}\n\n${this.task(entry.executor)}${attachments !== null ? ` Передано изображений: ${attachments}.` : ''}\n\n${this.disclosure('Точный текст отправленного задания', this.requestText(request))}`;
        } else if (entry.action === 'request.completed' || entry.action === 'request.failed') {
          const call = calls.get(id);
          const seconds =
            typeof data.durationMs === 'number' ? ` Через ${(data.durationMs / 1000).toFixed(1)} с.` : '';
          const response = this.unwrap(data.response);
          body =
            entry.action === 'request.failed'
              ? `Запрос ${call ? `№${call.number}` : 'с неизвестным номером'} завершился ошибкой.${seconds}\n\n${typeof data.error === 'string' ? data.error : 'Провайдер вернул ошибку; подробности сохранены ниже.'}\n\n${this.disclosure('Ответ с ошибкой', data)}`
              : `Получен ответ ${call ? `на запрос №${call.number}: ${call.purpose}` : 'модели'}.${seconds}\n\n${this.responseSummary(call?.purpose ?? '', response)}\n\n${this.disclosure('Полный исходный ответ модели', response)}`;
        } else if (entry.action === 'state.changed') {
          body = this.decisions(entry.data, run);
        } else if (entry.action === 'worker.started' || entry.action === 'worker.completed') {
          // Transport lifecycle is duplicated by the application request pair, but retained in machine data.
          continue;
        } else {
          body = `Записано служебное действие «${entry.action}».\n\n${this.disclosure('Сохранённые данные действия', entry.data)}`;
        }
      }
      if (body) lines.push(`## ${++step}. ${this.time(item.at)}\n\n${body}`);
    }
    lines.push(
      '## Итог',
      `Состояние: ${status}. Сохранено наборов: ${run.variants.length}. Запросов изображений: ${run.imageCalls}.`,
      `Идентификатор запуска: ${run.id}.\n\nЖурнал составлен из сохранённых данных без обращений к моделям. Настройки и снимок библиотеки (${profile.id}) находятся в отдельной машинной диагностике.`,
    );
    return ExecutionJournal.text(lines.filter(Boolean).join('\n\n') + '\n');
  }
  private record(value: unknown): Record<string, unknown> {
    const parsed = this.object.safeParse(value);
    return parsed.success ? parsed.data : {};
  }
  private unwrap(value: unknown): unknown {
    const object = this.record(value);
    if (object.response !== undefined) return this.unwrap(object.response);
    if (Array.isArray(object.output)) {
      for (const item of object.output) {
        const message = this.record(item);
        if (!Array.isArray(message.content)) continue;
        for (const content of message.content) {
          const text = this.record(content).text;
          if (typeof text !== 'string') continue;
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
        }
      }
    }
    return value;
  }
  private requestSubject(run: Run, value: unknown, executor: string): string {
    if (!/image|review|verifyComposition/.test(executor)) return '';
    const data = this.record(value);
    const text = this.requestText(value);
    const attachments = Array.isArray(data.attachments)
      ? data.attachments.filter((value): value is string => typeof value === 'string')
      : [];
    for (const variant of run.variants)
      for (const [index, card] of variant.cards.entries()) {
        for (const [version, attempt] of card.attempts.entries()) {
          const inputMatch = attachments.some((file) =>
            [attempt.master, attempt.preview].some(
              (candidate) =>
                file.endsWith('/' + candidate) || file.endsWith('/' + candidate.split('/').at(-1)),
            ),
          );
          const imageMatch = /image/.test(executor) && attempt.prompt && text.includes(attempt.prompt);
          if (inputMatch || imageMatch)
            return ` — карточка №${index + 1} «${card.subject}», версия ${version + 1}`;
        }
      }
    return '';
  }
  private requestText(value: unknown): string {
    const data = this.record(value);
    if (typeof data.prompt === 'string') return data.prompt;
    if (Array.isArray(value))
      return value
        .map((field) => this.record(field))
        .filter((field) => field.name === 'prompt')
        .map((field) => String(field.value))
        .join('\n');
    if (Array.isArray(data.input))
      return data.input
        .map((item) => {
          const message = this.record(item);
          if (typeof message.content === 'string') return message.content;
          if (!Array.isArray(message.content)) return '';
          return message.content
            .map((content) => this.record(content))
            .filter((part) => part.type === 'input_text')
            .map((part) => String(part.text ?? ''))
            .join('\n');
        })
        .filter(Boolean)
        .join('\n\n');
    return 'Текст запроса отдельно не сохранён. Полная структура доступна в машинной диагностике.';
  }
  private purpose(executor: string, request: unknown): string {
    const format = JSON.stringify(this.record(this.record(request).text).format ?? '');
    if (
      /designSlotSet|proposeSubjects|describeComposition|\.plan$/.test(executor) ||
      /slot_set_design|collection_plan/.test(format)
    )
      return 'создание концепции и предметов для слотов';
    if (/reviewSet/.test(executor)) return 'историческая общая оценка набора';
    if (/verifySetComposition/.test(executor)) return 'проверка отношений между десятью карточками';
    if (/verifyComposition/.test(executor) || format.includes('composition_observation'))
      return 'проверка предмета, фона и композиции';
    if (/review/.test(executor)) return 'историческая балльная проверка';
    if (/image/.test(executor) || Array.isArray(request)) return 'создание изображения по заданию';
    return 'выполнение задания моделью';
  }
  private task(executor: string): string {
    if (/verifySetComposition/.test(executor))
      return 'Модель проверяет фактическую сетку и указывает конкретные карточки для адресных правок. Число раундов ограничено сохранёнными настройками; балльная художественная оценка не используется.';
    if (/designSlotSet/.test(executor))
      return 'Модель должна предложить одну общую идею и десять предметов, соблюдая заранее выбранные категории и паттерны. Распределение слотов менять нельзя.';
    if (/verifyComposition/.test(executor))
      return 'Модель должна описать фактический предмет, фон, узор, положение и масштаб. Приложение сравнивает наблюдения с условиями слота. При включённых автоисправлениях только подтверждённые обязательные нарушения могут запустить ограниченную адресную правку.';
    if (/review/.test(executor))
      return 'В старом режиме модель сравнивала изображение с заданием и референсами, выставляла оценки и предлагала правки. Это суждение модели, а не установленный факт о качестве.';
    if (/image/.test(executor))
      return 'Модель должна нарисовать карточку по описанию, правилам композиции и исходным примерам. Если указана предыдущая версия, она передана как основа для правки.';
    return 'Точный текст задания и приложенные данные сохранены ниже.';
  }
  private responseSummary(purpose: string, value: unknown): string {
    const data = this.record(value);
    if (Array.isArray(data.variants))
      return data.variants
        .map((variant, index) => {
          const set = this.record(variant);
          const cards = Array.isArray(set.cards) ? set.cards : [];
          return (
            `Предложен набор ${index + 1}: «${String(set.title ?? '')}». Предметов: ${cards.length}.\n\n` +
            cards
              .map((card, i) => {
                const item = this.record(card);
                return `${i + 1}. ${String(item.subject ?? '')}${item.category ? ` — категория ${String(item.category)}` : ''}.`;
              })
              .join('\n')
          );
        })
        .join('\n\n');
    if (typeof data.subjectPresent === 'boolean') return this.readable(data);
    if (Array.isArray(data.corrections) && Array.isArray(data.findings)) return this.readable(data);
    if (typeof data.passed === 'boolean') {
      const corrections = Array.isArray(data.corrections)
        ? data.corrections.map((item) => this.record(item).instruction)
        : [data.correction];
      const summaries = corrections
        .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        .map((value) => this.historicalCorrection(value));
      return `Модель ${data.passed ? 'приняла результат' : 'нашла несоответствия'}. ${typeof data.style === 'number' ? `Старая оценка стиля: ${data.style}/5.` : ''}\n\n${summaries.join('\n\n') || 'Подробные формулировки сохранены в исходном ответе ниже.'}`;
    }
    if (purpose.includes('изображения'))
      return 'Провайдер вернул результат создания изображения. Файл и выбранная версия фиксируются следующими событиями сохранения; сам ответ провайдера ещё не доказывает корректность файла.';
    return 'Получены данные для следующего этапа. Полный ответ сохранён ниже.';
  }
  private historicalCorrection(value: string): string {
    if (/no correction required/i.test(value)) return 'Модель не запросила изменений.';
    if (/sapphire|facets/i.test(value))
      return 'Модель запросила меньше граней у сапфира и менее зернистую подкладку футляра. Предмет и композицию предложено сохранить.';
    if (/gloss|rubber|leather folds/i.test(value))
      return 'Модель запросила меньше блеска у перчатки и более матовую кожу с мягкими складками. Расположение и полосатый фон предложено сохранить.';
    if (/brass|shaft and bow/i.test(value))
      return 'Модель запросила более широкие и мягкие блики на латунном ключе. Силуэт и фон с лучами предложено сохранить.';
    if (/feather|barb|vane/i.test(value))
      return /flatten|inflated/i.test(value)
        ? 'Модель сочла перо слишком жёстким и объёмным: запросила более плоские мягкие группы бородок и менее яркий стержень.'
        : 'Модель сочла мелкие линии пера слишком подробными: запросила меньше тонких штрихов и более крупные мягкие группы бородок.';
    return 'Модель предложила правку. Её точная формулировка приведена в исходном ответе ниже; автоматический перевод не подменяет оригинал.';
  }
  private readable(value: unknown, depth = 0): string {
    if (value === null || value === undefined) return 'нет данных';
    if (typeof value === 'boolean') return value ? 'да' : 'нет';
    if (typeof value === 'string') return this.localization.text(value);
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map((item) => `- ${this.readable(item, depth + 1)}`).join('\n');
    if (depth > 3) return 'Подробности сохранены в исходном ответе ниже.';
    return Object.entries(this.record(value))
      .map(([key, item]) => `**${this.labels[key] ?? key}:** ${this.readable(item, depth + 1)}`)
      .join('\n\n');
  }
  private decisions(value: unknown, run: Run): string {
    const parsed = this.changes.safeParse(value);
    if (!parsed.success) return 'Сохранено состояние запуска.';
    const lines: string[] = [];
    for (const change of parsed.data) {
      const path = change.path;
      const match = /^\/variants\/(\d+)\/cards\/(\d+)\/(.*)$/.exec(path);
      if (match) {
        const card = run.variants[Number(match[1])]?.cards[Number(match[2])];
        const label = `Карточка №${Number(match[2]) + 1}${card ? ` «${card.subject}»` : ''}`;
        const tail = match[3] ?? '';
        if (tail === 'selectedAttemptId' && typeof change.after === 'string') {
          const version = card?.attempts.findIndex((attempt) => attempt.id === change.after);
          lines.push(
            `${label}: выбрана версия ${version !== undefined && version >= 0 ? version + 1 : 'из сохранённой истории'}.`,
          );
        } else if (/^attempts\/\d+$/.test(tail)) {
          lines.push(`${label}: сохранена новая версия. Предыдущие изображения остаются в истории.`);
        } else if (/compositionCheck$/.test(tail) && change.after) {
          const check = this.record(change.after);
          lines.push(
            `${label}: ${check.matches ? 'предмет и обязательные условия композиции совпали' : 'записано несоответствие предмета или композиции'}.`,
          );
        } else if (tail === 'error' && change.after)
          lines.push(`${label}: ошибка — ${String(change.after)}.`);
      } else if (path === '/compositionDraft' || /\/slotPlans$/.test(path)) {
        lines.push(
          this.slotDecisions(change.after),
          'Сохранён план слотов: категории, композиционные условия и выбранные исходные примеры. Эти условия передаются модели как ограничения.',
        );
      } else if (path === '/variants' || /^\/variants\/\d+$/.test(path)) {
        lines.push(
          'Сохранён предложенный набор и назначенные предметы. Структура плана проверяется приложением до рисования.',
        );
      } else if (path.startsWith('/reviewProtocolHistory')) {
        lines.push(
          'По явному запросу пользователя включён режим без художественных баллов. Прежние оценки и изображения сохранены.',
        );
      } else if (path === '/status') {
        const names: Record<string, string> = {
          planning: 'планирование',
          generating: 'создание изображений',
          reviewing: 'проверка',
          completed: 'завершено',
          paused: 'приостановлено',
          failed: 'ошибка',
        };
        lines.push(`Состояние работы: ${names[String(change.after)] ?? String(change.after)}.`);
      } else if (path === '/')
        lines.push(
          'Создан запуск. Сохранены пожелания пользователя, модели, ограничения и неизменяемый снимок настроек.',
        );
    }
    return [...new Set(lines)].join('\n\n');
  }
  private slotDecisions(value: unknown): string {
    const draft = this.record(value);
    const plans = CompositionPlanningContracts.slotPlan.array().safeParse(draft.slotPlans ?? value);
    if (!plans.success) return '';
    return plans.data
      .map(
        (plan, variant) =>
          `План набора ${variant + 1}:\n\n` +
          plan.slots
            .map((slot) => {
              const target = slot.target;
              const pattern = target.required.pattern
                ? this.localization.text(VisualPatterns.label(`pattern:${target.required.pattern}`))
                : 'без узора';
              const color = target.appearance?.backgroundColor ?? target.preferred.backgroundColor;
              return `- Слот ${slot.index + 1}: категория ${target.category}; ${pattern}${color ? `; фон: ${this.localization.text(VisualPatterns.label(`backgroundColor:${color}`))}` : ''}; исходных примеров: ${target.selectedReferenceIds?.length ?? target.referenceIds?.length ?? 0}.`;
            })
            .join('\n'),
      )
      .join('\n\n');
  }
  private stage(message: string): string {
    const stages: Record<string, string> = {
      'Planning set variants': 'Начато планирование коллекции.',
      'Loading aggregate composition statistics':
        'Читаем готовую статистику исходных коллекций, чтобы выбрать категории и паттерны десяти слотов.',
      'Ten composition slots and reference candidates are ready':
        'Десять слотов и подходящие исходные примеры выбраны до обращения к модели.',
      'Designing the concept and subjects for the fixed slots':
        'Запрашиваем у модели общую концепцию и десять предметов для зафиксированных слотов.',
      'Set plans validated':
        'Приложение проверило структуру набора и совместимость назначений со слотами. Можно создавать изображения.',
      'Reference library ready': 'Готовая библиотека исходных примеров загружена.',
      'Reviewing set coherence': 'В историческом режиме начата общая оценка десяти изображений вместе.',
      'Retained the stronger previous version':
        'Сохранён выбор предыдущей версии: новая версия получила худший результат проверки.',
      'Generation complete · completed with quality warnings':
        'Генерация завершена. В историческом режиме часть художественных проверок осталась непройденной; их замечания сохранены.',
      'Generation complete · automated checks passed':
        'Генерация завершена. Проверки по правилам этого запуска пройдены.',
      'Generation complete': 'Генерация завершена. Выбранные изображения и все исходные версии сохранены.',
      'Checking complete set composition':
        'Проверяем отношения между десятью выбранными карточками в общей сетке.',
    };
    return stages[message] ?? this.localization.text(message);
  }
  private disclosure(title: string, value: unknown): string {
    const content =
      typeof value === 'string'
        ? value
        : (JSON.stringify(ExecutionJournal.sanitize(value), null, 2) ?? 'Нет данных');
    const fence = '`'.repeat(Math.max(3, ...(content.match(/`+/g) ?? []).map((token) => token.length + 1)));
    return `<details>\n<summary>${title}</summary>\n\n${fence}text\n${content}\n${fence}\n\n</details>`;
  }
  private time(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat('ru-RU', {
          timeZone: 'Europe/Vilnius',
          dateStyle: 'short',
          timeStyle: 'medium',
        }).format(date);
  }
}
