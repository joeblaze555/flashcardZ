/**
 * Deck detail route (`/deck/[id]`).
 *
 * Header with title/description/counts, action bar (Start Review deep-links
 * to `/(tabs)/study?deckId=…`, Add Card, Bulk Import), and the card list
 * with Edit / Delete actions. All queries use parameter binding.
 */

import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BulkImportModal from '@/components/BulkImportModal';
import CardModal, { type EditingCard } from '@/components/CardModal';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { deleteCard, getCardsByDeck, getDeckWithCounts } from '@/db/database';
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
            <Text style={[styles.heading, { color: theme.text }]}>{deck.title}</Text>
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
              data={cards}
              keyExtractor={(c) => c.id}
              renderItem={renderCard}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: theme.textSecondary }]}>
                  No cards yet — add your first one above.
                </Text>
              }
            />
          </>
        )}
      </View>

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
  heading: { fontSize: 26, fontWeight: '700' },
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
  empty: { textAlign: 'center', marginTop: Spacing.five, fontSize: 14 },
});
