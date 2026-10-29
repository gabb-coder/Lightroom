import type { Flag } from '../db/db';

export type OrganizeCommand = { kind: 'rating'; value: number } | { kind: 'flag'; value: Flag | null };

/** 1–5 rate, 0 clears the rating, P pick, X reject, U unflag (design/Kit.dc.html). */
export function matchOrganizeShortcut(key: string): OrganizeCommand | null {
  if (/^[0-5]$/.test(key)) return { kind: 'rating', value: Number(key) };
  switch (key.toLowerCase()) {
    case 'p':
      return { kind: 'flag', value: 'pick' };
    case 'x':
      return { kind: 'flag', value: 'reject' };
    case 'u':
      return { kind: 'flag', value: null };
    default:
      return null;
  }
}
