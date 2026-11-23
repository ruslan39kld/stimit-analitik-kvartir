import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Check,
  FileSpreadsheet,
  Filter,
  Layers,
} from 'lucide-react';
import { DATA_META } from '../data/rawSeedRows';
import { formatInt } from '../data/marketEngine';

interface StartScreenProps {
  elapsedMs: number;
  onFinishToOverview: () => void;
}

interface BreakdownStep {
  id: string;
  label: string;
  result: string;
}

const BREAKDOWN_STEPS: BreakdownStep[] = [
  {
    id: 'load',
    label: `Загрузка и очистка ${formatInt(DATA_META.raw_rows)} строк`,
    result: `Очищено до ${formatInt(DATA_META.final)}`,
  },
  {
    id: 'excel',
    label: 'Восстановление искажённых значений Excel',
    result: `Исправлено ${formatInt(DATA_META.rooms_fixed)}`,
  },
  {
    id: 'dedup',
    label: 'Дедупликация и фильтр аномалий',
    result: `−${formatInt(DATA_META.dups)} дубль · −${formatInt(DATA_META.price_outliers)} выбросов`,
  },
  {
    id: 'build',
    label: 'Построение витрины',
    result: `${DATA_META.stations} станций · готово`,
  },
];

const ENGINE_STEPS = [
  {
    step: 'Шаг 01',
    title: 'Парсинг сырого Excel',
    detail: `${formatInt(DATA_META.raw_rows)} строк, разбор 14 колонок.`,
    icon: FileSpreadsheet,
  },
  {
    step: 'Шаг 02',
    title: 'Очистка и восстановление',
    detail: `минус ${formatInt(DATA_META.junk_rows)} мусорных строк, ${formatInt(DATA_META.rooms_fixed)} исправленных артефакта Excel.`,
    icon: Filter,
  },
  {
    step: 'Шаг 03',
    title: 'Дедупликация и фильтр выбросов',
    detail: `минус ${formatInt(DATA_META.dups)} дубль и ${formatInt(DATA_META.price_outliers)} аномальных цен.`,
    icon: Layers,
  },
  {
    step: 'Шаг 04',
    title: 'Живая витрина в браузере',
    detail: 'фильтры, графики и сравнение за миллисекунды.',
    icon: BarChart3,
  },
];

export function StartScreen({ elapsedMs, onFinishToOverview }: StartScreenProps) {
  const [phase, setPhase] = useState<'intro' | 'processing'>('intro');
  const [progress, setProgress] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    if (phase !== 'processing') return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setProgress(100);
      setCompletedCount(BREAKDOWN_STEPS.length);
      const navTimer = window.setTimeout(() => {
        onFinishToOverview();
      }, 1400);
      return () => window.clearTimeout(navTimer);
    }

    setProgress(8);
    setCompletedCount(0);

    const t1 = window.setTimeout(() => {
      setCompletedCount(1);
      setProgress(28);
    }, 550);
    const t2 = window.setTimeout(() => {
      setCompletedCount(2);
      setProgress(56);
    }, 1150);
    const t3 = window.setTimeout(() => {
      setCompletedCount(3);
      setProgress(82);
    }, 1750);
    const t4 = window.setTimeout(() => {
      setCompletedCount(4);
      setProgress(100);
    }, 2350);
    const tDone = window.setTimeout(() => {
      onFinishToOverview();
    }, 2950);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
      window.clearTimeout(tDone);
    };
  }, [phase, onFinishToOverview]);

  return (
    <div
      className="relative flex min-h-screen flex-col justify-between overflow-x-hidden text-white"
      style={{
        background:
          'radial-gradient(1100px 560px at 82% -10%, rgba(14, 165, 233, 0.24), transparent 62%), linear-gradient(155deg, #0D1F40 0%, #1B3A6B 52%, #112852 100%)',
      }}
    >
      {/* 1. Header */}
      <header className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 border-b border-white/15 px-5 py-4 sm:px-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-center gap-2.5 whitespace-nowrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="2" y="10" width="5" height="12" rx="1" fill="#38BDF8" />
              <rect x="9.5" y="5" width="5" height="17" rx="1" fill="#FFFFFF" />
              <rect x="17" y="2" width="5" height="20" rx="1" fill="#0284C7" />
            </svg>
            <span className="font-display text-lg font-bold tracking-tight text-white">
              STIMIT
            </span>
          </div>
          <span className="text-sm font-medium text-sky-100/80">
            · Портфолио аналитических систем
          </span>
        </div>

        <div className="font-mono text-xs font-medium text-sky-100/85 whitespace-nowrap">
          Автономное демо · без серверов
        </div>
      </header>

      {/* Main Centered Presentation or Breakdown View */}
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-center px-5 py-10 sm:px-8 sm:py-12">
        {phase === 'intro' ? (
          <div className="space-y-9">
            {/* 2. Large Question Headline + 3. Two-Line Fact Subtitle */}
            <div className="max-w-4xl space-y-4">
              <h1 className="font-display text-3xl font-bold leading-[1.14] tracking-tight text-white [text-wrap:balance] sm:text-4xl lg:text-[44px]">
                Что можно узнать из 252 тысяч строк Excel за 3 секунды?
              </h1>
              <p className="max-w-3xl text-base leading-relaxed text-sky-100/90 sm:text-lg">
                Система очистила сырой файл на 200 МБ до {formatInt(DATA_META.final)} чистых объявлений и считает рынок прямо в вашем браузере — без сервера и загрузки данных наружу.
              </p>
            </div>

            {/* 4. Row of 4 Real Demo Metric Cards (strictly from DATA.meta + runtime elapsedMs) */}
            <dl className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-white/15 bg-white/[0.07] p-5 backdrop-blur-xs">
                <dt className="font-mono text-2xl font-bold text-white tabular-nums whitespace-nowrap xl:text-3xl">
                  {formatInt(DATA_META.raw_rows)}
                </dt>
                <dd className="mt-1.5 text-sm leading-snug text-sky-100/85">
                  сырых строк в исходном Excel
                </dd>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/[0.07] p-5 backdrop-blur-xs">
                <dt className="font-mono text-2xl font-bold text-sky-300 tabular-nums whitespace-nowrap xl:text-3xl">
                  {formatInt(DATA_META.final)}
                </dt>
                <dd className="mt-1.5 text-sm leading-snug text-sky-100/85">
                  чистых объявлений после обработки
                </dd>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/[0.07] p-5 backdrop-blur-xs">
                <dt className="font-mono text-2xl font-bold text-white tabular-nums whitespace-nowrap xl:text-3xl">
                  {DATA_META.stations}
                </dt>
                <dd className="mt-1.5 text-sm leading-snug text-sky-100/85">
                  станций метро
                </dd>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/[0.07] p-5 backdrop-blur-xs">
                <dt className="font-mono text-2xl font-bold text-emerald-300 tabular-nums whitespace-nowrap xl:text-3xl">
                  {elapsedMs} мс
                </dt>
                <dd className="mt-1.5 text-sm leading-snug text-sky-100/85">
                  пересчёт фильтров по всему массиву
                </dd>
              </div>
            </dl>

            {/* 5. "Как работает движок" — 4 horizontal SVG steps with connecting line */}
            <section aria-labelledby="engine-steps-heading" className="space-y-4">
              <h2
                id="engine-steps-heading"
                className="text-sm font-bold uppercase tracking-wider text-sky-200/90"
              >
                Как работает движок
              </h2>

              <div className="relative">
                {/* Connecting horizontal line behind step nodes (desktop) */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-9 right-10 left-10 hidden h-px bg-sky-300/30 lg:block"
                />

                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                  {ENGINE_STEPS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.step}
                        className="relative rounded-xl border border-white/15 bg-[#0F244A]/70 p-4 backdrop-blur-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-400/35 bg-[#1B3A6B] text-sky-300">
                            <Icon className="h-5 w-5" aria-hidden="true" />
                          </div>
                          <span className="font-mono text-xs font-semibold text-sky-300">
                            {item.step}
                          </span>
                        </div>
                        <h3 className="mt-3 text-base font-bold leading-snug text-white">
                          {item.title}
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-sky-100/80 sm:text-sm">
                          {item.detail}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* 6. Single Big Accent CTA Button (no sub-captions underneath) */}
            <div>
              <button
                type="button"
                onClick={() => setPhase('processing')}
                className="inline-flex min-h-[52px] cursor-pointer items-center gap-2.5 rounded-xl bg-[#0284C7] px-7 text-base font-bold text-white shadow-lg shadow-sky-950/40 transition-colors hover:bg-[#0EA5E9] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
              >
                <span>Смотреть разбор</span>
                <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          /* Breakdown Progress Screen (2–3s with checklist + skip link) */
          <div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/15 bg-[#0D2146]/85 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <h1 className="font-display text-xl font-bold text-white sm:text-2xl">
                Подготовка аналитической витрины
              </h1>
              <span className="font-mono text-lg font-bold text-sky-300 tabular-nums whitespace-nowrap">
                {progress}%
              </span>
            </div>

            {/* Progress Bar */}
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="mt-4 h-3 w-full overflow-hidden rounded-full bg-white/10"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#0284C7] to-[#38BDF8] transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* 4 Checklist Steps */}
            <ul className="mt-6 space-y-3">
              {BREAKDOWN_STEPS.map((step, idx) => {
                const done = idx < completedCount;
                const active = idx === completedCount && progress < 100;

                return (
                  <li
                    key={step.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm transition-colors ${
                      done
                        ? 'border-emerald-400/35 bg-emerald-400/10 text-white'
                        : active
                        ? 'border-sky-400/40 bg-white/10 text-white'
                        : 'border-white/10 bg-white/[0.03] text-sky-100/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                          done
                            ? 'border-emerald-400 bg-emerald-500 text-white'
                            : active
                            ? 'border-sky-300 text-sky-200'
                            : 'border-white/25 text-sky-100/50'
                        }`}
                      >
                        {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : idx + 1}
                      </span>
                      <span className="font-medium">{step.label}</span>
                    </div>

                    <span
                      className={`font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${
                        done ? 'text-emerald-300' : 'text-sky-200/75'
                      }`}
                    >
                      {step.result}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={onFinishToOverview}
                className="cursor-pointer text-sm font-medium text-sky-200/85 underline decoration-sky-300/40 underline-offset-4 transition-colors hover:text-white hover:decoration-white"
              >
                Перейти сразу к обзору
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Thin Presentation Footer */}
      <footer className="mx-auto w-full max-w-[1200px] border-t border-white/10 px-5 py-4 text-xs text-sky-100/60 sm:px-8">
        STIMIT · Москва, {DATA_META.period} · {formatInt(DATA_META.final)} объявлений в памяти браузера
      </footer>
    </div>
  );
}
