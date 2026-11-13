// SPDX-License-Identifier: EPL-2.0
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names, letting later Tailwind classes override earlier ones. */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
