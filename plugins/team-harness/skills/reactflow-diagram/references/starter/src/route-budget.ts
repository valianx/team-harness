import type { RoutingWork } from './types';

/** Deterministic work ceilings bound exploration; elapsed observations are not a performance SLO. */
export const ROUTING_LIMITS = Object.freeze({
  compositionCandidates: 3, sidePairsPerEdge: 8, labelAlternativesPerPair: 12,
  searchesPerPair: 25, corridorCandidatesPerSearch: 48, gridStatesPerSearch: 120000, expandedStatesPerSearch: 60000,
});

/** routingWork gives each candidate independent counters, including failed searches. */
export function routingWork(): RoutingWork {
  return { layeredCalls: 0, compactPlacements: 0, endpointCandidates: 0, labelAlternatives: 0,
    searches: 0, corridorCandidates: 0, expandedStates: 0, maxGridStates: 0, cappedSearches: 0 };
}

/** sumWork adds attempted work but retains the largest allocated grid as a high-water mark. */
export function sumWork(values: RoutingWork[]): RoutingWork {
  const total = routingWork();
  for (const value of values) for (const key of Object.keys(total) as (keyof RoutingWork)[]) {
    total[key] = key === 'maxGridStates' ? Math.max(total[key], value[key]) : total[key] + value[key];
  }
  return total;
}
