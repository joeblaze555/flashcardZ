/**
 * Onboarding carousel — first-launch gate before the main tabs.
 *
 * Deep-dark theme (#0F172A) with emerald (#10B981) + indigo (#6366F1)
 * accents and glassmorphic overlays. A Reanimated-driven horizontal
 * pager powers parallax slide art, expanding pill pagination, and the
 * Next → Get Started CTA. Completing (or skipping) persists
 * `@flashcardz:has_onboarded = 'true'` and replaces the route.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { playImpact } from '@/lib/haptics';
import { TABS_HOME } from '@/lib/routes';

/** AsyncStorage flag read by the root-layout gate. */
export const HAS_ONBOARDED_KEY = '@flashcardz:has_onboarded';

const BG = '#0F172A';
const INK = '#F8FAFC';
const MUTED = '#94A3B8';
const EMERALD = '#10B981';
const INDIGO = '#6366F1';
const GLASS = 'rgba(255, 255, 255, 0.06)';
const GLASS_BORDER = 'rgba(255, 255, 255, 0.12)';
const TRACK = '#334155';

interface Slide {
  key: string;
  eyebrow: string;
  headline: string;
  body: string;
}

const SLIDES: readonly Slide[] = [
  {
    key: 'srs',
    eyebrow: 'Master Anything Fast',
    headline: 'Spaced Repetition, Perfected',
    body: 'Science-backed SuperMemo-2 (SM-2) scheduling calculates the exact moment you need to review, turning short-term focus into long-term memory.',
  },
  {
    key: 'offline',
    eyebrow: '100% Offline & Private',
    headline: 'Your Data Stays On Your Device',
    body: 'Zero accounts, zero cloud dependencies, and zero mandatory background syncs. Instant performance backed by on-device SQLite storage.',
  },
  {
    key: 'decks',
    eyebrow: 'Seamless Deck Management',
    headline: 'Built for Heavy Study Workloads',
    body: 'Create custom decks, edit cards on the fly, and batch-import hundreds of cards instantly using plain text or CSV formatting.',
  },
];

// ---------------------------------------------------------------------------
// Parallax wrapper — depth layers drift at different rates on swipe.
// ---------------------------------------------------------------------------

interface ParallaxProps {
  scrollX: SharedValue<number>;
  width: number;
  index: number;
  depth?: number;
  style?: object;
  children: React.ReactNode;
}

function Parallax({ scrollX, width, index, depth = 1, style, children }: ParallaxProps) {
  const anim = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          scrollX.value,
          [(index - 1) * width, (index + 1) * width],
          [48 * depth, -48 * depth],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

// ---------------------------------------------------------------------------
// Slide art — pure-View compositions (no image assets needed).
// ---------------------------------------------------------------------------

function SlideOneArt({ scrollX, width }: { scrollX: SharedValue<number>; width: number }) {
  return (
    <View style={styles.artStage}>
      <Parallax scrollX={scrollX} width={width} index={0} depth={0.4} style={styles.artCenter}>
        <View style={[styles.stackCard, styles.stackBack, { transform: [{ rotate: '-10deg' }] }]} />
      </Parallax>
      <Parallax scrollX={scrollX} width={width} index={0} depth={0.7} style={styles.artCenter}>
        <View style={[styles.stackCard, styles.stackMid, { transform: [{ rotate: '7deg' }] }]} />
      </Parallax>
      <Parallax scrollX={scrollX} width={width} index={0} depth={1} style={styles.artCenter}>
        <View style={styles.stackFront}>
          <View style={styles.stackLine} />
          <View style={[styles.stackLine, styles.stackLineShort]} />
          <View style={styles.badgeRow}>
            {['1d', '6d', '12d'].map((b) => (
              <View key={b} style={styles.intervalBadge}>
                <Text style={styles.intervalText}>{b}</Text>
              </View>
            ))}
          </View>
        </View>
      </Parallax>
      <Parallax scrollX={scrollX} width={width} index={0} depth={1.6} style={styles.checkOne}>
        <View style={styles.check}>
          <Text style={styles.checkText}>✓</Text>
        </View>
      </Parallax>
      <Parallax scrollX={scrollX} width={width} index={0} depth={1.3} style={styles.checkTwo}>
        <View style={[styles.check, styles.checkIndigo]}>
          <Text style={styles.checkText}>✓</Text>
        </View>
      </Parallax>
    </View>
  );
}

function SlideTwoArt({ scrollX, width }: { scrollX: SharedValue<number>; width: number }) {
  return (
    <View style={styles.artStage}>
      <Parallax scrollX={scrollX} width={width} index={1} depth={0.4} style={styles.artCenter}>
        <View style={styles.pulseOuter} />
      </Parallax>
      <Parallax scrollX={scrollX} width={width} index={1} depth={0.6} style={styles.artCenter}>
        <View style={styles.pulseInner} />
      </Parallax>
      <Parallax scrollX={scrollX} width={width} index={1} depth={1} style={styles.artCenter}>
        <View style={styles.shield}>
          <Text style={styles.shieldGlyph}>⬢</Text>
          <Text style={styles.shieldCheck}>✓</Text>
        </View>
      </Parallax>
      <Parallax scrollX={scrollX} width={width} index={1} depth={1.4} style={styles.dbPillTop}>
        <View style={styles.dbPill}>
          <Text style={styles.dbPillText}>⚡ SQLite · instant</Text>
        </View>
      </Parallax>
      <Parallax scrollX={scrollX} width={width} index={1} depth={1.2} style={styles.dbPillBottom}>
        <View style={styles.dbPill}>
          <Text style={styles.dbPillText}>No account · Private</Text>
        </View>
      </Parallax>
    </View>
  );
}

function SlideThreeArt({ scrollX, width }: { scrollX: SharedValue<number>; width: number }) {
  return (
    <View style={styles.artStage}>
      <Parallax scrollX={scrollX} width={width} index={2} depth={1} style={styles.artCenter}>
        <View style={styles.previewCard}>
          <View style={styles.previewHalf}>
            <Text style={styles.previewKicker}>FRONT</Text>
            <Text style={styles.previewText}>Bonjour</Text>
          </View>
          <View style={styles.previewDivider} />
          <View style={styles.previewHalf}>
            <Text style={styles.previewKicker}>BACK</Text>
            <Text style={styles.previewText}>Hello</Text>
          </View>
          <View style={styles.flipChip}>
            <Text style={styles.flipChipText}>⇄ flip</Text>
          </View>
        </View>
      </Parallax>
      <Parallax scrollX={scrollX} width={width} index={2} depth={1.5} style={styles.importBadges}>
        {['CSV', 'TSV', '+100'].map((b) => (
          <View key={b} style={styles.importBadge}>
            <Text style={styles.importBadgeText}>{b}</Text>
          </View>
        ))}
      </Parallax>
    </View>
  );
}

function SlideArt({
  index,
  scrollX,
  width,
}: {
  index: number;
  scrollX: SharedValue<number>;
  width: number;
}) {
  if (index === 0) return <SlideOneArt scrollX={scrollX} width={width} />;
  if (index === 1) return <SlideTwoArt scrollX={scrollX} width={width} />;
  return <SlideThreeArt scrollX={scrollX} width={width} />;
}

// ---------------------------------------------------------------------------
// Pagination dot — expands into an emerald pill when active.
// ---------------------------------------------------------------------------

function PageDot({ index, scrollX, width }: { index: number; scrollX: SharedValue<number>; width: number }) {
  const anim = useAnimatedStyle(() => ({
    width: interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [8, 28, 8],
      Extrapolation.CLAMP,
    ),
    backgroundColor: interpolateColor(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [TRACK, EMERALD, TRACK],
    ),
  }));
  return <Animated.View style={[styles.dot, anim]} />;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function OnboardingScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scrollX = useSharedValue(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const [page, setPage] = useState(0);
  const lastPage = useRef(0);
  const isLast = page === SLIDES.length - 1;

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.max(0, Math.min(SLIDES.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)));
      setPage(next);
      if (next !== lastPage.current) {
        lastPage.current = next;
        void playImpact(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [width],
  );

  const complete = useCallback(async () => {
    try {
      await playImpact(Haptics.ImpactFeedbackStyle.Medium);
      await AsyncStorage.setItem(HAS_ONBOARDED_KEY, 'true');
    } finally {
      // TABS_HOME ('/'), NOT '/(tabs)/index' — see src/lib/routes.ts.
      router.replace(TABS_HOME);
    }
  }, [router]);

  const handlePrimary = useCallback(() => {
    if (isLast) {
      void complete();
      return;
    }
    void playImpact(Haptics.ImpactFeedbackStyle.Light);
    listRef.current?.scrollToOffset({ offset: (page + 1) * width, animated: true });
  }, [isLast, complete, page, width]);

  const renderSlide = useCallback(
    ({ item, index }: { item: Slide; index: number }) => (
      <View style={[styles.slide, { width }]}>
        <SlideArt index={index} scrollX={scrollX} width={width} />
        <Animated.View entering={FadeInDown.delay(80).duration(450)}>
          <Text style={styles.eyebrow}>{item.eyebrow}</Text>
          <Text style={styles.headline}>{item.headline}</Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(180).duration(450)}>
          <Text style={styles.body}>{item.body}</Text>
        </Animated.View>
      </View>
    ),
    [width, scrollX],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: BG }]} edges={['top', 'bottom']}>
      <Pressable onPress={() => void complete()} hitSlop={12} style={styles.skip}>
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>

      <Animated.FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={handleMomentumEnd}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <PageDot key={s.key} index={i} scrollX={scrollX} width={width} />
          ))}
        </View>
        <Pressable
          onPress={handlePrimary}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Get started' : 'Next slide'}
          style={({ pressed }) => [
            styles.cta,
            isLast && styles.ctaGlow,
            { opacity: pressed ? 0.85 : 1 },
          ]}>
          <Text style={styles.ctaText}>{isLast ? 'Get Started' : 'Next'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  skip: { position: 'absolute', top: 60, right: 24, zIndex: 10, padding: 8 },
  skipText: { color: MUTED, fontSize: 15, fontWeight: '600' },
  slide: { flex: 1, paddingHorizontal: 32, paddingTop: 72, gap: 12 },
  eyebrow: { color: EMERALD, fontSize: 13, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  headline: { color: INK, fontSize: 32, fontWeight: '800', lineHeight: 38, marginTop: 8 },
  body: { color: MUTED, fontSize: 16, lineHeight: 24, marginTop: 4 },
  // Art stage
  artStage: { height: 300, marginBottom: 16, justifyContent: 'center', alignItems: 'center' },
  artCenter: { position: 'absolute' },
  // Slide 1 — stacked cards
  stackCard: { width: 180, height: 120, borderRadius: 16 },
  stackBack: { backgroundColor: 'rgba(99, 102, 241, 0.25)', borderWidth: 1, borderColor: 'rgba(99, 102, 241, 0.5)' },
  stackMid: { backgroundColor: 'rgba(16, 185, 129, 0.18)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.45)' },
  stackFront: {
    width: 190,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.6)',
    shadowColor: EMERALD,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  stackLine: { height: 10, borderRadius: 5, backgroundColor: 'rgba(248, 250, 252, 0.75)' },
  stackLineShort: { width: '60%', backgroundColor: 'rgba(148, 163, 184, 0.6)' },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  intervalBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: EMERALD,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  intervalText: { color: EMERALD, fontSize: 12, fontWeight: '700' },
  check: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: EMERALD,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: EMERALD,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
  checkIndigo: { backgroundColor: INDIGO, shadowColor: INDIGO },
  checkText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  checkOne: { position: 'absolute', top: 18, right: 28 },
  checkTwo: { position: 'absolute', bottom: 30, left: 30 },
  // Slide 2 — shield + pulse
  pulseOuter: { width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(99, 102, 241, 0.10)' },
  pulseInner: { width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(99, 102, 241, 0.16)' },
  shield: {
    width: 140,
    height: 140,
    borderRadius: 32,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: EMERALD,
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 12,
  },
  shieldGlyph: { color: EMERALD, fontSize: 64 },
  shieldCheck: { position: 'absolute', color: '#fff', fontSize: 26, fontWeight: '800' },
  dbPill: {
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dbPillText: { color: INK, fontSize: 13, fontWeight: '600' },
  dbPillTop: { position: 'absolute', top: 8, alignSelf: 'center' },
  dbPillBottom: { position: 'absolute', bottom: 6, alignSelf: 'center' },
  // Slide 3 — preview card
  previewCard: {
    width: 220,
    borderRadius: 16,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.55)',
    overflow: 'hidden',
    shadowColor: INDIGO,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  previewHalf: { padding: 16, gap: 4 },
  previewKicker: { color: MUTED, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  previewText: { color: INK, fontSize: 22, fontWeight: '700' },
  previewDivider: { height: 1, backgroundColor: GLASS_BORDER },
  flipChip: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: EMERALD,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  flipChipText: { color: EMERALD, fontSize: 11, fontWeight: '700' },
  importBadges: { position: 'absolute', bottom: 0, flexDirection: 'row', gap: 8 },
  importBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
    borderWidth: 1,
    borderColor: INDIGO,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  importBadgeText: { color: '#C7D2FE', fontSize: 12, fontWeight: '700' },
  // Footer
  footer: { paddingHorizontal: 32, paddingBottom: 16, gap: 20 },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dot: { height: 8, borderRadius: 4 },
  cta: { backgroundColor: EMERALD, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  ctaGlow: {
    shadowColor: EMERALD,
    shadowOpacity: 0.55,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
