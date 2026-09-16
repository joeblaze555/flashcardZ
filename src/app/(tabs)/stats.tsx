/**
 * Stats tab — learning insights dashboard.
 *
 * KPI cards (totals, due queue, review streak, completed reviews) plus a
 * mastery breakdown bucketing cards by SM-2 interval: Learning (<6d),
 * Reviewing (6–20d), Mastered (≥21d). Reloads on every focus.
 */

import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMasteryBreakdown, getReviewStreak, getStats } from '@/db/database';
import type { MasteryBreakdown, ReviewStats } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

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

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const [stats, mastery, streak] = await Promise.all([
            getStats(db),
            getMasteryBreakdown(db),
            getReviewStreak(db),
          ]);
          if (alive) setData({ stats, mastery, streak });
        } catch (e) {
          Alert.alert('Database error', e instanceof Error ? e.message : String(e));
        }
      })();
      return () => {
        alive = false;
      };
    }, [db]),
  );

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
  empty: { fontSize: 13, textAlign: 'center' },
});
