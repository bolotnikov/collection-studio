import fs from 'node:fs/promises';
import path from 'node:path';
import { VisualCatalogContracts } from '../src/shared/VisualCatalogContracts';
import { CollectionCorpusStatistics } from '../src/domain/CollectionCorpusStatistics';
import { AggregateCompositionPlanner } from '../src/domain/AggregateCompositionPlanner';
import { CompositionPlanningContracts } from '../src/shared/CompositionPlanningContracts';
import { SetRhythmPlanner } from '../src/domain/SetRhythmPlanner';

const catalog = VisualCatalogContracts.catalog.parse(
  JSON.parse(await fs.readFile('resources/knowledge/visual-catalog.json', 'utf8')),
);
const statistics = new CollectionCorpusStatistics(catalog).analyze();
const weights = CompositionPlanningContracts.defaults.aggregation;
if (!weights) throw new Error('Missing aggregate weights.');
const planner = new AggregateCompositionPlanner(weights);
const plans = [false, true].map((includeGold) => {
  const plan = planner.planSlots(catalog, includeGold);
  SetRhythmPlanner.validate(plan.composition);
  return { includeGold, ...plan };
});
const output = path.resolve('output/set-rhythm-audit');
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'statistics.json'), JSON.stringify(statistics, null, 2));
await fs.writeFile(path.join(output, 'plans.json'), JSON.stringify(plans, null, 2));
const names: Record<string, string> = {
  all: 'Все исходные наборы',
  'ordinary-only': 'Наборы без золотых карточек',
  mixed: 'Смешанные наборы',
  'gold-only': 'Только золотые карточки',
};
const lines = [
  '# Композиционные закономерности исходных коллекций',
  `Проанализировано ${statistics.sourceSetCount} окон и ${statistics.cardMembershipCount} карточек. Это подсчёт сохранённых классификаций исходных изображений, без повторного анализа моделью. Цвета — крупные группы фона, не измеренные пиксельные оттенки.`,
  '## Количество категорий',
  '| Группа | Наборов | Кат. 1, среднее | Кат. 2 | Кат. 3 | Кат. 4 | Кат. 5 | Разных цветов, мин–макс |',
  '|---|---:|---:|---:|---:|---:|---:|---|',
  ...statistics.cohorts.map(
    (cohort) =>
      `| ${names[cohort.cohort]} | ${cohort.setCount} | ${cohort.categories.map((category) => category.mean.toFixed(2)).join(' | ')} | ${cohort.distinctColors.minimum}–${cohort.distinctColors.maximum} |`,
  ),
  'Категория 5 не должна незаметно смешиваться с обычными карточками: отдельно приведены чисто обычные, смешанные и золотые окна. Действующий распределитель нормирует обычные карточки каждого из 15 подходящих окон к десяти, с одинаковым весом каждого окна; полностью золотое окно в обычном режиме не участвует.',
  '## Проверяемые отношения между карточками',
  `Повтор пары цвет + декоративный узор найден в ${statistics.sets.filter((set) => set.decorativeDuplicatePairs.length).length} из ${statistics.sourceSetCount} окон. Это редкость, но не абсолютный запрет исходников.`,
  ...statistics.sets
    .filter((set) => set.decorativeDuplicatePairs.length)
    .map(
      (set) =>
        `- ${set.title}: ${set.decorativeDuplicatePairs.map((pair) => `${pair.key}, слоты ${pair.slots.join(', ')}`).join('; ')}.`,
    ),
  `Соседние одинаковые цветовые теги: ${statistics.cohorts[0]?.adjacentSameColor.horizontal} горизонтальных пар и ${statistics.cohorts[0]?.adjacentSameColor.vertical} вертикальных. Семантически разные среды могут иметь одинаковую крупную цветовую метку.`,
  'Новое правило продукта строже корпуса: запрет повторения цветовой группы + узора во всём наборе и запрет одной цветовой группы по горизонтальным и вертикальным соседям 5×2. Голубой и синий объединены. Для фона без узора используется значение none. Это явное правило пользователя, а не утверждение, будто оно без исключений соблюдено источниками.',
  '## Каждое исходное окно',
  '| Окно | Категории 1/2/3/4/5 | Разных цветов | Максимум карточек одного цвета |',
  '|---|---|---:|---:|',
  ...statistics.sets.map(
    (set) =>
      `| ${set.title} | ${['1', '2', '3', '4', '5'].map((category) => set.categories[category] ?? 0).join('/')} | ${set.distinctColors} | ${set.maximumColorFrequency} |`,
  ),
  '## Распределения признаков',
];
for (const distribution of statistics.distributions) {
  lines.push(
    `### ${distribution.axis}`,
    '| Значение | Карточек | Окон | В среднем на окно | По категориям 1/2/3/4/5 |',
    '|---|---:|---:|---:|---|',
    ...distribution.values.map(
      (entry) =>
        `| ${entry.value} | ${entry.count} | ${entry.setsPresent} | ${entry.perSet.mean.toFixed(2)} | ${entry.byCategory.map((category) => category.count).join('/')} |`,
    ),
  );
}
lines.push(
  '## Позиции в исходных наборах',
  'Порядок: слева направо, позиции 1–5 в верхнем ряду и 6–10 в нижнем. Частоты рассчитаны по сохранённым классификациям и подтверждённым привязкам к исходным скриншотам; повторного распознавания изображений нет.',
  `В ${statistics.positions.goldSuffix.supportingSetCount} из ${statistics.positions.goldSuffix.mixedSetCount} смешанных наборов золотые карточки образуют непрерывный блок в конце. Частоты категории 5 по позициям: ${statistics.positions.goldSuffix.countsByPosition.join('/')}. Полностью золотое окно не используется для вывода о расположении золотого блока относительно обычных карточек.`,
  'Подтверждённое позиционное правило включается только при единогласной поддержке не менее трёх смешанных исходных наборов. Для обычных категорий, узоров, цветов и ракурсов фиксированные позиции не вводятся. Текущий отдельный перестановочный аудит с контролем состава набора и категории не обнаружил для них убедительной позиционной зависимости.',
);
for (const cohort of statistics.positions.cohorts) {
  lines.push(
    `### ${cohort.cohort}: ${cohort.setCount} наборов`,
    '| Позиция | Наблюдений | Категории 1/2/3/4/5 | Узоры | Цвета |',
    '|---|---:|---|---|---|',
    ...cohort.slots.map((slot) => {
      const distribution = (axis: string) =>
        slot.distributions.find((entry) => entry.axis === axis)?.counts ?? {};
      const categories = distribution('category');
      const counts = (axis: string) =>
        Object.entries(distribution(axis))
          .map(([key, count]) => `${key}: ${count}`)
          .join('; ');
      return `| ${slot.index + 1} | ${slot.observations} | ${['1', '2', '3', '4', '5'].map((category) => categories[category] ?? 0).join('/')} | ${counts('pattern')} | ${counts('backgroundColor')} |`;
    }),
  );
}
lines.push(
  '## Практическое применение до модели',
  'Программа сохраняет исходное распределение категорий и совместных композиционных паттернов, затем назначает цвета из наблюдавшихся сочетаний категории/фона/узора и переставляет слоты с учётом всей сетки. Крупный масштаб фиксируется: он указан у всех 160 исходных карточек. Ракурс, окружение и тип опоры продолжают участвовать в совместном распределении. Количество разных цветов и максимум повторений берутся из чисто обычных окон. Каноническая стилистика остаётся в исходных правилах и первом промпте; художественных баллов нет.',
  'Результат автоматически проверен для обычного и смешанного режима. Новых изображений и запросов к моделям: 0. Подробные частоты и связи доступны в statistics.json, зафиксированные слоты — в plans.json.',
);
await fs.writeFile(path.join(output, 'report.md'), lines.join('\n\n') + '\n');
console.log(
  JSON.stringify(
    {
      sourceSetCount: statistics.sourceSetCount,
      cardMembershipCount: statistics.cardMembershipCount,
      verifiedPlans: plans.length,
      modelCalls: 0,
      output,
    },
    null,
    2,
  ),
);
