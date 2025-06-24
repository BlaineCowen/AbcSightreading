import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Selects a random element from an array.
 * @param array - The array to select from.
 * @returns A random element from the array, or undefined if the array is empty.
 */
export function getRandomElement<T>(array: T[]): T | undefined {
  if (!array || array.length === 0) {
    return undefined;
  }
  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}
