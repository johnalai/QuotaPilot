// Rules are pure, unit-testable modules (domain-model §3). Barrel so the
// package can expose a stable `@quotapilot/domain/rules` entry.
export * from './quota-calc';
export * from './priority';
export * from './forecast';
export * from './risk';
export * from './plan';
