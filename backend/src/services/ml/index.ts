/**
 * Story 6.6 — ML barrel (T01).
 *
 * Re-exports the public surface of the `services/ml` package so external
 * modules (`predictiveAnalyticsService`, `routes/predictions`, `scheduler`,
 * tests) can import from a single stable path without reaching into private
 * file layouts.
 */

export * from './types';
export * from './linearAlgebra';
export * from './estimators';
export * from './evaluation';
export * from './features';
export { PredictionModelRegistry, modelRegistry } from './modelRegistry';
export { TrainingPipeline, trainingPipeline } from './trainingPipeline';
