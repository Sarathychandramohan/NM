import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@constants/colors';
import { useAppStore, Session, CATEGORIES, getTextScale } from '@store/useAppStore';
import { TopAppBar } from '@/components/ui/TopAppBar';
import { UI_TRANSLATIONS } from '@constants/translations';
import {
  Clock, Home, Briefcase, ShieldAlert,
  User, Heart, Scale, MessageSquare, ChevronRight,
} from 'lucide-react-native';

const CATEGORY_ICONS: Record<string, { Icon: any; color: string }> = {
  land:   { Icon: Home,        color: '#78350F' },
  police: { Icon: Briefcase,   color: '#1E3A5F' },
  cyber:  { Icon: ShieldAlert, color: '#1D4ED8' },
  health: { Icon: Heart,       color: '#134E4A' },
  family: { Icon: User,        color: '#5C1A3A' },
  rti:    { Icon: Scale,       color: '#EA580C' },
  general:{ Icon: MessageSquare, color: '#0369A1' },
};

function fmtTime(d: Date): string {
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function HistoryScreen() {
  const { isDarkMode, sessions, loadSession, selectedLanguage, textSize, isAnonymousGuest, setOverlay } = useAppStore();
  const C      = isDarkMode ? Colors.dark : Colors.light;
  const router = useRouter();
  const scale = getTextScale(textSize);
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];

  // BUG-F036 FIX: Use ms-based diff so month-boundary dates work correctly
  // BUG-F044 FIX: Use selectedLanguage.code instead of hardcoded 'en-IN'
  const fmtDateLocal = (d: Date): string => {
    const now  = new Date();
    const date = new Date(d);
    // Strip time components to compare whole days
    const nowDay  = new Date(now.getFullYear(),  now.getMonth(),  now.getDate());
    const tgtDay  = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((nowDay.getTime() - tgtDay.getTime()) / 86400000);
    if (diffDays === 0) return t.today;
    if (diffDays === 1) return t.yesterday;
    return date.toLocaleDateString(selectedLanguage.code, { day: 'numeric', month: 'short' });
  };

  const grouped = sessions.reduce<Record<string, Session[]>>((acc, s) => {
    const k = fmtDateLocal(s.startedAt);
    if (!acc[k]) acc[k] = [];
    acc[k].push(s);
    return acc;
  }, {});
  const groupedList = Object.entries(grouped);

  const getCatInfo = (id: string) =>
    CATEGORIES.find((c) => c.id === id) ?? { emoji: '💬', label: 'General', colorKey: 'rti' as const };

  const handlePress = async (session: Session) => {
    await loadSession(session.id);
    router.push(`/chat/${session.categoryId}` as any);
  };

  // Guest state: no sessions saved
  if (isAnonymousGuest) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.background }]} edges={['bottom']}>
        <TopAppBar title={t.chatHistory} showBack={false} />
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: isDarkMode ? '#1E1E23' : '#FFF3E0' }]}>
            <Clock size={40} color={Colors.orange} strokeWidth={1.5} />
          </View>
          <Text style={[styles.emptyTitle, { color: C.text, fontSize: 18 * scale }]}>{t.noHistory}</Text>
          <Text style={[styles.emptyHint, { color: C.textSecondary, fontSize: 13 * scale }]}>
            {t.loginToSave}
          </Text>
          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: Colors.orange }]}
            onPress={() => setOverlay('login_prompt')}
          >
            <Text style={[styles.startBtnText, { fontSize: 14 * scale }]}>{t.registerToUnlock}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]} edges={['bottom']}>
      <TopAppBar title={t.chatHistory} showBack={false} />

      {/* Page header row */}
      <View style={styles.titleRow}>
        <Text style={[styles.pageTitle, { color: C.text, fontSize: 18 * scale }]} adjustsFontSizeToFit={true} minimumFontScale={0.8} numberOfLines={1}>{t.consultations}</Text>
        <Text style={[styles.count, { color: C.textSecondary, fontSize: 12 * scale }]}>{sessions.length} {t.sessionsCount}</Text>
      </View>

      {sessions.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: isDarkMode ? '#1E1E23' : '#F3F4F6' }]}>
            <Clock size={40} color={C.textSecondary} strokeWidth={1.5} />
          </View>
          <Text style={[styles.emptyTitle, { color: C.text, fontSize: 18 * scale }]}>{t.noHistory}</Text>
          <Text style={[styles.emptyHint, { color: C.textSecondary, fontSize: 13 * scale }]}>
            {t.pastConsultationsHint}
          </Text>
          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: Colors.orange }]}
            onPress={() => router.push('/')}
          >
            <Text style={[styles.startBtnText, { fontSize: 14 * scale }]}>{t.startConsultation}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={groupedList}
          keyExtractor={([k]) => k}
          contentContainerStyle={styles.listPad}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: [dateLabel, dateSessions] }) => (
            <View>
              <Text style={[styles.dateLabel, { color: C.textSecondary, fontSize: 11 * scale }]}>{dateLabel}</Text>
              {dateSessions.map((session) => {
                const cat    = getCatInfo(session.categoryId);
                const icon   = CATEGORY_ICONS[session.categoryId] ?? { Icon: MessageSquare, color: Colors.orange };
                const CatIcon = icon.Icon;
                const lastMsg = session.messages[session.messages.length - 1];

                return (
                  <TouchableOpacity
                    key={session.id}
                    style={[styles.card, {
                      backgroundColor: C.surface,
                      borderColor:     C.surfaceBorder,
                      borderLeftColor: icon.color,
                      shadowColor:     C.shadow,
                    }]}
                    onPress={() => handlePress(session)}
                    activeOpacity={0.78}
                  >
                    <View style={styles.cardTop}>
                      <View style={[styles.catBadge, { backgroundColor: isDarkMode ? '#1E1E23' : '#F3F4F6' }]}>
                        <CatIcon size={16} color={icon.color} strokeWidth={1.8} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.catLabel, { color: C.text, fontSize: 14 * scale }]} adjustsFontSizeToFit={true} minimumFontScale={0.8} numberOfLines={1}>{t[session.categoryId] ?? cat.label}</Text>
                        <Text style={[styles.timeText, { color: C.textSecondary, fontSize: 11 * scale }]}>
                          {fmtTime(session.startedAt)} · {session.messages.length} {t.msgs}
                        </Text>
                      </View>
                      <ChevronRight size={16} color={C.textHint} strokeWidth={1.5} />
                    </View>
                    {lastMsg && (
                      <Text style={[styles.preview, { color: C.textSecondary, fontSize: 12 * scale }]} numberOfLines={2}>
                        {lastMsg.text}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  titleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  pageTitle: { fontSize: 20, fontFamily: 'PlusJakartaSans_700Bold' },
  count:     { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' },
  listPad:   { paddingHorizontal: 16, paddingBottom: 120, gap: 14 },
  dateLabel: {
    fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4,
  },
  card: {
    borderRadius: 16, borderWidth: 1, borderLeftWidth: 3,
    padding: 14, marginBottom: 8,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 5, elevation: 2,
  },
  cardTop:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  catBadge: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontSize: 14, fontFamily: 'PlusJakartaSans_700Bold' },
  timeText: { fontSize: 11, fontFamily: 'PlusJakartaSans_400Regular', marginTop: 2 },
  preview:  { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', lineHeight: 19 },
  empty:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon:{ width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle:{ fontSize: 18, fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 8 },
  emptyHint: { fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  startBtn:  { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  startBtnText:{ color: '#FFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
});
