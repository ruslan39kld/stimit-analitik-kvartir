import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, BarChart3, Download, FileSpreadsheet, Scale, TableProperties, X } from 'lucide-react';
import { DATA_AGG, DATA_META } from '../data/rawSeedRows';
import {
  exportSampleCsv,
  formatInt,
  formatPm2,
  formatRub,
  formatRubCompact,
  getStationIdByName,
} from '../data/marketEngine';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

export type AppRoute = 'overview' | 'base' | 'analytics' | 'comparison' | 'cleaning';

interface OverviewPageProps {
  onNavigate: (route: AppRoute) => void;
  onSelectStationAndGoBase: (metroId: number) => void;
}

export function OverviewPage({ onNavigate, onSelectStationAndGoBase }: OverviewPageProps) {
  const [hoveredStation, setHoveredStation] = useState<number | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);

  useBodyScrollLock(csvModalOpen);

  useEffect(() => {
    if (!csvModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCsvModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [csvModalOpen]);

  const topByPm2 = DATA_AGG.stations_top
    .slice()
    .sort((a, b) => b.pm2 - a.pm2)
    .slice(0, 12);
  const maxPm2 = Math.max(1, ...topByPm2.map((s) => s.pm2));

  const monthsData = [
    { key: '2019-06', label: 'Июнь 2019', n: DATA_AGG.months['2019-06'].n, price: DATA_AGG.months['2019-06'].price },
    { key: '2019-07', label: 'Июль 2019', n: DATA_AGG.months['2019-07'].n, price: DATA_AGG.months['2019-07'].price },
    { key: '2019-08', label: 'Август 2019', n: DATA_AGG.months['2019-08'].n, price: DATA_AGG.months['2019-08'].price },
  ];

  // Coordinates for monthly dual line + area chart
  const chartW = 520;
  const chartTop = 30;
  const chartBottom = 175;
  const chartH = chartBottom - chartTop;
  const xs = [96, 270, 444];
  const maxN = Math.max(1, ...monthsData.map((m) => m.n));
  const minP = Math.min(...monthsData.map((m) => m.price)) * 0.96;
  const maxP = Math.max(...monthsData.map((m) => m.price)) * 1.03;
  const spanP = Math.max(1, maxP - minP);

  const nPoints = monthsData.map((m, i) => ({
    x: xs[i],
    y: chartBottom - (m.n / maxN) * (chartH - 12),
  }));
  const pPoints = monthsData.map((m, i) => ({
    x: xs[i],
    y: chartBottom - ((m.price - minP) / spanP) * (chartH - 22) - 8,
  }));

  const nLinePath = nPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
  const nAreaPath = `${nLinePath} L ${nPoints[2].x} ${chartBottom} L ${nPoints[0].x} ${chartBottom} Z`;
  const pLinePath = pPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');

  return (
    <div className="space-y-6">
      {/* Page Title & 1-line Hint */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance] sm:text-3xl">
          Обзор рынка квартир Москвы
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Здесь весь рынок одним взглядом — ключевые ориентиры, лидеры по стоимости метра и переход к детальному анализу.
        </p>
      </div>

      {/* Main Market KPIs — 3x2 aligned dashboard grid, guaranteed single-line nowrap numbers */}
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <dt className="text-xs font-medium text-slate-500">Объявлений в базе</dt>
          <dd className="mt-2 font-mono text-xl font-bold text-[#1B3A6B] tabular-nums whitespace-nowrap xl:text-2xl">
            {formatInt(DATA_META.final)}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <dt className="text-xs font-medium text-slate-500">Станций метро</dt>
          <dd className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums whitespace-nowrap xl:text-2xl">
            {DATA_META.stations}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <dt className="text-xs font-medium text-slate-500">Медиана цены</dt>
          <dd className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums whitespace-nowrap xl:text-2xl">
            {formatRub(DATA_META.median_price)}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <dt className="text-xs font-medium text-slate-500">Медиана ₽/м²</dt>
          <dd className="mt-2 font-mono text-xl font-bold text-[#1B3A6B] tabular-nums whitespace-nowrap xl:text-2xl">
            {formatPm2(DATA_META.median_pm2)}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <dt className="text-xs font-medium text-slate-500">Срок экспозиции</dt>
          <dd className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums whitespace-nowrap xl:text-2xl">
            {DATA_META.median_days} дн.
          </dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <dt className="text-xs font-medium text-slate-500">Период среза</dt>
          <dd className="mt-2 font-mono text-lg font-bold text-slate-900 tabular-nums whitespace-nowrap xl:text-xl">
            {DATA_META.period}
          </dd>
        </div>
      </dl>

      {/* Required Short Demo Banner + Prominent Sample CSV Download CTA */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-[#1B3A6B]/20 bg-[#1B3A6B]/[0.04] px-5 py-4 lg:flex-row lg:items-center">
        <div className="text-sm font-medium text-slate-800">
          Это демо на реальных данных: {formatInt(DATA_META.final)} объявлений, лето 2019, вся обработка — прямо в вашем браузере.
        </div>
        <div className="flex flex-col items-start gap-1.5 shrink-0 sm:flex-row sm:items-center sm:gap-3">
          <button
            type="button"
            onClick={() => setCsvModalOpen(true)}
            className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-lg bg-[#0284C7] px-4 text-sm font-bold text-white shadow-xs transition-colors hover:bg-[#0369A1] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B3A6B]"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Скачать пример данных (CSV)</span>
          </button>
          <span className="text-xs font-medium text-slate-600">
            Реальные объявления из базы — откроется в Excel
          </span>
        </div>
      </div>

      {/* 2 Main Charts */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Chart 1: Top stations by median price/m² (Gradient Horizontal Bars) */}
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-900">
              Топ станций метро по цене м²
            </h2>
            <p className="text-xs text-slate-500">
              Медианная стоимость квадратного метра · нажмите на станцию, чтобы открыть её лоты в «Базе»
            </p>
          </div>

          <svg
            viewBox={`0 0 560 ${topByPm2.length * 26 + 8}`}
            className="w-full"
            role="img"
            aria-label="Рейтинг станций метро по медианной цене квадратного метра"
          >
            <defs>
              <linearGradient id="overviewBarGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#1B3A6B" />
                <stop offset="100%" stopColor="#0284C7" />
              </linearGradient>
            </defs>
            {topByPm2.map((st, idx) => {
              const y = idx * 26 + 4;
              const barW = Math.max(8, (st.pm2 / maxPm2) * 230);
              const isHovered = hoveredStation === idx;
              const metroId = getStationIdByName(st.name);

              return (
                <g
                  key={st.name}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredStation(idx)}
                  onMouseLeave={() => setHoveredStation(null)}
                  onClick={() => {
                    if (metroId) onSelectStationAndGoBase(metroId);
                  }}
                >
                  <rect
                    x="0"
                    y={y - 2}
                    width="560"
                    height="24"
                    rx="4"
                    fill={isHovered ? '#F1F5F9' : 'transparent'}
                  />
                  <text
                    x="4"
                    y={y + 14}
                    fontSize="11.5"
                    fontWeight="600"
                    fill="#1E293B"
                  >
                    {st.name.length > 21 ? `${st.name.slice(0, 20)}…` : st.name}
                  </text>
                  <rect
                    x="170"
                    y={y + 4}
                    width={barW}
                    height="13"
                    rx="3"
                    fill={isHovered ? '#0284C7' : 'url(#overviewBarGrad)'}
                  />
                  <text
                    x={178 + barW}
                    y={y + 14}
                    fontSize="11"
                    fontFamily="var(--font-mono)"
                    fontWeight="600"
                    fill="#0F172A"
                  >
                    {formatInt(st.pm2)} ₽/м²
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="mt-2 min-h-[30px] rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 tabular-nums">
            {hoveredStation !== null && topByPm2[hoveredStation] ? (
              <span className="inline-flex flex-wrap items-center gap-x-2">
                <span className="font-bold text-slate-900">м. {topByPm2[hoveredStation].name}</span>
                <span className="whitespace-nowrap">{formatPm2(topByPm2[hoveredStation].pm2)}</span>
                <span className="whitespace-nowrap">медиана {formatRubCompact(topByPm2[hoveredStation].price)}</span>
                <span className="whitespace-nowrap">{formatInt(topByPm2[hoveredStation].n)} лотов</span>
              </span>
            ) : (
              <span>Кликните по любой станции, чтобы перейти к отфильтрованной таблице</span>
            )}
          </div>
        </article>

        {/* Chart 2: Monthly Dynamics (Dual Line + Shaded Area Chart) */}
        <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Динамика по месяцам (июнь–август 2019)
                </h2>
                <p className="text-xs text-slate-500">
                  Объём активных объявлений и медианная стоимость квартиры
                </p>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-medium text-slate-600">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="h-0.5 w-4 bg-[#1B3A6B]" />
                  <span>Объявления</span>
                </span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="h-0.5 w-4 border-t-2 border-dashed border-[#0284C7]" />
                  <span>Медиана ₽</span>
                </span>
              </div>
            </div>

            <svg
              viewBox={`0 0 ${chartW} 225`}
              className="w-full"
              role="img"
              aria-label="Линейный график динамики объявлений и медианной цены по месяцам"
            >
              <defs>
                <linearGradient id="overviewMonthArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1B3A6B" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#1B3A6B" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {[0, 0.5, 1].map((t) => {
                const y = chartTop + (1 - t) * chartH;
                return (
                  <line
                    key={t}
                    x1="36"
                    y1={y}
                    x2={chartW - 24}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeDasharray="3 3"
                  />
                );
              })}

              <path d={nAreaPath} fill="url(#overviewMonthArea)" />
              <path d={nLinePath} fill="none" stroke="#1B3A6B" strokeWidth="2.5" strokeLinejoin="round" />
              <path
                d={pLinePath}
                fill="none"
                stroke="#0284C7"
                strokeWidth="2.2"
                strokeDasharray="6 4"
                strokeLinejoin="round"
              />

              {monthsData.map((m, idx) => {
                const np = nPoints[idx];
                const pp = pPoints[idx];
                const isHovered = hoveredMonth === idx;
                return (
                  <g
                    key={m.key}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredMonth(idx)}
                    onMouseLeave={() => setHoveredMonth(null)}
                  >
                    <rect
                      x={xs[idx] - 58}
                      y={chartTop - 10}
                      width="116"
                      height={chartH + 46}
                      fill="transparent"
                    />
                    {isHovered && (
                      <line
                        x1={xs[idx]}
                        y1={chartTop}
                        x2={xs[idx]}
                        y2={chartBottom}
                        stroke="#94A3B8"
                        strokeDasharray="2 2"
                      />
                    )}
                    <circle
                      cx={np.x}
                      cy={np.y}
                      r={isHovered ? 6 : 4.5}
                      fill="#1B3A6B"
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />
                    <circle
                      cx={pp.x}
                      cy={pp.y}
                      r={isHovered ? 6 : 4.5}
                      fill="#0284C7"
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />
                    <text
                      x={np.x}
                      y={np.y - 10}
                      textAnchor="middle"
                      fontSize="10.5"
                      fontFamily="var(--font-mono)"
                      fontWeight="700"
                      fill="#1B3A6B"
                    >
                      {formatInt(m.n)} шт.
                    </text>
                    <text
                      x={pp.x}
                      y={pp.y + 18}
                      textAnchor="middle"
                      fontSize="10.5"
                      fontFamily="var(--font-mono)"
                      fontWeight="700"
                      fill="#0369A1"
                    >
                      {formatRubCompact(m.price)}
                    </text>
                    <text
                      x={xs[idx]}
                      y="202"
                      textAnchor="middle"
                      fontSize="11.5"
                      fontWeight="600"
                      fill="#334155"
                    >
                      {m.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-2 min-h-[30px] rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 tabular-nums">
            {hoveredMonth !== null && monthsData[hoveredMonth] ? (
              <span className="inline-flex flex-wrap items-center gap-x-2">
                <span className="font-bold text-slate-900">{monthsData[hoveredMonth].label}:</span>
                <span className="whitespace-nowrap">{formatInt(monthsData[hoveredMonth].n)} объявлений</span>
                <span className="whitespace-nowrap">медиана {formatRub(monthsData[hoveredMonth].price)}</span>
              </span>
            ) : (
              <span>Наведите на точку месяца — пик публикаций пришёлся на июль ({formatInt(monthsData[1].n)} шт.)</span>
            )}
          </div>
        </article>
      </div>

      {/* 3 Large Navigation Cards */}
      <section aria-label="Быстрый переход к разделам">
        <div className="grid gap-4 md:grid-cols-3">
          <button
            type="button"
            onClick={() => onNavigate('base')}
            className="group flex cursor-pointer flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-[#1B3A6B] hover:bg-sky-50/40"
          >
            <div>
              <TableProperties className="h-6 w-6 text-[#1B3A6B]" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-bold text-slate-900">База объявлений</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                Фильтруйте квартиры по 8 параметрам, выгружайте CSV для Excel и отмечайте лоты в сравнение.
              </p>
            </div>
            <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1B3A6B]">
              <span>Открыть базу</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('analytics')}
            className="group flex cursor-pointer flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-[#1B3A6B] hover:bg-sky-50/40"
          >
            <div>
              <BarChart3 className="h-6 w-6 text-[#1B3A6B]" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-bold text-slate-900">Аналитика</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                Изучайте 6 графиков влияния расстояния до метро, этажа, площадки и распределения бюджетов.
              </p>
            </div>
            <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1B3A6B]">
              <span>Смотреть графики</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('comparison')}
            className="group flex cursor-pointer flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-[#1B3A6B] hover:bg-sky-50/40"
          >
            <div>
              <Scale className="h-6 w-6 text-[#1B3A6B]" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-bold text-slate-900">Сравнение квартир</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                Сопоставьте 2–3 лота бок о бок с расчётом отклонения от медианы станции и готовым вердиктом.
              </p>
            </div>
            <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1B3A6B]">
              <span>Перейти к сравнению</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </div>
          </button>
        </div>
      </section>

      {/* Overview Demo Explanation Modal for CSV Sample Download */}
      {csvModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-csv-modal-title"
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            <div
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
              onClick={() => setCsvModalOpen(false)}
            />
            <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0284C7]/10 text-[#0284C7]">
                    <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h2 id="demo-csv-modal-title" className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                    Это демо технологии, а не готовый продукт
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Закрыть окно"
                  onClick={() => setCsvModalOpen(false)}
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-slate-700 sm:text-[15px]">
                Прототип показывает работу с большими Excel-файлами: 252 536 сырых строк исходника обработаны до 125 577 чистых записей, вся аналитика — прямо в браузере. Такую же систему можно настроить под ЛЮБОЙ Excel-файл и любую задачу: склад, продажи, кадры, закупки — структура и показатели подстраиваются под ваши данные.
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCsvModalOpen(false)}
                  className="inline-flex min-h-[42px] cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
                >
                  Понятно
                </button>
                <button
                  type="button"
                  onClick={() => {
                    exportSampleCsv(2500);
                    setCsvModalOpen(false);
                  }}
                  className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-lg bg-[#0284C7] px-5 text-sm font-bold text-white shadow-xs transition-colors hover:bg-[#0369A1] whitespace-nowrap"
                >
                  <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Скачать CSV</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
