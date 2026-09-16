/**
 * Study tab — interactive SRS review flow.
 *
 * Queue is scoped by `deckId` search param (deep-linked from deck detail),
 * rendered through the Reanimated 3D `FlashcardView`, and graded with the
 * 4-point SM-2 scale. Grade buttons preview their target interval via the
 * pure `calculateNextReview` engine. When the queue drains, a session
 * summary is shown.
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import FlashcardView from '@/components/FlashcardView';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { getDeckById, getDueCards, reviewCard } from '@/db/database';
import type { DueCard } from '@/db/schema';
import { playImpact, playNotification } from '@/lib/haptics';
import { TABS_HOME } from '@/lib/routes';
import { calculateNextReview, formatInterval, type SrsGrade } from '@/lib/srs';

const BG = '#0F172A';
const SURFACE = '#1E293B';
const BORDER = '#334155';
const INK = '#F8FAFC';
const MUTED = '#94A3B8';
const EMERALD = '#10B981';
const INDIGO = '#6366F1';

interface GradeConfig {
  grade: SrsGrade;
  label: string;
  color: string;
  tint: string;
}

const GRADES: readonly GradeConfig[] = [
  { grade: 1, label: 'Again', color: '#EF4444', tint: 'rgba(239, 68, 68, 0.15)' },
  { grade: 2, label: 'Hard', color: '#F59E0B', tint: 'rgba(245, 158, 11, 0.15)' },
  { grade: 3, label: 'Good', color: INDIGO, tint: 'rgba(99, 102, 241, 0.15)' },
  { grade: 4, label: 'Easy', color: EMERALD, tint: 'rgba(16, 185, 129, 0.15)' },
] as const;

/**
 * Module-scope for the same reason as `animateFlipTo` in FlashcardView:
 * Reanimated shared values are stable mutable containers (like refs) and
 * must be written imperatively — the compiler lint can't tell that.
 */
function resetFlip(flipped: SharedValue<number>): void {
  flipped.value = 0;
}

function setProgress(bar: SharedValue<number>, ratio: number): void {
  bar.value = withTiming(Math.min(Math.max(ratio, 0), 1), { duration: 350 });
}

export default function StudyScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { deckId: deckIdParam } = useLocalSearchParams<{ deckId?: string }>();
  const deckId = Array.isArray(deckIdParam) ? deckIdParam[0] : deckIdParam;

  const [queue, setQueue] = useState<DueCard[]>([]);
  const [total, setTotal] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [deckTitle, setDeckTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);

  // UI-thread drivers, owned here so grading can reset them imperatively.
  const flipped = useSharedValue(0);
  const bar = useSharedValue(0);
  const summaryHapticFired = useRef(false);

  // UI thread: smooth queue-completion fill.
  const barStyle = useAnimatedStyle(() => ({
    width: `${bar.value * 100}%`,
  }));

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [due, deck] = await Promise.all([
        getDueCards(db, { limit: 100, ...(deckId ? { deckId } : {}) }),
        deckId ? getDeckById(db, deckId) : Promise.resolve(null),
      ]);
      resetFlip(flipped);
      setProgress(bar, 0);
      summaryHapticFired.current = false;
      setQueue(due);
      setTotal(due.length);
      setReviewed(0);
      setDeckTitle(deck?.title ?? null);
      setRevealed(false);
    } catch (e) {
      Alert.alert('Database error', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [db, deckId, flipped, bar]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const current = queue[0] ?? null;
  const complete = !loading && current == null;

  // Celebrate finishing a real session (not the initially-empty state).
  useEffect(() => {
    if (complete && reviewed > 0 && !summaryHapticFired.current) {
      summaryHapticFired.current = true;
      void playNotification(Haptics.NotificationFeedbackType.Success);
    }
  }, [complete, reviewed]);

  // Target intervals for each grade, computed from the live card state.
  const previews = useMemo(() => {
    if (!current) return null;
    const result = {} as Record<SrsGrade, string>;
    for (const { grade } of GRADES) {
      result[grade] = formatInterval(calculateNextReview(current, grade).interval);
    }
    return result;
  }, [current]);

  const grade = useCallback(
    async (g: SrsGrade) => {
      if (!current || grading) return;
      setGrading(true);
      try {
        await playImpact(Haptics.ImpactFeedbackStyle.Medium);
        await reviewCard(db, current.id, g);
        resetFlip(flipped);
        setProgress(bar, total > 0 ? (reviewed + 1) / total : 0);
        setRevealed(false);
        setReviewed((r) => r + 1);
        setQueue((q) => q.slice(1));
      } catch (e) {
        Alert.alert('Could not save review', e instanceof Error ? e.message : String(e));
      } finally {
        setGrading(false);
      }
    },
    [db, current, grading, flipped, bar, total, reviewed],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.inner}>
        {loading ? (
          <ActivityIndicator style={styles.loader} color={EMERALD} />
        ) : complete ? (
          <View style={styles.summary}>
            <View style={styles.ring}>
              <Ionicons name="checkmark" size={44} color={EMERALD} />
            </View>
            <Text style={styles.summaryTitle}>
              {reviewed > 0 ? 'Session Complete!' : 'All Caught Up!'}
            </Text>
            <Text style={styles.summarySub}>
              {reviewed > 0
                ? "You've reviewed all cards due for today."
                : 'No cards due right now.'}
            </Text>
            {reviewed > 0 && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCount}>{reviewed}</Text>
                <Text style={styles.summaryLabel}>
                  {reviewed === 1 ? 'Card Reviewed' : 'Cards Reviewed'}
                </Text>
              </View>
            )}
            <Pressable
              onPress={() => router.push(TABS_HOME)}
              accessibilityRole="button"
              accessibilityLabel="Back to decks"
              style={({ pressed }) => [styles.decksButton, { opacity: pressed ? 0.85 : 1 }]}>
              <Text style={styles.decksButtonText}>Back to Decks</Text>
            </Pressable>
          </View>
        ) : (
          current && (
            <>
              <Text style={styles.deckTitle} numberOfLines={1}>
                {deckTitle ?? 'All Due Cards'}
              </Text>
              <Text style={styles.progressLabel}>
                Card {Math.min(reviewed + 1, total)} of {total}
              </Text>
              <View style={styles.track}>
                <Animated.View style={[styles.fill, barStyle]} />
              </View>

              <FlashcardView
                front={current.front}
                back={current.back}
                flipped={flipped}
                onFlipChange={setRevealed}
              />

              {!revealed ? (
                <View style={styles.hintBadge}>
                  <Ionicons name="sync" size={14} color={MUTED} />
                  <Text style={styles.hintText}>Tap card to flip</Text>
                </View>
              ) : (
                previews && (
                  <View style={styles.grades}>
                    {GRADES.map(({ grade: g, label, color, tint }) => (
                      <Pressable
                        key={g}
                        onPress={() => void grade(g)}
                        disabled={grading}
                        accessibilityRole="button"
                        accessibilityLabel={`Grade ${label}, next review in ${previews[g]}`}
                        style={({ pressed }) => [
                          styles.gradeBtn,
                          {
                            backgroundColor: tint,
                            borderColor: color,
                            opacity: grading ? 0.5 : pressed ? 0.8 : 1,
                            transform: [{ scale: pressed ? 0.96 : 1 }],
                          },
                        ]}>
                        <Text style={[styles.gradeLabel, { color }]}>{label}</Text>
                        <View style={styles.intervalPill}>
                          <Text style={[styles.gradeInterval, { color }]}>{previews[g]}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )
              )}
            </>
          )
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  inner: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset,
  },
  loader: { marginTop: Spacing.five },
  // Session bar
  deckTitle: { color: INK, fontSize: 24, fontWeight: '800' },
  progressLabel: { color: MUTED, fontSize: 13, fontWeight: '600', marginTop: 4, marginBottom: Spacing.two },
  track: { height: 8, borderRadius: 999, backgroundColor: BORDER, overflow: 'hidden', marginBottom: Spacing.three },
  fill: { height: '100%', borderRadius: 999, backgroundColor: EMERALD },
  // Flip hint
  hintBadge: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.three,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  hintText: { color: MUTED, fontSize: 13, fontWeight: '600' },
  // Grade action cards
  grades: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  gradeBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: Spacing.two + 4,
    alignItems: 'center',
    gap: 6,
  },
  gradeLabel: { fontSize: 15, fontWeight: '800' },
  intervalPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  gradeInterval: { fontSize: 12, fontWeight: '700' },
  // Session complete
  summary: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  ring: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: EMERALD,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.two,
    shadowColor: EMERALD,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 10,
  },
  summaryTitle: { color: INK, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  summarySub: { color: MUTED, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  summaryCard: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.five,
    alignItems: 'center',
    gap: 2,
    marginTop: Spacing.two,
  },
  summaryCount: { color: EMERALD, fontSize: 34, fontWeight: '800' },
  summaryLabel: { color: MUTED, fontSize: 13, fontWeight: '600' },
  decksButton: {
    backgroundColor: INDIGO,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    marginTop: Spacing.two,
    shadowColor: INDIGO,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  decksButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
