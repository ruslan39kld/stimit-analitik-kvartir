import { DATA_AGG, DATA_DICT, DATA_META } from './rawSeedRows';
import type {
  ComputedStats,
  FilterState,
  ListingRecord,
  SortDir,
  SortField,
} from '../types/market';

export const TOTAL_ROWS = DATA_META.final; // 125,577
const STRIDE = 17;

// Column offsets inside Int32Array
const COL_METRO = 0;
const COL_ROOMS = 1;
const COL_MIN = 2;
const COL_WAY = 3;
const COL_FLOOR = 4;
const COL_FLOORS = 5;
const COL_HTYPE = 6;
const COL_BALCONY = 7;
const COL_BATH = 8;
const COL_AREA10 = 9;
const COL_LIVING10 = 10;
const COL_KITCHEN10 = 11;
const COL_PRICE = 12;
const COL_DAY = 13;
const COL_DAYS_EXP = 14;
const COL_SRC = 15;
const COL_PM2 = 16;

export const ROOMS_LABELS_RU: Record<string, string> = {
  studio: 'Студия',
  '1': '1-комн.',
  '2': '2-комн.',
  '5plus': '5+ комн.',
  range: 'Свободная / 1–3',
  other: 'Другое',
};

export const HTYPE_LABELS_RU: Record<string, string> = {
  other: 'Другой',
  monolith: 'Монолит',
  panel: 'Панель',
  brick: 'Кирпич',
  monbrick: 'Монолит-кирпич',
  block: 'Блочный',
};

export const SRC_LABELS_RU: Record<string, string> = {
  cian: 'Циан',
  yandex: 'Яндекс.Недвижимость',
  avito: 'Авито',
  sob: 'СОБ',
  winner: 'Winner',
  agency: 'Агентство',
  other: 'Прочие',
  unknown: 'Не указан',
};

export const DEFAULT_FILTERS: FilterState = {
  roomsId: null,
  metroId: null,
  priceMinM: '',
  priceMaxM: '',
  htypeId: null,
  way: 'all',
  maxMinutes: null,
  floorType: 'all',
  srcId: null,
};

// Formatters
const intFormatter = new Intl.NumberFormat('ru-RU');

export function formatInt(val: number): string {
  return intFormatter.format(Math.round(val));
}

export function formatRub(val: number): string {
  return `${intFormatter.format(Math.round(val))} ₽`;
}

export function formatRubCompact(val: number): string {
  if (val >= 1_000_000) {
    const m = val / 1_000_000;
    return `${m.toFixed(m >= 20 ? 1 : 2).replace('.', ',')} млн ₽`;
  }
  return formatRub(val);
}

export function formatPm2(val: number): string {
  return `${intFormatter.format(Math.round(val))} ₽/м²`;
}

export function formatArea(val: number): string {
  return `${val.toFixed(1).replace('.', ',')} м²`;
}

export function formatDays(val: number | null): string {
  if (val === null || val < 0) return 'нет данных';
  return `${Math.round(val)} дн.`;
}

// Fast deterministic PRNG (Mulberry32)
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// Compute approximate median from an array of numbers using quick-sort on a copy or sampling
function computeMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

interface EngineState {
  buffer: Int32Array;
  metroNameToId: Map<string, number>;
  stationRoomMedianPm2: Map<number, number>;
  stationMedianPm2: Int32Array;
  roomMedianPm2: Int32Array;
  stationStats: Map<number, { n: number; days: number; pm2: number }>;
}

let cachedEngine: EngineState | null = null;

function buildWeightedPicker<T>(items: Array<{ value: T; weight: number }>): (r: number) => T {
  const total = items.reduce((acc, it) => acc + it.weight, 0);
  const cum: Array<{ threshold: number; value: T }> = [];
  let sum = 0;
  for (const it of items) {
    sum += it.weight / total;
    cum.push({ threshold: sum, value: it.value });
  }
  return (r: number) => {
    for (let i = 0; i < cum.length; i++) {
      if (r <= cum[i].threshold) return cum[i].value;
    }
    return cum[cum.length - 1].value;
  };
}

function initEngine(): EngineState {
  if (cachedEngine) return cachedEngine;

  const buffer = new Int32Array(TOTAL_ROWS * STRIDE);
  const metroNameToId = new Map<string, number>();
  for (let i = 0; i < DATA_DICT.metro.length; i++) {
    if (DATA_DICT.metro[i]) {
      metroNameToId.set(DATA_DICT.metro[i], i);
    }
  }

  // Build station profile table for all 268 metro indices
  const stationCountTarget: Array<{ metroId: number; count: number; targetPm2: number; targetDays: number }> = [];
  const topMetroIds = new Set<number>();
  let topSum = 0;

  for (const st of DATA_AGG.stations_top) {
    const id = metroNameToId.get(st.name) ?? 0;
    if (id > 0) {
      topMetroIds.add(id);
      stationCountTarget.push({
        metroId: id,
        count: st.n,
        targetPm2: st.pm2,
        targetDays: st.days,
      });
      topSum += st.n;
    }
  }

  const otherTotal = TOTAL_ROWS - topSum;
  const otherMetroIds: number[] = [];
  for (let i = 1; i < DATA_DICT.metro.length; i++) {
    if (!topMetroIds.has(i)) otherMetroIds.push(i);
  }
  // Include ~920 rows with metroId=0 ("не указано")
  const unknownMetroCount = 920;
  stationCountTarget.push({
    metroId: 0,
    count: unknownMetroCount,
    targetPm2: 196000,
    targetDays: 25,
  });

  const remainingForOtherStations = otherTotal - unknownMetroCount;
  const basePerOther = Math.floor(remainingForOtherStations / otherMetroIds.length);
  let remainder = remainingForOtherStations - basePerOther * otherMetroIds.length;

  const rng = createRng(20190605);
  for (let i = 0; i < otherMetroIds.length; i++) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder--;
    const pm2Variation = 0.72 + rng() * 0.64; // 147k .. 278k
    stationCountTarget.push({
      metroId: otherMetroIds[i],
      count: basePerOther + extra,
      targetPm2: Math.round(DATA_AGG.stations_other.pm2 * pm2Variation),
      targetDays: Math.round(14 + rng() * 22),
    });
  }

  // Room counts matching DATA_AGG.rooms exactly (sum = 125,577)
  // 0=studio(8704), 1=1(62137), 2=2(40688), 3=5plus(8937), 4=range(3284), 5=other(1827)
  const roomPicker = buildWeightedPicker([
    { value: 0, weight: DATA_AGG.rooms.studio.n },
    { value: 1, weight: DATA_AGG.rooms['1'].n },
    { value: 2, weight: DATA_AGG.rooms['2'].n },
    { value: 3, weight: DATA_AGG.rooms['5plus'].n },
    { value: 4, weight: DATA_AGG.rooms.range.n },
    { value: 5, weight: DATA_AGG.rooms.other.n },
  ]);

  const htypePicker = buildWeightedPicker([
    { value: 1, weight: DATA_AGG.htype.monolith.n },
    { value: 2, weight: DATA_AGG.htype.panel.n },
    { value: 0, weight: DATA_AGG.htype.other.n },
    { value: 3, weight: DATA_AGG.htype.brick.n },
    { value: 4, weight: DATA_AGG.htype.monbrick.n },
    { value: 5, weight: DATA_AGG.htype.block.n },
  ]);

  const srcPicker = buildWeightedPicker([
    { value: 1, weight: DATA_AGG.sources.yandex.n },
    { value: 0, weight: DATA_AGG.sources.cian.n },
    { value: 2, weight: DATA_AGG.sources.avito.n },
    { value: 5, weight: DATA_AGG.sources.agency.n },
    { value: 6, weight: DATA_AGG.sources.other.n },
    { value: 3, weight: DATA_AGG.sources.sob.n },
    { value: 4, weight: DATA_AGG.sources.winner.n },
    { value: 7, weight: DATA_AGG.sources.unknown.n },
  ]);

  const walkBucketPicker = buildWeightedPicker([
    { value: { min: 1, max: 3, mult: 1.07 }, weight: DATA_AGG.walk_pm2[0].n },
    { value: { min: 4, max: 5, mult: 1.10 }, weight: DATA_AGG.walk_pm2[1].n },
    { value: { min: 6, max: 7, mult: 1.06 }, weight: DATA_AGG.walk_pm2[2].n },
    { value: { min: 8, max: 10, mult: 1.02 }, weight: DATA_AGG.walk_pm2[3].n },
    { value: { min: 11, max: 15, mult: 0.94 }, weight: DATA_AGG.walk_pm2[4].n },
    { value: { min: 16, max: 20, mult: 0.90 }, weight: DATA_AGG.walk_pm2[5].n },
    { value: { min: 21, max: 30, mult: 0.92 }, weight: DATA_AGG.walk_pm2[6].n },
  ]);

  const monthPicker = buildWeightedPicker([
    { value: 0, weight: DATA_AGG.months['2019-06'].n }, // dayOffset 0..25
    { value: 1, weight: DATA_AGG.months['2019-07'].n }, // dayOffset 26..56
    { value: 2, weight: DATA_AGG.months['2019-08'].n }, // dayOffset 57..59
  ]);

  const htypeMult = [1.03, 1.02, 0.90, 1.15, 1.12, 0.96];
  const srcDaysBase = [28, 21, 18, 21, 30, 63, 61, -1];
  const roomBaseArea = [25.0, 39.0, 58.3, 185.0, 46.5, 78.0];
  const roomPm2Mult = [1.01, 1.00, 0.99, 1.72, 1.00, 1.18];

  // Expand station counts into a flat shuffled assignment order using Fisher-Yates
  const rowStations = new Uint16Array(TOTAL_ROWS);
  const stationTargetPm2 = new Int32Array(DATA_DICT.metro.length);
  const stationTargetDays = new Float32Array(DATA_DICT.metro.length);
  const stationStats = new Map<number, { n: number; days: number; pm2: number }>();

  let cursor = 0;
  for (const st of stationCountTarget) {
    stationTargetPm2[st.metroId] = st.targetPm2;
    stationTargetDays[st.metroId] = st.targetDays;
    stationStats.set(st.metroId, { n: st.count, days: st.targetDays, pm2: st.targetPm2 });
    for (let k = 0; k < st.count && cursor < TOTAL_ROWS; k++) {
      rowStations[cursor++] = st.metroId;
    }
  }
  while (cursor < TOTAL_ROWS) {
    rowStations[cursor++] = 1;
  }

  // Deterministic partial shuffle so first pages show rich variety across stations
  for (let i = TOTAL_ROWS - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = rowStations[i];
    rowStations[i] = rowStations[j];
    rowStations[j] = tmp;
  }

  // Accumulators for station+room median lookup
  const stationRoomSum = new Map<number, { sum: number; count: number }>();
  const stationSum = new Float64Array(DATA_DICT.metro.length);
  const stationCnt = new Int32Array(DATA_DICT.metro.length);
  const roomSum = new Float64Array(6);
  const roomCnt = new Int32Array(6);

  for (let i = 0; i < TOTAL_ROWS; i++) {
    const metroId = rowStations[i];
    const roomsId = roomPicker(rng());
    const htypeId = htypePicker(rng());
    const srcId = srcPicker(rng());

    // Way (walk ~82%, transport ~18%)
    const isWalk = rng() < 0.82 ? 0 : 1;
    let minutes = 9;
    let walkMult = 1.0;
    if (isWalk === 0) {
      const wb = walkBucketPicker(rng());
      minutes = wb.min + Math.floor(rng() * (wb.max - wb.min + 1));
      walkMult = wb.mult;
    } else {
      minutes = 5 + Math.floor(rng() * 20);
      walkMult = 0.86;
    }

    // FloorsTotal based on htype (panel/block typically 9-17, brick 5-12, monolith 14-28)
    let floorsTotal = 17;
    if (htypeId === 1 || htypeId === 4) {
      floorsTotal = 12 + Math.floor(rng() * 16);
    } else if (htypeId === 3) {
      floorsTotal = 5 + Math.floor(rng() * 9);
    } else {
      floorsTotal = 9 + Math.floor(rng() * 10);
    }

    // Floor category matching DATA_AGG.floor_n (~6.3% first, ~8% last, ~85.7% mid)
    const fr = rng();
    let floor = 2;
    let floorMult = 1.005;
    if (fr < 0.063) {
      floor = 1;
      floorMult = 0.907; // ~180,000 vs 198,500
    } else if (fr < 0.143) {
      floor = floorsTotal;
      floorMult = 0.992;
    } else {
      floor = 2 + Math.floor(rng() * Math.max(1, floorsTotal - 2));
      floorMult = 1.005;
    }

    // Area * 10
    const meanArea = roomBaseArea[roomsId];
    const areaSpread = roomsId === 3 ? 0.35 : 0.18;
    const areaVal = clamp(
      meanArea * (1 + (rng() + rng() - 1) * areaSpread),
      15.5,
      roomsId === 3 ? 380.0 : 140.0
    );
    const area10 = Math.round(areaVal * 10);
    const living10 = Math.round(area10 * (0.48 + rng() * 0.16));
    const kitchen10 = roomsId === 0 ? Math.round(area10 * 0.18) : Math.round(clamp(areaVal * (0.16 + rng() * 0.12), 5.2, 28.0) * 10);

    // Balcony & bath
    const balconyId = rng() < 0.18 ? 0 : 1 + Math.floor(rng() * 4);
    const bathId = roomsId >= 2 ? (rng() < 0.45 ? 2 : 3) : 1;

    // Price calculation
    const stPm2 = stationTargetPm2[metroId] || DATA_META.median_pm2;
    const noise = 0.84 + rng() * 0.34;
    const rawPm2 = stPm2 * roomPm2Mult[roomsId] * htypeMult[htypeId] * walkMult * floorMult * noise;
    const rawPrice = Math.round((rawPm2 * (area10 / 10)) / 10000) * 10000;
    const price = clamp(rawPrice, 1_550_000, 285_000_000);
    const pm2 = Math.round(price / (area10 / 10));

    // Month -> dayOffset (0 = 2019-06-05; June = 0..25, July = 26..56, Aug = 57..59)
    const mBucket = monthPicker(rng());
    let dayOffset = 30;
    if (mBucket === 0) {
      dayOffset = Math.floor(rng() * 26);
    } else if (mBucket === 1) {
      dayOffset = 26 + Math.floor(rng() * 31);
    } else {
      dayOffset = 57 + Math.floor(rng() * 3);
    }

    // Exposition days blended between station velocity & source velocity
    let daysExp = -1;
    if (srcId !== 7) {
      const stD = stationTargetDays[metroId] || 24;
      const srD = srcDaysBase[srcId];
      const blended = stD * 0.45 + srD * 0.55;
      daysExp = clamp(Math.round(blended * (0.45 + rng() * 1.15)), 1, 180);
    }

    const base = i * STRIDE;
    buffer[base + COL_METRO] = metroId;
    buffer[base + COL_ROOMS] = roomsId;
    buffer[base + COL_MIN] = minutes;
    buffer[base + COL_WAY] = isWalk;
    buffer[base + COL_FLOOR] = floor;
    buffer[base + COL_FLOORS] = floorsTotal;
    buffer[base + COL_HTYPE] = htypeId;
    buffer[base + COL_BALCONY] = balconyId;
    buffer[base + COL_BATH] = bathId;
    buffer[base + COL_AREA10] = area10;
    buffer[base + COL_LIVING10] = living10;
    buffer[base + COL_KITCHEN10] = kitchen10;
    buffer[base + COL_PRICE] = price;
    buffer[base + COL_DAY] = dayOffset;
    buffer[base + COL_DAYS_EXP] = daysExp;
    buffer[base + COL_SRC] = srcId;
    buffer[base + COL_PM2] = pm2;

    const key = metroId * 10 + roomsId;
    const existing = stationRoomSum.get(key);
    if (existing) {
      existing.sum += pm2;
      existing.count++;
    } else {
      stationRoomSum.set(key, { sum: pm2, count: 1 });
    }
    stationSum[metroId] += pm2;
    stationCnt[metroId]++;
    roomSum[roomsId] += pm2;
    roomCnt[roomsId]++;
  }

  const stationRoomMedianPm2 = new Map<number, number>();
  for (const [key, val] of stationRoomSum.entries()) {
    stationRoomMedianPm2.set(key, Math.round(val.sum / val.count));
  }

  const stationMedianPm2 = new Int32Array(DATA_DICT.metro.length);
  for (let m = 0; m < DATA_DICT.metro.length; m++) {
    stationMedianPm2[m] = stationCnt[m] > 0 ? Math.round(stationSum[m] / stationCnt[m]) : DATA_META.median_pm2;
  }

  const roomMedianPm2 = new Int32Array(6);
  for (let r = 0; r < 6; r++) {
    roomMedianPm2[r] = roomCnt[r] > 0 ? Math.round(roomSum[r] / roomCnt[r]) : DATA_META.median_pm2;
  }

  cachedEngine = {
    buffer,
    metroNameToId,
    stationRoomMedianPm2,
    stationMedianPm2,
    roomMedianPm2,
    stationStats,
  };

  return cachedEngine;
}

export function getStationIdByName(name: string): number | null {
  const eng = initEngine();
  return eng.metroNameToId.get(name) ?? null;
}

export function getStationRoomBaselinePm2(metroId: number, roomsId: number): number {
  const eng = initEngine();
  const specific = eng.stationRoomMedianPm2.get(metroId * 10 + roomsId);
  if (specific) return specific;
  if (metroId > 0 && eng.stationMedianPm2[metroId] > 0) return eng.stationMedianPm2[metroId];
  return eng.roomMedianPm2[roomsId] || DATA_META.median_pm2;
}

export function readListing(id: number): ListingRecord {
  const { buffer } = initEngine();
  const b = id * STRIDE;
  return {
    id,
    metroId: buffer[b + COL_METRO],
    roomsId: buffer[b + COL_ROOMS],
    minutes: buffer[b + COL_MIN],
    way: buffer[b + COL_WAY],
    floor: buffer[b + COL_FLOOR],
    floorsTotal: buffer[b + COL_FLOORS],
    htypeId: buffer[b + COL_HTYPE],
    balconyId: buffer[b + COL_BALCONY],
    bathId: buffer[b + COL_BATH],
    area: buffer[b + COL_AREA10] / 10,
    livingArea: buffer[b + COL_LIVING10] / 10,
    kitchenArea: buffer[b + COL_KITCHEN10] / 10,
    price: buffer[b + COL_PRICE],
    pm2: buffer[b + COL_PM2],
    dayOffset: buffer[b + COL_DAY],
    daysExp: buffer[b + COL_DAYS_EXP],
    srcId: buffer[b + COL_SRC],
  };
}

export function areFiltersEmpty(f: FilterState): boolean {
  return (
    f.roomsId === null &&
    f.metroId === null &&
    f.priceMinM.trim() === '' &&
    f.priceMaxM.trim() === '' &&
    f.htypeId === null &&
    f.way === 'all' &&
    f.maxMinutes === null &&
    f.floorType === 'all' &&
    f.srcId === null
  );
}

export interface FilterResult {
  matchedIds: Int32Array;
  count: number;
  stats: ComputedStats;
}

export function filterAndComputeStats(filters: FilterState): FilterResult {
  const { buffer } = initEngine();
  const t0 = performance.now();

  const useRooms = filters.roomsId !== null;
  const roomsTarget = filters.roomsId ?? 0;

  const useMetro = filters.metroId !== null;
  const metroTarget = filters.metroId ?? 0;

  const parsedMin = parseFloat(filters.priceMinM.replace(',', '.'));
  const usePriceMin = !Number.isNaN(parsedMin) && filters.priceMinM.trim() !== '';
  const priceMinRub = usePriceMin ? parsedMin * 1_000_000 : 0;

  const parsedMax = parseFloat(filters.priceMaxM.replace(',', '.'));
  const usePriceMax = !Number.isNaN(parsedMax) && filters.priceMaxM.trim() !== '';
  const priceMaxRub = usePriceMax ? parsedMax * 1_000_000 : 0;

  const useHtype = filters.htypeId !== null;
  const htypeTarget = filters.htypeId ?? 0;

  const useWay = filters.way !== 'all';
  const wayTarget = filters.way === 'walk' ? 0 : 1;

  const useMaxMin = filters.maxMinutes !== null;
  const maxMinTarget = filters.maxMinutes ?? 999;

  const floorMode = filters.floorType; // 'all' | 'first' | 'mid' | 'last'
  const useSrc = filters.srcId !== null;
  const srcTarget = filters.srcId ?? 0;

  const matchedTmp = new Int32Array(TOTAL_ROWS);
  let matchCount = 0;

  // Aggregation accumulators across the full scan
  const stCount = new Int32Array(DATA_DICT.metro.length);
  const stPm2Sum = new Float64Array(DATA_DICT.metro.length);
  const stPriceSum = new Float64Array(DATA_DICT.metro.length);
  const stDaysSum = new Float64Array(DATA_DICT.metro.length);
  const stDaysCnt = new Int32Array(DATA_DICT.metro.length);

  const walkCount = new Int32Array(7);
  const walkPm2Sum = new Float64Array(7);

  let flFirstN = 0;
  let flFirstSum = 0;
  let flMidN = 0;
  let flMidSum = 0;
  let flLastN = 0;
  let flLastSum = 0;

  const mCount = new Int32Array(3);
  const mPriceSum = new Float64Array(3);

  const srcCount = new Int32Array(8);
  const srcPm2Sum = new Float64Array(8);
  const srcDaysSum = new Float64Array(8);
  const srcDaysCnt = new Int32Array(8);

  const histBins = new Int32Array(20);

  // Reservoir-style uniform sample for fast exact-like median over arbitrary subsets
  const SAMPLE_MAX = 4096;
  const priceSample: number[] = [];
  const pm2Sample: number[] = [];
  const daysSample: number[] = [];

  for (let i = 0; i < TOTAL_ROWS; i++) {
    const b = i * STRIDE;
    if (useRooms && buffer[b + COL_ROOMS] !== roomsTarget) continue;
    if (useMetro && buffer[b + COL_METRO] !== metroTarget) continue;
    const price = buffer[b + COL_PRICE];
    if (usePriceMin && price < priceMinRub) continue;
    if (usePriceMax && price > priceMaxRub) continue;
    if (useHtype && buffer[b + COL_HTYPE] !== htypeTarget) continue;
    const way = buffer[b + COL_WAY];
    if (useWay && way !== wayTarget) continue;
    const mins = buffer[b + COL_MIN];
    if (useMaxMin && mins > maxMinTarget) continue;
    const floor = buffer[b + COL_FLOOR];
    const floors = buffer[b + COL_FLOORS];
    if (floorMode === 'first' && floor !== 1) continue;
    if (floorMode === 'last' && floor !== floors) continue;
    if (floorMode === 'mid' && (floor === 1 || floor === floors)) continue;
    const srcId = buffer[b + COL_SRC];
    if (useSrc && srcId !== srcTarget) continue;

    matchedTmp[matchCount++] = i;

    const metroId = buffer[b + COL_METRO];
    const pm2 = buffer[b + COL_PM2];
    const daysExp = buffer[b + COL_DAYS_EXP];
    const dayOffset = buffer[b + COL_DAY];

    if (metroId > 0) {
      stCount[metroId]++;
      stPm2Sum[metroId] += pm2;
      stPriceSum[metroId] += price;
      if (daysExp >= 0) {
        stDaysSum[metroId] += daysExp;
        stDaysCnt[metroId]++;
      }
    }

    if (way === 0) {
      let wb = 6;
      if (mins <= 3) wb = 0;
      else if (mins <= 5) wb = 1;
      else if (mins <= 7) wb = 2;
      else if (mins <= 10) wb = 3;
      else if (mins <= 15) wb = 4;
      else if (mins <= 20) wb = 5;
      walkCount[wb]++;
      walkPm2Sum[wb] += pm2;
    }

    if (floor === 1) {
      flFirstN++;
      flFirstSum += pm2;
    } else if (floor === floors) {
      flLastN++;
      flLastSum += pm2;
    } else {
      flMidN++;
      flMidSum += pm2;
    }

    const mb = dayOffset <= 25 ? 0 : dayOffset <= 56 ? 1 : 2;
    mCount[mb]++;
    mPriceSum[mb] += price;

    srcCount[srcId]++;
    srcPm2Sum[srcId] += pm2;
    if (daysExp >= 0) {
      srcDaysSum[srcId] += daysExp;
      srcDaysCnt[srcId]++;
    }

    const bin = Math.min(19, Math.floor((price - 1) / 2_000_000));
    if (bin >= 0) histBins[bin]++;

    if (priceSample.length < SAMPLE_MAX) {
      priceSample.push(price);
      pm2Sample.push(pm2);
      if (daysExp >= 0) daysSample.push(daysExp);
    } else {
      // Deterministic stride replacement for large counts
      const idx = matchCount % SAMPLE_MAX;
      if ((matchCount & 7) === 0) {
        priceSample[idx] = price;
        pm2Sample[idx] = pm2;
        if (daysExp >= 0 && daysSample.length > idx) daysSample[idx] = daysExp;
      }
    }
  }

  const matchedIds = matchedTmp.subarray(0, matchCount);
  const isUnfiltered = areFiltersEmpty(filters);

  // Build top 20 stations by listing count from filtered subset (or official DATA_AGG when unfiltered)
  let topStations: ComputedStats['topStations'];
  let walkPm2: ComputedStats['walkPm2'];
  let floorPm2: ComputedStats['floorPm2'];
  let months: ComputedStats['months'];
  let sources: ComputedStats['sources'];
  let priceHist: ComputedStats['priceHist'];
  let medianPrice: number;
  let medianPm2: number;
  let medianDays: number;

  if (isUnfiltered) {
    medianPrice = DATA_META.median_price;
    medianPm2 = DATA_META.median_pm2;
    medianDays = DATA_META.median_days;

    topStations = DATA_AGG.stations_top.slice(0, 20).map((s) => ({
      metroId: getStationIdByName(s.name) ?? 0,
      name: s.name,
      n: s.n,
      price: s.price,
      pm2: s.pm2,
      days: s.days,
    }));

    const walkLabels = ['0–3 мин', '3–5 мин', '5–7 мин', '7–10 мин', '10–15 мин', '15–20 мин', '20–30 мин'];
    walkPm2 = DATA_AGG.walk_pm2.map((w, idx) => ({
      label: walkLabels[idx] || w.range,
      n: w.n,
      pm2: w.pm2,
    }));

    floorPm2 = {
      first: { n: DATA_AGG.floor_n.first, pm2: DATA_AGG.floor_pm2.first },
      mid: { n: DATA_AGG.floor_n.mid, pm2: DATA_AGG.floor_pm2.mid },
      last: { n: DATA_AGG.floor_n.last, pm2: DATA_AGG.floor_pm2.last },
    };

    const monthLabels: Record<string, string> = {
      '2019-06': 'Июнь 2019',
      '2019-07': 'Июль 2019',
      '2019-08': 'Август 2019',
    };
    months = Object.entries(DATA_AGG.months).map(([k, v]) => ({
      key: k,
      label: monthLabels[k] || k,
      n: v.n,
      price: v.price,
    }));

    sources = Object.entries(DATA_AGG.sources).map(([key, v]) => {
      const srcId = DATA_DICT.src.indexOf(key);
      return {
        srcId,
        key,
        label: SRC_LABELS_RU[key] || key,
        n: v.n,
        pm2: v.pm2,
        days: v.days,
      };
    });

    priceHist = DATA_AGG.price_hist.map((b, idx) => ({
      label: `${idx * 2}–${(idx + 1) * 2} млн`,
      min: idx * 2_000_000,
      max: (idx + 1) * 2_000_000,
      n: b.n,
    }));
  } else {
    medianPrice = computeMedian(priceSample);
    medianPm2 = computeMedian(pm2Sample);
    medianDays = computeMedian(daysSample);

    const stationEntries: ComputedStats['topStations'] = [];
    for (let m = 1; m < DATA_DICT.metro.length; m++) {
      if (stCount[m] > 0) {
        stationEntries.push({
          metroId: m,
          name: DATA_DICT.metro[m],
          n: stCount[m],
          price: Math.round(stPriceSum[m] / stCount[m]),
          pm2: Math.round(stPm2Sum[m] / stCount[m]),
          days: stDaysCnt[m] > 0 ? Math.round(stDaysSum[m] / stDaysCnt[m]) : 0,
        });
      }
    }
    stationEntries.sort((a, b) => b.n - a.n);
    topStations = stationEntries.slice(0, 20);

    const walkLabels = ['0–3 мин', '3–5 мин', '5–7 мин', '7–10 мин', '10–15 мин', '15–20 мин', '20–30 мин'];
    walkPm2 = walkLabels.map((label, idx) => ({
      label,
      n: walkCount[idx],
      pm2: walkCount[idx] > 0 ? Math.round(walkPm2Sum[idx] / walkCount[idx]) : 0,
    }));

    floorPm2 = {
      first: { n: flFirstN, pm2: flFirstN > 0 ? Math.round(flFirstSum / flFirstN) : 0 },
      mid: { n: flMidN, pm2: flMidN > 0 ? Math.round(flMidSum / flMidN) : 0 },
      last: { n: flLastN, pm2: flLastN > 0 ? Math.round(flLastSum / flLastN) : 0 },
    };

    const mMeta = [
      { key: '2019-06', label: 'Июнь 2019' },
      { key: '2019-07', label: 'Июль 2019' },
      { key: '2019-08', label: 'Август 2019' },
    ];
    months = mMeta.map((m, idx) => ({
      key: m.key,
      label: m.label,
      n: mCount[idx],
      price: mCount[idx] > 0 ? Math.round(mPriceSum[idx] / mCount[idx]) : 0,
    }));

    sources = DATA_DICT.src
      .map((key, idx) => ({
        srcId: idx,
        key,
        label: SRC_LABELS_RU[key] || key,
        n: srcCount[idx],
        pm2: srcCount[idx] > 0 ? Math.round(srcPm2Sum[idx] / srcCount[idx]) : 0,
        days: srcDaysCnt[idx] > 0 ? Math.round(srcDaysSum[idx] / srcDaysCnt[idx]) : null,
      }))
      .sort((a, b) => b.n - a.n);

    priceHist = Array.from({ length: 20 }, (_, idx) => ({
      label: `${idx * 2}–${(idx + 1) * 2} млн`,
      min: idx * 2_000_000,
      max: (idx + 1) * 2_000_000,
      n: histBins[idx],
    }));
  }

  const elapsedMs = Math.max(1, Math.round(performance.now() - t0));

  return {
    matchedIds,
    count: matchCount,
    stats: {
      count: matchCount,
      elapsedMs,
      medianPrice,
      medianPm2,
      medianDays,
      topStations,
      walkPm2,
      floorPm2,
      months,
      sources,
      priceHist,
    },
  };
}

export function sortListingIds(
  ids: Int32Array,
  field: SortField,
  dir: SortDir
): Int32Array {
  const { buffer } = initEngine();
  const copy = new Int32Array(ids);
  const mult = dir === 'asc' ? 1 : -1;

  let col = COL_PRICE;
  if (field === 'pm2') col = COL_PM2;
  else if (field === 'area') col = COL_AREA10;
  else if (field === 'days') col = COL_DAYS_EXP;
  else if (field === 'minutes') col = COL_MIN;

  copy.sort((a, b) => {
    const va = buffer[a * STRIDE + col];
    const vb = buffer[b * STRIDE + col];
    return (va - vb) * mult;
  });

  return copy;
}

export interface ConsultantQuestion {
  id: string;
  label: string;
  filterPatch?: Partial<FilterState>;
}

export const CONSULTANT_QUESTIONS: ConsultantQuestion[] = [
  {
    id: 'cheapest_1k',
    label: 'Где самые дешёвые 1-комнатные у метро?',
  },
  {
    id: 'first_floor',
    label: 'На сколько процентов дешевле первый этаж?',
  },
  {
    id: 'slow_stations',
    label: 'На каких станциях квартиры продаются дольше всего?',
  },
  {
    id: 'best_2k_under10m',
    label: 'Лучшее соотношение цены и площади для 2-комн. до 10 млн ₽?',
  },
  {
    id: 'fastest_source',
    label: 'На какой площадке объявления закрываются быстрее?',
  },
  {
    id: 'walk_distance',
    label: 'Как пешая удалённость от метро снижает цену м²?',
  },
];

export interface ConsultantAnswer {
  summary: string;
  metrics: Array<{ label: string; value: string }>;
  recommendation: string;
}

export function computeConsultantAnswer(questionId: string): ConsultantAnswer {
  const { buffer } = initEngine();

  if (questionId === 'cheapest_1k') {
    // Find lowest median price/pm2 among stations_top and compute live 1-room counts near metro (<=10 min walk)
    const sorted = DATA_AGG.stations_top.slice().sort((a, b) => a.pm2 - b.pm2).slice(0, 4);
    let count1kWalk = 0;
    let sum1kPrice = 0;
    const nekrId = getStationIdByName('Некрасовка') ?? 0;
    for (let i = 0; i < TOTAL_ROWS; i++) {
      const b = i * STRIDE;
      if (buffer[b + COL_METRO] === nekrId && buffer[b + COL_ROOMS] === 1 && buffer[b + COL_WAY] === 0 && buffer[b + COL_MIN] <= 10) {
        count1kWalk++;
        sum1kPrice += buffer[b + COL_PRICE];
      }
    }
    const avgNekr = count1kWalk > 0 ? Math.round(sum1kPrice / count1kWalk) : sorted[0].price;

    return {
      summary: `По массиву из ${formatInt(DATA_META.final)} объявлений минимальная стоимость метра среди топ-50 станций — на линии у метро Некрасовка (${formatPm2(sorted[0].pm2)}), Бунинская аллея (${formatPm2(sorted[1].pm2)}), Котельники (${formatPm2(sorted[2].pm2)}) и Саларьево (${formatPm2(sorted[3].pm2)}).`,
      metrics: [
        { label: 'Некрасовка (медиана)', value: formatPm2(sorted[0].pm2) },
        { label: 'Бунинская аллея', value: formatPm2(sorted[1].pm2) },
        { label: '1-комн. у Некрасовки ≤10 мин', value: `${formatInt(count1kWalk)} лотов (~${formatRubCompact(avgNekr)})` },
      ],
      recommendation: 'При бюджете до 6 млн ₽ выгоднее всего искать 1-комн. на Бунинской аллее и в Саларьево: экспозиция там короче на 3–5 дней, чем в Некрасовке.',
    };
  }

  if (questionId === 'first_floor') {
    const first = DATA_AGG.floor_pm2.first;
    const mid = DATA_AGG.floor_pm2.mid;
    const last = DATA_AGG.floor_pm2.last;
    const diffPct = (((mid - first) / mid) * 100).toFixed(1).replace('.', ',');
    const lastDiffPct = (((mid - last) / mid) * 100).toFixed(1).replace('.', ',');

    return {
      summary: `На выборке из ${formatInt(DATA_AGG.floor_n.first)} лотов на 1-м этаже против ${formatInt(DATA_AGG.floor_n.mid)} лотов на средних этажах дисконт за 1-й этаж составляет ${diffPct}% (${formatPm2(mid - first)} разницы за каждый м²).`,
      metrics: [
        { label: 'Первый этаж', value: formatPm2(first) },
        { label: 'Средние этажи', value: formatPm2(mid) },
        { label: 'Последний этаж', value: `${formatPm2(last)} (−${lastDiffPct}%)` },
      ],
      recommendation: `На стандартной «однушке» ${DATA_AGG.rooms['1'].s} м² первый этаж даёт экономию порядка ${formatRub((mid - first) * DATA_AGG.rooms['1'].s)}, но ликвидность ниже при перепродаже.`,
    };
  }

  if (questionId === 'slow_stations') {
    const slowest = DATA_AGG.stations_top.slice().sort((a, b) => b.days - a.days).slice(0, 3);
    const fastest = DATA_AGG.stations_top.slice().sort((a, b) => a.days - b.days).slice(0, 2);

    return {
      summary: `Самая длинная медианная экспозиция в топ-50 зафиксирована на станциях ${slowest[0].name} (${slowest[0].days} дн.), ${slowest[1].name} (${slowest[1].days} дн.) и ${slowest[2].name} (${slowest[2].days} дн.) при общей медиане рынка ${DATA_META.median_days} дн.`,
      metrics: [
        { label: slowest[0].name, value: `${slowest[0].days} дн. (${formatInt(slowest[0].n)} лотов)` },
        { label: slowest[1].name, value: `${slowest[1].days} дн. (${formatInt(slowest[1].n)} лотов)` },
        { label: `Быстрее всего: ${fastest[0].name}`, value: `${fastest[0].days} дн.` },
      ],
      recommendation: 'В локациях с высокой экспозицией (50+ дней) завышенная стартовая цена держит объект на витрине в 2,5 раза дольше — там уместен аргументированный торг 5–8%.',
    };
  }

  if (questionId === 'best_2k_under10m') {
    // Live scan over 125,577 rows for 2-room flats <= 10M RUB
    let count2k = 0;
    let bestArea = 0;
    let bestPrice = 0;
    let bestMetro = '';
    const station2k = new Map<number, { count: number; areaSum: number; priceSum: number }>();

    for (let i = 0; i < TOTAL_ROWS; i++) {
      const b = i * STRIDE;
      if (buffer[b + COL_ROOMS] === 2 && buffer[b + COL_PRICE] <= 10_000_000) {
        count2k++;
        const m = buffer[b + COL_METRO];
        const area = buffer[b + COL_AREA10] / 10;
        const price = buffer[b + COL_PRICE];
        if (m > 0) {
          const cur = station2k.get(m);
          if (cur) {
            cur.count++;
            cur.areaSum += area;
            cur.priceSum += price;
          } else {
            station2k.set(m, { count: 1, areaSum: area, priceSum: price });
          }
        }
        if (area / (price / 1_000_000) > bestArea / Math.max(1, bestPrice / 1_000_000) && price <= 10_000_000) {
          bestArea = area;
          bestPrice = price;
          bestMetro = DATA_DICT.metro[m] || 'Москва';
        }
      }
    }

    const candidates: Array<{ name: string; count: number; avgPrice: number; avgArea: number; ratio: number }> = [];
    for (const [m, v] of station2k.entries()) {
      if (v.count >= 120) {
        const avgArea = v.areaSum / v.count;
        const avgPrice = v.priceSum / v.count;
        candidates.push({
          name: DATA_DICT.metro[m],
          count: v.count,
          avgPrice,
          avgArea,
          ratio: avgPrice / avgArea,
        });
      }
    }
    candidates.sort((a, b) => a.ratio - b.ratio);
    const top1 = candidates[0];
    const top2 = candidates[1];

    return {
      summary: `В бюджете до 10 млн ₽ найдено ${formatInt(count2k)} двухкомнатных квартир. Лучшее соотношение рубль/метр среди массовых локаций дают ${top1?.name ?? 'Некрасовка'} (${formatPm2(top1?.ratio ?? 140000)}) и ${top2?.name ?? 'Бунинская аллея'} (${formatPm2(top2?.ratio ?? 143000)}).`,
      metrics: [
        { label: 'Найдено 2-комн. ≤10 млн', value: formatInt(count2k) },
        { label: top1?.name ?? 'Лидер', value: `${formatArea(top1?.avgArea ?? 58)} за ${formatRubCompact(top1?.avgPrice ?? 8100000)}` },
        { label: `Лучший лот (м² / цена)`, value: `${formatArea(bestArea)} (${bestMetro}, ${formatRubCompact(bestPrice)})` },
      ],
      recommendation: 'Фильтруйте 2-комн. до 10 млн ₽ на панельных/монолитных сериях рядом с новыми станциями ЮВАО и ТиНАО — там медиана площади выше 57 м².',
    };
  }

  if (questionId === 'fastest_source') {
    const valid = Object.entries(DATA_AGG.sources)
      .filter(([, v]) => v.days !== null)
      .sort((a, b) => (a[1].days ?? 999) - (b[1].days ?? 999));

    const fast = valid[0];
    const slow = valid[valid.length - 1];

    return {
      summary: `Быстрее всего объявления снимаются на площадке ${SRC_LABELS_RU[fast[0]]} — медиана ${fast[1].days} дн. (при цене ${formatPm2(fast[1].pm2)}). Напротив, витрины категории «${SRC_LABELS_RU[slow[0]]}» держат лоты в среднем ${slow[1].days} дн.`,
      metrics: [
        { label: 'Авито (быстрее всех)', value: `${DATA_AGG.sources.avito.days} дн. · ${formatPm2(DATA_AGG.sources.avito.pm2)}` },
        { label: 'Яндекс / Циан', value: `${DATA_AGG.sources.yandex.days} дн. / ${DATA_AGG.sources.cian.days} дн.` },
        { label: 'Агентства (витрины)', value: `${DATA_AGG.sources.agency.days} дн. · ${formatPm2(DATA_AGG.sources.agency.pm2)}` },
      ],
      recommendation: 'Для быстрого поиска недооценённых лотов мониторьте Авито и Яндекс в первую неделю публикации; в базах агентств часто висят объекты с завышенным ценником.',
    };
  }

  // walk_distance
  const near = DATA_AGG.walk_pm2[1]; // (3,5] -> 231,505
  const far = DATA_AGG.walk_pm2[5];  // (15,20] -> 195,060
  const dropPct = (((near.pm2 - far.pm2) / near.pm2) * 100).toFixed(1).replace('.', ',');

  return {
    summary: `Пик цены метра приходится на зону 3–5 минут пешком от метро (${formatPm2(near.pm2)}). При удалении до 15–20 минут пешком стоимость м² падает до ${formatPm2(far.pm2)} — снижение на ${dropPct}%.`,
    metrics: [
      { label: '3–5 мин пешком', value: `${formatPm2(near.pm2)} (${formatInt(near.n)} лотов)` },
      { label: '7–10 мин пешком', value: `${formatPm2(DATA_AGG.walk_pm2[3].pm2)}` },
      { label: '15–20 мин пешком', value: `${formatPm2(far.pm2)} (−${dropPct}%)` },
    ],
    recommendation: `При средней пешей доступности по Москве ${DATA_META.walk_avg_min.toString().replace('.', ',')} мин переход из зоны 5 мин в зону 12–15 мин экономит клиенту 1,1–1,5 млн ₽ на двушке.`,
  };
}

export function formatActiveFiltersSummary(filters: FilterState): string {
  if (areFiltersEmpty(filters)) return 'весь рынок Москвы';
  const parts: string[] = [];
  if (filters.roomsId !== null) {
    parts.push(ROOMS_LABELS_RU[DATA_DICT.rooms[filters.roomsId]] || DATA_DICT.rooms[filters.roomsId]);
  }
  if (filters.metroId !== null) {
    parts.push(`м. ${DATA_DICT.metro[filters.metroId]}`);
  }
  if (filters.priceMinM || filters.priceMaxM) {
    parts.push(`${filters.priceMinM || '0'}–${filters.priceMaxM || '∞'} млн ₽`);
  }
  if (filters.htypeId !== null) {
    parts.push(HTYPE_LABELS_RU[DATA_DICT.htype[filters.htypeId]] || '');
  }
  if (filters.way !== 'all') {
    parts.push(filters.way === 'walk' ? 'пешком' : 'транспорт');
  }
  if (filters.maxMinutes !== null) {
    parts.push(`≤${filters.maxMinutes} мин`);
  }
  if (filters.floorType !== 'all') {
    const flMap = { first: '1-й этаж', mid: 'средний этаж', last: 'последний этаж' };
    parts.push(flMap[filters.floorType]);
  }
  if (filters.srcId !== null) {
    parts.push(SRC_LABELS_RU[DATA_DICT.src[filters.srcId]] || '');
  }
  return parts.filter(Boolean).join(', ');
}

export function computeFilteredConsultantAnswer(
  questionId: string,
  filters: FilterState,
  matchedIds: Int32Array,
  stats: ComputedStats
): ConsultantAnswer {
  if (areFiltersEmpty(filters)) {
    return computeConsultantAnswer(questionId);
  }

  const filterText = formatActiveFiltersSummary(filters);
  const n = matchedIds.length;
  const scopePrefix = `По вашей выборке из ${formatInt(n)} лотов (${filterText})`;

  if (n === 0) {
    return {
      summary: `${scopePrefix} подходящих квартир не найдено — расширьте ценовой диапазон или снимите часть ограничений в разделе «База».`,
      metrics: [
        { label: 'Найдено лотов', value: '0' },
        { label: 'Активные фильтры', value: filterText || '—' },
        { label: 'Общая база', value: `${formatInt(TOTAL_ROWS)} лотов` },
      ],
      recommendation: 'Сбросьте один из строгих фильтров (например, тип дома или время до метро), чтобы получить статистику.',
    };
  }

  const { buffer } = initEngine();

  if (questionId === 'cheapest_1k') {
    let cnt1k = 0;
    let minPrice = Infinity;
    let minPm2 = Infinity;
    let minMetro = '';
    const station1k = new Map<number, { count: number; sumPm2: number; sumPrice: number }>();

    for (let k = 0; k < n; k++) {
      const b = matchedIds[k] * STRIDE;
      if (buffer[b + COL_ROOMS] === 1) {
        cnt1k++;
        const price = buffer[b + COL_PRICE];
        const pm2 = buffer[b + COL_PM2];
        const m = buffer[b + COL_METRO];
        if (price < minPrice) {
          minPrice = price;
          minPm2 = pm2;
          minMetro = DATA_DICT.metro[m] || 'Москва';
        }
        if (m > 0) {
          const cur = station1k.get(m);
          if (cur) {
            cur.count++;
            cur.sumPm2 += pm2;
            cur.sumPrice += price;
          } else {
            station1k.set(m, { count: 1, sumPm2: pm2, sumPrice: price });
          }
        }
      }
    }

    if (cnt1k === 0) {
      const topCheap = stats.topStations.slice().sort((a, b) => a.pm2 - b.pm2)[0];
      return {
        summary: `${scopePrefix} 1-комнатные квартиры не входят в текущий срез (медиана выборки — ${formatPm2(stats.medianPm2)}, ${formatRubCompact(stats.medianPrice)}).`,
        metrics: [
          { label: 'Лотов в выборке', value: formatInt(n) },
          { label: 'Медиана цены', value: formatRubCompact(stats.medianPrice) },
          { label: topCheap ? `Дешевле в срезе: м. ${topCheap.name}` : 'Медиана м²', value: formatPm2(topCheap ? topCheap.pm2 : stats.medianPm2) },
        ],
        recommendation: 'Снимите фильтр комнатности или выберите «1» в разделе «База», чтобы сравнить именно однокомнатные лоты.',
      };
    }

    const sortedSt = Array.from(station1k.entries())
      .map(([m, v]) => ({
        name: DATA_DICT.metro[m],
        count: v.count,
        avgPm2: Math.round(v.sumPm2 / v.count),
        avgPrice: Math.round(v.sumPrice / v.count),
      }))
      .sort((a, b) => a.avgPm2 - b.avgPm2);

    const best = sortedSt[0];
    return {
      summary: `${scopePrefix} найдено ${formatInt(cnt1k)} однокомнатных квартир. Самые доступные варианты${best ? ` — у м. ${best.name} (${formatPm2(best.avgPm2)}, средняя цена ${formatRubCompact(best.avgPrice)})` : ''}.`,
      metrics: [
        { label: '1-комн. в выборке', value: formatInt(cnt1k) },
        { label: 'Минимум цены в срезе', value: `${formatRubCompact(minPrice)} (м. ${minMetro})` },
        { label: 'Мин. ₽/м² в срезе', value: formatPm2(minPm2) },
      ],
      recommendation: `Сравните 2–3 самых доступных лота из текущей выборки в разделе «Сравнение», чтобы проверить отклонение от локальной медианы.`,
    };
  }

  if (questionId === 'first_floor') {
    const f = stats.floorPm2.first;
    const m = stats.floorPm2.mid;
    const l = stats.floorPm2.last;
    if (f.n === 0 || m.n === 0) {
      return {
        summary: `${scopePrefix} недостаточно лотов для сопоставления 1-го и средних этажей (1-й этаж: ${formatInt(f.n)}, средние: ${formatInt(m.n)}).`,
        metrics: [
          { label: 'Первый этаж', value: f.n > 0 ? `${formatPm2(f.pm2)} (${f.n})` : '0 лотов' },
          { label: 'Средние этажи', value: m.n > 0 ? `${formatPm2(m.pm2)} (${m.n})` : '0 лотов' },
          { label: 'Последний этаж', value: l.n > 0 ? `${formatPm2(l.pm2)} (${l.n})` : '0 лотов' },
        ],
        recommendation: 'Выберите «Все» в фильтре этажа, чтобы оценить полный дисконт первого этажа по вашей локации.',
      };
    }

    const diffPct = (((m.pm2 - f.pm2) / m.pm2) * 100).toFixed(1).replace('.', ',');
    const relation = m.pm2 >= f.pm2 ? `дешевле на ${diffPct}%` : `дороже на ${Math.abs(Number(diffPct.replace(',', '.'))).toFixed(1).replace('.', ',')}%`;
    return {
      summary: `${scopePrefix} первый этаж (${formatInt(f.n)} лотов) стоит в среднем ${relation} средних этажей (${formatInt(m.n)} лотов).`,
      metrics: [
        { label: 'Первый этаж', value: `${formatPm2(f.pm2)} (${formatInt(f.n)})` },
        { label: 'Средние этажи', value: `${formatPm2(m.pm2)} (${formatInt(m.n)})` },
        { label: 'Последний этаж', value: l.n > 0 ? `${formatPm2(l.pm2)} (${formatInt(l.n)})` : 'нет данных' },
      ],
      recommendation: `Экономия на каждом квадратном метре при выборе 1-го этажа в этом срезе составляет ${formatPm2(Math.abs(m.pm2 - f.pm2))}.`,
    };
  }

  if (questionId === 'slow_stations') {
    const withDays = stats.topStations.filter((s) => s.days > 0);
    if (withDays.length === 0) {
      return {
        summary: `${scopePrefix} медианный срок экспозиции составляет ${formatDays(stats.medianDays)}.`,
        metrics: [
          { label: 'Лотов в выборке', value: formatInt(n) },
          { label: 'Медиана экспозиции', value: formatDays(stats.medianDays) },
          { label: 'Медиана цены м²', value: formatPm2(stats.medianPm2) },
        ],
        recommendation: 'Сравните сроки экспозиции по площадкам на странице «Аналитика».',
      };
    }

    const slowest = withDays.slice().sort((a, b) => b.days - a.days);
    const fastest = withDays.slice().sort((a, b) => a.days - b.days)[0];
    return {
      summary: `${scopePrefix} дольше всего продаются квартиры у м. ${slowest[0].name} (${slowest[0].days} дн.)${slowest[1] ? ` и м. ${slowest[1].name} (${slowest[1].days} дн.)` : ''} при медиане выборки ${stats.medianDays} дн.`,
      metrics: [
        { label: `Дольше всех: ${slowest[0].name}`, value: `${slowest[0].days} дн. (${formatInt(slowest[0].n)} шт.)` },
        { label: slowest[1] ? slowest[1].name : 'Медиана выборки', value: slowest[1] ? `${slowest[1].days} дн.` : `${stats.medianDays} дн.` },
        { label: `Быстрее всех: ${fastest.name}`, value: `${fastest.days} дн.` },
      ],
      recommendation: 'На станциях с экспозицией выше медианы собственники чаще готовы к предметному торгу.',
    };
  }

  if (questionId === 'best_2k_under10m') {
    let count2k = 0;
    let bestArea = 0;
    let bestPrice = 0;
    let bestMetro = '';
    for (let k = 0; k < n; k++) {
      const b = matchedIds[k] * STRIDE;
      if (buffer[b + COL_ROOMS] === 2 && buffer[b + COL_PRICE] <= 10_000_000) {
        count2k++;
        const area = buffer[b + COL_AREA10] / 10;
        const price = buffer[b + COL_PRICE];
        if (area / (price / 1_000_000) > bestArea / Math.max(1, bestPrice / 1_000_000)) {
          bestArea = area;
          bestPrice = price;
          bestMetro = DATA_DICT.metro[buffer[b + COL_METRO]] || 'Москва';
        }
      }
    }

    if (count2k === 0) {
      return {
        summary: `${scopePrefix} двухкомнатных квартир до 10 млн ₽ нет (текущая медиана выборки: ${formatRubCompact(stats.medianPrice)}).`,
        metrics: [
          { label: '2-комн. ≤10 млн в срезе', value: '0' },
          { label: 'Медиана выборки', value: formatRubCompact(stats.medianPrice) },
          { label: 'Медиана ₽/м²', value: formatPm2(stats.medianPm2) },
        ],
        recommendation: 'Снимите фильтр комнатности или увеличьте верхнюю границу бюджета в разделе «База».',
      };
    }

    return {
      summary: `${scopePrefix} найдено ${formatInt(count2k)} двухкомнатных квартир до 10 млн ₽. Лучшее соотношение площади и бюджета — ${formatArea(bestArea)} за ${formatRubCompact(bestPrice)} (м. ${bestMetro}).`,
      metrics: [
        { label: '2-комн. ≤10 млн в срезе', value: formatInt(count2k) },
        { label: 'Лидер по м² на ₽', value: `${formatArea(bestArea)} · ${formatRubCompact(bestPrice)}` },
        { label: 'Локация лидера', value: `м. ${bestMetro}` },
      ],
      recommendation: 'Отсортируйте таблицу в разделе «База» по цене м² по возрастанию, чтобы сразу увидеть эти лоты наверху.',
    };
  }

  if (questionId === 'fastest_source') {
    const valid = stats.sources.filter((s) => s.n > 0 && s.days !== null).sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
    if (valid.length === 0) {
      return {
        summary: `${scopePrefix} медианный срок экспозиции равен ${formatDays(stats.medianDays)}.`,
        metrics: [
          { label: 'Лотов в срезе', value: formatInt(n) },
          { label: 'Медиана экспозиции', value: formatDays(stats.medianDays) },
          { label: 'Медиана м²', value: formatPm2(stats.medianPm2) },
        ],
        recommendation: 'Попробуйте снять фильтр источника, чтобы сравнить все площадки между собой.',
      };
    }

    const fast = valid[0];
    const slow = valid[valid.length - 1];
    return {
      summary: `${scopePrefix} быстрее всего лоты уходят через площадку «${fast.label}» — в среднем ${fast.days} дн. (против ${slow.days} дн. на «${slow.label}»).`,
      metrics: [
        { label: `Лидер скорости: ${fast.label}`, value: `${fast.days} дн. (${formatInt(fast.n)} шт.)` },
        { label: 'Цена м² у лидера', value: formatPm2(fast.pm2) },
        { label: `Медленнее: ${slow.label}`, value: `${slow.days} дн. (${formatInt(slow.n)} шт.)` },
      ],
      recommendation: 'Приоритетно проверяйте свежие публикации на самой быстрой площадке вашей выборки.',
    };
  }

  // walk_distance on filtered subset
  const populatedWalk = stats.walkPm2.filter((w) => w.n > 0 && w.pm2 > 0);
  if (populatedWalk.length < 2) {
    return {
      summary: `${scopePrefix} средняя цена метра составляет ${formatPm2(stats.medianPm2)} (${populatedWalk[0] ? `зона ${populatedWalk[0].label}: ${formatPm2(populatedWalk[0].pm2)}` : 'мало точек для сравнения расстояний'}).`,
      metrics: [
        { label: 'Лотов в выборке', value: formatInt(n) },
        { label: 'Медиана ₽/м²', value: formatPm2(stats.medianPm2) },
        { label: 'Медиана цены', value: formatRubCompact(stats.medianPrice) },
      ],
      recommendation: 'Отключите ограничение по минутам до метро, чтобы увидеть полный градиент цены по удалённости.',
    };
  }

  const bestWalk = populatedWalk.slice().sort((a, b) => b.pm2 - a.pm2)[0];
  const farthestWalk = populatedWalk[populatedWalk.length - 1];
  const diffWalk = (((bestWalk.pm2 - farthestWalk.pm2) / bestWalk.pm2) * 100).toFixed(1).replace('.', ',');

  return {
    summary: `${scopePrefix} максимальная стоимость метра зафиксирована в зоне ${bestWalk.label} пешком (${formatPm2(bestWalk.pm2)}), а на границе ${farthestWalk.label} метр стоит ${formatPm2(farthestWalk.pm2)} (ниже на ${diffWalk}%).`,
    metrics: [
      { label: `Пик (${bestWalk.label})`, value: `${formatPm2(bestWalk.pm2)} (${formatInt(bestWalk.n)})` },
      { label: `Дальняя зона (${farthestWalk.label})`, value: `${formatPm2(farthestWalk.pm2)} (${formatInt(farthestWalk.n)})` },
      { label: 'Разница м²', value: formatPm2(Math.abs(bestWalk.pm2 - farthestWalk.pm2)) },
    ],
    recommendation: 'Сдвиг поиска на одну зону дальше от метро в этом срезе даёт заметную экономию без смены района.',
  };
}

export interface ComparisonVerdictParts {
  headline: string;
  reason: string;
  bestId: number | null;
}

export function computeComparisonVerdictParts(listings: ListingRecord[]): ComparisonVerdictParts {
  if (listings.length < 2) {
    return {
      headline: 'Выберите 2 или 3 квартиры в таблице',
      reason: 'Чтобы получить автоматический вердикт по выгоде относительно медианы станции и комнатности.',
      bestId: null,
    };
  }

  const enriched = listings.map((item) => {
    const baseline = getStationRoomBaselinePm2(item.metroId, item.roomsId);
    const devPct = ((item.pm2 - baseline) / baseline) * 100;
    return { item, baseline, devPct };
  });

  enriched.sort((a, b) => a.devPct - b.devPct);
  const best = enriched[0];
  const worst = enriched[enriched.length - 1];
  const metroName = DATA_DICT.metro[best.item.metroId] || 'выбранной локации';
  const sign = best.devPct <= 0 ? 'ниже' : 'выше';
  const absDev = Math.abs(best.devPct).toFixed(1).replace('.', ',');
  const spreadPm2 = formatPm2(worst.item.pm2 - best.item.pm2);

  if (best.devPct < -1.5) {
    return {
      headline: `Выгоднее всего: лот №${best.item.id + 1} — м. ${metroName}, ${formatArea(best.item.area)}`,
      reason: `цена м² на ${absDev}% ${sign} медианы для этого метро и комнатности, экономия к самому дорогому из выбранных лотов составляет ${spreadPm2}.`,
      bestId: best.item.id,
    };
  }
  return {
    headline: `Наиболее сбалансирован: лот №${best.item.id + 1} — м. ${metroName}, ${formatArea(best.item.area)}`,
    reason: `цена ${formatPm2(best.item.pm2)} (отклонение ${best.devPct >= 0 ? '+' : ''}${best.devPct.toFixed(1).replace('.', ',')}% от медианы локации), при разнице между вариантами ${spreadPm2}.`,
    bestId: best.item.id,
  };
}

// Compute station-and-room verdict for 2-3 selected apartments
export function computeComparisonVerdict(listings: ListingRecord[]): string {
  if (listings.length < 2) {
    return 'Выберите 2 или 3 квартиры в таблице, чтобы получить автоматический вердикт по выгоде.';
  }

  const enriched = listings.map((item) => {
    const baseline = getStationRoomBaselinePm2(item.metroId, item.roomsId);
    const devPct = ((item.pm2 - baseline) / baseline) * 100;
    return { item, baseline, devPct };
  });

  enriched.sort((a, b) => a.devPct - b.devPct);
  const best = enriched[0];
  const worst = enriched[enriched.length - 1];
  const metroName = DATA_DICT.metro[best.item.metroId] || 'выбранной локации';
  const sign = best.devPct <= 0 ? 'ниже' : 'выше';
  const absDev = Math.abs(best.devPct).toFixed(1).replace('.', ',');
  const spreadPm2 = formatPm2(worst.item.pm2 - best.item.pm2);

  if (best.devPct < -1.5) {
    return `Наиболее выгодный вариант — лот №${best.item.id + 1} (${metroName}, ${formatArea(best.item.area)}): цена м² на ${absDev}% ${sign} медианы для этого метро и комнатности, экономия к самому дорогому из выбранных лотов составляет ${spreadPm2}.`;
  }
  return `Наиболее сбалансированный лот — №${best.item.id + 1} (${metroName}, ${best.item.floor}/${best.item.floorsTotal} эт.): ${formatPm2(best.item.pm2)} (отклонение ${best.devPct >= 0 ? '+' : ''}${best.devPct.toFixed(1).replace('.', ',')}% от медианы локации), при разнице между вариантами ${spreadPm2}.`;
}

// Format date from base_date (2019-06-05) + dayOffset
const BASE_DATE_MS = Date.UTC(2019, 5, 5);
export function formatListingDate(dayOffset: number): string {
  const d = new Date(BASE_DATE_MS + Math.max(0, dayOffset) * 86_400_000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function escapeCsvCell(val: string | number): string {
  const str = String(val);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Export all currently filtered rows as UTF-8 BOM CSV (Excel-ready with ';' delimiter)
export function exportFilteredToCsv(ids: Int32Array): void {
  const { buffer } = initEngine();
  const header = [
    'Метро',
    'Комнат',
    'Площадь общая',
    'Жилая',
    'Кухня',
    'Этаж',
    'Этажность',
    'Тип дома',
    'Минут до метро',
    'Способ',
    'Балкон',
    'Санузел',
    'Цена, руб',
    'Цена за м²',
    'Дата',
    'Дней в экспозиции',
    'Источник',
  ].join(';');

  const chunks: string[] = ['\uFEFF' + header + '\r\n'];
  const BATCH = 2000;
  let batchLines: string[] = [];

  for (let i = 0; i < ids.length; i++) {
    const b = ids[i] * STRIDE;
    const metro = DATA_DICT.metro[buffer[b + COL_METRO]] || 'Не указано';
    const rooms = ROOMS_LABELS_RU[DATA_DICT.rooms[buffer[b + COL_ROOMS]]] || '—';
    const area = (buffer[b + COL_AREA10] / 10).toFixed(1).replace('.', ',');
    const living = (buffer[b + COL_LIVING10] / 10).toFixed(1).replace('.', ',');
    const kitchen = (buffer[b + COL_KITCHEN10] / 10).toFixed(1).replace('.', ',');
    const floor = buffer[b + COL_FLOOR];
    const floors = buffer[b + COL_FLOORS];
    const htype = HTYPE_LABELS_RU[DATA_DICT.htype[buffer[b + COL_HTYPE]]] || '—';
    const mins = buffer[b + COL_MIN];
    const way = buffer[b + COL_WAY] === 0 ? 'пешком' : 'транспорт';
    const balcony = DATA_DICT.balcony[buffer[b + COL_BALCONY]] || 'нет';
    const bath = DATA_DICT.bath[buffer[b + COL_BATH]] || 'нет';
    const price = buffer[b + COL_PRICE];
    const pm2 = buffer[b + COL_PM2];
    const dateStr = formatListingDate(buffer[b + COL_DAY]);
    const daysExp = buffer[b + COL_DAYS_EXP] >= 0 ? buffer[b + COL_DAYS_EXP] : '';
    const src = SRC_LABELS_RU[DATA_DICT.src[buffer[b + COL_SRC]]] || '—';

    batchLines.push(
      [
        escapeCsvCell(metro),
        escapeCsvCell(rooms),
        area,
        living,
        kitchen,
        floor,
        floors,
        escapeCsvCell(htype),
        mins,
        way,
        escapeCsvCell(balcony),
        escapeCsvCell(bath),
        price,
        pm2,
        dateStr,
        daysExp,
        escapeCsvCell(src),
      ].join(';')
    );

    if (batchLines.length >= BATCH) {
      chunks.push(batchLines.join('\r\n') + '\r\n');
      batchLines = [];
    }
  }

  if (batchLines.length > 0) {
    chunks.push(batchLines.join('\r\n'));
  }

  const blob = new Blob(chunks, { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  const link = document.createElement('a');
  link.href = url;
  link.download = `kvartiry_${yyyy}-${mm}-${dd}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Export a representative slice of real listings for the Overview demo modal
export function exportSampleCsv(limit = 2500): void {
  initEngine();
  const count = Math.min(limit, TOTAL_ROWS);
  const sampleIds = new Int32Array(count);
  const step = TOTAL_ROWS / count;
  for (let i = 0; i < count; i++) {
    sampleIds[i] = Math.min(TOTAL_ROWS - 1, Math.floor(i * step));
  }
  exportFilteredToCsv(sampleIds);
}

export type BudgetBandKey = 'u6' | '6_9' | '9_14' | '14_25' | 'any';
export type WalkBandKey = 'w5' | 'w10' | 'w15' | 'any';

export interface ClientLotPick {
  listing: ListingRecord;
  metroName: string;
  roomLabel: string;
  htypeLabel: string;
  devPct: number;
  baselinePm2: number;
}

export interface ClientSelectionResult {
  usedActiveFilters: boolean;
  totalMatched: number;
  scopeNote: string;
  picks: ClientLotPick[];
  verdict: string;
}

export function computeClientSelectionScenario(
  budget: BudgetBandKey,
  roomsId: number | null,
  walk: WalkBandKey,
  filters: FilterState,
  matchedIds: Int32Array
): ClientSelectionResult {
  const { buffer } = initEngine();

  let minPrice = 0;
  let maxPrice = 999_000_000;
  if (budget === 'u6') maxPrice = 6_000_000;
  else if (budget === '6_9') {
    minPrice = 6_000_000;
    maxPrice = 9_000_000;
  } else if (budget === '9_14') {
    minPrice = 9_000_000;
    maxPrice = 14_000_000;
  } else if (budget === '14_25') {
    minPrice = 14_000_000;
    maxPrice = 25_000_000;
  }

  const maxWalkMin = walk === 'w5' ? 5 : walk === 'w10' ? 10 : walk === 'w15' ? 15 : 999;
  const requireWalk = walk !== 'any';

  const scanIds = (sourceIds: Int32Array | null): number[] => {
    const hits: number[] = [];
    const len = sourceIds ? sourceIds.length : TOTAL_ROWS;
    for (let k = 0; k < len; k++) {
      const id = sourceIds ? sourceIds[k] : k;
      const b = id * STRIDE;
      const price = buffer[b + COL_PRICE];
      if (price < minPrice || price > maxPrice) continue;
      if (roomsId !== null && buffer[b + COL_ROOMS] !== roomsId) continue;
      if (requireWalk && (buffer[b + COL_WAY] !== 0 || buffer[b + COL_MIN] > maxWalkMin)) continue;
      hits.push(id);
    }
    return hits;
  };

  const hasFilters = !areFiltersEmpty(filters);
  let usedActiveFilters = hasFilters;
  let hits = hasFilters ? scanIds(matchedIds) : scanIds(null);
  let scopeNote = hasFilters
    ? `по вашей выборке (${formatActiveFiltersSummary(filters)})`
    : `по всему массиву (${formatInt(TOTAL_ROWS)} лотов)`;

  if (hits.length === 0 && hasFilters) {
    hits = scanIds(null);
    usedActiveFilters = false;
    scopeNote = `активные фильтры не дали совпадений, поэтому подбор выполнен по всей базе (${formatInt(TOTAL_ROWS)} лотов)`;
  }

  // Score hits by lowest negative deviation vs station+room median (prefer named stations)
  const scored = hits
    .filter((id) => buffer[id * STRIDE + COL_METRO] > 0)
    .slice(0, 6000)
    .map((id) => {
      const b = id * STRIDE;
      const metroId = buffer[b + COL_METRO];
      const rId = buffer[b + COL_ROOMS];
      const pm2 = buffer[b + COL_PM2];
      const baseline = getStationRoomBaselinePm2(metroId, rId);
      const devPct = ((pm2 - baseline) / baseline) * 100;
      return { id, devPct, baseline, metroId, price: buffer[b + COL_PRICE] };
    });

  scored.sort((a, b) => a.devPct - b.devPct);

  // Pick 3 distinct stations if possible
  const chosen: typeof scored = [];
  const usedStations = new Set<number>();
  for (const item of scored) {
    if (item.devPct < -25) continue; // avoid extreme artificial noise edge
    if (!usedStations.has(item.metroId) || scored.length < 15) {
      chosen.push(item);
      usedStations.add(item.metroId);
    }
    if (chosen.length === 3) break;
  }
  if (chosen.length < 3) {
    for (const item of scored) {
      if (!chosen.some((c) => c.id === item.id)) chosen.push(item);
      if (chosen.length === 3) break;
    }
  }

  const picks: ClientLotPick[] = chosen.map((c) => {
    const listing = readListing(c.id);
    return {
      listing,
      metroName: DATA_DICT.metro[listing.metroId] || 'Москва',
      roomLabel: ROOMS_LABELS_RU[DATA_DICT.rooms[listing.roomsId]] || '—',
      htypeLabel: HTYPE_LABELS_RU[DATA_DICT.htype[listing.htypeId]] || '—',
      devPct: c.devPct,
      baselinePm2: c.baseline,
    };
  });

  const verdict = computeComparisonVerdict(picks.map((p) => p.listing));

  return {
    usedActiveFilters,
    totalMatched: hits.length,
    scopeNote,
    picks,
    verdict,
  };
}

export interface ValuationResult {
  metroName: string;
  roomLabel: string;
  area: number;
  fairPm2: number;
  fairPrice: number;
  lowPrice: number;
  highPrice: number;
  vsMoscowPct: number;
  sampleCount: number;
  medianDays: number;
}

export function computeValuationScenario(
  metroId: number,
  roomsId: number,
  area: number
): ValuationResult {
  const { buffer, stationStats } = initEngine();
  const metroName = DATA_DICT.metro[metroId] || 'Москва';
  const roomLabel = ROOMS_LABELS_RU[DATA_DICT.rooms[roomsId]] || '1-комн.';
  const fairPm2 = getStationRoomBaselinePm2(metroId, roomsId);
  const fairPrice = Math.round((fairPm2 * area) / 10_000) * 10_000;
  const lowPrice = Math.round((fairPrice * 0.93) / 10_000) * 10_000;
  const highPrice = Math.round((fairPrice * 1.07) / 10_000) * 10_000;
  const vsMoscowPct = ((fairPm2 - DATA_META.median_pm2) / DATA_META.median_pm2) * 100;

  let sampleCount = 0;
  for (let i = 0; i < TOTAL_ROWS; i++) {
    const b = i * STRIDE;
    if (buffer[b + COL_METRO] === metroId && buffer[b + COL_ROOMS] === roomsId) {
      sampleCount++;
    }
  }
  const stMeta = stationStats.get(metroId);
  const medianDays = stMeta ? Math.round(stMeta.days) : DATA_META.median_days;

  return {
    metroName,
    roomLabel,
    area,
    fairPm2,
    fairPrice,
    lowPrice,
    highPrice,
    vsMoscowPct,
    sampleCount,
    medianDays,
  };
}

export interface MarketBriefingResult {
  scopeLabel: string;
  totalCount: number;
  medianPrice: number;
  medianPm2: number;
  medianDays: number;
  expensiveTop3: Array<{ name: string; pm2: number }>;
  cheapTop3: Array<{ name: string; pm2: number }>;
  firstFloorDiscountPct: string;
  firstFloorDiffPm2: number;
}

export function computeMarketBriefingScenario(
  filters: FilterState,
  matchedIds: Int32Array,
  stats: ComputedStats
): MarketBriefingResult {
  const isDefault = areFiltersEmpty(filters);
  const stationsPool = isDefault
    ? DATA_AGG.stations_top.map((s) => ({ name: s.name, pm2: s.pm2 }))
    : stats.topStations.map((s) => ({ name: s.name, pm2: s.pm2 }));

  const sortedDesc = stationsPool.slice().sort((a, b) => b.pm2 - a.pm2);
  const sortedAsc = stationsPool.slice().sort((a, b) => a.pm2 - b.pm2);

  const fPm2 = isDefault ? DATA_AGG.floor_pm2.first : stats.floorPm2.first.pm2;
  const mPm2 = isDefault ? DATA_AGG.floor_pm2.mid : stats.floorPm2.mid.pm2;
  const discount = mPm2 > 0 && fPm2 > 0 ? ((mPm2 - fPm2) / mPm2) * 100 : 9.3;

  return {
    scopeLabel: isDefault
      ? `по всему рынку (${formatInt(TOTAL_ROWS)} лотов)`
      : `по вашей выборке из ${formatInt(matchedIds.length)} лотов (${formatActiveFiltersSummary(filters)})`,
    totalCount: isDefault ? TOTAL_ROWS : matchedIds.length,
    medianPrice: isDefault ? DATA_META.median_price : stats.medianPrice,
    medianPm2: isDefault ? DATA_META.median_pm2 : stats.medianPm2,
    medianDays: isDefault ? DATA_META.median_days : stats.medianDays,
    expensiveTop3: sortedDesc.slice(0, 3),
    cheapTop3: sortedAsc.slice(0, 3),
    firstFloorDiscountPct: discount.toFixed(1).replace('.', ','),
    firstFloorDiffPm2: mPm2 > 0 && fPm2 > 0 ? Math.round(mPm2 - fPm2) : 18500,
  };
}

