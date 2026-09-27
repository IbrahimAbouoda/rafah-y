import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateFormatter = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { dateStyle: 'medium', timeZone: 'Asia/Gaza' });
const dateTimeFormatter = new Intl.DateTimeFormat('ar-PS-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Gaza',
});

export const formatDate = (d: Date | null | undefined) => (d ? dateFormatter.format(d) : '—');
export const formatDateTime = (d: Date | null | undefined) => (d ? dateTimeFormatter.format(d) : '—');

/** قيمة حقل <input type="date"> بتوقيت غزة */
export function toDateInput(d: Date | null | undefined): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza' }).format(d);
}

/** بداية يوم YYYY-MM-DD بتوقيت غزة كلحظة UTC — تراعي التوقيت الصيفي (+02 / +03) */
export function gazaDayStart(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const utcGuess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(utcGuess)) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Gaza',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(utcGuess))
      .map((p) => [p.type, p.value]),
  );
  const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(utcGuess - (localAsUtc - utcGuess));
}

/** قيمة <input type="datetime-local"> (YYYY-MM-DDTHH:mm) بتوقيت غزة ← لحظة UTC */
export function gazaDateTime(value: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const day = gazaDayStart(m[1]!);
  return day ? new Date(day.getTime() + (Number(m[2]) * 60 + Number(m[3])) * 60_000) : null;
}

/** لحظة ← قيمة <input type="datetime-local"> بتوقيت غزة */
export function toDateTimeInput(d: Date | null | undefined): string {
  if (!d) return '';
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Gaza',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
