// Tailwind-class utility — merges class strings while resolving conflicts
// (e.g. `px-2 px-4` collapses to `px-4`). Used across components.

import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
