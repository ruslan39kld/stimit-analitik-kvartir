import { useMemo, useState } from 'react';
import { RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { DATA_DICT } from '../data/rawSeedRows';
import {
  HTYPE_LABELS_RU,
  ROOMS_LABELS_RU,
  SRC_LABELS_RU,
  TOTAL_ROWS,
  areFiltersEmpty,
  formatInt,
} from '../data/marketEngine';
import type { FilterState, FloorCategory, WayFilter } from '../types/market';

interface FilterPanelProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  onReset: () => void;
  matchedCount: number;
  elapsedMs: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const ROOM_OPTIONS: Array<{ id: number | null; label: string }> = [
  { id: null, label: 'Все' },
  { id: 0, label: ROOMS_LABELS_RU.studio },
  { id: 1, label: '1' },
  { id: 2, label: '2' },
  { id: 3, label: '5+' },
  { id: 4, label: '1–3' },
  { id: 5, label: 'Др.' },
];

const MINUTE_OPTIONS: Array<{ val: number | null; label: string }> = [
  { val: null, label: 'Любое' },
  { val: 5, label: '≤ 5 мин' },
  { val: 10, label: '≤ 10 мин' },
  { val: 15, label: '≤ 15 мин' },
  { val: 20, label: '≤ 20 мин' },
];

const FLOOR_OPTIONS: Array<{ val: FloorCategory; label: string }> = [
  { val: 'all', label: 'Все' },
  { val: 'first', label: 'Первый' },
  { val: 'mid', label: 'Средние' },
  { val: 'last', label: 'Последний' },
];

export function FilterPanel({
  filters,
  onChange,
  onReset,
  matchedCount,
  elapsedMs,
  mobileOpen,
  onCloseMobile,
}: FilterPanelProps) {
  const [metroQuery, setMetroQuery] = useState('');
  const [metroDropdownOpen, setMetroDropdownOpen] = useState(false);

  const selectedMetroName = filters.metroId !== null ? DATA_DICT.metro[filters.metroId] : '';

  const filteredStations = useMemo(() => {
    const q = metroQuery.trim().toLowerCase();
    const result: Array<{ id: number; name: string }> = [];
    for (let i = 1; i < DATA_DICT.metro.length; i++) {
      const name = DATA_DICT.metro[i];
      if (!q || name.toLowerCase().includes(q)) {
        result.push({ id: i, name });
      }
      if (result.length >= 40) break;
    }
    return result;
  }, [metroQuery]);

  const hasActiveFilters = !areFiltersEmpty(filters);

  const panelContent = (
    <div className="space-y-5">
      {/* Live Count & Latency Indicator */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-medium text-slate-500">Выборка в реальном времени</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 font-mono text-sm font-bold text-[#1B3A6B] tabular-nums xl:text-[15px]">
          <span className="whitespace-nowrap">Найдено {formatInt(matchedCount)}</span>
          <span className="whitespace-nowrap">из {formatInt(TOTAL_ROWS)}</span>
        </div>
        <div className="mt-0.5 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
          пересчитано за {elapsedMs} мс
        </div>
      </div>

      {/* Rooms */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Комнатность
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ROOM_OPTIONS.map((opt) => {
            const active = filters.roomsId === opt.id;
            return (
              <button
                key={String(opt.id)}
                type="button"
                onClick={() => onChange({ ...filters, roomsId: opt.id })}
                className={`min-h-[38px] cursor-pointer rounded-md border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B3A6B] ${
                  active
                    ? 'border-[#1B3A6B] bg-[#1B3A6B] text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Searchable Metro Station (all 268) */}
      <div className="relative">
        <label
          htmlFor="metro-search-input"
          className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Станция метро ({DATA_DICT.metro.length})
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="metro-search-input"
            type="text"
            value={metroDropdownOpen ? metroQuery : selectedMetroName || metroQuery}
            onFocus={() => {
              setMetroDropdownOpen(true);
              setMetroQuery('');
            }}
            onChange={(e) => {
              setMetroQuery(e.target.value);
              setMetroDropdownOpen(true);
            }}
            placeholder="Поиск по 268 станциям…"
            className="min-h-[42px] w-full rounded-md border border-slate-200 bg-white py-2 pr-9 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B3A6B] focus:outline-none"
          />
          {(filters.metroId !== null || metroQuery) && (
            <button
              type="button"
              aria-label="Сбросить станцию метро"
              onClick={() => {
                setMetroQuery('');
                setMetroDropdownOpen(false);
                onChange({ ...filters, metroId: null });
              }}
              className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {metroDropdownOpen && (
          <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
            <button
              type="button"
              onClick={() => {
                onChange({ ...filters, metroId: null });
                setMetroQuery('');
                setMetroDropdownOpen(false);
              }}
              className="flex w-full cursor-pointer items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-xs font-semibold text-[#1B3A6B] hover:bg-slate-50"
            >
              <span>Все станции Москвы</span>
            </button>
            {filteredStations.length === 0 ? (
              <div className="px-3 py-2.5 text-xs text-slate-500">Станция не найдена</div>
            ) : (
              filteredStations.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    onChange({ ...filters, metroId: st.id });
                    setMetroQuery('');
                    setMetroDropdownOpen(false);
                  }}
                  className={`flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    filters.metroId === st.id ? 'bg-sky-50 font-semibold text-[#1B3A6B]' : 'text-slate-700'
                  }`}
                >
                  <span>{st.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Price Range */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Цена, млн ₽
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="price-min" className="sr-only">
              Цена от, млн рублей
            </label>
            <input
              id="price-min"
              type="number"
              step="0.5"
              min="0"
              placeholder="От, млн"
              value={filters.priceMinM}
              onChange={(e) => onChange({ ...filters, priceMinM: e.target.value })}
              className="min-h-[40px] w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 tabular-nums placeholder:text-slate-400 focus:border-[#1B3A6B] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="price-max" className="sr-only">
              Цена до, млн рублей
            </label>
            <input
              id="price-max"
              type="number"
              step="0.5"
              min="0"
              placeholder="До, млн"
              value={filters.priceMaxM}
              onChange={(e) => onChange({ ...filters, priceMaxM: e.target.value })}
              className="min-h-[40px] w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 tabular-nums placeholder:text-slate-400 focus:border-[#1B3A6B] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* House Type */}
      <div>
        <label
          htmlFor="htype-select"
          className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Тип дома
        </label>
        <select
          id="htype-select"
          value={filters.htypeId === null ? '' : String(filters.htypeId)}
          onChange={(e) =>
            onChange({
              ...filters,
              htypeId: e.target.value === '' ? null : Number(e.target.value),
            })
          }
          className="min-h-[42px] w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-[#1B3A6B] focus:outline-none"
        >
          <option value="">Любой тип дома</option>
          {DATA_DICT.htype.map((key, idx) => (
            <option key={key} value={idx}>
              {HTYPE_LABELS_RU[key] || key}
            </option>
          ))}
        </select>
      </div>

      {/* Distance to Station */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          До метро
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { val: 'all', label: 'Любой' },
              { val: 'walk', label: 'Пешком' },
              { val: 'transport', label: 'Трансп.' },
            ] as Array<{ val: WayFilter; label: string }>
          ).map((opt) => (
            <button
              key={opt.val}
              type="button"
              onClick={() => onChange({ ...filters, way: opt.val })}
              className={`min-h-[38px] cursor-pointer rounded-md border px-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 xl:px-2 xl:text-xs ${
                filters.way === opt.val
                  ? 'border-[#1B3A6B] bg-[#1B3A6B] text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MINUTE_OPTIONS.map((m) => (
            <button
              key={String(m.val)}
              type="button"
              onClick={() => onChange({ ...filters, maxMinutes: m.val })}
              className={`min-h-[34px] cursor-pointer rounded-md border px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                filters.maxMinutes === m.val
                  ? 'border-[#1B3A6B] bg-sky-50 text-[#1B3A6B] font-semibold'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Floor */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Этаж
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {FLOOR_OPTIONS.map((opt) => (
            <button
              key={opt.val}
              type="button"
              onClick={() => onChange({ ...filters, floorType: opt.val })}
              className={`min-h-[38px] cursor-pointer rounded-md border px-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                filters.floorType === opt.val
                  ? 'border-[#1B3A6B] bg-[#1B3A6B] text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Listing Source */}
      <div>
        <label
          htmlFor="src-select"
          className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Источник объявления
        </label>
        <select
          id="src-select"
          value={filters.srcId === null ? '' : String(filters.srcId)}
          onChange={(e) =>
            onChange({
              ...filters,
              srcId: e.target.value === '' ? null : Number(e.target.value),
            })
          }
          className="min-h-[42px] w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-[#1B3A6B] focus:outline-none"
        >
          <option value="">Все площадки</option>
          {DATA_DICT.src.map((key, idx) => (
            <option key={key} value={idx}>
              {SRC_LABELS_RU[key] || key}
            </option>
          ))}
        </select>
      </div>

      {/* Reset Filters */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onReset}
          className="flex min-h-[42px] w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span>Сбросить фильтры</span>
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Left Rail */}
      <aside
        aria-label="Фильтры рынка"
        className="hidden lg:block lg:w-[232px] lg:shrink-0 xl:w-[272px]"
      >
        <div className="sticky top-[72px] max-h-[calc(100vh-88px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3.5 xl:p-5">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <SlidersHorizontal className="h-4 w-4 text-[#1B3A6B]" aria-hidden="true" />
              <span>Фильтры выборки</span>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onReset}
                className="cursor-pointer text-xs font-semibold text-[#1B3A6B] hover:underline"
              >
                Сбросить
              </button>
            )}
          </div>
          {panelContent}
        </div>
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Фильтры">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 flex h-full w-full max-w-sm flex-col overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                <SlidersHorizontal className="h-4 w-4 text-[#1B3A6B]" aria-hidden="true" />
                <span>Фильтры</span>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Закрыть фильтры"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {panelContent}
            <div className="mt-6 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={onCloseMobile}
                className="min-h-[44px] w-full cursor-pointer rounded-md bg-[#1B3A6B] px-4 text-sm font-semibold text-white whitespace-nowrap"
              >
                Показать {formatInt(matchedCount)} объявлений
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
