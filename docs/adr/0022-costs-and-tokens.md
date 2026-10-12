# ADR 0022: Show costs as API-equivalent dollars and tokens with their cache share

Status: accepted
Date: 2026-10-12

## Context

Claude Code reports a dollar cost and token counts for every run. Under a
subscription nobody pays those dollars per run: they are what the same usage would
cost on the API. Token totals that leave out the cache reads understate the work by an
order of magnitude, while totals that include them without saying so look alarming.
A daily cap of zero is ambiguous: no budget, or no cap.

## Options

1. **Show the reported dollars as costs.** Misleads an operator on a subscription.
2. **Hide dollars under a subscription** and show only the subscription's limits.
   Loses the only per-run measure of effort.
3. **Label the basis of every figure**: each account declares its billing
   (`subscription` or `api-key`), and every amount says whether it is API-equivalent,
   metered, or a mix; token figures are stated with and without the cache.

## Decision

Option 3. Costs are aggregated per run, per issue, per project and per day with their
basis; the cockpit and the command line say "what the same usage would cost on the
API; the subscription pays for it" wherever the basis is a subscription. Every token
total is stated twice, with and without the cache, next to the cache reads and cache
writes on their own, so neither figure is mistaken for the other. The daily cap is
`none` or a positive number of API-equivalent dollars, never zero, and the per-run cap
the same.

## Consequences

- The subscription's own limits, read from the usage report (ADR 0012), remain the
  measure that pauses the factory under a subscription; dollars inform, they do not
  gate, unless the operator sets a cap.
- An installation with both kinds of accounts sees a `mixed` basis rather than a sum
  that pretends to be one thing.
