declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function expect<T>(actual: T): {
    toBe(expected: T): void;
    toBeTruthy(): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThanOrEqual(expected: number, message?: string): void;
    toBeGreaterThanOrEqual(expected: number, message?: string): void;
    toMatch(pattern: RegExp): void;
    toContain(substring: string): void;
  };
}
