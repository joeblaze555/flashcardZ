/**
 * Deck detail route (`/deck/[id]`).
 *
 * Header with title/description/counts + deck Edit / Duplicate / Delete,
 * action bar (Start Review deep-links to `/(tabs)/study?deckId=…`, Add
 * Card, Bulk Import), searchable card list with Edit / Delete actions.
 * All queries use parameter binding.
 */

import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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

import BulkImportModal from '@/components/BulkImportModal';
import CardModal, { type EditingCard } from '@/components/CardModal';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  deleteCard,
  deleteDeck,
  duplicateDeck,
  getCardsByDeck,
  getDeckWithCounts,
  updateDeck,
} from '@/db/database';
import type { DeckWithCounts, DueCard } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';

export default function DeckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Array.isArray(id) ? id[0] : id;
  const db = useSQLiteContext();
  const router = useRouter();
  const theme = useTheme();

  const [deck, setDeck] = useState<DeckWithCounts | null>(null);
  const [cards, setCards] = useState<DueCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [bulkVisible, setBulkVisible] = useState(false);
  // Bump on each open so the modals remount with fresh form state.
  const [cardModalSession, setCardModalSession] = useState(0);
  const [bulkSession, setBulkSession] = useState(0);
  const [editing, setEditing] = useState<EditingCard | null>(null);
  const [cardQuery, setCardQuery] = useState('');
  const [deckModalVisible, setDeckModalVisible] = useState(false);
  const [deckTitle, setDeckTitle] = useState('');
  const [deckDescription, setDeckDescription] = useState('');
  const [savingDeck, setSavingDeck] = useState(false);

  const load = useCallback(async () => {
    if (!deckId) return;
    try {
      const [deckRow, cardRows] = await Promise.all([
        getDeckWithCounts(db, deckId),
        getCardsByDeck(db, deckId),
      ]);
      setDeck(deckRow);
      setCards(cardRows);
    } catch (e) {
      Alert.alert('Database error', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [db, deckId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const openCreate = useCallback(() => {
    setEditing(null);
    setCardModalSession((s) => s + 1);
    setCardModalVisible(true);
  }, []);

  const openEdit = useCallback((card: DueCard) => {
    setEditing({ id: card.id, front: card.front, back: card.back });
    setCardModalSession((s) => s + 1);
    setCardModalVisible(true);
  }, []);

  const openBulk = useCallback(() => {
    setBulkSession((s) => s + 1);
    setBulkVisible(true);
  }, []);

  const confirmDelete = useCallback(
    (card: DueCard) => {
      Alert.alert('Delete card?', 'This also removes its review history. This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteCard(db, card.id);
                await load();
              } catch (e) {
                Alert.alert('Could not delete card', e instanceof Error ? e.message : String(e));
              }
            })();
          },
        },
      ]);
    },
    [db, load],
  );

  const startReview = useCallback(() => {
    router.push({ pathname: '/(tabs)/study', params: { deckId } });
  }, [router, deckId]);

  const openDeckEdit = useCallback(() => {
    if (!deck) return;
    setDeckTitle(deck.title);
    setDeckDescription(deck.description);
    setDeckModalVisible(true);
  }, [deck]);

  const handleDeckSave = useCallback(async () => {
    if (!deckId || !deckTitle.trim() || savingDeck) return;
    setSavingDeck(true);
    try {
      await updateDeck(db, deckId, { title: deckTitle, description: deckDescription });
      setDeckModalVisible(false);
      await load();
    } catch (e) {
      Alert.alert('Could not update deck', e instanceof Error ? e.message : String(e));
    } finally {
      setSavingDeck(false);
    }
  }, [db, deckId, deckTitle, deckDescription, savingDeck, load]);

  const confirmDeckDelete = useCallback(() => {
    if (!deck) return;
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
                // Clear local state first: if there is no history to go
                // back to (deep link), the screen falls through to the
                // "no longer exists" empty state instead of stale data.
                setDeck(null);
                setCards([]);
                if (router.canGoBack()) router.back();
                else router.replace('/(tabs)');
              } catch (e) {
                Alert.alert('Could not delete deck', e instanceof Error ? e.message : String(e));
              }
            })();
          },
        },
      ],
    );
  }, [db, deck, router]);

  const handleDeckDuplicate = useCallback(() => {
    if (!deck) return;
    void (async () => {
      try {
        const copy = await duplicateDeck(db, deck.id);
        router.push({ pathname: '/deck/[id]', params: { id: copy.id } });
      } catch (e) {
        Alert.alert('Could not duplicate deck', e instanceof Error ? e.message : String(e));
      }
    })();
  }, [db, deck, router]);

  const visibleCards = useMemo(() => {
    const q = cardQuery.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q),
    );
  }, [cards, cardQuery]);

  const renderCard = useCallback(
    ({ item }: { item: DueCard }) => (
      <View style={[styles.cardRow, { backgroundColor: theme.backgroundElement }]}>
        <View style={styles.cardText}>
          <Text style={[styles.front, { color: theme.text }]} numberOfLines={2}>
            {item.front}
          </Text>
          <Text style={[styles.back, { color: theme.textSecondary }]} numberOfLines={2}>
            {item.back}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <Pressable onPress={() => openEdit(item)} hitSlop={8}>
            <Text style={[styles.edit, { color: theme.text }]}>Edit</Text>
          </Pressable>
          <Pressable onPress={() => confirmDelete(item)} hitSlop={8}>
            <Text style={styles.delete}>Delete</Text>
          </Pressable>
        </View>
      </View>
    ),
    [theme, openEdit, confirmDelete],
  );

  if (!deckId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.inner}>
          <Text style={[styles.heading, { color: theme.text }]}>Missing deck id</Text>
        </View>
      </SafeAreaView>
    );
  }

  const dueCount = deck?.dueCount ?? 0;
  const totalCards = deck?.totalCards ?? 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: deck?.title ?? 'Deck',
          headerBackTitle: 'Decks',
        }}
      />
      <View style={styles.inner}>
        {loading ? (
          <ActivityIndicator style={styles.loader} />
        ) : deck == null ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            This deck no longer exists.
          </Text>
        ) : (
          <>
            <View style={styles.titleRow}>
              <Text style={[styles.heading, { color: theme.text }]}>{deck.title}</Text>
              <View style={styles.deckActions}>
                <Pressable
                  onPress={openDeckEdit}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit deck ${deck.title}`}>
                  <Ionicons name="pencil" size={18} color={theme.textSecondary} />
                </Pressable>
                <Pressable
                  onPress={handleDeckDuplicate}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Duplicate deck ${deck.title}`}>
                  <Ionicons name="copy-outline" size={18} color={theme.textSecondary} />
                </Pressable>
                <Pressable
                  onPress={confirmDeckDelete}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete deck ${deck.title}`}>
                  <Ionicons name="trash-outline" size={18} color="#ff453a" />
                </Pressable>
              </View>
            </View>
            {!!deck.description && (
              <Text style={[styles.desc, { color: theme.textSecondary }]}>{deck.description}</Text>
            )}
            <Text style={[styles.counts, { color: theme.textSecondary }]}>
              {totalCards} {totalCards === 1 ? 'card' : 'cards'} · {dueCount} due
            </Text>

            <View style={styles.actionBar}>
              <Pressable
                onPress={startReview}
                disabled={dueCount === 0}
                style={({ pressed }) => [
                  styles.primary,
                  {
                    backgroundColor: theme.text,
                    opacity: dueCount === 0 ? 0.35 : pressed ? 0.8 : 1,
                  },
                ]}>
                <Text style={[styles.primaryText, { color: theme.background }]}>
                  Start Review{dueCount > 0 ? ` (${dueCount})` : ''}
                </Text>
              </Pressable>
              <View style={styles.secondaryRow}>
                <Pressable
                  onPress={openCreate}
                  style={[styles.secondary, { backgroundColor: theme.backgroundElement }]}>
                  <Text style={[styles.secondaryText, { color: theme.text }]}>Add Card</Text>
                </Pressable>
                <Pressable
                  onPress={openBulk}
                  style={[styles.secondary, { backgroundColor: theme.backgroundElement }]}>
                  <Text style={[styles.secondaryText, { color: theme.text }]}>Import</Text>
                </Pressable>
              </View>
            </View>

            <FlatList
              data={visibleCards}
              keyExtractor={(c) => c.id}
              renderItem={renderCard}
              contentContainerStyle={styles.list}
              ListHeaderComponent={
                cards.length > 0 ? (
                  <View style={[styles.searchRow, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons name="search" size={17} color={theme.textSecondary} />
                    <TextInput
                      value={cardQuery}
                      onChangeText={setCardQuery}
                      placeholder="Search cards…"
                      placeholderTextColor={theme.textSecondary}
                      returnKeyType="search"
                      clearButtonMode="while-editing"
                      accessibilityLabel="Search cards"
                      style={[styles.searchInput, { color: theme.text }]}
                    />
                    {cardQuery.length > 0 && (
                      <Pressable
                        onPress={() => setCardQuery('')}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Clear card search">
                        <Ionicons name="close-circle" size={17} color={theme.textSecondary} />
                      </Pressable>
                    )}
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <Text style={[styles.empty, { color: theme.textSecondary }]}>
                  {cards.length === 0
                    ? 'No cards yet — add your first one above.'
                    : `No cards match "${cardQuery.trim()}".`}
                </Text>
              }
            />
          </>
        )}
      </View>

      <Modal
        visible={deckModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        transparent
        onRequestClose={() => setDeckModalVisible(false)}>
        <View style={styles.sheetScrim}>
          <View style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Edit Deck</Text>
            <Text style={[styles.sheetLabel, { color: theme.textSecondary }]}>TITLE</Text>
            <TextInput
              value={deckTitle}
              onChangeText={setDeckTitle}
              placeholder="Deck title"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.sheetInput,
                { backgroundColor: theme.background, color: theme.text },
              ]}
            />
            <Text style={[styles.sheetLabel, { color: theme.textSecondary }]}>
              DESCRIPTION (OPTIONAL)
            </Text>
            <TextInput
              value={deckDescription}
              onChangeText={setDeckDescription}
              placeholder="What is this deck about?"
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[
                styles.sheetInput,
                styles.sheetMultiline,
                { backgroundColor: theme.background, color: theme.text },
              ]}
            />
            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => setDeckModalVisible(false)}
                style={[styles.sheetBtn, { backgroundColor: theme.background }]}>
                <Text style={[styles.sheetCancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleDeckSave()}
                disabled={!deckTitle.trim() || savingDeck}
                style={[
                  styles.sheetSave,
                  { opacity: !deckTitle.trim() || savingDeck ? 0.4 : 1 },
                ]}>
                <Text style={styles.sheetSaveText}>{savingDeck ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <CardModal
        key={`card-${cardModalSession}`}
        visible={cardModalVisible}
        deckId={deckId}
        editing={editing}
        onClose={() => setCardModalVisible(false)}
        onSaved={() => void load()}
      />
      <BulkImportModal
        key={`bulk-${bulkSession}`}
        visible={bulkVisible}
        deckId={deckId}
        onClose={() => setBulkVisible(false)}
        onImported={() => void load()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  inner: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset,
  },
  loader: { marginTop: Spacing.five },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  heading: { flex: 1, fontSize: 26, fontWeight: '700' },
  deckActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  desc: { fontSize: 14, marginTop: 4 },
  counts: { fontSize: 13, marginTop: 6, marginBottom: Spacing.three },
  actionBar: { gap: Spacing.two, marginBottom: Spacing.three },
  primary: { borderRadius: 12, paddingVertical: Spacing.three, alignItems: 'center' },
  primaryText: { fontSize: 16, fontWeight: '700' },
  secondaryRow: { flexDirection: 'row', gap: Spacing.two },
  secondary: { flex: 1, borderRadius: 12, paddingVertical: Spacing.two + 4, alignItems: 'center' },
  secondaryText: { fontSize: 15, fontWeight: '600' },
  list: { gap: Spacing.two, paddingBottom: Spacing.five },
  cardRow: {
    borderRadius: 12,
    padding: Spacing.three,
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  cardText: { flex: 1, gap: 4 },
  front: { fontSize: 16, fontWeight: '600' },
  back: { fontSize: 14 },
  cardActions: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  edit: { fontSize: 14, fontWeight: '600' },
  delete: { fontSize: 14, fontWeight: '600', color: '#ff453a' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    marginBottom: Spacing.one,
  },
  searchInput: { flex: 1, fontSize: 15 },
  sheetScrim: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.four, gap: Spacing.two },
  sheetTitle: { fontSize: 20, fontWeight: '800' },
  sheetLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: Spacing.two },
  sheetInput: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 4, fontSize: 16 },
  sheetMultiline: { minHeight: 84, textAlignVertical: 'top' },
  sheetActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  sheetBtn: { flex: 1, borderRadius: 12, paddingVertical: Spacing.three, alignItems: 'center' },
  sheetCancelText: { fontSize: 16, fontWeight: '700' },
  sheetSave: { flex: 1, borderRadius: 12, paddingVertical: Spacing.three, alignItems: 'center', backgroundColor: '#6366F1' },
  sheetSaveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  empty: { textAlign: 'center', marginTop: Spacing.five, fontSize: 14 },
});
