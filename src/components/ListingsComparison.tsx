import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Award,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  MapPin,
  Plus,
  Scale,
  Trash2,
  X,
} from 'lucide-react';
import { DATA_DICT } from '../data/rawSeedRows';
import {
  HTYPE_LABELS_RU,
  ROOMS_LABELS_RU,
  SRC_LABELS_RU,
  TOTAL_ROWS,
  computeComparisonVerdictParts,
  exportFilteredToCsv,
  formatArea,
  formatDays,
  formatInt,
  formatListingDate,
  formatPm2,
  formatRub,
  getStationRoomBaselinePm2,
  readListing,
  sortListingIds,
} from '../data/marketEngine';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import type { SortDir, SortField } from '../types/market';

interface ComparisonSectionProps {
  selectedIds: number[];
  onToggleSelect: (id: number) => void;
  onClearSelected: () => void;
  onGoToBase: () => void;
  onLoadExampleComparison: () => void;
}

export function ComparisonSection({
  selectedIds,
  onToggleSelect,
  onClearSelected,
  onGoToBase,
  onLoadExampleComparison,
}: ComparisonSectionProps) {
  const selectedRecords = useMemo(
    () => selectedIds.map((id) => readListing(id)),
    [selectedIds]
  );

  const verdictParts = useMemo(
    () => computeComparisonVerdictParts(selectedRecords),
    [selectedRecords]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance] sm:text-3xl">
            Сравнение выбранных квартир ({selectedRecords.length} из 3)
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Сопоставьте лоты бок о бок: отклонение от медианы считается отдельно по каждой станции и комнатности.
          </p>
        </div>

        {selectedRecords.length > 0 && (
          <button
            type="button"
            onClick={onClearSelected}
            className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Очистить выбор</span>
          </button>
        )}
      </div>

      {selectedRecords.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-xs">
          <Scale className="mx-auto h-10 w-10 text-[#1B3A6B]/70" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-slate-900">
            Выберите 2–3 квартиры в разделе «База»
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">
            Поставьте галочки в левой колонке таблицы объявлений, чтобы сразу увидеть карточки сравнения и вердикт аналитики.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onGoToBase}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg bg-[#1B3A6B] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#152E56] whitespace-nowrap shrink-0"
            >
              <span>Перейти в Базу</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onLoadExampleComparison}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <span>Загрузить пример (3 лота)</span>
            </button>
          </div>
        </section>
      ) : (
        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          {/* Prominent Structured Verdict Panel */}
          <div className="flex items-start gap-3.5 rounded-xl border-2 border-[#1B3A6B]/25 bg-[#1B3A6B]/[0.05] p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1B3A6B] text-white shadow-xs">
              <Award className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wide text-[#1B3A6B]">
                Вердикт аналитики
              </div>
              <p className="mt-1 text-lg font-bold leading-snug text-slate-900 sm:text-xl">
                {verdictParts.headline}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700 sm:text-base">
                {verdictParts.reason}
              </p>
            </div>
          </div>

          {/* Horizontal scroll on mobile */}
          <div className="flex gap-4 overflow-x-auto pb-2">
            {selectedRecords.map((item) => {
              const metroName = DATA_DICT.metro[item.metroId] || 'Не указано';
              const roomLabel = ROOMS_LABELS_RU[DATA_DICT.rooms[item.roomsId]] || '—';
              const htypeLabel = HTYPE_LABELS_RU[DATA_DICT.htype[item.htypeId]] || '—';
              const srcLabel = SRC_LABELS_RU[DATA_DICT.src[item.srcId]] || '—';
              const balconyLabel = DATA_DICT.balcony[item.balconyId] || 'нет';
              const bathLabel = DATA_DICT.bath[item.bathId] || 'нет';
              const baselinePm2 = getStationRoomBaselinePm2(item.metroId, item.roomsId);
              const devPct = ((item.pm2 - baselinePm2) / baselinePm2) * 100;
              const isCheaper = devPct <= 0;
              const signedDev = `${isCheaper ? '−' : '+'}${Math.abs(devPct).toFixed(1).replace('.', ',')}%`;
              const isWinner = verdictParts.bestId === item.id;

              return (
                <article
                  key={item.id}
                  className={`min-w-[290px] flex-1 rounded-xl border p-4 ${
                    isWinner
                      ? 'border-emerald-300 bg-emerald-50/35'
                      : 'border-slate-200 bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
                    <div>
                      <div className="font-mono text-xs font-semibold text-slate-600 whitespace-nowrap">
                        Лот №{item.id + 1} · {roomLabel}
                      </div>
                      <h2 className="mt-0.5 text-base font-bold text-slate-900">
                        м. {metroName}
                      </h2>
                      <p className="text-xs text-slate-600 whitespace-nowrap tabular-nums">
                        {item.minutes} мин {item.way === 0 ? 'пешком' : 'транспортом'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleSelect(item.id)}
                      className="cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-900 whitespace-nowrap"
                    >
                      Убрать
                    </button>
                  </div>

                  <div className="mt-3">
                    <div className="font-mono text-xl font-bold text-slate-900 tabular-nums whitespace-nowrap sm:text-2xl">
                      {formatRub(item.price)}
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-[#1B3A6B] tabular-nums whitespace-nowrap">
                      {formatPm2(item.pm2)}
                    </div>

                    {/* Large Colored Median Deviation */}
                    <div className="mt-3 rounded-lg border border-slate-200/80 bg-white px-3.5 py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`font-mono text-xl font-extrabold tabular-nums whitespace-nowrap sm:text-2xl ${
                            isCheaper ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {signedDev}
                        </span>
                        <span
                          className={`text-xs font-bold whitespace-nowrap ${
                            isCheaper ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {isCheaper ? 'выгоднее медианы' : 'дороже медианы'}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-600">
                        ориентир {metroName} ({roomLabel}):{' '}
                        <span className="font-mono font-semibold text-slate-800 whitespace-nowrap">
                          {formatPm2(baselinePm2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-slate-200 pt-3 text-xs">
                    <div>
                      <dt className="text-slate-500">Площадь</dt>
                      <dd className="font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatArea(item.area)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Жилая / кухня</dt>
                      <dd className="font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {item.livingArea.toFixed(1).replace('.', ',')} /{' '}
                        {item.kitchenArea.toFixed(1).replace('.', ',')} м²
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Этаж</dt>
                      <dd className="font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {item.floor} из {item.floorsTotal}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Тип дома</dt>
                      <dd className="font-semibold text-slate-900 whitespace-nowrap">{htypeLabel}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Балкон / санузел</dt>
                      <dd className="font-semibold text-slate-900 whitespace-nowrap">
                        {balconyLabel} / {bathLabel}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Экспозиция / база</dt>
                      <dd className="font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatDays(item.daysExp)} · {srcLabel}
                      </dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>

          {selectedRecords.length < 3 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-slate-600">
              <span>Вы можете добавить ещё {3 - selectedRecords.length} лот(а) из таблицы в разделе «База».</span>
              <button
                type="button"
                onClick={onGoToBase}
                className="cursor-pointer font-semibold text-[#1B3A6B] hover:underline whitespace-nowrap"
              >
                Добавить ещё квартиры →
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

interface ListingsTableSectionProps {
  matchedIds: Int32Array;
  selectedIds: number[];
  onToggleSelect: (id: number) => void;
  onGoToComparison: () => void;
  elapsedMs: number;
}

const PAGE_SIZE = 20;

export function ListingsTableSection({
  matchedIds,
  selectedIds,
  onToggleSelect,
  onGoToComparison,
  elapsedMs,
}: ListingsTableSectionProps) {
  const [sortField, setSortField] = useState<SortField>('price');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);
  const [activeListingId, setActiveListingId] = useState<number | null>(null);

  useBodyScrollLock(activeListingId !== null);

  useEffect(() => {
    setPage(0);
  }, [matchedIds, sortField, sortDir]);

  useEffect(() => {
    if (activeListingId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveListingId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeListingId]);

  const sortedIds = useMemo(
    () => sortListingIds(matchedIds, sortField, sortDir),
    [matchedIds, sortField, sortDir]
  );

  const totalPages = Math.max(1, Math.ceil(sortedIds.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  const pageRecords = useMemo(() => {
    const start = safePage * PAGE_SIZE;
    const end = Math.min(sortedIds.length, start + PAGE_SIZE);
    const items = [];
    for (let i = start; i < end; i++) {
      items.push(readListing(sortedIds[i]));
    }
    return items;
  }, [sortedIds, safePage]);

  const activeListing = useMemo(() => {
    if (activeListingId === null) return null;
    return readListing(activeListingId);
  }, [activeListingId]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 shrink-0 text-[#1B3A6B]" aria-hidden="true" />
    ) : (
      <ArrowDown className="h-3 w-3 shrink-0 text-[#1B3A6B]" aria-hidden="true" />
    );
  };

  return (
    <section
      aria-labelledby="table-heading"
      className="rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b border-slate-200 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 id="table-heading" className="text-lg font-bold text-slate-900">
            Список объявлений
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-600 tabular-nums">
            <span className="whitespace-nowrap">
              Найдено {formatInt(matchedIds.length)} из {formatInt(TOTAL_ROWS)}
            </span>
            <span className="whitespace-nowrap">· пересчитано за {elapsedMs} мс</span>
            <span className="whitespace-nowrap">
              · стр. {safePage + 1} из {formatInt(totalPages)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600">
          {/* Bright High-Contrast Primary Accent CSV Download CTA */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={sortedIds.length === 0}
              onClick={() => exportFilteredToCsv(sortedIds)}
              title={`Будет выгружено ${formatInt(sortedIds.length)} строк в формате CSV для Excel`}
              className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg bg-[#0284C7] px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#0369A1] disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B3A6B]"
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Скачать CSV</span>
            </button>
            <span className="font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
              {formatInt(sortedIds.length)} строк в файл
            </span>
          </div>

          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={onGoToComparison}
              className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg bg-[#1B3A6B] px-3.5 text-xs font-semibold text-white hover:bg-[#152E56] whitespace-nowrap shrink-0"
            >
              <span>Сравнить ({selectedIds.length})</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Subtle hint bar for row click & comparison */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs text-slate-600 sm:px-5">
        <span>Нажмите на любую строку, чтобы открыть полную карточку квартиры.</span>
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 whitespace-nowrap">
          <CheckSquare className="h-3.5 w-3.5 text-[#1B3A6B]" aria-hidden="true" />
          <span>Галочки — для сравнения до 3 лотов</span>
        </span>
      </div>

      {/* Mobile Vertical Card-Rows (< 768px): Zero Horizontal Scroll */}
      <div className="divide-y divide-slate-200 md:hidden">
        {pageRecords.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            По заданным фильтрам объявления не найдены. Попробуйте расширить бюджет или сбросить ограничения.
          </div>
        ) : (
          pageRecords.map((item) => {
            const checked = selectedIds.includes(item.id);
            const disabled = !checked && selectedIds.length >= 3;
            const metroName = DATA_DICT.metro[item.metroId] || 'Без привязки';
            const roomLabel = ROOMS_LABELS_RU[DATA_DICT.rooms[item.roomsId]] || '—';
            const htypeLabel = HTYPE_LABELS_RU[DATA_DICT.htype[item.htypeId]] || '—';
            const srcLabel = SRC_LABELS_RU[DATA_DICT.src[item.srcId]] || '—';

            return (
              <div
                key={item.id}
                onClick={() => setActiveListingId(item.id)}
                className={`cursor-pointer p-4 transition-colors ${
                  checked ? 'bg-sky-50/75' : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        aria-label={`Выбрать квартиру №${item.id + 1} у метро ${metroName} для сравнения`}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => onToggleSelect(item.id)}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-[#1B3A6B] focus:ring-[#1B3A6B] disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-slate-900" title={`м. ${metroName}`}>
                        м. {metroName}
                      </div>
                      <div className="text-xs text-slate-600 tabular-nums">
                        {roomLabel} · Лот №{item.id + 1}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="font-mono text-sm font-bold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatRub(item.price)}
                    </div>
                    <div className="font-mono text-xs font-semibold text-[#1B3A6B] tabular-nums whitespace-nowrap">
                      {formatPm2(item.pm2)}
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6.5 text-xs text-slate-600 tabular-nums">
                  <span className="font-mono font-semibold text-slate-800 whitespace-nowrap">
                    {formatArea(item.area)}
                  </span>
                  <span className="whitespace-nowrap">
                    {item.floor}/{item.floorsTotal} эт. · {htypeLabel}
                  </span>
                  <span className="whitespace-nowrap">
                    {item.minutes} мин {item.way === 0 ? 'пешком' : 'трансп.'}
                  </span>
                  <span className="whitespace-nowrap text-slate-500">
                    {formatDays(item.daysExp)} · {srcLabel}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop / Tablet Full-Fit Table (>= 768px): Zero Horizontal Scrollbar */}
      <div className="hidden md:block">
        <table className="w-full border-collapse text-left text-[11.5px] xl:text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10.5px] font-semibold uppercase tracking-wide text-slate-600 xl:text-xs">
              <th className="w-10 px-1 py-2.5 text-center whitespace-nowrap xl:w-12 xl:px-2">
                Выбор
              </th>
              <th className="w-full max-w-0 px-1.5 py-2.5 whitespace-nowrap xl:px-3">Метро</th>
              <th className="px-1 py-2.5 whitespace-nowrap xl:px-2.5">
                <button
                  type="button"
                  onClick={() => handleSort('area')}
                  className="inline-flex cursor-pointer items-center gap-0.5 hover:text-slate-900 whitespace-nowrap"
                >
                  <span>Площадь</span>
                  {renderSortIcon('area')}
                </button>
              </th>
              <th className="px-1 py-2.5 whitespace-nowrap xl:px-2.5">Этаж</th>
              <th className="px-1 py-2.5 whitespace-nowrap xl:px-2.5">
                <button
                  type="button"
                  onClick={() => handleSort('minutes')}
                  className="inline-flex cursor-pointer items-center gap-0.5 hover:text-slate-900 whitespace-nowrap"
                >
                  <span>До метро</span>
                  {renderSortIcon('minutes')}
                </button>
              </th>
              <th className="px-1 py-2.5 text-right whitespace-nowrap xl:px-2.5">
                <button
                  type="button"
                  onClick={() => handleSort('price')}
                  className="inline-flex cursor-pointer items-center gap-0.5 hover:text-slate-900 whitespace-nowrap"
                >
                  <span>Цена</span>
                  {renderSortIcon('price')}
                </button>
              </th>
              <th className="px-1 py-2.5 text-right whitespace-nowrap xl:px-2.5">
                <button
                  type="button"
                  onClick={() => handleSort('pm2')}
                  className="inline-flex cursor-pointer items-center gap-0.5 hover:text-slate-900 whitespace-nowrap"
                >
                  <span>₽/м²</span>
                  {renderSortIcon('pm2')}
                </button>
              </th>
              <th className="px-1 py-2.5 text-right whitespace-nowrap xl:px-3">
                <button
                  type="button"
                  onClick={() => handleSort('days')}
                  className="inline-flex cursor-pointer items-center gap-0.5 hover:text-slate-900 whitespace-nowrap"
                >
                  <span>Экспоз.</span>
                  {renderSortIcon('days')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRecords.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">
                  По заданным фильтрам объявления не найдены. Попробуйте расширить бюджет или сбросить ограничения.
                </td>
              </tr>
            ) : (
              pageRecords.map((item) => {
                const checked = selectedIds.includes(item.id);
                const disabled = !checked && selectedIds.length >= 3;
                const metroName = DATA_DICT.metro[item.metroId] || 'Без привязки';
                const roomLabel = ROOMS_LABELS_RU[DATA_DICT.rooms[item.roomsId]] || '—';
                const htypeLabel = HTYPE_LABELS_RU[DATA_DICT.htype[item.htypeId]] || '—';
                const srcLabel = SRC_LABELS_RU[DATA_DICT.src[item.srcId]] || '—';

                return (
                  <tr
                    key={item.id}
                    onClick={() => setActiveListingId(item.id)}
                    className={`cursor-pointer transition-colors ${
                      checked ? 'bg-sky-50/75 hover:bg-sky-100/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td
                      className="px-1 py-2.5 text-center xl:px-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        aria-label={`Выбрать квартиру №${item.id + 1} у метро ${metroName} для сравнения`}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => onToggleSelect(item.id)}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-[#1B3A6B] focus:ring-[#1B3A6B] disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </td>
                    <td className="w-full max-w-0 px-1.5 py-2.5 xl:px-3">
                      <div
                        className="truncate font-semibold text-slate-900"
                        title={`м. ${metroName}`}
                      >
                        м. {metroName}
                      </div>
                      <div className="text-[11px] text-slate-600 tabular-nums whitespace-nowrap xl:text-xs">
                        {roomLabel} · №{item.id + 1}
                      </div>
                    </td>
                    <td className="px-1 py-2.5 font-mono text-slate-800 tabular-nums whitespace-nowrap xl:px-2.5">
                      <div>{formatArea(item.area)}</div>
                      <div className="text-[11px] text-slate-500 xl:text-xs">
                        к. {item.kitchenArea.toFixed(1).replace('.', ',')} м²
                      </div>
                    </td>
                    <td className="px-1 py-2.5 text-slate-700 xl:px-2.5">
                      <div className="font-mono tabular-nums whitespace-nowrap">
                        {item.floor}/{item.floorsTotal} эт.
                      </div>
                      <div className="text-[11px] leading-tight text-slate-500 xl:text-xs xl:whitespace-nowrap">
                        {htypeLabel}
                      </div>
                    </td>
                    <td className="px-1 py-2.5 font-mono text-slate-700 tabular-nums whitespace-nowrap xl:px-2.5">
                      <div>{item.minutes} мин</div>
                      <div className="text-[11px] font-sans text-slate-500 xl:text-xs">
                        {item.way === 0 ? 'пешком' : 'трансп.'}
                      </div>
                    </td>
                    <td className="px-1 py-2.5 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap xl:px-2.5">
                      {formatRub(item.price)}
                    </td>
                    <td className="px-1 py-2.5 text-right font-mono font-semibold text-[#1B3A6B] tabular-nums whitespace-nowrap xl:px-2.5">
                      {formatPm2(item.pm2)}
                    </td>
                    <td className="px-1 py-2.5 text-right font-mono text-[11px] text-slate-600 tabular-nums whitespace-nowrap xl:px-3 xl:text-xs">
                      <div>{formatDays(item.daysExp)}</div>
                      <div className="font-sans text-slate-500">{srcLabel}</div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {sortedIds.length > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3.5 sm:px-5">
          <span className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
            Показаны {formatInt(safePage * PAGE_SIZE + 1)}–
            {formatInt(Math.min((safePage + 1) * PAGE_SIZE, sortedIds.length))} из{' '}
            {formatInt(sortedIds.length)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="inline-flex min-h-[38px] cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              <span>Назад</span>
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="inline-flex min-h-[38px] cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap"
            >
              <span>Вперёд</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Apartment Details Modal (Portal on document.body at z-[100] covering entire viewport) */}
      {activeListing &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const metroName = DATA_DICT.metro[activeListing.metroId] || 'Не указано';
            const roomLabel = ROOMS_LABELS_RU[DATA_DICT.rooms[activeListing.roomsId]] || '—';
            const htypeLabel = HTYPE_LABELS_RU[DATA_DICT.htype[activeListing.htypeId]] || '—';
            const srcLabel = SRC_LABELS_RU[DATA_DICT.src[activeListing.srcId]] || '—';
            const balconyLabel = DATA_DICT.balcony[activeListing.balconyId] || 'нет';
            const bathLabel = DATA_DICT.bath[activeListing.bathId] || 'нет';
            const pubDate = formatListingDate(activeListing.dayOffset);

            const baselinePm2 = getStationRoomBaselinePm2(activeListing.metroId, activeListing.roomsId);
            const devPct = ((activeListing.pm2 - baselinePm2) / baselinePm2) * 100;
            const isCheaper = devPct <= 0;
            const signedDev = `${isCheaper ? '−' : '+'}${Math.abs(devPct).toFixed(1).replace('.', ',')}%`;

            const inCompare = selectedIds.includes(activeListing.id);
            const compareFull = !inCompare && selectedIds.length >= 3;

            return (
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="listing-modal-title"
                className="fixed inset-0 z-[100] flex items-center justify-center sm:p-4"
              >
                <div
                  className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
                  onClick={() => setActiveListingId(null)}
                />

                <div className="relative z-10 flex h-full w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl">
                  {/* Modal Header */}
                  <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                    <div>
                      <div className="font-mono text-xs font-semibold text-slate-600 tabular-nums whitespace-nowrap">
                        Лот №{activeListing.id + 1} · {roomLabel}
                      </div>
                      <h3 id="listing-modal-title" className="mt-0.5 flex items-center gap-1.5 text-lg font-bold text-slate-900 sm:text-xl">
                        <MapPin className="h-5 w-5 shrink-0 text-[#1B3A6B]" aria-hidden="true" />
                        <span>м. {metroName}</span>
                      </h3>
                      <p className="mt-0.5 text-xs font-medium text-slate-600 tabular-nums whitespace-nowrap">
                        {activeListing.minutes} мин {activeListing.way === 0 ? 'пешком до станции' : 'на транспорте до станции'}
                      </p>
                    </div>

                    <button
                      type="button"
                      aria-label="Закрыть карточку квартиры"
                      onClick={() => setActiveListingId(null)}
                      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-900"
                    >
                      <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
                    {/* Price + Price/m2 + Station/Room Median Deviation */}
                    <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 sm:items-center">
                      <div>
                        <div className="text-xs font-medium text-slate-600">Цена предложения</div>
                        <div className="mt-1 font-mono text-2xl font-extrabold text-slate-900 tabular-nums whitespace-nowrap sm:text-3xl">
                          {formatRub(activeListing.price)}
                        </div>
                        <div className="mt-1 font-mono text-base font-bold text-[#1B3A6B] tabular-nums whitespace-nowrap">
                          {formatPm2(activeListing.pm2)}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                        <div className="text-xs font-medium text-slate-600">
                          Отклонение от медианы ({metroName}, {roomLabel})
                        </div>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span
                            className={`font-mono text-2xl font-extrabold tabular-nums whitespace-nowrap ${
                              isCheaper ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {signedDev}
                          </span>
                          <span
                            className={`text-xs font-bold whitespace-nowrap ${
                              isCheaper ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {isCheaper ? 'выгоднее рынка' : 'дороже рынка'}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          Медиана локации: <span className="font-mono font-semibold text-slate-900">{formatPm2(baselinePm2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* All Apartment Specs */}
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <dt className="text-xs text-slate-500">Общая площадь</dt>
                        <dd className="mt-0.5 font-mono text-base font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatArea(activeListing.area)}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <dt className="text-xs text-slate-500">Жилая площадь</dt>
                        <dd className="mt-0.5 font-mono text-base font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatArea(activeListing.livingArea)}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <dt className="text-xs text-slate-500">Кухня</dt>
                        <dd className="mt-0.5 font-mono text-base font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatArea(activeListing.kitchenArea)}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <dt className="text-xs text-slate-500">Этаж / этажность</dt>
                        <dd className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {activeListing.floor} из {activeListing.floorsTotal}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <dt className="text-xs text-slate-500">Тип дома</dt>
                        <dd className="mt-0.5 text-sm font-bold text-slate-900 whitespace-nowrap">
                          {htypeLabel}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <dt className="text-xs text-slate-500">Комнатность</dt>
                        <dd className="mt-0.5 text-sm font-bold text-slate-900 whitespace-nowrap">
                          {roomLabel}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <dt className="text-xs text-slate-500">Балкон / лоджия</dt>
                        <dd className="mt-0.5 text-sm font-bold text-slate-900 whitespace-nowrap">
                          {balconyLabel}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <dt className="text-xs text-slate-500">Санузел</dt>
                        <dd className="mt-0.5 text-sm font-bold text-slate-900 whitespace-nowrap">
                          {bathLabel}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <dt className="text-xs text-slate-500">Дата публикации</dt>
                        <dd className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {pubDate}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <dt className="text-xs text-slate-500">Дней в экспозиции</dt>
                        <dd className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatDays(activeListing.daysExp)}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3 sm:col-span-2">
                        <dt className="text-xs text-slate-500">Источник объявления</dt>
                        <dd className="mt-0.5 text-sm font-bold text-slate-900 whitespace-nowrap">
                          {srcLabel}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Modal Footer Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
                    <span className="text-xs text-slate-600 tabular-nums">
                      {compareFull
                        ? 'В сравнении уже 3 из 3 лотов — перейдите в раздел или снимите один.'
                        : `Выбрано для сравнения: ${selectedIds.length} из 3`}
                    </span>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {selectedIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveListingId(null);
                            onGoToComparison();
                          }}
                          className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                        >
                          <span>К сравнению ({selectedIds.length})</span>
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={compareFull}
                        onClick={() => onToggleSelect(activeListing.id)}
                        className={`inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg px-4 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap ${
                          inCompare
                            ? 'border border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'bg-[#1B3A6B] text-white hover:bg-[#152E56]'
                        }`}
                      >
                        {inCompare ? (
                          <>
                            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>В сравнении (убрать)</span>
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>В сравнение</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })(),
          document.body
        )}
    </section>
  );
}
