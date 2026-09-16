/**
 * FlashCardZ local SQLite schema (expo-sqlite, async API).
 *
 * Tables:
 * - decks(id TEXT PK, title TEXT, description TEXT, createdAt TEXT)
 * - cards(id TEXT PK, deckId TEXT FK -> decks(id), front TEXT, back TEXT, createdAt TEXT)
 * - card_srs(cardId TEXT PK FK -> cards(id), interval INTEGER, repetition INTEGER,
 *            easeFactor REAL, dueDate TEXT, lastReviewedAt TEXT)
 */

export const DATABASE_NAME = 'flashcardz.db';

/** Bump when schema changes; `migrateDbIfNeeded` applies migrations in order. */
export const DATABASE_VERSION = 1;

export interface Deck {
  id: string;
  title: string;
  description: string;
  createdAt: string;
}

export interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  createdAt: string;
}

export interface CardSrs {
  cardId: string;
  /** Days until next review. */
  interval: number;
  /** Consecutive successful reviews. */
  repetition: number;
  /** SM-2 ease factor, default 2.5. */
  easeFactor: number;
  /** ISO timestamp for when the card is next due. */
  dueDate: string;
  /** ISO timestamp of last review, null if never reviewed. */
  lastReviewedAt: string | null;
}

/** Deck + aggregated counts for list rendering. */
export interface DeckWithCounts extends Deck {
  totalCards: number;
  dueCount: number;
}

/** A card joined with its SRS row — the unit the study queue consumes. */
export interface DueCard extends Card {
  interval: number;
  repetition: number;
  easeFactor: number;
  dueDate: string;
  lastReviewedAt: string | null;
}

export interface ReviewStats {
  totalDecks: number;
  totalCards: number;
  dueToday: number;
  /** Cards with at least one completed review (lastReviewedAt set). */
  totalReviews: number;
}

/** Retention buckets derived from the SM-2 interval (days). */
export interface MasteryBreakdown {
  /** interval < 6 days — still being learned. */
  learning: number;
  /** 6 <= interval < 21 days — in active review. */
  reviewing: number;
  /** interval >= 21 days — long-term retention. */
  mastered: number;
  total: number;
}

/** v1 base schema. `execAsync` runs it as one bulk batch (no user input). */
export const CREATE_SCHEMA_V1 = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY NOT NULL,
  deckId TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_deckId ON cards(deckId);

CREATE TABLE IF NOT EXISTS card_srs (
  cardId TEXT PRIMARY KEY NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  "interval" INTEGER NOT NULL DEFAULT 0,
  repetition INTEGER NOT NULL DEFAULT 0,
  easeFactor REAL NOT NULL DEFAULT 2.5,
  dueDate TEXT NOT NULL,
  lastReviewedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_card_srs_dueDate ON card_srs(dueDate);
`;
