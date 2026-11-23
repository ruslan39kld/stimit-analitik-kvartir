import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Database, FileSpreadsheet } from 'lucide-react';
import { DATA_META } from '../data/rawSeedRows';
import { formatInt } from '../data/marketEngine';

interface PipelineStage {
  id: string;
  step: string;
  title: string;
  metric: string;
  delta: string;
  description: string;
}

const STAGES: PipelineStage[] = [
  {
    id: 'raw',
    step: '01',
    title: 'Сырая выгрузка парсеров',
    metric: formatInt(DATA_META.raw_rows),
    delta: 'Исходный объём',
    description:
      'Объединённый CSV/Excel-массив по жилой недвижимости Москвы за июнь–август 2019 года со всех подключённых агрегаторов.',
  },
  {
    id: 'junk',
    step: '02',
    title: 'Отсев служебных строк',
    metric: `−${formatInt(DATA_META.junk_rows)}`,
    delta: `Осталось ${formatInt(DATA_META.listings)}`,
    description:
      'Удалены повторяющиеся технические строки-разделители «Для заметок:», составлявшие ровно половину исходной таблицы.',
  },
  {
    id: 'excel',
    step: '03',
    title: 'Восстановление комнатности',
    metric: formatInt(DATA_META.rooms_fixed),
    delta: 'Исправлено',
    description:
      'Excel автоматически превратил диапазоны комнат («1–3», «2–4») в календарные даты («01.мар», «02.апр»). Правила парсинга восстановили реальные значения.',
  },
  {
    id: 'dups',
    step: '04',
    title: 'Дедупликация лотов',
    metric: `−${formatInt(DATA_META.dups)}`,
    delta: 'Кросс-площадки',
    description:
      'Исключены полные дубликаты объявлений, синхронно опубликованные разными агентами по совпадающим параметрам адреса, площади и цены.',
  },
  {
    id: 'outliers',
    step: '05',
    title: 'Фильтр выбросов и битых полей',
    metric: `−${formatInt(DATA_META.price_outliers)}`,
    delta: `${formatInt(DATA_META.area_broken)} площ. · ${formatInt(DATA_META.date_broken)} дат`,
    description:
      'Ценовые аномалии (<1 млн ₽ или >300 млн ₽) исключены из медианной статистики. Строки с нулевой/битой площадью и невалидными датами промаркированы для пропуска в расчётах.',
  },
  {
    id: 'final',
    step: '06',
    title: 'Чистая витрина в браузере',
    metric: formatInt(DATA_META.final),
    delta: `${DATA_META.stations} станций метро`,
    description:
      'Упаковано в компактный типизированный массив (Int32Array), который фильтруется и агрегируется в памяти браузера за единицы миллисекунд.',
  },
];

const RAW_EXAMPLES = [
  {
    id: 1,
    problem: 'Служебный разделитель через каждую строку',
    before: 'Для заметок:;;;;;;;;;;;;;',
    after: 'Строка полностью удалена при парсинге',
    count: `${formatInt(DATA_META.junk_rows)} строк`,
  },
  {
    id: 2,
    problem: 'Автоформат Excel превратил диапазон в дату',
    before: 'Комнат: 01.мар',
    after: 'Восстановлен диапазон «1-3» (категория range)',
    count: `${formatInt(DATA_META.rooms_fixed)} строк`,
  },
  {
    id: 3,
    problem: 'Дата Excel вместо значения общей площади',
    before: 'Площадь: 24.12.2005',
    after: 'Помечена как битая и исключена из расчётов м²',
    count: `${formatInt(DATA_META.area_broken)} строка`,
  },
  {
    id: 4,
    problem: 'Опечатки и аномальные цены (<1 млн или >300 млн)',
    before: 'Цена: 4 500  /  3 000 000 015',
    after: 'Выбросы исключены из медиан и ценовой статистики',
    count: `${formatInt(DATA_META.price_outliers)} строк`,
  },
];

interface DataPipelineSectionProps {
  standalonePage?: boolean;
}

export function DataPipelineSection({ standalonePage = false }: DataPipelineSectionProps) {
  const [expanded, setExpanded] = useState(standalonePage);
  const [activeStage, setActiveStage] = useState<number>(0);

  useEffect(() => {
    if (standalonePage) setExpanded(true);
  }, [standalonePage]);

  useEffect(() => {
    if (!expanded) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const timer = window.setInterval(() => {
      setActiveStage((prev) => (prev + 1) % STAGES.length);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [expanded]);

  return (
    <div className="space-y-6">
      {/* Input Excel Breakdown ("Что было на входе") */}
      {standalonePage && (
        <section
          aria-labelledby="raw-input-heading"
          className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A6B]" aria-hidden="true" />
            <div>
              <h2 id="raw-input-heading" className="text-lg font-bold tracking-tight text-slate-900">
                Что было на входе
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Исходный массив поступил в виде сырой таблицы, непригодной для прямой аналитики без программной очистки.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-[#1B3A6B]/20 bg-[#1B3A6B]/[0.04] px-4 py-3 text-sm text-slate-800">
            Файл Excel <span className="font-mono font-bold text-[#1B3A6B]">«moscow квартиры 2019»</span>:{' '}
            <span className="font-mono font-semibold whitespace-nowrap">~200 МБ</span> ·{' '}
            <span className="font-mono font-semibold whitespace-nowrap">{formatInt(DATA_META.raw_rows)} строк</span> ·{' '}
            <span className="font-mono font-semibold whitespace-nowrap">14 колонок</span> — обычный Excel такой файл не тянет, поэтому вся очистка и нормализация выполнялись кодом.
          </div>

          {/* Before -> After: Mobile Cards (< md) + Full-Fit Table (>= md) */}
          <div className="mt-5 divide-y divide-slate-200 rounded-lg border border-slate-200 md:hidden">
            {RAW_EXAMPLES.map((row) => (
              <div key={row.id} className="space-y-1.5 p-3.5 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-slate-800">{row.problem}</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                    {row.count}
                  </span>
                </div>
                <div className="break-all font-mono text-rose-700">{row.before}</div>
                <div className="font-mono text-emerald-700">{row.after}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 hidden md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th className="px-3 py-3">Аномалия в исходнике</th>
                  <th className="px-3 py-3">Было (сырая строка)</th>
                  <th className="px-3 py-3">Стало после обработки</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">Затронуто</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {RAW_EXAMPLES.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-3 text-xs font-semibold text-slate-700">
                      {row.problem}
                    </td>
                    <td className="px-3 py-3 break-all font-mono text-xs text-rose-700 lg:break-normal">
                      {row.before}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-emerald-700">
                      {row.after}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">
                      {row.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Existing 6-Node Cleaning Pipeline */}
      <section
        id="pipeline"
        aria-labelledby="pipeline-heading"
        className="rounded-xl border border-slate-200 bg-white"
      >
        {standalonePage ? (
          <div className="flex items-start gap-3 px-5 py-5 sm:px-6">
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A6B]" aria-hidden="true" />
            <div>
              <h2 id="pipeline-heading" className="text-lg font-bold tracking-tight text-slate-900">
                Конвейер очистки: от {formatInt(DATA_META.raw_rows)} сырых строк до {formatInt(DATA_META.final)} чистых
              </h2>
              <p className="mt-0.5 text-sm text-slate-600 tabular-nums">
                Нажмите на любой этап схемы, чтобы посмотреть правило очистки и точную статистику отсева
              </p>
            </div>
          </div>
        ) : (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
            className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-5 text-left transition-colors hover:bg-slate-50/80 sm:px-6"
          >
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A6B]" aria-hidden="true" />
              <div>
                <h2 id="pipeline-heading" className="text-lg font-bold tracking-tight text-slate-900">
                  Как обработаны данные: путь от {formatInt(DATA_META.raw_rows)} сырых строк до {formatInt(DATA_META.final)} чистых
                </h2>
                <p className="mt-0.5 text-sm text-slate-600 tabular-nums">
                  {expanded
                    ? 'Нажмите на любой этап схемы, чтобы увидеть детали очистки и нормализации'
                    : `Нажмите, чтобы раскрыть пайплайн очистки: −${formatInt(DATA_META.junk_rows)} мусорных строк, ${formatInt(DATA_META.rooms_fixed)} дат Excel, −${formatInt(DATA_META.dups)} дублей`}
                </p>
              </div>
            </div>

            <span className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0">
              <span>{expanded ? 'Свернуть' : 'Раскрыть схему'}</span>
              {expanded ? (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
          </button>
        )}

        {expanded && (
          <div className="border-t border-slate-200 px-5 py-6 sm:px-6">
            {/* Animated Flow Connector (Desktop SVG line) */}
            <div className="mb-3 hidden lg:block">
              <svg viewBox="0 0 1200 22" className="h-5 w-full" aria-hidden="true">
                <line x1="40" y1="11" x2="1160" y2="11" stroke="#CBD5E1" strokeWidth="2" />
                <line
                  x1="40"
                  y1="11"
                  x2="1160"
                  y2="11"
                  stroke="#1B3A6B"
                  strokeWidth="2.5"
                  strokeDasharray="10 14"
                  className="animate-pipeline-flow"
                />
                {STAGES.map((s, idx) => {
                  const cx = 40 + idx * ((1160 - 40) / (STAGES.length - 1));
                  const isActive = activeStage === idx;
                  return (
                    <circle
                      key={s.id}
                      cx={cx}
                      cy="11"
                      r={isActive ? 7 : 5}
                      fill={isActive ? '#0284C7' : '#1B3A6B'}
                    />
                  );
                })}
              </svg>
            </div>

            {/* 6-Node Pipeline Cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {STAGES.map((stage, idx) => {
                const isActive = activeStage === idx;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setActiveStage(idx)}
                    className={`flex cursor-pointer flex-col justify-between rounded-lg border p-3.5 text-left transition-all ${
                      isActive
                        ? 'border-[#1B3A6B] bg-sky-50/70'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-mono text-xs font-semibold text-slate-600">
                        Этап {stage.step}
                      </div>
                      <div className="mt-1 text-sm font-bold leading-snug text-slate-900">
                        {stage.title}
                      </div>
                    </div>
                    <div className="mt-3 border-t border-slate-100 pt-2">
                      <div
                        className={`font-mono text-base font-bold tabular-nums whitespace-nowrap ${
                          stage.id === 'final' ? 'text-emerald-700' : 'text-[#1B3A6B]'
                        }`}
                      >
                        {stage.metric}
                      </div>
                      <div className="text-xs text-slate-600 tabular-nums">{stage.delta}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Stage Explanation */}
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
              <div className="font-bold text-[#1B3A6B]">
                Этап {STAGES[activeStage].step}: {STAGES[activeStage].title} ({STAGES[activeStage].metric})
              </div>
              <p className="mt-1 leading-relaxed text-slate-700">
                {STAGES[activeStage].description}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
