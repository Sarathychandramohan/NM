/**
 * Helplines Screen — full list of national Indian legal & emergency helplines.
 * Accessible via "See All" on the home screen's EmergencyHelplines section.
 *
 * Features:
 *  - Fetches from /api/helplines (national numbers seeded at startup)
 *  - Filters by category (Police, Women, Cyber, Health, Land, RTI, etc.)
 *  - Tap to call on mobile; shows number prominently on web
 *  - Dark/light mode + text size aware
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Platform, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@constants/colors';
import { useAppStore, Helpline, getTextScale } from '@store/useAppStore';
import { TopAppBar } from '@/components/ui/TopAppBar';
import {
  Phone, ShieldAlert, Heart, Scale, Home,
  Briefcase, Users, User, ArrowLeft, ChevronRight,
} from 'lucide-react-native';

const CATEGORY_META: Record<string, { label: string; Icon: any; color: string; bg: string; bgDark: string }> = {
  police:    { label: 'Police & Emergency', Icon: Briefcase,  color: '#1E3A5F', bg: '#EFF6FF', bgDark: '#1E2A3F' },
  cybercrime:{ label: 'Cyber Crime',        Icon: ShieldAlert, color: '#1D4ED8', bg: '#EFF6FF', bgDark: '#1E2040' },
  women_dv:  { label: 'Women & Family',     Icon: Users,       color: '#7C3AED', bg: '#F5F3FF', bgDark: '#2D1B4E' },
  senior:    { label: 'Senior Citizens',    Icon: User,        color: '#D97706', bg: '#FFFBEB', bgDark: '#3D2A00' },
  health:    { label: 'Health',             Icon: Heart,       color: '#065F46', bg: '#ECFDF5', bgDark: '#0D2E20' },
  land:      { label: 'Land & Property',    Icon: Home,        color: '#78350F', bg: '#FFF7ED', bgDark: '#3A1800' },
  rti:       { label: 'RTI & Government',   Icon: Scale,       color: '#EA580C', bg: '#FFF7ED', bgDark: '#3A1500' },
  labor:     { label: 'Labour Rights',      Icon: Briefcase,   color: '#0369A1', bg: '#E0F2FE', bgDark: '#0C2D40' },
  consumer:  { label: 'Consumer Rights',    Icon: Scale,       color: '#16A34A', bg: '#F0FDF4', bgDark: '#0D2E10' },
  general:   { label: 'General & Legal Aid',Icon: Scale,       color: '#4F46E5', bg: '#EEF2FF', bgDark: '#1A1A40' },
};

const CATEGORY_ORDER = ['police', 'women_dv', 'cybercrime', 'health', 'senior', 'land', 'rti', 'labor', 'consumer', 'general'];

export default function HelplinesScreen() {
  const { isDarkMode, helplines, fetchHelplines, textSize } = useAppStore();
  const C = isDarkMode ? Colors.dark : Colors.light;
  const router = useRouter();
  const scale = getTextScale(textSize);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  useEffect(() => {
    if (helplines.length === 0) {
      setLoading(true);
      fetchHelplines().finally(() => setLoading(false));
    }
  }, []);

  // Group by category, respecting the order above
  const grouped: Record<string, Helpline[]> = {};
  helplines.forEach((h) => {
    if (!grouped[h.category]) grouped[h.category] = [];
    grouped[h.category].push(h);
  });

  const categories = CATEGORY_ORDER.filter(
    (c) => grouped[c]?.length > 0
  );

  const filteredCategories = activeFilter ? [activeFilter] : categories;

  const handleCall = (number: string) => {
    if (Platform.OS === 'web') return;
    Linking.openURL(`tel:${number}`);
  };

  const renderHelplineCard = ({ item }: { item: Helpline }) => (
    <TouchableOpacity
      onPress={() => handleCall(item.number)}
      activeOpacity={Platform.OS === 'web' ? 1 : 0.8}
      disabled={Platform.OS === 'web'}
      style={[
        styles.card,
        {
          backgroundColor: C.surface,
          borderColor: C.surfaceBorder,
        },
      ]}
    >
      <View style={[styles.cardIconWrap, { backgroundColor: isDarkMode ? '#1E1E23' : '#F3F4F6' }]}>
        <Phone size={16} color={Colors.orange} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardName, { color: C.text, fontSize: 13 * scale }]} numberOfLines={2}>
          {item.name}
        </Text>
        {item.availableHours && (
          <Text style={[styles.cardHours, { color: C.textSecondary, fontSize: 11 * scale }]}>
            {item.availableHours}
          </Text>
        )}
      </View>
      <View style={styles.numberWrap}>
        <Text style={[styles.number, { fontSize: 14 * scale }]}>{item.number}</Text>
        {Platform.OS !== 'web' && (
          <ChevronRight size={14} color={Colors.orange} strokeWidth={2} />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]} edges={['bottom']}>
      <TopAppBar title="Emergency Helplines" showBack />

      {/* Category Filter Chips */}
      <FlatList
        horizontal
        data={categories}
        keyExtractor={(c) => c}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterStrip}
        renderItem={({ item: cat }) => {
          const meta = CATEGORY_META[cat];
          const isActive = activeFilter === cat;
          return (
            <TouchableOpacity
              onPress={() => setActiveFilter(isActive ? null : cat)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isActive
                    ? Colors.orange
                    : (isDarkMode ? '#1E1E23' : '#F3F4F6'),
                  borderColor: isActive ? Colors.orange : C.surfaceBorder,
                },
              ]}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterChipText, { color: isActive ? '#FFF' : C.textSecondary, fontSize: 12 * scale }]}>
                {meta?.label ?? cat}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.orange} />
          <Text style={[styles.loadingText, { color: C.textSecondary, fontSize: 14 * scale }]}>
            Loading helplines…
          </Text>
        </View>
      ) : helplines.length === 0 ? (
        // Fallback — show hardcoded critical numbers if API returns empty
        <View style={styles.loadingWrap}>
          <Phone size={32} color={C.textSecondary} strokeWidth={1.5} />
          <Text style={[styles.loadingText, { color: C.textSecondary, fontSize: 14 * scale }]}>
            Emergency Numbers:{'\n'}
            Police: 100  •  Women: 1091{'\n'}
            Ambulance: 108  •  Fire: 101{'\n'}
            Cyber: 1930  •  National: 112
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredCategories}
          keyExtractor={(cat) => cat}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: cat }) => {
            const meta = CATEGORY_META[cat];
            const MetaIcon = meta?.Icon ?? Phone;
            const items = (grouped[cat] ?? []).sort((a, b) => a.priority - b.priority);
            return (
              <View style={styles.section}>
                {/* Section header */}
                <View style={[
                  styles.sectionHeader,
                  { backgroundColor: isDarkMode ? (meta?.bgDark ?? '#1E1E23') : (meta?.bg ?? '#F3F4F6') },
                ]}>
                  <MetaIcon size={14} color={meta?.color ?? Colors.orange} strokeWidth={2} />
                  <Text style={[styles.sectionTitle, { color: meta?.color ?? Colors.orange, fontSize: 12 * scale }]}>
                    {meta?.label ?? cat.toUpperCase()}
                  </Text>
                </View>

                {/* Helpline cards */}
                {items.map((h) => renderHelplineCard({ item: h }))}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  filterStrip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 6,
  },
  filterChipText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    gap: 16,
  },

  section: { gap: 8 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    lineHeight: 18,
  },
  cardHours: {
    fontFamily: 'PlusJakartaSans_400Regular',
    marginTop: 2,
  },
  numberWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  number: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: Colors.orange,
  },

  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  loadingText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
});
