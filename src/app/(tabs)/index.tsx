/**
 * Decks tab — "My Decks" dashboard.
 *
 * Fixed deep-slate theme with glassmorphic deck cards, due badges, and
 * per-deck progress. Supports search + sort, deck edit / duplicate /
 * delete, creation, and a daily-goal reminder banner.
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  createDeck,
  deleteDeck,
  duplicateDeck,
  getDecksWithCounts,
  getReviewsTodayCount,
  updateDeck,
} from '@/db/database';
import type { DeckWithCounts } from '@/db/schema';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  DAILY_GOAL_KEY,
  DEFAULT_DAILY_GOAL,
  DEFAULT_REMINDER_HOUR,
  REMINDER_ENABLED_KEY,
  REMINDER_HOUR_KEY,
  clampGoal,
} from '@/lib/daily-goal';

const BG = '#0F172A';
const CARD = '#1E293B';
const BORDER = '#334155';
const INK = '#F8FAFC';
const MUTED = '#94A3B8';
const EMERALD = '#10B981';
const INDIGO = '#6366F1';

type DeckSort = 'newest' | 'name' | 'due' | 'cards';

const SORT_OPTIONS: readonly { key: DeckSort; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'name', label: 'Name' },
  { key: 'due', label: 'Most due' },
  { key: 'cards', label: 'Most cards' },
];

function DecksList() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [decks, setDecks] = useState<DeckWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingDeck, setEditingDeck] = useState<DeckWithCounts | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<DeckSort>('newest');
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL);
  const [reviewsToday, setReviewsToday] = useState(0);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderHour, setReminderHour] = useState(DEFAULT_REMINDER_HOUR);

  const refresh = useCallback(async () => {
    try {
      const [rows, todayCount, goalRaw, reminderRaw, hourRaw] = await Promise.all([
        getDecksWithCounts(db),
        getReviewsTodayCount(db).catch(() => 0),
        AsyncStorage.getItem(DAILY_GOAL_KEY),
        AsyncStorage.getItem(REMINDER_ENABLED_KEY),
        AsyncStorage.getItem(REMINDER_HOUR_KEY),
      ]);
      setDecks(rows);
      setReviewsToday(todayCount);
      setDailyGoal(clampGoal(goalRaw == null ? NaN : Number.parseInt(goalRaw, 10)));
      setReminderOn(reminderRaw === '1');
      const parsedHour = hourRaw == null ? NaN : Number.parseInt(hourRaw, 10);
      setReminderHour(Number.isFinite(parsedHour) ? Math.min(23, Math.max(0, parsedHour)) : DEFAULT_REMINDER_HOUR);
    } catch (e) {
      Alert.alert('Database error', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void refresh();
    }, [refresh]),
  );

  const totals = useMemo(
    () => ({
      decks: decks.length,
      due: decks.reduce((sum, d) => sum + d.dueCount, 0),
    }),
    [decks],
  );

  const visibleDecks = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? decks.filter(
          (d) =>
            d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
        )
      : [...decks];
    switch (sort) {
      case 'name':
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'due':
        filtered.sort((a, b) => b.dueCount - a.dueCount);
        break;
      case 'cards':
        filtered.sort((a, b) => b.totalCards - a.totalCards);
        break;
      case 'newest':
      default:
        filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
    }
    return filtered;
  }, [decks, query, sort]);

  const openModal = useCallback(() => {
    setEditingDeck(null);
    setTitle('');
    setDescription('');
    setModalVisible(true);
  }, []);

  const openEditModal = useCallback((deck: DeckWithCounts) => {
    setEditingDeck(deck);
    setTitle(deck.title);
    setDescription(deck.description);
    setModalVisible(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!title.trim() || creating) return;
    setCreating(true);
    try {
      if (editingDeck) {
        await updateDeck(db, editingDeck.id, { title, description });
      } else {
        await createDeck(db, { title, description });
      }
      setModalVisible(false);
      setTitle('');
      setDescription('');
      setEditingDeck(null);
      await refresh();
    } catch (e) {
      Alert.alert(
        editingDeck ? 'Could not update deck' : 'Could not create deck',
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setCreating(false);
    }
  }, [db, title, description, creating, refresh, editingDeck]);

  const handleDelete = useCallback(
    (deck: DeckWithCounts) => {
      Alert.alert(
        'Delete deck?',
        `"${deck.title}" and its ${deck.totalCards} card${deck.totalCards === 1 ? '' : 's'} will be permanently deleted.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await deleteDeck(db, deck.id);
                  await refresh();
                } catch (e) {
                  Alert.alert('Could not delete deck', e instanceof Error ? e.message : String(e));
                }
              })();
            },
          },
        ],
      );
    },
    [db, refresh],
  );

  const handleDuplicate = useCallback(
    (deck: DeckWithCounts) => {
      void (async () => {
        try {
          await duplicateDeck(db, deck.id);
          await refresh();
        } catch (e) {
          Alert.alert('Could not duplicate deck', e instanceof Error ? e.message : String(e));
        }
      })();
    },
    [db, refresh],
  );

  const goalRemaining = Math.max(0, dailyGoal - reviewsToday);
  const showReminderBanner =
    reminderOn &&
    goalRemaining > 0 &&
    totals.due > 0 &&
    new Date().getHours() >= reminderHour;

  const renderItem = useCallback(
    ({ item }: { item: DeckWithCounts }) => {
      const reviewed = Math.max(0, item.totalCards - item.dueCount);
      const progress = item.totalCards > 0 ? reviewed / item.totalCards : 0;
      const openDeck = () => router.push({ pathname: '/deck/[id]', params: { id: item.id } });
      return (
        // NOTE: the action buttons must NOT be nested inside the navigation
        // Pressable — nested Pressables fire both handlers, so Edit /
        // Duplicate / Delete would also navigate to the deck detail.
        <View style={styles.card}>
          <Pressable
            onPress={openDeck}
            accessibilityRole="button"
            accessibilityLabel={`Open deck ${item.title}`}>
            <View style={styles.topRow}>
              <View style={styles.iconBox}>
                <Ionicons name="layers" size={22} color={INDIGO} />
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>
              {item.dueCount > 0 ? (
                <View style={styles.dueBadge}>
                  <Text style={styles.dueText}>{item.dueCount} Due</Text>
                </View>
              ) : (
                <View style={styles.doneBadge}>
                  <Text style={styles.doneText}>Completed</Text>
                </View>
              )}
            </View>

            {!!item.description && (
              <Text style={styles.cardDesc} numberOfLines={2}>
                {item.description}
              </Text>
            )}

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <View style={styles.bottomRow}>
              <Text style={styles.totalText}>
                Total: {item.totalCards} {item.totalCards === 1 ? 'card' : 'cards'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={MUTED} />
            </View>
          </Pressable>
          <View style={styles.cardDivider} />
          <View style={styles.deckActions}>
            <Pressable
              onPress={() => openEditModal(item)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Edit deck ${item.title}`}
              style={({ pressed }) => [styles.deckActionBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <Ionicons name="pencil" size={15} color={MUTED} />
              <Text style={styles.deckActionText}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={() => handleDuplicate(item)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Duplicate deck ${item.title}`}
              style={({ pressed }) => [styles.deckActionBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <Ionicons name="copy-outline" size={15} color={MUTED} />
              <Text style={styles.deckActionText}>Copy</Text>
            </Pressable>
            <Pressable
              onPress={() => handleDelete(item)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Delete deck ${item.title}`}
              style={({ pressed }) => [styles.deckActionBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <Ionicons name="trash-outline" size={15} color="#F87171" />
              <Text style={[styles.deckActionText, styles.deckActionDanger]}>Delete</Text>
            </Pressable>
          </View>
        </View>
      );
    },
    [router, openEditModal, handleDuplicate, handleDelete],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.heading}>My Decks</Text>
            <Text style={styles.sub}>
              {totals.decks} {totals.decks === 1 ? 'Deck' : 'Decks'} • {totals.due} Cards Due
            </Text>
          </View>
          <Pressable
            onPress={openModal}
            accessibilityRole="button"
            accessibilityLabel="Create new deck"
            style={({ pressed }) => [styles.addButton, { opacity: pressed ? 0.8 : 1 }]}>
            <Ionicons name="add" size={26} color="#fff" />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={EMERALD} />
        ) : (
          <FlatList
            data={visibleDecks}
            keyExtractor={(d) => d.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <>
                {showReminderBanner && (
                  <View style={styles.banner}>
                    <Ionicons name="notifications-outline" size={20} color={EMERALD} />
                    <View style={styles.bannerText}>
                      <Text style={styles.bannerTitle}>Daily goal in reach</Text>
                      <Text style={styles.bannerSub}>
                        {goalRemaining} review{goalRemaining === 1 ? '' : 's'} left to hit {dailyGoal}/day
                        ({reviewsToday} done).
                      </Text>
                    </View>
                  </View>
                )}
                {decks.length > 0 && (
                  <>
                    <View style={styles.searchRow}>
                      <Ionicons name="search" size={18} color={MUTED} />
                      <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search decks…"
                        placeholderTextColor={MUTED}
                        returnKeyType="search"
                        clearButtonMode="while-editing"
                        accessibilityLabel="Search decks"
                        style={styles.searchInput}
                      />
                      {query.length > 0 && (
                        <Pressable
                          onPress={() => setQuery('')}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Clear search">
                          <Ionicons name="close-circle" size={18} color={MUTED} />
                        </Pressable>
                      )}
                    </View>
                    <View style={styles.sortRow}>
                      {SORT_OPTIONS.map((opt) => {
                        const active = sort === opt.key;
                        return (
                          <Pressable
                            key={opt.key}
                            onPress={() => setSort(opt.key)}
                            accessibilityRole="button"
                            accessibilityLabel={`Sort decks by ${opt.label}`}
                            style={({ pressed }) => [
                              styles.sortChip,
                              active && styles.sortChipActive,
                              { opacity: pressed ? 0.8 : 1 },
                            ]}>
                            <Text style={[styles.sortText, active && styles.sortTextActive]}>
                              {opt.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}
              </>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyRing}>
                  <Ionicons name="layers" size={44} color={EMERALD} />
                </View>
                <Text style={styles.emptyTitle}>
                  {decks.length === 0 ? 'No Decks Yet' : 'No matches'}
                </Text>
                <Text style={styles.emptySub}>
                  {decks.length === 0
                    ? 'Create your first deck or import cards to start memorizing.'
                    : `Nothing matches "${query.trim()}". Try a different search.`}
                </Text>
                {decks.length === 0 && (
                  <Pressable
                    onPress={openModal}
                    accessibilityRole="button"
                    accessibilityLabel="Create your first deck"
                    style={({ pressed }) => [styles.emptyCta, { opacity: pressed ? 0.85 : 1 }]}>
                    <Text style={styles.emptyCtaText}>+ Create Deck</Text>
                  </Pressable>
                )}
              </View>
            }
          />
        )}
      </View>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        transparent
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles.sheetScrim}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{editingDeck ? 'Edit Deck' : 'New Deck'}</Text>
            <Text style={styles.sheetLabel}>TITLE</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Spanish Vocabulary"
              placeholderTextColor={MUTED}
              returnKeyType="next"
              style={styles.sheetInput}
            />
            <Text style={styles.sheetLabel}>DESCRIPTION (OPTIONAL)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What is this deck about?"
              placeholderTextColor={MUTED}
              multiline
              style={[styles.sheetInput, styles.sheetMultiline]}
            />
            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={[styles.sheetBtn, styles.sheetCancel]}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSave()}
                disabled={!title.trim() || creating}
                style={[
                  styles.sheetBtn,
                  styles.sheetCreate,
                  { opacity: !title.trim() || creating ? 0.4 : 1 },
                ]}>
                <Text style={styles.sheetCreateText}>
                  {creating ? 'Saving…' : editingDeck ? 'Save' : 'Create'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default function DecksScreen() {
  return <DecksList />;
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
  // Header dashboard bar
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.three },
  headerText: { flex: 1, gap: 2 },
  heading: { color: INK, fontSize: 30, fontWeight: '800' },
  sub: { color: MUTED, fontSize: 14, fontWeight: '600' },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: INDIGO,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: INDIGO,
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  loader: { marginTop: Spacing.five },
  list: { gap: Spacing.three, paddingBottom: Spacing.five, flexGrow: 1 },
  // Deck cards
  card: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three + 2,
    gap: Spacing.two,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: { flex: 1, color: INK, fontSize: 17, fontWeight: '700' },
  dueBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: EMERALD,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    shadowColor: EMERALD,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  dueText: { color: EMERALD, fontSize: 12, fontWeight: '800' },
  doneBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  doneText: { color: MUTED, fontSize: 12, fontWeight: '700' },
  cardDesc: { color: MUTED, fontSize: 14, lineHeight: 20 },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: BORDER, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: EMERALD },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalText: { color: MUTED, fontSize: 13, fontWeight: '600' },
  deckActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardDivider: { height: 1, backgroundColor: BORDER, opacity: 0.6 },
  deckActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.two,
    borderRadius: 10,
  },
  deckActionText: { color: MUTED, fontSize: 13, fontWeight: '700' },
  deckActionDanger: { color: '#F87171' },
  // Reminder banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: EMERALD,
    borderRadius: 14,
    padding: Spacing.three,
    marginBottom: Spacing.one,
  },
  bannerText: { flex: 1, gap: 2 },
  bannerTitle: { color: EMERALD, fontSize: 14, fontWeight: '800' },
  bannerSub: { color: INK, fontSize: 13 },
  // Search + sort
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    marginBottom: Spacing.two,
  },
  searchInput: { flex: 1, color: INK, fontSize: 15 },
  sortRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.one, flexWrap: 'wrap' },
  sortChip: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  sortChipActive: { borderColor: EMERALD, backgroundColor: 'rgba(16, 185, 129, 0.12)' },
  sortText: { color: MUTED, fontSize: 13, fontWeight: '700' },
  sortTextActive: { color: EMERALD },
  // Empty state
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingVertical: Spacing.six },
  emptyRing: {
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
  emptyTitle: { color: INK, fontSize: 22, fontWeight: '800' },
  emptySub: { color: MUTED, fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: Spacing.four },
  emptyCta: {
    marginTop: Spacing.two,
    backgroundColor: INDIGO,
    borderRadius: 12,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    shadowColor: INDIGO,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  emptyCtaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  // Create modal
  sheetScrim: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: BORDER, padding: Spacing.four, gap: Spacing.two },
  sheetTitle: { color: INK, fontSize: 20, fontWeight: '800' },
  sheetLabel: { color: MUTED, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: Spacing.two },
  sheetInput: {
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    color: INK,
    fontSize: 16,
  },
  sheetMultiline: { minHeight: 84, textAlignVertical: 'top' },
  sheetActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  sheetBtn: { flex: 1, borderRadius: 12, paddingVertical: Spacing.three, alignItems: 'center' },
  sheetCancel: { backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  sheetCancelText: { color: MUTED, fontSize: 16, fontWeight: '700' },
  sheetCreate: { backgroundColor: INDIGO },
  sheetCreateText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
