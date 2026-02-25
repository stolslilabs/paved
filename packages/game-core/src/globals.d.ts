// Minimal console declaration for pure logic package (no DOM / no Node required)
declare var console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
