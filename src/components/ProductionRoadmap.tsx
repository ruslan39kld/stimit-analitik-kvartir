import { Layers, Radar, ShieldCheck, Sparkles } from 'lucide-react';

const ROADMAP_ITEMS = [
  {
    icon: Radar,
    title: 'Живой поток объявлений по API и парсингу',
    detail:
      'Замена статичного среза лета 2019 года на ежедневную синхронизацию с Циан, Авито, Домклик и Яндекс.Недвижимостью в режиме реального времени.',
  },
  {
    icon: Sparkles,
    title: 'ML-оценка справедливой цены и торга',
    detail:
      'Модель градиентного бустинга по этажу, серии дома, ремонту и расстоянию до метро для выявления недооценённых лотов в первые минуты публикации.',
  },
  {
    icon: ShieldCheck,
    title: 'Роли агентов, авторизация и CRM-карточки',
    detail:
      'Личные кабинеты брокеров, сохранение подборок под конкретного покупателя, экспорт PDF-презентаций и уведомления о снижении цены.',
  },
  {
    icon: Layers,
    title: 'Серверная БД и актуальный период',
    detail:
      'Перенос витрины в PostgreSQL / ClickHouse для мгновенных выборок за несколько лет истории с динамикой закрытия сделок по районам.',
  },
];

export function ProductionRoadmap() {
  return (
    <section
      aria-labelledby="roadmap-heading"
      className="rounded-xl border-2 border-[#1B3A6B]/15 bg-white p-6 shadow-xs sm:p-7"
    >
      <div className="max-w-3xl">
        <h2 id="roadmap-heading" className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          Что добавить для боевого запуска
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700 sm:text-base">
          Текущий прототип доказывает скорость клиентской аналитики на массиве 125 577 строк. Для полноценного продакшн-внедрения в агентстве недвижимости подключаются 4 модуля:
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROADMAP_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="rounded-xl border border-slate-200 bg-slate-50/80 p-5"
            >
              <Icon className="h-5 w-5 text-[#1B3A6B]" aria-hidden="true" />
              <h3 className="mt-3 text-base font-bold leading-snug text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{item.detail}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
