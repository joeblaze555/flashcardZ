/**
 * Decks tab — "My Decks" dashboard.
 *
 * Fixed deep-slate theme with glassmorphic deck cards, due badges, and
 * per-deck progress. Data layer untouched: decks + due counts come from
 * `getDecksWithCounts`, creation via `createDeck`.
 */

import { Ionicons } from '@expo/vector-icons';
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

import { createDeck, getDecksWithCounts } from '@/db/database';
import type { DeckWithCounts } from '@/db/schema';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

const BG = '#0F172A';
const CARD = '#1E293B';
const BORDER = '#334155';
const INK = '#F8FAFC';
const MUTED = '#94A3B8';
const EMERALD = '#10B981';
const INDIGO = '#6366F1';

function DecksList() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [decks, setDecks] = useState<DeckWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const rows = await getDecksWithCounts(db);
      setDecks(rows);
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

  const openModal = useCallback(() => {
    setTitle('');
    setDescription('');
    setModalVisible(true);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!title.trim() || creating) return;
    setCreating(true);
    try {
      await createDeck(db, { title, description });
      setModalVisible(false);
      setTitle('');
      setDescription('');
      await refresh();
    } catch (e) {
      Alert.alert('Could not create deck', e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }, [db, title, description, creating, refresh]);

  const renderItem = useCallback(
    ({ item }: { item: DeckWithCounts }) => {
      const reviewed = Math.max(0, item.totalCards - item.dueCount);
      const progress = item.totalCards > 0 ? reviewed / item.totalCards : 0;
      return (
        <Pressable
          onPress={() => router.push({ pathname: '/deck/[id]', params: { id: item.id } })}
          accessibilityRole="button"
          accessibilityLabel={`Open deck ${item.title}`}>
          <View style={styles.card}>
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
          </View>
        </Pressable>
      );
    },
    [router],
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
            data={decks}
            keyExtractor={(d) => d.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyRing}>
                  <Ionicons name="layers" size={44} color={EMERALD} />
                </View>
                <Text style={styles.emptyTitle}>No Decks Yet</Text>
                <Text style={styles.emptySub}>
                  Create your first deck or import cards to start memorizing.
                </Text>
                <Pressable
                  onPress={openModal}
                  accessibilityRole="button"
                  accessibilityLabel="Create your first deck"
                  style={({ pressed }) => [styles.emptyCta, { opacity: pressed ? 0.85 : 1 }]}>
                  <Text style={styles.emptyCtaText}>+ Create Deck</Text>
                </Pressable>
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
            <Text style={styles.sheetTitle}>New Deck</Text>
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
                onPress={() => void handleCreate()}
                disabled={!title.trim() || creating}
                style={[
                  styles.sheetBtn,
                  styles.sheetCreate,
                  { opacity: !title.trim() || creating ? 0.4 : 1 },
                ]}>
                <Text style={styles.sheetCreateText}>{creating ? 'Creating…' : 'Create'}</Text>
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
