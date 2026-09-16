/**
 * FlashCardZ database layer — expo-sqlite (SDK 57, async API).
 *
 * All queries use parameter binding (`?` placeholders). The `*Async`
 * convenience methods (`runAsync` / `getAllAsync` / `getFirstAsync`)
 * compile to prepared statements internally; bulk imports additionally
 * use explicit `prepareAsync` + `executeAsync` + `finalizeAsync`.
 *
 * Usage (SDK 57 recommended):
 * ```tsx
 * <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
 *   <Slot />
 * </SQLiteProvider>
 * // inside a screen:
 * const db = useSQLiteContext();
 * const decks = await getDecksWithCounts(db);
 * ```
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import {
  calculateNextReview,
  createInitialSrsState,
  type SrsGrade,
} from '@/lib/srs';
import {
  CREATE_SCHEMA_V1,
  DATABASE_VERSION,
  type Card,
  type Deck,
  type DeckWithCounts,
  type DueCard,
  type MasteryBreakdown,
  type ReviewStats,
} from '@/db/schema';

export { DATABASE_VERSION } from '@/db/schema';
export { DATABASE_NAME } from '@/db/schema';
export type { MasteryBreakdown } from '@/db/schema';

/** Run on `SQLiteProvider(onInit=)`. Idempotent via `PRAGMA user_version`. */
export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentDbVersion = row?.user_version ?? 0;

  if (currentDbVersion >= DATABASE_VERSION) return;

  if (currentDbVersion === 0) {
    await db.execAsync(CREATE_SCHEMA_V1);
    currentDbVersion = 1;
  }

  // Future migrations:
  // if (currentDbVersion === 1) { ...; currentDbVersion = 2; }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

/** Local id without extra deps (crypto-safe enough for on-device PKs). */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const toIso = (d: Date = new Date()): string => d.toISOString();

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

export async function createDeck(
  db: SQLiteDatabase,
  input: { title: string; description?: string },
): Promise<Deck> {
  const title = input.title.trim();
  if (!title) throw new Error('Deck title must not be empty.');

  const deck: Deck = {
    id: generateId(),
    title,
    description: (input.description ?? '').trim(),
    createdAt: toIso(),
  };

  await db.runAsync(
    'INSERT INTO decks (id, title, description, createdAt) VALUES (?, ?, ?, ?)',
    [deck.id, deck.title, deck.description, deck.createdAt],
  );
  return deck;
}

export async function getDeckById(db: SQLiteDatabase, deckId: string): Promise<Deck | null> {
  return db.getFirstAsync<Deck>('SELECT id, title, description, createdAt FROM decks WHERE id = ?', [
    deckId,
  ]);
}

/**
 * All decks with per-deck totals + due counts (due = dueDate <= now).
 * Single query — no N+1.
 */
export async function getDecksWithCounts(
  db: SQLiteDatabase,
  now: Date = new Date(),
): Promise<DeckWithCounts[]> {
  const nowIso = now.toISOString();
  return db.getAllAsync<DeckWithCounts>(
    `SELECT d.id, d.title, d.description, d.createdAt,
            COUNT(DISTINCT c.id) AS totalCards,
            COUNT(DISTINCT CASE WHEN s.dueDate <= ? THEN c.id END) AS dueCount
       FROM decks d
       LEFT JOIN cards c ON c.deckId = d.id
       LEFT JOIN card_srs s ON s.cardId = c.id
      GROUP BY d.id
      ORDER BY d.createdAt DESC`,
    [nowIso],
  );
}

export async function deleteDeck(db: SQLiteDatabase, deckId: string): Promise<void> {
  // Cards + card_srs cascade via FK; wrap in transaction for atomicity.
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM card_srs WHERE cardId IN (SELECT id FROM cards WHERE deckId = ?)', [
      deckId,
    ]);
    await db.runAsync('DELETE FROM cards WHERE deckId = ?', [deckId]);
    await db.runAsync('DELETE FROM decks WHERE id = ?', [deckId]);
  });
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export async function createCard(
  db: SQLiteDatabase,
  input: { deckId: string; front: string; back: string },
  now: Date = new Date(),
): Promise<Card> {
  const front = input.front.trim();
  const back = input.back.trim();
  if (!front || !back) throw new Error('Card front and back must not be empty.');

  const card: Card = {
    id: generateId(),
    deckId: input.deckId,
    front,
    back,
    createdAt: toIso(now),
  };
  const initial = createInitialSrsState(now);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO cards (id, deckId, front, back, createdAt) VALUES (?, ?, ?, ?, ?)',
      [card.id, card.deckId, card.front, card.back, card.createdAt],
    );
    await db.runAsync(
      'INSERT INTO card_srs (cardId, "interval", repetition, easeFactor, dueDate, lastReviewedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [card.id, initial.interval, initial.repetition, initial.easeFactor, initial.dueDate, null],
    );
  });

  return card;
}

export async function getCardsByDeck(db: SQLiteDatabase, deckId: string): Promise<DueCard[]> {
  return db.getAllAsync<DueCard>(
    `SELECT c.id, c.deckId, c.front, c.back, c.createdAt,
            s."interval" AS "interval", s.repetition, s.easeFactor, s.dueDate, s.lastReviewedAt
       FROM cards c
       JOIN card_srs s ON s.cardId = c.id
      WHERE c.deckId = ?
      ORDER BY s.dueDate ASC, c.createdAt ASC`,
    [deckId],
  );
}

export async function deleteCard(db: SQLiteDatabase, cardId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM card_srs WHERE cardId = ?', [cardId]);
    await db.runAsync('DELETE FROM cards WHERE id = ?', [cardId]);
  });
}

/**
 * Update a card's content only — SRS progress (`card_srs`) is untouched
 * so editing never resets the review schedule.
 */
export async function updateCard(
  db: SQLiteDatabase,
  cardId: string,
  input: { front: string; back: string },
): Promise<void> {
  const front = input.front.trim();
  const back = input.back.trim();
  if (!front || !back) throw new Error('Card front and back must not be empty.');

  const result = await db.runAsync('UPDATE cards SET front = ?, back = ? WHERE id = ?', [
    front,
    back,
    cardId,
  ]);
  if (result.changes === 0) throw new Error(`No card found with id: ${cardId}`);
}

export interface BulkCardInput {
  front: string;
  back: string;
}

/**
 * Batch-create cards into a deck. One transaction + explicit prepared
 * statements (`prepareAsync` / `executeAsync` / `finalizeAsync`) so
 * large CSV imports stay fast. Blank rows are skipped; returns the
 * number of cards actually inserted.
 */
export async function bulkCreateCards(
  db: SQLiteDatabase,
  deckId: string,
  inputs: BulkCardInput[],
  now: Date = new Date(),
): Promise<{ inserted: number }> {
  const rows = inputs
    .map((c) => ({ front: c.front.trim(), back: c.back.trim() }))
    .filter((c) => c.front.length > 0 && c.back.length > 0);
  if (rows.length === 0) return { inserted: 0 };

  const nowIso = now.toISOString();
  const initial = createInitialSrsState(now);

  await db.withTransactionAsync(async () => {
    const cardStmt = await db.prepareAsync(
      'INSERT INTO cards (id, deckId, front, back, createdAt) VALUES (?, ?, ?, ?, ?)',
    );
    const srsStmt = await db.prepareAsync(
      'INSERT INTO card_srs (cardId, "interval", repetition, easeFactor, dueDate, lastReviewedAt) VALUES (?, ?, ?, ?, ?, ?)',
    );
    try {
      for (const row of rows) {
        const id = generateId();
        await cardStmt.executeAsync([id, deckId, row.front, row.back, nowIso]);
        await srsStmt.executeAsync([
          id,
          initial.interval,
          initial.repetition,
          initial.easeFactor,
          initial.dueDate,
          null,
        ]);
      }
    } finally {
      await cardStmt.finalizeAsync();
      await srsStmt.finalizeAsync();
    }
  });

  return { inserted: rows.length };
}

/** Single-deck header stats (total + due). Null when the deck is gone. */
export async function getDeckWithCounts(
  db: SQLiteDatabase,
  deckId: string,
  now: Date = new Date(),
): Promise<DeckWithCounts | null> {
  return db.getFirstAsync<DeckWithCounts>(
    `SELECT d.id, d.title, d.description, d.createdAt,
            COUNT(DISTINCT c.id) AS totalCards,
            COUNT(DISTINCT CASE WHEN s.dueDate <= ? THEN c.id END) AS dueCount
       FROM decks d
       LEFT JOIN cards c ON c.deckId = d.id
       LEFT JOIN card_srs s ON s.cardId = c.id
      WHERE d.id = ?
      GROUP BY d.id`,
    [now.toISOString(), deckId],
  );
}

// ---------------------------------------------------------------------------
// Review queue (SM-2)
// ---------------------------------------------------------------------------

/** Cards due at (or before) `now`, oldest-due first. */
export async function getDueCards(
  db: SQLiteDatabase,
  options: { deckId?: string; limit?: number; now?: Date } = {},
): Promise<DueCard[]> {
  const { deckId, limit = 50, now = new Date() } = options;
  const nowIso = now.toISOString();

  if (deckId) {
    return db.getAllAsync<DueCard>(
      `SELECT c.id, c.deckId, c.front, c.back, c.createdAt,
              s."interval" AS "interval", s.repetition, s.easeFactor, s.dueDate, s.lastReviewedAt
         FROM cards c
         JOIN card_srs s ON s.cardId = c.id
        WHERE c.deckId = ? AND s.dueDate <= ?
        ORDER BY s.dueDate ASC, c.createdAt ASC
        LIMIT ?`,
      [deckId, nowIso, limit],
    );
  }

  return db.getAllAsync<DueCard>(
    `SELECT c.id, c.deckId, c.front, c.back, c.createdAt,
            s."interval" AS "interval", s.repetition, s.easeFactor, s.dueDate, s.lastReviewedAt
       FROM cards c
       JOIN card_srs s ON s.cardId = c.id
      WHERE s.dueDate <= ?
      ORDER BY s.dueDate ASC, c.createdAt ASC
      LIMIT ?`,
    [nowIso, limit],
  );
}

export async function getDueCount(db: SQLiteDatabase, now: Date = new Date()): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM card_srs WHERE dueDate <= ?',
    [now.toISOString()],
  );
  return row?.count ?? 0;
}

/**
 * Grade a card: reads its SRS row, runs pure `calculateNextReview`,
 * then persists. Returns the new due date / interval for UI + haptics.
 */
export async function reviewCard(
  db: SQLiteDatabase,
  cardId: string,
  grade: SrsGrade,
  now: Date = new Date(),
): Promise<{ interval: number; repetition: number; easeFactor: number; dueDate: string }> {
  const current = await db.getFirstAsync<{
    interval: number;
    repetition: number;
    easeFactor: number;
  }>('SELECT "interval" AS "interval", repetition, easeFactor FROM card_srs WHERE cardId = ?', [
    cardId,
  ]);
  if (!current) throw new Error(`No SRS row found for cardId: ${cardId}`);

  const next = calculateNextReview(current, grade, now);

  await db.runAsync(
    'UPDATE card_srs SET "interval" = ?, repetition = ?, easeFactor = ?, dueDate = ?, lastReviewedAt = ? WHERE cardId = ?',
    [next.interval, next.repetition, next.easeFactor, next.dueDate, now.toISOString(), cardId],
  );

  return next;
}

// ---------------------------------------------------------------------------
// Stats / backup
// ---------------------------------------------------------------------------

export async function getStats(db: SQLiteDatabase, now: Date = new Date()): Promise<ReviewStats> {
  const nowIso = now.toISOString();
  const row = await db.getFirstAsync<{
    totalDecks: number;
    totalCards: number;
    dueToday: number;
    totalReviews: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM decks) AS totalDecks,
       (SELECT COUNT(*) FROM cards) AS totalCards,
       (SELECT COUNT(*) FROM card_srs WHERE dueDate <= ?) AS dueToday,
       (SELECT COUNT(*) FROM card_srs WHERE lastReviewedAt IS NOT NULL) AS totalReviews`,
    [nowIso],
  );

  return {
    totalDecks: row?.totalDecks ?? 0,
    totalCards: row?.totalCards ?? 0,
    dueToday: row?.dueToday ?? 0,
    totalReviews: row?.totalReviews ?? 0,
  };
}

/** Retention-bucket counts from the SM-2 interval, in a single scan. */
export async function getMasteryBreakdown(db: SQLiteDatabase): Promise<MasteryBreakdown> {
  const row = await db.getFirstAsync<{ learning: number; reviewing: number; mastered: number }>(
    `SELECT
       SUM(CASE WHEN "interval" < 6 THEN 1 ELSE 0 END) AS learning,
       SUM(CASE WHEN "interval" >= 6 AND "interval" < 21 THEN 1 ELSE 0 END) AS reviewing,
       SUM(CASE WHEN "interval" >= 21 THEN 1 ELSE 0 END) AS mastered
       FROM card_srs`,
  );
  const learning = row?.learning ?? 0;
  const reviewing = row?.reviewing ?? 0;
  const mastered = row?.mastered ?? 0;
  return { learning, reviewing, mastered, total: learning + reviewing + mastered };
}

/**
 * Consecutive days (ending today, or yesterday when today has no
 * reviews yet) with at least one completed review, derived from
 * distinct `lastReviewedAt` dates in `card_srs`.
 *
 * Note: day boundaries use UTC (`DATE()` over ISO timestamps), and only
 * each card's *latest* review is visible — a dedicated review-events
 * table would make long histories exact.
 */
export async function getReviewStreak(db: SQLiteDatabase, now: Date = new Date()): Promise<number> {
  const rows = await db.getAllAsync<{ d: string }>(
    'SELECT DISTINCT DATE(lastReviewedAt) AS d FROM card_srs WHERE lastReviewedAt IS NOT NULL ORDER BY d DESC',
  );
  if (rows.length === 0) return 0;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const first = rows[0];
  if (!first) return 0;

  let expected = Date.parse(`${first.d}T00:00:00Z`);
  if (Number.isNaN(expected)) return 0;
  // Streak stays alive when today simply hasn't been studied yet.
  if (expected !== todayUTC) expected = todayUTC - DAY_MS;

  let streak = 0;
  for (const row of rows) {
    if (Date.parse(`${row.d}T00:00:00Z`) !== expected) break;
    streak += 1;
    expected -= DAY_MS;
  }
  return streak;
}

/** Destructive wipe of all user data (decks, cards, SRS rows). */
export async function clearDatabase(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM card_srs');
    await db.runAsync('DELETE FROM cards');
    await db.runAsync('DELETE FROM decks');
  });
}

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  decks: Deck[];
  cards: Card[];
  srs: import('@/db/schema').CardSrs[];
}

export async function exportData(db: SQLiteDatabase): Promise<BackupPayload> {
  const [decks, cards, srs] = await Promise.all([
    db.getAllAsync<Deck>('SELECT id, title, description, createdAt FROM decks ORDER BY createdAt ASC'),
    db.getAllAsync<Card>(
      'SELECT id, deckId, front, back, createdAt FROM cards ORDER BY createdAt ASC',
    ),
    db.getAllAsync<import('@/db/schema').CardSrs>(
      'SELECT cardId, "interval" AS "interval", repetition, easeFactor, dueDate, lastReviewedAt FROM card_srs',
    ),
  ]);
  return { version: 1, exportedAt: toIso(), decks, cards, srs };
}

/**
 * Restore from `exportData`. Uses explicit prepared statements inside one
 * transaction — fast + safe for large imports.
 */
export async function importData(db: SQLiteDatabase, payload: BackupPayload): Promise<void> {
  if (payload.version !== 1) throw new Error(`Unsupported backup version: ${payload.version}`);

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM card_srs');
    await db.runAsync('DELETE FROM cards');
    await db.runAsync('DELETE FROM decks');

    const deckStmt = await db.prepareAsync(
      'INSERT OR REPLACE INTO decks (id, title, description, createdAt) VALUES (?, ?, ?, ?)',
    );
    try {
      for (const d of payload.decks) {
        await deckStmt.executeAsync([d.id, d.title, d.description ?? '', d.createdAt]);
      }
    } finally {
      await deckStmt.finalizeAsync();
    }

    const cardStmt = await db.prepareAsync(
      'INSERT OR REPLACE INTO cards (id, deckId, front, back, createdAt) VALUES (?, ?, ?, ?, ?)',
    );
    try {
      for (const c of payload.cards) {
        await cardStmt.executeAsync([c.id, c.deckId, c.front, c.back, c.createdAt]);
      }
    } finally {
      await cardStmt.finalizeAsync();
    }

    const srsStmt = await db.prepareAsync(
      'INSERT OR REPLACE INTO card_srs (cardId, "interval", repetition, easeFactor, dueDate, lastReviewedAt) VALUES (?, ?, ?, ?, ?, ?)',
    );
    try {
      for (const s of payload.srs) {
        await srsStmt.executeAsync([
          s.cardId,
          s.interval,
          s.repetition,
          s.easeFactor,
          s.dueDate,
          s.lastReviewedAt,
        ]);
      }
    } finally {
      await srsStmt.finalizeAsync();
    }
  });
}
