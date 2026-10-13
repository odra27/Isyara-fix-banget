-- Phase 4 — matching_logs.confidence precision (ADR-038 §8).
--
-- Modeling returns confidence with 4 decimal places (ADR-007); numeric(4,3)
-- would store e.g. 0.8499 as 0.850 and 0.5999 as 0.600. Widening to
-- numeric(5,4) is non-destructive: existing 3-decimal values are kept exactly,
-- and NOT NULL is preserved. No other column, constraint, index or table changes.

alter table matching_logs alter column confidence type numeric(5,4);
