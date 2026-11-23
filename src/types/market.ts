export type RawTuple = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

export interface MarketMeta {
  raw_rows: number;
  junk_rows: number;
  listings: number;
  dups: number;
  final: number;
  rooms_fixed: number;
  area_broken: number;
  date_broken: number;
  price_outliers: number;
  stations: number;
  period: string;
  median_price: number;
  median_pm2: number;
  median_days: number;
  walk_avg_min: number;
  base_date: string;
}

export interface MarketDict {
  metro: string[];
  rooms: string[];
  htype: string[];
  balcony: string[];
  bath: string[];
  src: string[];
}

export interface StationAgg {
  name: string;
  n: number;
  price: number;
  pm2: number;
  days: number;
}

export interface RoomAgg {
  n: number;
  price: number;
  pm2: number;
  s: number;
}

export interface HtypeAgg {
  n: number;
  pm2: number;
}

export interface WalkAgg {
  range: string;
  n: number;
  pm2: number;
}

export interface MonthAgg {
  n: number;
  price: number;
}

export interface SourceAgg {
  n: number;
  pm2: number;
  days: number | null;
}

export interface PriceHistBin {
  range: string;
  n: number;
}

export interface MarketAgg {
  stations_top: StationAgg[];
  stations_other: { n: number; pm2: number };
  rooms: Record<string, RoomAgg>;
  htype: Record<string, HtypeAgg>;
  walk_pm2: WalkAgg[];
  floor_pm2: { first: number; mid: number; last: number };
  floor_n: { first: number; mid: number; last: number };
  months: Record<string, MonthAgg>;
  sources: Record<string, SourceAgg>;
  price_hist: PriceHistBin[];
}

export type FloorCategory = 'all' | 'first' | 'mid' | 'last';
export type WayFilter = 'all' | 'walk' | 'transport';
export type SortField = 'price' | 'pm2' | 'area' | 'days' | 'minutes';
export type SortDir = 'asc' | 'desc';

export interface FilterState {
  roomsId: number | null;
  metroId: number | null;
  priceMinM: string;
  priceMaxM: string;
  htypeId: number | null;
  way: WayFilter;
  maxMinutes: number | null;
  floorType: FloorCategory;
  srcId: number | null;
}

export interface ListingRecord {
  id: number;
  metroId: number;
  roomsId: number;
  minutes: number;
  way: number;
  floor: number;
  floorsTotal: number;
  htypeId: number;
  balconyId: number;
  bathId: number;
  area: number;
  livingArea: number;
  kitchenArea: number;
  price: number;
  pm2: number;
  dayOffset: number;
  daysExp: number;
  srcId: number;
}

export interface ComputedStats {
  count: number;
  elapsedMs: number;
  medianPrice: number;
  medianPm2: number;
  medianDays: number;
  topStations: Array<{
    metroId: number;
    name: string;
    n: number;
    price: number;
    pm2: number;
    days: number;
  }>;
  walkPm2: Array<{
    label: string;
    n: number;
    pm2: number;
  }>;
  floorPm2: {
    first: { n: number; pm2: number };
    mid: { n: number; pm2: number };
    last: { n: number; pm2: number };
  };
  months: Array<{
    key: string;
    label: string;
    n: number;
    price: number;
  }>;
  sources: Array<{
    srcId: number;
    key: string;
    label: string;
    n: number;
    pm2: number;
    days: number | null;
  }>;
  priceHist: Array<{
    label: string;
    min: number;
    max: number;
    n: number;
  }>;
}
