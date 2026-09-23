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
