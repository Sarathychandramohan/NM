import React from 'react';
import { ScrollView, View, Text, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppStore, CATEGORIES, Category, getTextScale } from '@store/useAppStore';
import { TopAppBar } from '@/components/ui/TopAppBar';
import { WelcomeBanner } from '@/components/home/WelcomeBanner';
import { LanguageStrip } from '@/components/home/LanguageStrip';
import { EmergencyHelplines } from '@/components/home/EmergencyHelplines';
import { InputZone } from '@/components/home/InputZone';
import { RecentSessionsStrip } from '@/components/home/RecentSessionsStrip';
import { CategoryCard } from '@/components/home/CategoryCard';
import { Colors } from '@constants/colors';
import { UI_TRANSLATIONS } from '@constants/translations';

const isWeb = (Platform.OS as string) === 'web';

export default function HomeScreen() {
  const { isDarkMode, startSession, selectedLanguage, textSize } = useAppStore();
  const router  = useRouter();
  const { width } = useWindowDimensions();
  const C = isDarkMode ? Colors.dark : Colors.light;
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];
  const scale = getTextScale(textSize);

  const isDesktop = isWeb && width >= 1024;
  const isTablet  = isWeb && width >= 768 && width < 1024;

  const handleCategoryPress = async (category: Category) => {
    await startSession(category);
    router.push(`/chat/${category.id}` as any);
  };

  // ── Desktop two-column layout ──────────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={[styles.desktopRoot, { backgroundColor: C.background }]}>
        {/* Left column — input + recent */}
        <ScrollView
          style={styles.desktopLeft}
          contentContainerStyle={styles.desktopLeftContent}
          showsVerticalScrollIndicator={false}
        >
          <WelcomeBanner />
          <InputZone />
          <RecentSessionsStrip />
          <EmergencyHelplines />
        </ScrollView>

        {/* Right column — categories */}
        <ScrollView
          style={[styles.desktopRight, { borderLeftColor: C.surfaceBorder }]}
          contentContainerStyle={styles.desktopRightContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sectionLabel, { color: C.textSecondary }, isDesktop && { fontSize: 13 * scale, marginBottom: 18, letterSpacing: 1.5 }]}>
            {t.legalCategories}
          </Text>
          <View style={styles.desktopCatGrid}>
            {CATEGORIES.map((cat) => (
              <CategoryCard
                key={cat.id}
                category={cat}
                onPress={handleCategoryPress}
                webFullWidth={false}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Tablet single-column, wider cards ─────────────────────────────────────
  if (isTablet) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.background }} edges={['bottom']}>
        <TopAppBar />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingHorizontal: 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <WelcomeBanner />
          <LanguageStrip />
          <InputZone />
          <EmergencyHelplines />
          <Text style={[styles.sectionLabel, { color: C.textSecondary, fontSize: 11 * scale }]}>{t.legalCategories}</Text>
          <View style={[styles.catGrid, { gap: 16 }]}>
            {CATEGORIES.map((cat) => (
              <CategoryCard key={cat.id} category={cat} onPress={handleCategoryPress} webFullWidth />
            ))}
          </View>
          <RecentSessionsStrip />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Mobile layout (unchanged) ──────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.background }} edges={['bottom']}>
      <TopAppBar />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <WelcomeBanner />
        <LanguageStrip />
        <InputZone />
        <EmergencyHelplines />
        <Text style={[styles.sectionLabel, { color: C.textSecondary, fontSize: 11 * scale }]}>{t.legalCategories}</Text>
        <View style={styles.catGrid}>
          {CATEGORIES.map((cat) => (
            <CategoryCard key={cat.id} category={cat} onPress={handleCategoryPress} />
          ))}
        </View>
        <RecentSessionsStrip />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 130,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  // Desktop
  desktopRoot: { flex: 1, flexDirection: 'row' },
  desktopLeft: { flex: 1 },
  desktopLeftContent: { padding: 36, paddingBottom: 60 },
  desktopRight: { width: 440, borderLeftWidth: 1 },
  desktopRightContent: { padding: 32, paddingBottom: 60 },
  desktopCatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
});
