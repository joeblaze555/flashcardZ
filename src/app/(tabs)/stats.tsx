/**
 * Stats tab — learning insights dashboard.
 *
 * KPI cards (totals, due queue, review streak, completed reviews), daily
 * goal progress (reviews today vs. target with adjustable goal), plus a
 * mastery breakdown bucketing cards by SM-2 interval: Learning (<6d),
 * Reviewing (6–20d), Mastered (≥21d). Reloads on every focus.
 */

import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMasteryBreakdown, getReviewsTodayCount, getReviewStreak, getStats } from '@/db/database';
import type { MasteryBreakdown, ReviewStats } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  DEFAULT_DAILY_GOAL,
  MAX_DAILY_GOAL,
  MIN_DAILY_GOAL,
  clampGoal,
  getDailyGoal,
  setDailyGoal,
} from '@/lib/daily-goal';

const LEARNING_COLOR = '#6366F1';
const REVIEWING_COLOR = '#F59E0B';
const MASTERED_COLOR = '#10B981';

interface Bucket {
  key: 'learning' | 'reviewing' | 'mastered';
  label: string;
  hint: string;
  color: string;
}

const BUCKETS: readonly Bucket[] = [
  { key: 'learning', label: 'Learning', hint: 'interval < 6 days', color: LEARNING_COLOR },
  { key: 'reviewing', label: 'Reviewing', hint: '6 – 20 days', color: REVIEWING_COLOR },
  { key: 'mastered', label: 'Mastered', hint: 'interval ≥ 21 days', color: MASTERED_COLOR },
] as const;

interface Dashboard {
  stats: ReviewStats;
  mastery: MasteryBreakdown;
  streak: number;
}

export default function StatsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [data, setData] = useState<Dashboard | null>(null);
  const [goal, setGoal] = useState(DEFAULT_DAILY_GOAL);
  const [today, setToday] = useState(0);
  // Mirror of `goal` for the stepper: the sync portion of `changeGoal`
  // runs before any await, so rapid taps each see the latest value
  // instead of a stale closure (which would drop increments).
  const goalRef = useRef(DEFAULT_DAILY_GOAL);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const [stats, mastery, streak, todayCount, savedGoal] = await Promise.all([
            getStats(db),
            getMasteryBreakdown(db),
            getReviewStreak(db),
            getReviewsTodayCount(db).catch(() => 0),
            getDailyGoal().catch(() => DEFAULT_DAILY_GOAL),
          ]);
          if (alive) {
            setData({ stats, mastery, streak });
            setToday(todayCount);
            goalRef.current = savedGoal;
            setGoal(savedGoal);
          }
        } catch (e) {
          Alert.alert('Database error', e instanceof Error ? e.message : String(e));
        }
      })();
      return () => {
        alive = false;
      };
    }, [db]),
  );

  const changeGoal = useCallback(async (delta: number) => {
    const next = clampGoal(goalRef.current + delta);
    goalRef.current = next;
    setGoal(next);
    try {
      await setDailyGoal(next);
    } catch {
      // Non-fatal: goal stays in memory for this session.
    }
  }, []);

  const kpis = data
    ? [
        { label: 'Total Cards', value: String(data.stats.totalCards) },
        { label: 'Due Today', value: String(data.stats.dueToday) },
        {
          label: 'Day Streak',
          value: data.streak > 0 ? `🔥 ${data.streak}` : '—',
        },
        { label: 'Total Reviews', value: String(data.stats.totalReviews) },
      ]
    : [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={[styles.heading, { color: theme.text }]}>Stats</Text>
        <Text style={[styles.sub, { color: theme.textSecondary }]}>Your learning overview</Text>

        {!data ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <>
            <View style={styles.grid}>
              {kpis.map((kpi) => (
                <View
                  key={kpi.label}
                  style={[styles.tile, { backgroundColor: theme.backgroundElement }]}>
                  <Text style={[styles.value, { color: theme.text }]}>{kpi.value}</Text>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>{kpi.label}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.section, { color: theme.text }]}>Daily goal</Text>
            <View style={[styles.panel, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.goalHeader}>
                <View style={styles.bucketLabels}>
                  <Text style={[styles.goalValue, { color: theme.text }]}>
                    {today} / {goal} reviews
                  </Text>
                  <Text style={[styles.bucketHint, { color: theme.textSecondary }]}>
                    {today >= goal
                      ? 'Goal hit — nice work!'
                      : `${goal - today} to go today`}
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => void changeGoal(-5)}
                    disabled={goal <= MIN_DAILY_GOAL}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Decrease daily goal"
                    style={[styles.stepBtn, { opacity: goal <= MIN_DAILY_GOAL ? 0.35 : 1 }]}>
                    <Text style={[styles.stepText, { color: theme.text }]}>−</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void changeGoal(5)}
                    disabled={goal >= MAX_DAILY_GOAL}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Increase daily goal"
                    style={[styles.stepBtn, { opacity: goal >= MAX_DAILY_GOAL ? 0.35 : 1 }]}>
                    <Text style={[styles.stepText, { color: theme.text }]}>+</Text>
                  </Pressable>
                </View>
              </View>
              <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      backgroundColor: '#10B981',
                      width: `${Math.min(100, Math.round((today / Math.max(1, goal)) * 100))}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.goalHint, { color: theme.textSecondary }]}>
                Adjust in steps of 5 ({MIN_DAILY_GOAL}–{MAX_DAILY_GOAL}). Reminder prefs live in
                Settings.
              </Text>
            </View>

            <Text style={[styles.section, { color: theme.text }]}>Mastery</Text>
            <View style={[styles.panel, { backgroundColor: theme.backgroundElement }]}>
              {BUCKETS.map((bucket) => {
                const count = data.mastery[bucket.key];
                const pct = data.mastery.total > 0 ? Math.round((count / data.mastery.total) * 100) : 0;
                return (
                  <View key={bucket.key} style={styles.bucket}>
                    <View style={styles.bucketHeader}>
                      <View style={[styles.swatch, { backgroundColor: bucket.color }]} />
                      <View style={styles.bucketLabels}>
                        <Text style={[styles.bucketLabel, { color: theme.text }]}>
                          {bucket.label}
                        </Text>
                        <Text style={[styles.bucketHint, { color: theme.textSecondary }]}>
                          {bucket.hint}
                        </Text>
                      </View>
                      <Text style={[styles.bucketCount, { color: theme.text }]}>
                        {count} · {pct}%
                      </Text>
                    </View>
                    <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                      <View
                        style={[styles.fill, { backgroundColor: bucket.color, width: `${pct}%` }]}
                      />
                    </View>
                  </View>
                );
              })}
              {data.mastery.total === 0 && (
                <Text style={[styles.empty, { color: theme.textSecondary }]}>
                  Add cards to a deck to start building mastery.
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  inner: {
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  heading: { fontSize: 28, fontWeight: '700' },
  sub: { fontSize: 14, marginTop: 2, marginBottom: Spacing.three },
  loader: { marginTop: Spacing.five },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: 12,
    padding: Spacing.four,
    alignItems: 'center',
    gap: 4,
  },
  value: { fontSize: 26, fontWeight: '700' },
  label: { fontSize: 13 },
  section: { fontSize: 18, fontWeight: '700', marginTop: Spacing.four, marginBottom: Spacing.two },
  panel: { borderRadius: 14, padding: Spacing.four, gap: Spacing.three },
  bucket: { gap: Spacing.two },
  bucketHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  bucketLabels: { flex: 1 },
  bucketLabel: { fontSize: 15, fontWeight: '600' },
  bucketHint: { fontSize: 12 },
  bucketCount: { fontSize: 14, fontWeight: '700' },
  track: { height: 8, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  goalHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  goalValue: { fontSize: 17, fontWeight: '800' },
  stepper: { flexDirection: 'row', gap: Spacing.two },
  stepBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#334155' },
  stepText: { fontSize: 18, fontWeight: '800' },
  goalHint: { fontSize: 12 },
  empty: { fontSize: 13, textAlign: 'center' },
});
