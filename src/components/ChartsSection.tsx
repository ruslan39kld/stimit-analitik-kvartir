import { useState } from 'react';
import { DATA_AGG, DATA_DICT, DATA_META } from '../data/rawSeedRows';
import {
  SRC_LABELS_RU,
  areFiltersEmpty,
  formatInt,
  formatPm2,
  formatRub,
  formatRubCompact,
  getStationIdByName,
} from '../data/marketEngine';
import type { ComputedStats, FilterState } from '../types/market';

interface ChartsSectionProps {
  stats: ComputedStats;
  filters: FilterState;
  onSelectMetro: (metroId: number | null) => void;
  onSelectSource: (srcId: number | null) => void;
  onGoToBase?: () => void;
}

export function ChartsSection({
  stats,
  filters,
  onSelectMetro,
  onSelectSource,
  onGoToBase,
}: ChartsSectionProps) {
  const [scope, setScope] = useState<'filtered' | 'market'>('filtered');
  const [hoveredStation, setHoveredStation] = useState<number | null>(null);
  const [hoveredWalk, setHoveredWalk] = useState<number | null>(null);
  const [hoveredHist, setHoveredHist] = useState<number | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [hoveredFloor, setHoveredFloor] = useState<number | null>(null);
  const [hoveredSource, setHoveredSource] = useState<number | null>(null);

  const isUnfiltered = areFiltersEmpty(filters);
  const showMarket = scope === 'market' || isUnfiltered;

  const topStations = showMarket
    ? DATA_AGG.stations_top.slice(0, 20).map((s) => ({
        metroId: getStationIdByName(s.name) ?? 0,
        name: s.name,
        n: s.n,
        price: s.price,
        pm2: s.pm2,
        days: s.days,
      }))
    : stats.topStations;

  const walkLabels = ['0–3 м', '3–5 м', '5–7 м', '7–10 м', '10–15 м', '15–20 м', '20–30 м'];
  const walkData = showMarket
    ? DATA_AGG.walk_pm2.map((w, i) => ({ label: walkLabels[i] || w.range, n: w.n, pm2: w.pm2 }))
    : stats.walkPm2.map((w, i) => ({ ...w, label: walkLabels[i] || w.label }));

  const floorData = showMarket
    ? {
        first: { n: DATA_AGG.floor_n.first, pm2: DATA_AGG.floor_pm2.first },
        mid: { n: DATA_AGG.floor_n.mid, pm2: DATA_AGG.floor_pm2.mid },
        last: { n: DATA_AGG.floor_n.last, pm2: DATA_AGG.floor_pm2.last },
      }
    : stats.floorPm2;

  const monthsData = showMarket
    ? [
        { key: '2019-06', label: 'Июнь 2019', n: DATA_AGG.months['2019-06'].n, price: DATA_AGG.months['2019-06'].price },
        { key: '2019-07', label: 'Июль 2019', n: DATA_AGG.months['2019-07'].n, price: DATA_AGG.months['2019-07'].price },
        { key: '2019-08', label: 'Август 2019', n: DATA_AGG.months['2019-08'].n, price: DATA_AGG.months['2019-08'].price },
      ]
    : stats.months;

  const sourcesData = showMarket
    ? Object.entries(DATA_AGG.sources).map(([key, v]) => ({
        srcId: DATA_DICT.src.indexOf(key),
        key,
        label: SRC_LABELS_RU[key] || key,
        n: v.n,
        pm2: v.pm2,
        days: v.days,
      }))
    : stats.sources;

  const histData = showMarket
    ? DATA_AGG.price_hist.map((b, idx) => ({
        label: `${idx * 2}–${(idx + 1) * 2} млн`,
        min: idx * 2_000_000,
        max: (idx + 1) * 2_000_000,
        n: b.n,
      }))
    : stats.priceHist;

  const refMedianPm2 = showMarket ? DATA_META.median_pm2 : stats.medianPm2 || DATA_META.median_pm2;
  const refMedianPrice = showMarket ? DATA_META.median_price : stats.medianPrice || DATA_META.median_price;

  // Chart 1 bounds
  const maxStationPm2 = Math.max(1, ...topStations.map((s) => s.pm2));

  // Chart 2: Dual Line + Area chart geometry
  const mXs = [98, 270, 442];
  const mTop = 28;
  const mBottom = 172;
  const mH = mBottom - mTop;
  const maxMonthN = Math.max(1, ...monthsData.map((m) => m.n));
  const validPrices = monthsData.filter((m) => m.price > 0).map((m) => m.price);
  const minMonthP = validPrices.length ? Math.min(...validPrices) * 0.95 : 0;
  const maxMonthP = validPrices.length ? Math.max(...validPrices) * 1.04 : 1;
  const spanMonthP = Math.max(1, maxMonthP - minMonthP);

  const monthNPts = monthsData.map((m, i) => ({
    x: mXs[i],
    y: mBottom - (m.n / maxMonthN) * (mH - 12),
  }));
  const monthPPts = monthsData.map((m, i) => ({
    x: mXs[i],
    y: m.price > 0 ? mBottom - ((m.price - minMonthP) / spanMonthP) * (mH - 22) - 8 : mBottom,
  }));
  const monthNLine = monthNPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const monthNArea = `${monthNLine} L ${monthNPts[2].x} ${mBottom} L ${monthNPts[0].x} ${mBottom} Z`;
  const monthPLine = monthPPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Chart 3: Scatter / Marker chart for Walk Distance with Reference Median Line
  const activeWalkPm2s = walkData.filter((w) => w.pm2 > 0).map((w) => w.pm2);
  const wMin = Math.min(refMedianPm2, ...(activeWalkPm2s.length ? activeWalkPm2s : [170000])) * 0.92;
  const wMax = Math.max(refMedianPm2, ...(activeWalkPm2s.length ? activeWalkPm2s : [240000])) * 1.05;
  const wSpan = Math.max(1, wMax - wMin);
  const wTop = 26;
  const wBottom = 186;
  const wH = wBottom - wTop;
  const refMedianY = wBottom - ((refMedianPm2 - wMin) / wSpan) * wH;

  const walkPoints = walkData.map((w, idx) => {
    const x = 82 + idx * 69;
    const y = w.pm2 > 0 ? wBottom - ((w.pm2 - wMin) / wSpan) * wH : wBottom;
    return { ...w, x, y, idx };
  });
  const populatedWalkPts = walkPoints.filter((p) => p.pm2 > 0);
  const walkTrendPath = populatedWalkPts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  // Chart 4: Histogram with Median Bin Highlight & Reference Line
  const maxHistN = Math.max(1, ...histData.map((h) => h.n));
  const medianBinIdx = Math.min(19, Math.max(0, Math.floor(refMedianPrice / 2_000_000)));
  const medianX = 24 + (refMedianPrice / 40_000_000) * 498;
  const medianClampedX = Math.min(516, Math.max(28, medianX));

  // Chart 5 & 6 bounds
  const maxFloorPm2 = Math.max(1, floorData.first.pm2, floorData.mid.pm2, floorData.last.pm2);
  const maxSourceN = Math.max(1, ...sourcesData.map((s) => s.n));

  const floorRows = [
    { key: 'first', label: 'Первый этаж', item: floorData.first, color: '#0284C7' },
    { key: 'mid', label: 'Средние этажи', item: floorData.mid, color: '#1B3A6B' },
    { key: 'last', label: 'Последний этаж', item: floorData.last, color: '#334155' },
  ] as const;

  return (
    <section id="charts" aria-labelledby="charts-heading" className="space-y-6">
      {/* Header + Scope Toggle */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 id="charts-heading" className="text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance] sm:text-3xl">
            Аналитика рынка
          </h1>
          <p className="mt-1 text-sm text-slate-600 tabular-nums">
            {showMarket
              ? `Все 6 срезов по полному массиву (${DATA_META.stations} станций) · клик по станции или площадке применяет фильтр`
              : `Пересчитано по активным фильтрам (${formatInt(stats.count)} лотов) · переключитесь на «Весь рынок» для сравнения`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isUnfiltered && (
            <div
              role="group"
              aria-label="Источник данных для графиков"
              className="inline-flex rounded-lg border border-slate-200 bg-white p-1"
            >
              <button
                type="button"
                onClick={() => setScope('filtered')}
                className={`min-h-[34px] cursor-pointer rounded-md px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  scope === 'filtered'
                    ? 'bg-[#1B3A6B] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                По фильтрам ({formatInt(stats.count)})
              </button>
              <button
                type="button"
                onClick={() => setScope('market')}
                className={`min-h-[34px] cursor-pointer rounded-md px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  scope === 'market'
                    ? 'bg-[#1B3A6B] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Весь рынок
              </button>
            </div>
          )}

          {!isUnfiltered && onGoToBase && (
            <button
              type="button"
              onClick={onGoToBase}
              className="inline-flex min-h-[42px] cursor-pointer items-center rounded-lg border border-[#1B3A6B] bg-white px-3.5 text-xs font-semibold text-[#1B3A6B] hover:bg-sky-50 whitespace-nowrap shrink-0"
            >
              Открыть эти лоты в Базе →
            </button>
          )}
        </div>
      </div>

      {/* 2-Column Diverse Charts Grid */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* 1. Top-20 Stations: Gradient Horizontal Bars by Rank */}
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Топ-20 станций по объёму предложения
              </h2>
              <p className="text-xs text-slate-500">
                Градиент по рангу · клик по строке фильтрует базу по станции
              </p>
            </div>
            {filters.metroId !== null && (
              <button
                type="button"
                onClick={() => onSelectMetro(null)}
                className="cursor-pointer text-xs font-semibold text-[#1B3A6B] hover:underline whitespace-nowrap shrink-0"
              >
                Сбросить метро
              </button>
            )}
          </div>

          {topStations.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Нет данных по выбранным фильтрам
            </div>
          ) : (
            <div>
              <svg
                viewBox={`0 0 580 ${Math.max(120, topStations.length * 24 + 10)}`}
                className="w-full"
                role="img"
                aria-label="Горизонтальная диаграмма топ-20 станций метро по стоимости квадратного метра"
              >
                <defs>
                  <linearGradient id="analyticsRankGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#1B3A6B" />
                    <stop offset="100%" stopColor="#0284C7" />
                  </linearGradient>
                </defs>
                {topStations.map((st, idx) => {
                  const y = idx * 24 + 4;
                  const barMaxW = 196;
                  const barW = Math.max(8, (st.pm2 / maxStationPm2) * barMaxW);
                  const isSelected = filters.metroId === st.metroId;
                  const isHovered = hoveredStation === idx;
                  const opacity = Math.max(0.45, 1 - idx * 0.025);

                  return (
                    <g
                      key={st.name}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredStation(idx)}
                      onMouseLeave={() => setHoveredStation(null)}
                      onClick={() => onSelectMetro(isSelected ? null : st.metroId)}
                    >
                      <rect
                        x="0"
                        y={y - 2}
                        width="580"
                        height="22"
                        rx="4"
                        fill={isSelected ? '#EFF6FF' : isHovered ? '#F8FAFC' : 'transparent'}
                      />
                      <text
                        x="4"
                        y={y + 13}
                        fontSize="11"
                        fontWeight={isSelected ? '700' : '500'}
                        fill={isSelected ? '#1B3A6B' : '#334155'}
                      >
                        {idx + 1}. {st.name.length > 20 ? `${st.name.slice(0, 19)}…` : st.name}
                      </text>
                      <rect
                        x="176"
                        y={y + 3}
                        width={barW}
                        height="12"
                        rx="3"
                        fill={isSelected || isHovered ? '#0284C7' : 'url(#analyticsRankGrad)'}
                        fillOpacity={isSelected || isHovered ? 1 : opacity}
                      />
                      <text
                        x={182 + barW}
                        y={y + 13}
                        fontSize="10.5"
                        fontFamily="var(--font-mono)"
                        fontWeight="600"
                        fill="#0F172A"
                      >
                        {formatInt(st.pm2)} ₽/м² · {formatInt(st.n)}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <div className="mt-2 min-h-[30px] rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 tabular-nums">
                {hoveredStation !== null && topStations[hoveredStation] ? (
                  <span className="inline-flex flex-wrap items-center gap-x-2">
                    <span className="font-bold text-slate-900">м. {topStations[hoveredStation].name}</span>
                    <span className="whitespace-nowrap">{formatPm2(topStations[hoveredStation].pm2)}</span>
                    <span className="whitespace-nowrap">медиана {formatRubCompact(topStations[hoveredStation].price)}</span>
                    <span className="whitespace-nowrap">{formatInt(topStations[hoveredStation].n)} лотов</span>
                    {topStations[hoveredStation].days > 0 && (
                      <span className="whitespace-nowrap">{topStations[hoveredStation].days} дн.</span>
                    )}
                  </span>
                ) : (
                  <span>Наведите на станцию для подробностей или кликните для фильтрации</span>
                )}
              </div>
            </div>
          )}
        </article>

        {/* 2. Monthly Dynamics: Dual Line + Area Chart */}
        <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Динамика по месяцам (линии и область)
                </h2>
                <p className="text-xs text-slate-500">
                  Сплошная линия — объём лотов, пунктир — медианная цена квартиры
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="h-0.5 w-3.5 bg-[#1B3A6B]" />
                  <span>Лоты</span>
                </span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="h-0.5 w-3.5 border-t-2 border-dashed border-[#0284C7]" />
                  <span>Цена ₽</span>
                </span>
              </div>
            </div>

            <svg
              viewBox="0 0 540 225"
              className="w-full"
              role="img"
              aria-label="Линейный график с областью динамики объявлений и цены по месяцам"
            >
              <defs>
                <linearGradient id="analyticsMonthArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1B3A6B" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#1B3A6B" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const y = mTop + (1 - t) * mH;
                const val = Math.round(t * maxMonthN);
                return (
                  <g key={t}>
                    <line x1="48" y1={y} x2="516" y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
                    <text
                      x="42"
                      y={y + 3.5}
                      textAnchor="end"
                      fontSize="9.5"
                      fontFamily="var(--font-mono)"
                      fill="#64748B"
                    >
                      {val >= 1000 ? `${Math.round(val / 1000)}k` : val}
                    </text>
                  </g>
                );
              })}

              <path d={monthNArea} fill="url(#analyticsMonthArea)" />
              <path d={monthNLine} fill="none" stroke="#1B3A6B" strokeWidth="2.5" strokeLinejoin="round" />
              <path
                d={monthPLine}
                fill="none"
                stroke="#0284C7"
                strokeWidth="2.2"
                strokeDasharray="6 4"
                strokeLinejoin="round"
              />

              {monthsData.map((m, idx) => {
                const np = monthNPts[idx];
                const pp = monthPPts[idx];
                const isHovered = hoveredMonth === idx;
                return (
                  <g
                    key={m.key}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredMonth(idx)}
                    onMouseLeave={() => setHoveredMonth(null)}
                  >
                    <rect x={mXs[idx] - 64} y={mTop - 10} width="128" height={mH + 46} fill="transparent" />
                    {isHovered && (
                      <line
                        x1={mXs[idx]}
                        y1={mTop}
                        x2={mXs[idx]}
                        y2={mBottom}
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
                    {m.price > 0 && (
                      <circle
                        cx={pp.x}
                        cy={pp.y}
                        r={isHovered ? 6 : 4.5}
                        fill="#0284C7"
                        stroke="#FFFFFF"
                        strokeWidth="2"
                      />
                    )}
                    <text
                      x={np.x}
                      y={np.y - 10}
                      textAnchor="middle"
                      fontSize="10.5"
                      fontFamily="var(--font-mono)"
                      fontWeight="700"
                      fill="#1B3A6B"
                    >
                      {formatInt(m.n)}
                    </text>
                    {m.price > 0 && (
                      <text
                        x={pp.x}
                        y={pp.y + 17}
                        textAnchor="middle"
                        fontSize="10"
                        fontFamily="var(--font-mono)"
                        fontWeight="700"
                        fill="#0369A1"
                      >
                        {formatRubCompact(m.price)}
                      </text>
                    )}
                    <text
                      x={mXs[idx]}
                      y="200"
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
              <text x="282" y="218" textAnchor="middle" fontSize="10" fill="#64748B">
                Месяц публикации (ось X) · число лотов (ось Y)
              </text>
            </svg>
          </div>

          <div className="mt-2 min-h-[30px] rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 tabular-nums">
            {hoveredMonth !== null && monthsData[hoveredMonth] ? (
              <span className="inline-flex flex-wrap items-center gap-x-2">
                <span className="font-bold text-slate-900">{monthsData[hoveredMonth].label}:</span>
                <span className="whitespace-nowrap">{formatInt(monthsData[hoveredMonth].n)} объявлений</span>
                <span className="whitespace-nowrap">
                  медиана {monthsData[hoveredMonth].price > 0 ? formatRub(monthsData[hoveredMonth].price) : '—'}
                </span>
              </span>
            ) : (
              <span>Наведите на точку графика для детализации по месяцу</span>
            )}
          </div>
        </article>

        {/* 3. Distance to Metro: Scatter + Reference Median Line */}
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3">
            <h2 className="text-base font-bold text-slate-900">
              Удалённость от метро: точки и линия медианы
            </h2>
            <p className="text-xs text-slate-500">
              Средняя цена ₽/м² по диапазонам минут пешком · пунктир — медиана среза ({formatPm2(refMedianPm2)})
            </p>
          </div>

          <svg
            viewBox="0 0 540 240"
            className="w-full"
            role="img"
            aria-label="Точечная диаграмма зависимости цены квадратного метра от времени пешком до метро с линией медианы"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = wTop + (1 - t) * wH;
              const val = Math.round(wMin + t * wSpan);
              return (
                <g key={t}>
                  <line x1="60" y1={y} x2="522" y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
                  <text
                    x="54"
                    y={y + 4}
                    textAnchor="end"
                    fontSize="10"
                    fontFamily="var(--font-mono)"
                    fill="#64748B"
                  >
                    {Math.round(val / 1000)}k
                  </text>
                </g>
              );
            })}

            {/* Reference Median Line */}
            {refMedianY >= wTop - 4 && refMedianY <= wBottom + 4 && (
              <g>
                <line
                  x1="60"
                  y1={refMedianY}
                  x2="522"
                  y2={refMedianY}
                  stroke="#0284C7"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                />
                <text
                  x="518"
                  y={refMedianY - 5}
                  textAnchor="end"
                  fontSize="9.5"
                  fontFamily="var(--font-mono)"
                  fontWeight="700"
                  fill="#0369A1"
                >
                  медиана {formatInt(refMedianPm2)} ₽/м²
                </text>
              </g>
            )}

            {/* Connecting Trendline */}
            {populatedWalkPts.length >= 2 && (
              <path
                d={walkTrendPath}
                fill="none"
                stroke="#1B3A6B"
                strokeWidth="2"
                strokeOpacity="0.65"
              />
            )}

            {/* Scatter Markers */}
            {walkPoints.map((pt) => {
              const isHovered = hoveredWalk === pt.idx;
              const r = pt.pm2 > 0 ? Math.min(11, Math.max(5, 4 + Math.sqrt(pt.n / 4000) * 3)) : 0;
              return (
                <g
                  key={pt.label}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredWalk(pt.idx)}
                  onMouseLeave={() => setHoveredWalk(null)}
                >
                  <rect x={pt.x - 32} y={wTop - 6} width="64" height={wH + 34} fill="transparent" />
                  {pt.pm2 > 0 && (
                    <>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isHovered ? r + 2.5 : r}
                        fill={pt.pm2 >= refMedianPm2 ? '#1B3A6B' : '#0284C7'}
                        fillOpacity="0.9"
                        stroke="#FFFFFF"
                        strokeWidth="2"
                      />
                      <text
                        x={pt.x}
                        y={pt.y - r - 6}
                        textAnchor="middle"
                        fontSize="10"
                        fontFamily="var(--font-mono)"
                        fontWeight="700"
                        fill="#0F172A"
                      >
                        {Math.round(pt.pm2 / 1000)}k
                      </text>
                    </>
                  )}
                  <text x={pt.x} y="208" textAnchor="middle" fontSize="10.5" fill="#475569">
                    {pt.label}
                  </text>
                </g>
              );
            })}
            <text x="290" y="228" textAnchor="middle" fontSize="10" fill="#64748B">
              Пешая доступность от станции (размер точки ~ числу лотов)
            </text>
          </svg>

          <div className="mt-2 min-h-[30px] rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 tabular-nums">
            {hoveredWalk !== null && walkData[hoveredWalk] ? (
              <span className="inline-flex flex-wrap items-center gap-x-2">
                <span className="font-bold text-slate-900">{walkData[hoveredWalk].label} пешком:</span>
                <span className="whitespace-nowrap">
                  {walkData[hoveredWalk].pm2 > 0 ? formatPm2(walkData[hoveredWalk].pm2) : 'нет лотов'}
                </span>
                <span className="whitespace-nowrap">{formatInt(walkData[hoveredWalk].n)} объявлений</span>
              </span>
            ) : (
              <span>Наведите на маркер зоны, чтобы увидеть точную стоимость м² и число лотов</span>
            )}
          </div>
        </article>

        {/* 4. Price Histogram with Median Reference Line & Highlighted Bin */}
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3">
            <h2 className="text-base font-bold text-slate-900">
              Распределение цен до 40 млн ₽ (шаг 2 млн)
            </h2>
            <p className="text-xs text-slate-500">
              Выделен столбец с медианой выборки ({(refMedianPrice / 1_000_000).toFixed(2).replace('.', ',')} млн ₽)
            </p>
          </div>

          <svg
            viewBox="0 0 540 230"
            className="w-full"
            role="img"
            aria-label="Гистограмма распределения цен квартир с вертикальной линией медианы"
          >
            {[0, 0.5, 1].map((t) => {
              const y = 26 + (1 - t) * 150;
              return (
                <line key={t} x1="22" y1={y} x2="526" y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
              );
            })}

            {histData.map((bin, idx) => {
              const slotW = 500 / histData.length;
              const barW = slotW - 4;
              const x = 24 + idx * slotW;
              const h = bin.n > 0 ? Math.max(3, (bin.n / maxHistN) * 150) : 1;
              const y = 176 - h;
              const isHovered = hoveredHist === idx;
              const isMedianBin = idx === medianBinIdx;

              return (
                <g
                  key={bin.label}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredHist(idx)}
                  onMouseLeave={() => setHoveredHist(null)}
                >
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    rx="2"
                    fill={
                      isHovered
                        ? '#0284C7'
                        : isMedianBin
                        ? '#0284C7'
                        : '#1B3A6B'
                    }
                    fillOpacity={isHovered || isMedianBin ? 1 : 0.72}
                  />
                  {idx % 2 === 0 && (
                    <text
                      x={x + barW / 2}
                      y="195"
                      textAnchor="middle"
                      fontSize="9.5"
                      fontFamily="var(--font-mono)"
                      fill="#64748B"
                    >
                      {idx * 2}м
                    </text>
                  )}
                </g>
              );
            })}

            {/* Vertical Median Reference Line */}
            <line
              x1={medianClampedX}
              y1="14"
              x2={medianClampedX}
              y2="178"
              stroke="#0F172A"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            <rect
              x={Math.min(370, Math.max(24, medianClampedX + 6))}
              y="10"
              width="148"
              height="20"
              rx="4"
              fill="#0F172A"
            />
            <text
              x={Math.min(370, Math.max(24, medianClampedX + 6)) + 74}
              y="23.5"
              textAnchor="middle"
              fontSize="10"
              fontFamily="var(--font-mono)"
              fontWeight="700"
              fill="#FFFFFF"
            >
              медиана {(refMedianPrice / 1_000_000).toFixed(2).replace('.', ',')} млн ₽
            </text>

            <text x="275" y="217" textAnchor="middle" fontSize="10" fill="#64748B">
              Бюджет квартиры, млн ₽ (ось X) · число объявлений (ось Y)
            </text>
          </svg>

          <div className="mt-2 min-h-[30px] rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 tabular-nums">
            {hoveredHist !== null && histData[hoveredHist] ? (
              <span className="inline-flex flex-wrap items-center gap-x-2">
                <span className="font-bold text-slate-900">Бюджет {histData[hoveredHist].label}:</span>
                <span className="whitespace-nowrap">{formatInt(histData[hoveredHist].n)} объявлений</span>
              </span>
            ) : (
              <span>Наведите на столбец гистограммы для просмотра точного числа лотов</span>
            )}
          </div>
        </article>

        {/* 5. Floor Comparison with % Deviation & Tooltip */}
        <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-900">
                Этажи: отклонение цены м² от средних этажей
              </h2>
              <p className="text-xs text-slate-500">
                Сравнительные полосы с % дисконта и объёмом предложения в подсказке
              </p>
            </div>

            <div className="space-y-4">
              {floorRows.map((row, idx) => {
                const pct = maxFloorPm2 > 0 ? (row.item.pm2 / maxFloorPm2) * 100 : 0;
                const diffNum =
                  floorData.mid.pm2 > 0 && row.key !== 'mid' && row.item.pm2 > 0
                    ? ((row.item.pm2 - floorData.mid.pm2) / floorData.mid.pm2) * 100
                    : null;
                const diffStr =
                  diffNum !== null
                    ? `${diffNum > 0 ? '+' : ''}${diffNum.toFixed(1).replace('.', ',')}%`
                    : 'база (0%)';

                return (
                  <div
                    key={row.key}
                    onMouseEnter={() => setHoveredFloor(idx)}
                    onMouseLeave={() => setHoveredFloor(null)}
                    className={`rounded-lg border p-3 transition-colors ${
                      hoveredFloor === idx ? 'border-slate-300 bg-slate-50' : 'border-slate-100 bg-white'
                    }`}
                  >
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-semibold text-slate-800">{row.label}</span>
                      <span className="inline-flex items-baseline gap-2 font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        <span>{row.item.pm2 > 0 ? formatPm2(row.item.pm2) : 'нет данных'}</span>
                        <span className="text-xs font-semibold text-[#0369A1]">{diffStr}</span>
                      </span>
                    </div>
                    <div className="h-4 w-full overflow-hidden rounded bg-slate-100">
                      <div
                        className="h-full rounded transition-all duration-300"
                        style={{ width: `${Math.max(2, pct)}%`, backgroundColor: row.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 min-h-[30px] rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 tabular-nums">
            {hoveredFloor !== null && floorRows[hoveredFloor] ? (
              <span className="inline-flex flex-wrap items-center gap-x-2">
                <span className="font-bold text-slate-900">{floorRows[hoveredFloor].label}:</span>
                <span className="whitespace-nowrap">{formatInt(floorRows[hoveredFloor].item.n)} объявлений</span>
                <span className="whitespace-nowrap">
                  {floorRows[hoveredFloor].item.pm2 > 0
                    ? formatPm2(floorRows[hoveredFloor].item.pm2)
                    : '—'}
                </span>
              </span>
            ) : (
              <span>Наведите на полосу этажа, чтобы увидеть число объявлений в сегменте</span>
            )}
          </div>
        </article>

        {/* 6. Sources Comparison with % Deviation & Exposition Tooltip */}
        <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Источники: объём, цена м² и отклонение от медианы
                </h2>
                <p className="text-xs text-slate-500">
                  Наведите для срока экспозиции; клик по площадке фильтрует базу
                </p>
              </div>
              {filters.srcId !== null && (
                <button
                  type="button"
                  onClick={() => onSelectSource(null)}
                  className="cursor-pointer text-xs font-semibold text-[#1B3A6B] hover:underline whitespace-nowrap shrink-0"
                >
                  Все площадки
                </button>
              )}
            </div>

            <div className="space-y-2">
              {sourcesData.map((src, idx) => {
                const widthPct = maxSourceN > 0 ? (src.n / maxSourceN) * 100 : 0;
                const isSelected = filters.srcId === src.srcId;
                const isHovered = hoveredSource === idx;
                const devPct =
                  src.pm2 > 0 && refMedianPm2 > 0
                    ? ((src.pm2 - refMedianPm2) / refMedianPm2) * 100
                    : null;
                const devLabel =
                  devPct !== null
                    ? `${devPct >= 0 ? '+' : ''}${devPct.toFixed(1).replace('.', ',')}%`
                    : '—';

                return (
                  <button
                    key={src.key}
                    type="button"
                    onMouseEnter={() => setHoveredSource(idx)}
                    onMouseLeave={() => setHoveredSource(null)}
                    onClick={() => onSelectSource(isSelected ? null : src.srcId)}
                    className={`block w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? 'border-[#1B3A6B] bg-sky-50/70'
                        : isHovered
                        ? 'border-slate-300 bg-slate-50'
                        : 'border-slate-100 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-900">{src.label}</span>
                      <span className="inline-flex items-baseline gap-2 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                        <span>{formatInt(src.n)} шт.</span>
                        <span>{src.pm2 > 0 ? formatPm2(src.pm2) : '—'}</span>
                        <span className="font-semibold text-[#0369A1]">{devLabel}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded bg-slate-100">
                      <div
                        className="h-full rounded transition-all"
                        style={{
                          width: `${Math.max(1.5, widthPct)}%`,
                          backgroundColor: isSelected ? '#0284C7' : '#1B3A6B',
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 min-h-[30px] rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 tabular-nums">
            {hoveredSource !== null && sourcesData[hoveredSource] ? (
              <span className="inline-flex flex-wrap items-center gap-x-2">
                <span className="font-bold text-slate-900">{sourcesData[hoveredSource].label}:</span>
                <span className="whitespace-nowrap">
                  экспозиция{' '}
                  {sourcesData[hoveredSource].days !== null
                    ? `${sourcesData[hoveredSource].days} дн.`
                    : 'нет данных'}
                </span>
                <span className="whitespace-nowrap">
                  {sourcesData[hoveredSource].pm2 > 0
                    ? formatPm2(sourcesData[hoveredSource].pm2)
                    : '—'}
                </span>
              </span>
            ) : (
              <span>Наведите на площадку, чтобы увидеть медианный срок экспозиции в днях</span>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
