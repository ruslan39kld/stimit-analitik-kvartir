import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Bot,
  Calculator,
  Compass,
  FileBarChart2,
  HelpCircle,
  MessageSquare,
  RotateCcw,
  Search,
  Send,
  X,
} from 'lucide-react';
import { DATA_DICT } from '../data/rawSeedRows';
import {
  CONSULTANT_QUESTIONS,
  TOTAL_ROWS,
  areFiltersEmpty,
  computeClientSelectionScenario,
  computeFilteredConsultantAnswer,
  computeMarketBriefingScenario,
  computeValuationScenario,
  formatActiveFiltersSummary,
  formatArea,
  formatInt,
  formatPm2,
  formatRub,
  formatRubCompact,
  getStationIdByName,
  type BudgetBandKey,
  type ClientSelectionResult,
  type ConsultantAnswer,
  type MarketBriefingResult,
  type ValuationResult,
  type WalkBandKey,
} from '../data/marketEngine';
import type { ComputedStats, FilterState } from '../types/market';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface FloatingConsultantProps {
  filters: FilterState;
  matchedIds: Int32Array;
  stats: ComputedStats;
  onApplyComparisonIds?: (ids: number[]) => void;
}

type ScenarioId = 'home' | 'select_client' | 'valuate' | 'briefing' | 'quick_qa';

interface ChatLogEntry {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  quickAnswer?: ConsultantAnswer;
  clientResult?: ClientSelectionResult;
  valuationResult?: ValuationResult;
  briefingResult?: MarketBriefingResult;
}

const BUDGET_OPTIONS: Array<{ key: BudgetBandKey; label: string }> = [
  { key: 'u6', label: 'До 6 млн ₽' },
  { key: '6_9', label: '6–9 млн ₽' },
  { key: '9_14', label: '9–14 млн ₽' },
  { key: '14_25', label: '14–25 млн ₽' },
  { key: 'any', label: 'Любой бюджет' },
];

const ROOM_PICK_OPTIONS: Array<{ id: number | null; label: string }> = [
  { id: 0, label: 'Студия' },
  { id: 1, label: '1-комн.' },
  { id: 2, label: '2-комн.' },
  { id: 3, label: '5+ комн.' },
  { id: null, label: 'Любая комнатность' },
];

const ROOM_VAL_OPTIONS: Array<{ id: number; label: string }> = [
  { id: 0, label: 'Студия' },
  { id: 1, label: '1-комн.' },
  { id: 2, label: '2-комн.' },
  { id: 3, label: '5+ комн.' },
];

const WALK_OPTIONS: Array<{ key: WalkBandKey; label: string }> = [
  { key: 'w5', label: 'До 5 мин пешком' },
  { key: 'w10', label: 'До 10 мин пешком' },
  { key: 'w15', label: 'До 15 мин пешком' },
  { key: 'any', label: 'Транспорт / не важно' },
];

const QUICK_METRO_NAMES = [
  'Селигерская',
  'Бунинская аллея',
  'Саларьево',
  'Некрасовка',
  'Марьино',
  'Белорусская',
  'Раменки',
  'Улица 1905 года',
];

const AREA_PRESETS_BY_ROOM: Record<number, number[]> = {
  0: [22, 25, 29, 34],
  1: [34, 39, 44, 52],
  2: [48, 58, 66, 78],
  3: [140, 180, 210, 260],
};

export function FloatingConsultant({
  filters,
  matchedIds,
  stats,
  onApplyComparisonIds,
}: FloatingConsultantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [scenario, setScenario] = useState<ScenarioId>('home');
  const [typing, setTyping] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatLogEntry[]>([]);

  // Scenario 1 state (Client selection: step 1 -> 2 -> 3 -> 4 final)
  const [selStep, setSelStep] = useState<1 | 2 | 3 | 4>(1);
  const [selBudget, setSelBudget] = useState<BudgetBandKey>('6_9');
  const [selRooms, setSelRooms] = useState<number | null>(1);

  // Scenario 2 state (Valuation: step 1 -> 2 -> 3 -> 4 final)
  const [valStep, setValStep] = useState<1 | 2 | 3 | 4>(1);
  const [valMetroId, setValMetroId] = useState<number>(1);
  const [valRoomsId, setValRoomsId] = useState<number>(1);
  const [metroSearch, setMetroSearch] = useState('');

  const hasFilters = !areFiltersEmpty(filters);
  const activeSummary = formatActiveFiltersSummary(filters);

  useBodyScrollLock(isOpen);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const filteredMetroList = useMemo(() => {
    const q = metroSearch.trim().toLowerCase();
    if (!q) {
      return QUICK_METRO_NAMES.map((name) => ({
        id: getStationIdByName(name) ?? 1,
        name,
      }));
    }
    const list: Array<{ id: number; name: string }> = [];
    for (let i = 1; i < DATA_DICT.metro.length; i++) {
      if (DATA_DICT.metro[i].toLowerCase().includes(q)) {
        list.push({ id: i, name: DATA_DICT.metro[i] });
      }
      if (list.length >= 16) break;
    }
    return list;
  }, [metroSearch]);

  const runWithTyping = (userText: string | null, buildReply: () => Omit<ChatLogEntry, 'id' | 'role'>) => {
    if (typing) return;
    if (userText) {
      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text: userText }]);
    }
    const prefersReduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = prefersReduced ? 0 : 280;

    setTyping(true);
    window.setTimeout(() => {
      const payload = buildReply();
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', ...payload },
      ]);
      setTyping(false);
    }, delay);
  };

  const resetToHome = () => {
    setScenario('home');
    setMessages([]);
    setSelStep(1);
    setValStep(1);
    setMetroSearch('');
  };

  const startScenario = (id: ScenarioId) => {
    setScenario(id);
    setMessages([]);
    setMetroSearch('');

    if (id === 'select_client') {
      setSelStep(1);
      setMessages([
        {
          id: 'sc1-intro',
          role: 'assistant',
          text: `Шаг 1 из 3: выберите ориентировочный бюджет клиента${hasFilters ? ` (учитываю фильтры: ${activeSummary})` : ''}.`,
        },
      ]);
    } else if (id === 'valuate') {
      setValStep(1);
      setMessages([
        {
          id: 'sc2-intro',
          role: 'assistant',
          text: 'Шаг 1 из 3: выберите станцию метро, у которой находится оцениваемая квартира (поиск работает по всем 268 станциям).',
        },
      ]);
    } else if (id === 'briefing') {
      runWithTyping('Сформируй обзор рынка за 30 секунд', () => ({
        briefingResult: computeMarketBriefingScenario(filters, matchedIds, stats),
      }));
    } else if (id === 'quick_qa') {
      setMessages([
        {
          id: 'sc4-intro',
          role: 'assistant',
          text: `Выберите готовый вопрос ниже — расчёт выполнится мгновенно ${
            hasFilters
              ? `по вашей текущей выборке (${formatInt(matchedIds.length)} лотов)`
              : `по всему массиву (${formatInt(TOTAL_ROWS)} лотов)`
          }.`,
        },
      ]);
    }
  };

  const handleSelectBudget = (b: { key: BudgetBandKey; label: string }) => {
    setSelBudget(b.key);
    setSelStep(2);
    runWithTyping(`Бюджет: ${b.label}`, () => ({
      text: 'Шаг 2 из 3: сколько комнат нужно клиенту?',
    }));
  };

  const handleSelectRooms = (r: { id: number | null; label: string }) => {
    setSelRooms(r.id);
    setSelStep(3);
    runWithTyping(`Комнатность: ${r.label}`, () => ({
      text: 'Шаг 3 из 3: какая максимальная удалённость от метро допустима?',
    }));
  };

  const handleSelectWalk = (w: { key: WalkBandKey; label: string }) => {
    setSelStep(4);
    runWithTyping(`До метро: ${w.label}`, () => ({
      clientResult: computeClientSelectionScenario(selBudget, selRooms, w.key, filters, matchedIds),
    }));
  };

  const handleValMetro = (m: { id: number; name: string }) => {
    setValMetroId(m.id);
    setValStep(2);
    runWithTyping(`Станция: м. ${m.name}`, () => ({
      text: 'Шаг 2 из 3: выберите комнатность оцениваемой квартиры.',
    }));
  };

  const handleValRooms = (r: { id: number; label: string }) => {
    setValRoomsId(r.id);
    setValStep(3);
    runWithTyping(`Комнатность: ${r.label}`, () => ({
      text: 'Шаг 3 из 3: выберите ориентировочную общую площадь квартиры.',
    }));
  };

  const handleValArea = (area: number) => {
    setValStep(4);
    runWithTyping(`Площадь: ${area} м²`, () => ({
      valuationResult: computeValuationScenario(valMetroId, valRoomsId, area),
    }));
  };

  const handleQuickQuestion = (qId: string, label: string) => {
    runWithTyping(label, () => ({
      quickAnswer: computeFilteredConsultantAnswer(qId, filters, matchedIds, stats),
    }));
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || typing) return;
    setInputValue('');

    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', text: trimmed },
      {
        id: `a-${Date.now() + 1}`,
        role: 'assistant',
        text: 'Это демо-стенд без подключения к внешней языковой модели. Выберите один из 4 сценариев или готовый вопрос выше, чтобы получить точный расчёт по базе.',
      },
    ]);
  };

  return (
    <>
      {/* Large Centered Modal */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 md:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Интерактивный консультант STIMIT"
          >
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
              onClick={() => setIsOpen(false)}
            />

          {/* Dialog Container: ~70% width & ~80% height on desktop, fullscreen on mobile */}
          <div className="relative z-10 flex h-full w-full flex-col bg-white sm:h-[82vh] sm:max-h-[760px] sm:w-[92vw] sm:max-w-[980px] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl lg:w-[72vw]">
            {/* Modal Header */}
            <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-[#1B3A6B] px-5 py-4 text-white sm:rounded-t-2xl">
              <div className="flex items-center gap-3">
                {scenario !== 'home' && (
                  <button
                    type="button"
                    onClick={resetToHome}
                    aria-label="К другим сценариям"
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                <Bot className="h-5 w-5 shrink-0 text-sky-300" aria-hidden="true" />
                <div>
                  <h2 className="text-base font-bold leading-tight">
                    AI-консультант STIMIT
                  </h2>
                  <p className="mt-0.5 text-xs text-sky-200 tabular-nums">
                    {hasFilters
                      ? `Учитываю фильтры: ${formatInt(matchedIds.length)} лотов (${activeSummary})`
                      : `Автономный расчёт по всему массиву (${formatInt(TOTAL_ROWS)} лотов)`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Закрыть консультанта"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto bg-slate-50/70 p-4 sm:p-6">
              {scenario === 'home' ? (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Выберите сценарий работы с данными
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Каждый сценарий опирается на реальные цифры массива и учитывает активные фильтры.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => startScenario('select_client')}
                      className="group flex cursor-pointer flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-[#1B3A6B] hover:bg-sky-50/50"
                    >
                      <div>
                        <Compass className="h-6 w-6 text-[#1B3A6B]" aria-hidden="true" />
                        <h4 className="mt-3 text-base font-bold text-slate-900">
                          Подобрать квартиру для клиента
                        </h4>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                          Пошаговый диалог (бюджет → комнатность → до метро) с подборкой 3 реальных лотов и вердиктом к медиане.
                        </p>
                      </div>
                      <span className="mt-4 text-xs font-semibold text-[#1B3A6B] group-hover:underline">
                        Запустить подбор (3 шага) →
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => startScenario('valuate')}
                      className="group flex cursor-pointer flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-[#1B3A6B] hover:bg-sky-50/50"
                    >
                      <div>
                        <Calculator className="h-6 w-6 text-[#1B3A6B]" aria-hidden="true" />
                        <h4 className="mt-3 text-base font-bold text-slate-900">
                          Оценить квартиру
                        </h4>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                          Выбор станции метро, комнатности и площади: расчёт справедливого коридора цены и отклонения от рынка.
                        </p>
                      </div>
                      <span className="mt-4 text-xs font-semibold text-[#1B3A6B] group-hover:underline">
                        Рассчитать коридор цены →
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => startScenario('briefing')}
                      className="group flex cursor-pointer flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-[#1B3A6B] hover:bg-sky-50/50"
                    >
                      <div>
                        <FileBarChart2 className="h-6 w-6 text-[#1B3A6B]" aria-hidden="true" />
                        <h4 className="mt-3 text-base font-bold text-slate-900">
                          Обзор рынка за 30 секунд
                        </h4>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                          Связный дайджест с медианами, топ-3 дорогих и доступных станций, сроком продажи и эффектом 1-го этажа.
                        </p>
                      </div>
                      <span className="mt-4 text-xs font-semibold text-[#1B3A6B] group-hover:underline">
                        Получить сводку →
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => startScenario('quick_qa')}
                      className="group flex cursor-pointer flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-[#1B3A6B] hover:bg-sky-50/50"
                    >
                      <div>
                        <HelpCircle className="h-6 w-6 text-[#1B3A6B]" aria-hidden="true" />
                        <h4 className="mt-3 text-base font-bold text-slate-900">
                          Быстрые вопросы
                        </h4>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                          Готовые аналитические запросы (дешевле ли 1-й этаж, быстрые площадки, 2-комн. до 10 млн) по текущему срезу.
                        </p>
                      </div>
                      <span className="mt-4 text-xs font-semibold text-[#1B3A6B] group-hover:underline">
                        Открыть вопросы →
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Conversation Log */}
                  <div aria-live="polite" className="space-y-3">
                    {messages.map((msg) =>
                      msg.role === 'user' ? (
                        <div key={msg.id} className="flex justify-end">
                          <div className="max-w-[85%] rounded-xl bg-[#1B3A6B] px-4 py-2.5 text-sm font-medium text-white">
                            {msg.text}
                          </div>
                        </div>
                      ) : (
                        <div key={msg.id} className="flex justify-start">
                          <div className="w-full max-w-[94%] rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800 sm:max-w-[88%]">
                            {msg.text && <p className="leading-relaxed text-slate-700">{msg.text}</p>}

                            {msg.quickAnswer && (
                              <div className="space-y-3">
                                <p className="leading-relaxed text-slate-800">{msg.quickAnswer.summary}</p>
                                <dl className="grid gap-3 border-y border-slate-100 py-3 sm:grid-cols-3">
                                  {msg.quickAnswer.metrics.map((m) => (
                                    <div key={m.label}>
                                      <dt className="text-xs text-slate-500">{m.label}</dt>
                                      <dd className="mt-0.5 font-mono text-xs font-bold text-[#1B3A6B] tabular-nums whitespace-nowrap">
                                        {m.value}
                                      </dd>
                                    </div>
                                  ))}
                                </dl>
                                <p className="text-xs font-medium text-slate-600">
                                  <span className="font-bold text-slate-800">Вывод для агента: </span>
                                  {msg.quickAnswer.recommendation}
                                </p>
                              </div>
                            )}

                            {msg.clientResult && (
                              <div className="space-y-4">
                                <div className="text-sm leading-relaxed text-slate-800">
                                  Найдено подходящих лотов{' '}
                                  <span className="font-mono font-bold text-[#1B3A6B] tabular-nums whitespace-nowrap">
                                    {formatInt(msg.clientResult.totalMatched)}
                                  </span>{' '}
                                  ({msg.clientResult.scopeNote}). Отобраны 3 наиболее выгодных по цене к медиане станции:
                                </div>

                                {msg.clientResult.picks.length === 0 ? (
                                  <p className="text-xs text-slate-500">
                                    Лоты не найдены — попробуйте расширить бюджет или удалённость.
                                  </p>
                                ) : (
                                  <div className="grid gap-3 md:grid-cols-3">
                                    {msg.clientResult.picks.map((pick) => (
                                      <div
                                        key={pick.listing.id}
                                        className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
                                      >
                                        <div className="font-bold text-slate-900">
                                          м. {pick.metroName} · {pick.roomLabel}
                                        </div>
                                        <div className="mt-1 font-mono text-base font-bold text-[#1B3A6B] tabular-nums whitespace-nowrap">
                                          {formatRub(pick.listing.price)}
                                        </div>
                                        <div className="font-mono font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                                          {formatPm2(pick.listing.pm2)}
                                        </div>
                                        <div className="mt-1.5 text-slate-600 tabular-nums">
                                          <span className="whitespace-nowrap">{formatArea(pick.listing.area)}</span> ·{' '}
                                          <span className="whitespace-nowrap">
                                            {pick.listing.floor}/{pick.listing.floorsTotal} эт.
                                          </span>{' '}
                                          · {pick.htypeLabel}
                                        </div>
                                        <div
                                          className={`mt-1.5 font-semibold tabular-nums ${
                                            pick.devPct <= 0 ? 'text-emerald-700' : 'text-amber-700'
                                          }`}
                                        >
                                          {pick.devPct <= 0 ? 'Ниже' : 'Выше'} медианы на{' '}
                                          <span className="whitespace-nowrap">
                                            {Math.abs(pick.devPct).toFixed(1).replace('.', ',')}%
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <div className="rounded-lg border border-[#1B3A6B]/20 bg-[#1B3A6B]/[0.04] px-3.5 py-2.5 text-xs text-slate-800">
                                  <span className="font-bold text-[#1B3A6B]">Вердикт: </span>
                                  {msg.clientResult.verdict}
                                </div>

                                {onApplyComparisonIds && msg.clientResult.picks.length >= 2 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onApplyComparisonIds(
                                        msg.clientResult!.picks.map((p) => p.listing.id)
                                      );
                                      setIsOpen(false);
                                    }}
                                    className="inline-flex min-h-[38px] cursor-pointer items-center rounded-lg bg-[#1B3A6B] px-3.5 text-xs font-semibold text-white hover:bg-[#152E56] whitespace-nowrap"
                                  >
                                    Открыть эти 3 лота в разделе «Сравнение» →
                                  </button>
                                )}
                              </div>
                            )}

                            {msg.valuationResult && (
                              <div className="space-y-3">
                                <div className="text-sm font-bold text-slate-900">
                                  Оценка: м. {msg.valuationResult.metroName} · {msg.valuationResult.roomLabel} ·{' '}
                                  <span className="whitespace-nowrap tabular-nums">
                                    {formatArea(msg.valuationResult.area)}
                                  </span>
                                </div>

                                <div className="rounded-lg border border-[#1B3A6B]/20 bg-sky-50/60 p-3.5">
                                  <div className="text-xs text-slate-600">Справедливый ценовой коридор (±7%)</div>
                                  <div className="mt-1 font-mono text-xl font-bold text-[#1B3A6B] tabular-nums whitespace-nowrap">
                                    {formatRubCompact(msg.valuationResult.lowPrice)} —{' '}
                                    {formatRubCompact(msg.valuationResult.highPrice)}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-700 tabular-nums">
                                    Медианный ориентир:{' '}
                                    <span className="font-mono font-bold whitespace-nowrap">
                                      {formatRub(msg.valuationResult.fairPrice)}
                                    </span>{' '}
                                    ({formatPm2(msg.valuationResult.fairPm2)})
                                  </div>
                                </div>

                                <dl className="grid gap-3 border-t border-slate-100 pt-2.5 sm:grid-cols-3">
                                  <div>
                                    <dt className="text-xs text-slate-500">К медиане Москвы</dt>
                                    <dd className="font-mono text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">
                                      {msg.valuationResult.vsMoscowPct >= 0 ? '+' : ''}
                                      {msg.valuationResult.vsMoscowPct.toFixed(1).replace('.', ',')}%
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-slate-500">Аналогов у станции</dt>
                                    <dd className="font-mono text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">
                                      {formatInt(msg.valuationResult.sampleCount)} лотов
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-slate-500">Срок экспозиции</dt>
                                    <dd className="font-mono text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">
                                      {msg.valuationResult.medianDays} дн.
                                    </dd>
                                  </div>
                                </dl>
                              </div>
                            )}

                            {msg.briefingResult && (
                              <div className="space-y-3">
                                <p className="leading-relaxed text-slate-800">
                                  Сводка {msg.briefingResult.scopeLabel}: медианная квартира стоит{' '}
                                  <span className="font-mono font-bold text-[#1B3A6B] whitespace-nowrap">
                                    {formatRub(msg.briefingResult.medianPrice)}
                                  </span>{' '}
                                  при цене метра{' '}
                                  <span className="font-mono font-bold whitespace-nowrap">
                                    {formatPm2(msg.briefingResult.medianPm2)}
                                  </span>{' '}
                                  и сроке продажи{' '}
                                  <span className="font-mono font-bold whitespace-nowrap">
                                    {msg.briefingResult.medianDays} дн.
                                  </span>
                                </p>

                                <div className="grid gap-3 border-y border-slate-100 py-3 sm:grid-cols-2">
                                  <div>
                                    <div className="text-xs font-semibold text-slate-500">
                                      Самые дорогие станции (топ-3)
                                    </div>
                                    <ul className="mt-1.5 space-y-1 text-xs">
                                      {msg.briefingResult.expensiveTop3.map((s) => (
                                        <li key={s.name} className="flex justify-between gap-2">
                                          <span className="font-medium text-slate-800">{s.name}</span>
                                          <span className="font-mono font-bold text-[#1B3A6B] tabular-nums whitespace-nowrap">
                                            {formatPm2(s.pm2)}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div>
                                    <div className="text-xs font-semibold text-slate-500">
                                      Самые доступные станции (топ-3)
                                    </div>
                                    <ul className="mt-1.5 space-y-1 text-xs">
                                      {msg.briefingResult.cheapTop3.map((s) => (
                                        <li key={s.name} className="flex justify-between gap-2">
                                          <span className="font-medium text-slate-800">{s.name}</span>
                                          <span className="font-mono font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                                            {formatPm2(s.pm2)}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>

                                <p className="text-xs text-slate-600">
                                  <span className="font-bold text-slate-800">Эффект 1-го этажа: </span>
                                  дисконт к средним этажам составляет{' '}
                                  <span className="font-mono font-bold whitespace-nowrap">
                                    {msg.briefingResult.firstFloorDiscountPct}%
                                  </span>{' '}
                                  (экономия{' '}
                                  <span className="font-mono font-semibold whitespace-nowrap">
                                    {formatPm2(msg.briefingResult.firstFloorDiffPm2)}
                                  </span>
                                  ).
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    )}

                    {typing && (
                      <div className="flex justify-start">
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-500">
                          печатает…
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Interactive Branching Controls for Active Scenario */}
                  {!typing && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      {scenario === 'select_client' && (
                        <>
                          {selStep === 1 && (
                            <div className="flex flex-wrap gap-2">
                              {BUDGET_OPTIONS.map((b) => (
                                <button
                                  key={b.key}
                                  type="button"
                                  onClick={() => handleSelectBudget(b)}
                                  className="min-h-[40px] cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-xs font-semibold text-slate-800 hover:border-[#1B3A6B] hover:bg-sky-50 hover:text-[#1B3A6B] whitespace-nowrap"
                                >
                                  {b.label}
                                </button>
                              ))}
                            </div>
                          )}
                          {selStep === 2 && (
                            <div className="flex flex-wrap gap-2">
                              {ROOM_PICK_OPTIONS.map((r) => (
                                <button
                                  key={String(r.id)}
                                  type="button"
                                  onClick={() => handleSelectRooms(r)}
                                  className="min-h-[40px] cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-xs font-semibold text-slate-800 hover:border-[#1B3A6B] hover:bg-sky-50 hover:text-[#1B3A6B] whitespace-nowrap"
                                >
                                  {r.label}
                                </button>
                              ))}
                            </div>
                          )}
                          {selStep === 3 && (
                            <div className="flex flex-wrap gap-2">
                              {WALK_OPTIONS.map((w) => (
                                <button
                                  key={w.key}
                                  type="button"
                                  onClick={() => handleSelectWalk(w)}
                                  className="min-h-[40px] cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-xs font-semibold text-slate-800 hover:border-[#1B3A6B] hover:bg-sky-50 hover:text-[#1B3A6B] whitespace-nowrap"
                                >
                                  {w.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {scenario === 'valuate' && (
                        <>
                          {valStep === 1 && (
                            <div className="space-y-3">
                              <div className="relative">
                                <Search
                                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                                  aria-hidden="true"
                                />
                                <input
                                  type="text"
                                  value={metroSearch}
                                  onChange={(e) => setMetroSearch(e.target.value)}
                                  placeholder="Поиск по 268 станциям или выберите популярную ниже…"
                                  className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#1B3A6B] focus:bg-white focus:outline-none"
                                />
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {filteredMetroList.map((m) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => handleValMetro(m)}
                                    className="min-h-[36px] cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 hover:border-[#1B3A6B] hover:bg-sky-50 hover:text-[#1B3A6B] whitespace-nowrap"
                                  >
                                    м. {m.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {valStep === 2 && (
                            <div className="flex flex-wrap gap-2">
                              {ROOM_VAL_OPTIONS.map((r) => (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => handleValRooms(r)}
                                  className="min-h-[40px] cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-xs font-semibold text-slate-800 hover:border-[#1B3A6B] hover:bg-sky-50 hover:text-[#1B3A6B] whitespace-nowrap"
                                >
                                  {r.label}
                                </button>
                              ))}
                            </div>
                          )}
                          {valStep === 3 && (
                            <div className="flex flex-wrap gap-2">
                              {(AREA_PRESETS_BY_ROOM[valRoomsId] || [35, 45, 60, 85]).map((sq) => (
                                <button
                                  key={sq}
                                  type="button"
                                  onClick={() => handleValArea(sq)}
                                  className="min-h-[40px] cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-4 font-mono text-xs font-semibold text-slate-800 hover:border-[#1B3A6B] hover:bg-sky-50 hover:text-[#1B3A6B] whitespace-nowrap"
                                >
                                  {sq} м²
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {scenario === 'quick_qa' && (
                        <div className="flex flex-wrap gap-2">
                          {CONSULTANT_QUESTIONS.map((q) => (
                            <button
                              key={q.id}
                              type="button"
                              onClick={() => handleQuickQuestion(q.id, q.label)}
                              className="min-h-[38px] cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold text-slate-800 hover:border-[#1B3A6B] hover:bg-sky-50 hover:text-[#1B3A6B]"
                            >
                              {q.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Reset / Back to Scenarios row */}
                      <div
                        className={`flex flex-wrap items-center gap-2 ${
                          (scenario === 'select_client' && selStep <= 3) ||
                          (scenario === 'valuate' && valStep <= 3) ||
                          scenario === 'quick_qa'
                            ? 'mt-3 border-t border-slate-100 pt-3'
                            : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => startScenario(scenario)}
                          className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Начать заново</span>
                        </button>
                        <button
                          type="button"
                          onClick={resetToHome}
                          className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#1B3A6B] hover:bg-sky-50 whitespace-nowrap"
                        >
                          <span>К другим сценариям</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Input */}
            <form
              onSubmit={handleCustomSubmit}
              className="flex gap-2 border-t border-slate-200 bg-white p-3.5 sm:rounded-b-2xl"
            >
              <label htmlFor="modal-consultant-input" className="sr-only">
                Введите свой вопрос консультанту
              </label>
              <input
                id="modal-consultant-input"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Выберите сценарий выше или напишите сообщение…"
                className="min-h-[42px] flex-1 rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1B3A6B] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || typing}
                aria-label="Отправить"
                className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-lg bg-[#1B3A6B] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#152E56] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
              >
                <span className="hidden sm:inline">Отправить</span>
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>,
          document.body
        )}

      {/* Persistent Floating Circular Button Bottom-Right */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Закрыть AI-консультанта' : 'Открыть AI-консультанта'}
        className="fixed right-4 bottom-[74px] z-40 flex h-13 w-13 cursor-pointer items-center justify-center rounded-full bg-[#1B3A6B] text-white shadow-lg shadow-[#1B3A6B]/30 transition-transform hover:scale-105 hover:bg-[#152E56] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1B3A6B] md:right-6 md:bottom-6 md:h-14 md:w-14"
      >
        {isOpen ? (
          <X className="h-6 w-6" aria-hidden="true" />
        ) : (
          <MessageSquare className="h-6 w-6" aria-hidden="true" />
        )}
      </button>
    </>
  );
}
