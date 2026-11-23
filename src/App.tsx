import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Database,
  LayoutDashboard,
  Play,
  Scale,
  SlidersHorizontal,
  TableProperties,
} from 'lucide-react';
import { OverviewPage, type AppRoute } from './components/OverviewPage';
import { StartScreen } from './components/StartScreen';
import { FilterPanel } from './components/FilterPanel';
import { ChartsSection } from './components/ChartsSection';
import { ComparisonSection, ListingsTableSection } from './components/ListingsComparison';
import { DataPipelineSection } from './components/DataPipelineSection';
import { ProductionRoadmap } from './components/ProductionRoadmap';
import { FloatingConsultant } from './components/FloatingConsultant';
import { DATA_META } from './data/rawSeedRows';
import {
  DEFAULT_FILTERS,
  TOTAL_ROWS,
  filterAndComputeStats,
  formatInt,
  getStationIdByName,
  sortListingIds,
} from './data/marketEngine';
import type { FilterState } from './types/market';

const ROUTES: Array<{
  id: AppRoute;
  hash: string;
  label: string;
  mobileLabel: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', hash: '#/overview', label: 'Обзор', mobileLabel: 'Обзор', icon: LayoutDashboard },
  { id: 'base', hash: '#/base', label: 'База', mobileLabel: 'База', icon: TableProperties },
  { id: 'analytics', hash: '#/analytics', label: 'Аналитика', mobileLabel: 'Графики', icon: BarChart3 },
  { id: 'comparison', hash: '#/comparison', label: 'Сравнение', mobileLabel: 'Сравн.', icon: Scale },
  { id: 'cleaning', hash: '#/cleaning', label: 'Очистка данных', mobileLabel: 'Данные', icon: Database },
];

type ActiveView = 'start' | AppRoute;

function parseHashRoute(hash: string): ActiveView {
  const clean = hash.replace(/^#\/?/, '').toLowerCase();
  if (!clean || clean === 'start') return 'start';
  const found = ROUTES.find((r) => r.id === clean);
  return found ? found.id : 'start';
}

export default function App() {
  const [route, setRoute] = useState<ActiveView>(() => {
    if (typeof window === 'undefined') return 'start';
    return parseHashRoute(window.location.hash);
  });
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Sync browser hash & support Back / Forward navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const rawHash = window.location.hash;
    if (!rawHash || rawHash === '#' || rawHash === '#/') {
      window.history.replaceState(null, '', '#/start');
    }
    const onHashChange = () => {
      setRoute(parseHashRoute(window.location.hash));
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((target: ActiveView) => {
    const targetHash = `#/${target}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    } else {
      setRoute(target);
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  const { matchedIds, count, stats } = useMemo(
    () => filterAndComputeStats(filters),
    [filters]
  );

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const handleSelectStationAndGoBase = (metroId: number) => {
    setFilters({ ...DEFAULT_FILTERS, metroId });
    navigate('base');
  };

  const handleLoadExampleComparison = () => {
    const seligId = getStationIdByName('Селигерская');
    const exampleFilters: FilterState = {
      ...DEFAULT_FILTERS,
      metroId: seligId,
      roomsId: 1,
    };
    setFilters(exampleFilters);
    const result = filterAndComputeStats(exampleFilters);
    if (result.count >= 3) {
      const sorted = sortListingIds(result.matchedIds, 'pm2', 'asc');
      const pick0 = sorted[0];
      const pickMid = sorted[Math.floor(sorted.length / 2)];
      const pickHigh = sorted[Math.max(0, sorted.length - 2)];
      setSelectedIds(Array.from(new Set([pick0, pickMid, pickHigh])).slice(0, 3));
    }
  };

  if (route === 'start') {
    return (
      <StartScreen
        elapsedMs={stats.elapsedMs}
        onFinishToOverview={() => navigate('overview')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 text-slate-900 md:pb-0">
      {/* Thin Sticky Top Header across ALL pages */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 sm:flex-nowrap sm:px-6 sm:py-0">
          <a
            href="#/overview"
            onClick={(e) => {
              e.preventDefault();
              navigate('overview');
            }}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1B3A6B]"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <rect x="2" y="10" width="5" height="12" rx="1" fill="#3B82F6" />
              <rect x="9.5" y="5" width="5" height="17" rx="1" fill="#1B3A6B" />
              <rect x="17" y="2" width="5" height="20" rx="1" fill="#0284C7" />
            </svg>
            <span className="font-display text-base font-bold tracking-tight text-[#1B3A6B]">
              STIMIT
            </span>
            <span className="hidden text-sm font-medium text-slate-500 sm:inline">
              · Аналитика рынка квартир Москвы
            </span>
          </a>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex flex-wrap items-center justify-end gap-x-1.5 font-mono text-xs font-semibold text-slate-700 tabular-nums sm:text-sm">
              <span className="whitespace-nowrap">
                найдено <span className="text-[#1B3A6B]">{formatInt(count)}</span>
              </span>
              <span className="whitespace-nowrap">из {formatInt(TOTAL_ROWS)}</span>
              <span className="whitespace-nowrap">· за {stats.elapsedMs} мс</span>
            </div>

            <a
              href="#/start"
              onClick={(e) => {
                e.preventDefault();
                navigate('start');
              }}
              aria-label="Показать заставку"
              title="Показать стартовую заставку"
              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:border-[#1B3A6B]/40 hover:bg-slate-100 hover:text-[#1B3A6B] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B3A6B]"
            >
              <Play className="h-3.5 w-3.5 shrink-0 fill-current" aria-hidden="true" />
              <span className="hidden sm:inline">Заставка</span>
            </a>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-3.5rem)]">
        {/* Desktop Narrow Vertical Left Sidebar (Always sticky) */}
        <aside
          aria-label="Навигация по разделам"
          className="hidden w-[84px] shrink-0 border-r border-slate-200 bg-white md:block lg:w-[196px] xl:w-[216px]"
        >
          <nav className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col justify-between p-2.5 xl:p-3">
            <ul className="space-y-1.5">
              {ROUTES.map((item) => {
                const Icon = item.icon;
                const active = route === item.id;
                const badgeCount = item.id === 'comparison' ? selectedIds.length : 0;

                return (
                  <li key={item.id}>
                    <a
                      href={item.hash}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(item.id);
                      }}
                      aria-current={active ? 'page' : undefined}
                      className={`group relative flex min-h-[44px] items-center justify-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[13px] font-semibold transition-colors duration-150 lg:justify-start xl:gap-3 xl:px-3 xl:text-sm ${
                        active
                          ? 'bg-[#1B3A6B] text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100 hover:text-[#1B3A6B]'
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span className="hidden whitespace-nowrap lg:inline">{item.label}</span>

                      {badgeCount > 0 && (
                        <span
                          className={`ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-bold tabular-nums ${
                            active
                              ? 'bg-white text-[#1B3A6B]'
                              : 'bg-[#1B3A6B] text-white'
                          } lg:static absolute top-1.5 right-1.5`}
                        >
                          {badgeCount}
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>

            <div className="hidden border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400 lg:block">
              <div className="font-semibold text-slate-500">Автономный прототип</div>
              <div className="tabular-nums">{DATA_META.period}</div>
            </div>
          </nav>
        </aside>

        {/* Main Page Content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-5 lg:px-4 xl:px-7 xl:py-8">
          <div key={route} className="animate-page-enter mx-auto max-w-[1260px]">
            {route === 'overview' && (
              <OverviewPage
                onNavigate={navigate}
                onSelectStationAndGoBase={handleSelectStationAndGoBase}
              />
            )}

            {route === 'base' && (
              <div className="space-y-6">
                {/* Page Header + Mobile Filter Button */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance] sm:text-3xl">
                      База объявлений
                    </h1>
                    <p className="mt-1 text-sm text-slate-600">
                      Фильтруйте и отбирайте квартиры для сравнения — пересчёт по всему массиву происходит мгновенно.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMobileDrawerOpen(true)}
                    className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 lg:hidden"
                  >
                    <SlidersHorizontal className="h-4 w-4 text-[#1B3A6B]" aria-hidden="true" />
                    <span>Фильтры</span>
                  </button>
                </div>

                {/* Filters Left + Table Right */}
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start xl:gap-6">
                  <FilterPanel
                    filters={filters}
                    onChange={setFilters}
                    onReset={handleResetFilters}
                    matchedCount={count}
                    elapsedMs={stats.elapsedMs}
                    mobileOpen={mobileDrawerOpen}
                    onCloseMobile={() => setMobileDrawerOpen(false)}
                  />

                  <div className="min-w-0 flex-1">
                    <ListingsTableSection
                      matchedIds={matchedIds}
                      selectedIds={selectedIds}
                      onToggleSelect={handleToggleSelect}
                      onGoToComparison={() => navigate('comparison')}
                      elapsedMs={stats.elapsedMs}
                    />
                  </div>
                </div>
              </div>
            )}

            {route === 'analytics' && (
              <ChartsSection
                stats={stats}
                filters={filters}
                onSelectMetro={(metroId) => setFilters((prev) => ({ ...prev, metroId }))}
                onSelectSource={(srcId) => setFilters((prev) => ({ ...prev, srcId }))}
                onGoToBase={() => navigate('base')}
              />
            )}

            {route === 'comparison' && (
              <ComparisonSection
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onClearSelected={() => setSelectedIds([])}
                onGoToBase={() => navigate('base')}
                onLoadExampleComparison={handleLoadExampleComparison}
              />
            )}

            {route === 'cleaning' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance] sm:text-3xl">
                    Очистка данных и архитектура
                  </h1>
                  <p className="mt-1 text-sm text-slate-600">
                    Реальный конвейер превращения {formatInt(DATA_META.raw_rows)} сырых строк выгрузки в чистую клиентскую витрину.
                  </p>
                </div>

                <DataPipelineSection standalonePage />
                <ProductionRoadmap />
              </div>
            )}
          </div>

          <footer className="mx-auto mt-10 max-w-[1260px] border-t border-slate-200 pt-4 pb-2 text-center text-xs text-slate-400 sm:flex sm:items-center sm:justify-between sm:text-left">
            <span>Прототип STIMIT · автономное демо · данные: 125 577 объявлений, лето 2019</span>
            <span className="mt-1 block font-mono text-[11px] tabular-nums whitespace-nowrap sm:mt-0">
              {DATA_META.stations} станций метро · без серверных запросов
            </span>
          </footer>
        </main>
      </div>

      {/* Mobile Bottom 5-Icon Navigation Bar */}
      <nav
        aria-label="Мобильное меню"
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-slate-200 bg-white md:hidden"
      >
        {ROUTES.map((item) => {
          const Icon = item.icon;
          const active = route === item.id;
          const badgeCount = item.id === 'comparison' ? selectedIds.length : 0;

          return (
            <a
              key={item.id}
              href={item.hash}
              onClick={(e) => {
                e.preventDefault();
                navigate(item.id);
              }}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
                active ? 'text-[#1B3A6B]' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span
                className={`flex h-7 w-10 items-center justify-center rounded-full ${
                  active ? 'bg-[#1B3A6B]/10' : ''
                }`}
              >
                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <span className="truncate">{item.mobileLabel}</span>
              {badgeCount > 0 && (
                <span className="absolute top-1.5 right-3 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#1B3A6B] px-1 font-mono text-[10px] font-bold text-white tabular-nums">
                  {badgeCount}
                </span>
              )}
            </a>
          );
        })}
      </nav>

      {/* Always-Available Floating Filter-Aware AI Consultant */}
      <FloatingConsultant
        filters={filters}
        matchedIds={matchedIds}
        stats={stats}
        onApplyComparisonIds={(ids) => {
          setSelectedIds(ids);
          navigate('comparison');
        }}
      />
    </div>
  );
}
