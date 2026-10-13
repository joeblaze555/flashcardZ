/**
 * Daily goal + reminder preferences (AsyncStorage-backed).
 *
 * - Daily goal: target reviews per day (default 20, clamped 1–500).
 * - Reminder: in-app nudge flag + hour (0–23). Actual push scheduling
 *   can be layered later with `expo-notifications`; the stored prefs are
 *   the contract that scheduler would read.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DAILY_GOAL_KEY = '@flashcardz/daily-goal';
export const REMINDER_ENABLED_KEY = '@flashcardz/reminder-enabled';
export const REMINDER_HOUR_KEY = '@flashcardz/reminder-hour';

export const DEFAULT_DAILY_GOAL = 20;
export const MIN_DAILY_GOAL = 1;
export const MAX_DAILY_GOAL = 500;
export const DEFAULT_REMINDER_HOUR = 19;

export function clampGoal(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DAILY_GOAL;
  return Math.min(MAX_DAILY_GOAL, Math.max(MIN_DAILY_GOAL, Math.round(value)));
}

export async function getDailyGoal(): Promise<number> {
  const raw = await AsyncStorage.getItem(DAILY_GOAL_KEY);
  const parsed = raw == null ? NaN : Number.parseInt(raw, 10);
  return clampGoal(parsed);
}

export async function setDailyGoal(goal: number): Promise<number> {
  const clamped = clampGoal(goal);
  await AsyncStorage.setItem(DAILY_GOAL_KEY, String(clamped));
  return clamped;
}

export async function getReminderEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(REMINDER_ENABLED_KEY)) === '1';
}

export async function setReminderEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(REMINDER_ENABLED_KEY, enabled ? '1' : '0');
}

export async function getReminderHour(): Promise<number> {
  const raw = await AsyncStorage.getItem(REMINDER_HOUR_KEY);
  const parsed = raw == null ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_REMINDER_HOUR;
  return Math.min(23, Math.max(0, Math.round(parsed)));
}

export async function setReminderHour(hour: number): Promise<number> {
  const clamped = Math.min(23, Math.max(0, Math.round(hour)));
  await AsyncStorage.setItem(REMINDER_HOUR_KEY, String(clamped));
  return clamped;
}
