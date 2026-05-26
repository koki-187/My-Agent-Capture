import { format } from 'date-fns';
import { CASE_ID_PREFIX, M2_TO_TSUBO } from '../config';

export function generateCaseIdLocal(): string {
  const today = format(new Date(), 'yyyyMMdd');
  const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
  return `${CASE_ID_PREFIX}-${today}-${seq}`;
}

export function m2ToTsubo(m2: number): number {
  return Math.round((m2 / M2_TO_TSUBO) * 100) / 100;
}

export function tsuboToM2(tsubo: number): number {
  return Math.round(tsubo * M2_TO_TSUBO * 100) / 100;
}

export function formatPrice(manEn: number | null): string {
  if (manEn == null) return '—';
  if (manEn >= 10000) return `${(manEn / 10000).toFixed(1)}億円`;
  return `${manEn.toLocaleString()}万円`;
}

export function formatArea(m2: number | null): string {
  if (m2 == null) return '—';
  return `${m2}㎡ (${m2ToTsubo(m2)}坪)`;
}

export function formatDate(date: Date | null): string {
  if (!date) return '';
  return format(date, 'yyyy/MM/dd');
}
