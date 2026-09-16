/**
 * FlashCardZ SM-2 engine.
 *
 * Pure, fully typed implementation of SuperMemo-2 adapted for a 4-point
 * grading scale (Anki-style):
 *   1 = Again (fail — resets repetition)
 *   2 = Hard  (pass — small interval growth, ease decreases)
 *   3 = Good  (pass — standard SM-2 expansion)
 *   4 = Easy  (pass — bonus expansion + ease increase)
 *
 * Reference: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 */

export type SrsGrade = 1 | 2 | 3 | 4;

export interface SrsState {
  /** Days until next review. 0 for brand-new cards. */
  interval: number;
  /** Count of consecutive successful reviews. */
  repetition: number;
  /** Ease factor, defaults to 2.5, floored at 1.3. */
  easeFactor: number;
}

export interface SrsResult extends SrsState {
  /** ISO string timestamp for when the card is next due. */
  dueDate: string;
}

const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;

/**
 * Map the 4-point UI grade to a classic SM-2 quality (0-5).
 * - Again (1) -> 2 (fail, q < 3 resets repetition)
 * - Hard  (2) -> 3 (pass, but ease decreases: EF -0.14)
 * - Good  (3) -> 4 (pass, ease unchanged)
 * - Easy  (4) -> 5 (pass, ease increases: EF +0.10)
 */
function gradeToQuality(grade: SrsGrade): 2 | 3 | 4 | 5 {
  switch (grade) {
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return 4;
    case 4:
      return 5;
  }
}

/** Clamp + sanitize stored state so corrupt DB rows can't break scheduling. */
function normalizeState(state: SrsState): Required<SrsState> {
  return {
    interval: Number.isFinite(state.interval) ? Math.max(0, Math.floor(state.interval)) : 0,
    repetition: Number.isFinite(state.repetition)
      ? Math.max(0, Math.floor(state.repetition))
      : 0,
    easeFactor: Number.isFinite(state.easeFactor)
      ? Math.min(10, Math.max(MIN_EASE_FACTOR, state.easeFactor))
      : DEFAULT_EASE_FACTOR,
  };
}

export function createInitialSrsState(now: Date = new Date()): SrsResult {
  return {
    interval: 0,
    repetition: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    dueDate: now.toISOString(),
  };
}

/**
 * Compute the next SRS state for a card.
 *
 * @param current Current `{ interval, repetition, easeFactor }`.
 * @param grade   1 = Again, 2 = Hard, 3 = Good, 4 = Easy.
 * @param now     Reference timestamp (defaults to `new Date()`). Injected
 *                for testability — callers in production omit it.
 */
export function calculateNextReview(
  current: SrsState,
  grade: SrsGrade,
  now: Date = new Date(),
): SrsResult {
  if (grade !== 1 && grade !== 2 && grade !== 3 && grade !== 4) {
    throw new RangeError(`Invalid SRS grade: ${grade}. Expected 1, 2, 3, or 4.`);
  }

  const { interval: prevInterval, repetition: prevRepetition, easeFactor: prevEf } =
    normalizeState(current);
  const quality = gradeToQuality(grade);

  // SM-2 ease update: EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
  let easeFactor = prevEf + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < MIN_EASE_FACTOR) easeFactor = MIN_EASE_FACTOR;
  // Round to 2 decimals to avoid float drift in SQLite REAL column.
  easeFactor = Math.round(easeFactor * 100) / 100;

  let interval: number;
  let repetition: number;

  if (quality < 3) {
    // Fail: reset streak. Card is due again tomorrow (1 day) so the
    // review queue stays "offline-first, same-day re-try"-friendly
    // without needing minute-level scheduling.
    repetition = 0;
    interval = 1;
  } else {
    repetition = prevRepetition + 1;
    if (repetition === 1) {
      // First success: Hard/Good -> tomorrow, Easy -> in 4 days.
      interval = grade === 4 ? 4 : 1;
    } else if (repetition === 2) {
      // Second success: classic SM-2 gives 6 days for Good;
      // Hard lands between (3d), Easy gets a bonus (8d).
      interval = grade === 2 ? 3 : grade === 4 ? 8 : 6;
    } else {
      // Steady state: Good is I(n-1) * EF, Hard grows slowly at
      // I(n-1) * 1.2, Easy gets a 1.3x bonus on top of EF.
      if (grade === 2) {
        interval = Math.round(prevInterval * 1.2);
      } else {
        const bonus = grade === 4 ? 1.3 : 1;
        interval = Math.round(prevInterval * easeFactor * bonus);
      }
      if (interval < 1) interval = 1;
    }
  }

  const dueDate = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000).toISOString();

  return { interval, repetition, easeFactor, dueDate };
}

/** Convenience: is this card due at (or before) `at`? */
export function isDue(dueDateIso: string, at: Date = new Date()): boolean {
  return new Date(dueDateIso).getTime() <= at.getTime();
}

/** Human-friendly interval for grade-button previews: `1d`, `6d`, `3mo`, `2y`. */
export function formatInterval(days: number): string {
  const d = Math.max(0, Math.round(days));
  if (d < 30) return `${d}d`;
  if (d < 365) {
    const mo = Math.round(d / 30);
    return `${mo}mo`;
  }
  const years = d / 365;
  return `${Number.isInteger(years) ? years : years.toFixed(1)}y`;
}
