import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Switch, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@constants/colors';
import { useAppStore, getTextScale } from '@store/useAppStore';
import { TopAppBar } from '@/components/ui/TopAppBar';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { useRouter } from 'expo-router';
import { UI_TRANSLATIONS } from '@constants/translations';
import {
  Sun, Moon, Globe, Info, Shield, Scale,
  LogOut, Trash2, ChevronRight, User, Type,
} from 'lucide-react-native';

export default function ProfileScreen() {
  const router = useRouter();
  const {
    isDarkMode, toggleDarkMode, selectedLanguage, sessions, logout,
    setOverlay, userName, userPhone, textSize, setTextSize
  } = useAppStore();
  const C = isDarkMode ? Colors.dark : Colors.light;
  const [confirmType, setConfirmType] = useState<'logout' | 'delete' | null>(null);

  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];
  const scale = getTextScale(textSize);

  // Real user display values
  const displayName   = userName || 'Guest Citizen';
  const displayPhone  = userPhone ? `+91 ${userPhone}` : 'Not logged in';
  const avatarInitial = displayName.charAt(0).toUpperCase();

  const showAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.replace('/(auth)/phone-auth' as any);
  };
  const handleDeleteAccount = async () => {
    await logout();
    router.replace('/(auth)/phone-auth' as any);
  };

  const SETTINGS = [
    {
      section: t.preferences,
      items: [
        {
          label: isDarkMode ? `${t.mode} · ${t.dark}` : `${t.mode} · ${t.light}`,
          Icon: isDarkMode ? Moon : Sun,
          right: (
            <Switch
              value={isDarkMode}
              onValueChange={toggleDarkMode}
              trackColor={{ false: '#E5E7EB', true: Colors.green }}
              thumbColor={Platform.OS === 'android' ? (isDarkMode ? Colors.green : '#f4f3f4') : undefined}
            />
          ),
        },
        {
          label: `${t.language} · ${selectedLanguage.name}`,
          Icon: Globe,
          right: (
            <TouchableOpacity
              onPress={() => setOverlay('language')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
            >
              <Text style={{ color: Colors.orange, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }}>
                {t.changeLanguage ?? 'Change'}
              </Text>
              <ChevronRight size={14} color={Colors.orange} strokeWidth={1.8} />
            </TouchableOpacity>
          ),
        },
        {
          label: t.textSize,
          Icon: Type,
          right: (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['small', 'medium', 'large'] as const).map((sz) => (
                <TouchableOpacity
                  key={sz}
                  onPress={() => setTextSize(sz)}
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 12,
                    backgroundColor: textSize === sz ? Colors.orange : (isDarkMode ? '#1E1E23' : '#F3F4F6'),
                    borderWidth: 1,
                    borderColor: textSize === sz ? Colors.orange : (isDarkMode ? '#333' : '#E5E7EB'),
                  }}
                >
                  <Text style={{
                    fontSize: 11,
                    fontFamily: 'PlusJakartaSans_700Bold',
                    color: textSize === sz ? '#FFF' : C.textSecondary,
                  }}>
                    {t[sz]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ),
        },
      ],
    },
    {
      section: t.aboutLegal,
      items: [
        {
          label: t.aboutApp,
          Icon: Info,
          onPress: () => showAlert(t.aboutApp, 'NeethiMitra AI v1.0\nProviding free legal guidance to citizens across India.'),
          right: <ChevronRight size={15} color={C.textHint} strokeWidth={1.5} />
        },
        {
          label: t.privacyPolicy,
          Icon: Shield,
          onPress: () => showAlert(t.privacyPolicy, 'Your data is secured locally and processed in compliance with Indian privacy laws.'),
          right: <ChevronRight size={15} color={C.textHint} strokeWidth={1.5} />
        },
        {
          label: t.legalDisclaimer,
          Icon: Scale,
          onPress: () => showAlert(t.legalDisclaimer, 'This app provides AI-powered legal information, not formal legal advice. Consult a lawyer for legal representation.'),
          right: <ChevronRight size={15} color={C.textHint} strokeWidth={1.5} />
        },
      ],
    },
    {
      section: t.dangerZone,
      items: [
        { label: t.deleteAccount, Icon: Trash2, danger: true, onPress: () => { setConfirmType('delete'); setOverlay('confirm'); } },
        { label: t.signOut,       Icon: LogOut,  danger: true, onPress: () => { setConfirmType('logout'); setOverlay('confirm'); } },
      ],
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]} edges={['bottom']}>
      <TopAppBar title={t.profileSettings} showBack={false} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Profile Header ───────────────────────────────────────── */}
        <View style={[styles.profileCard, {
          backgroundColor: isDarkMode ? '#0F0F12' : '#FFFFFF',
          borderBottomColor: C.surfaceBorder,
        }]}>
          <View style={[styles.avatar, { backgroundColor: isDarkMode ? '#1E1E23' : '#FFF7ED', borderColor: Colors.orange + '40' }]}>
            <Text style={[styles.avatarInitial, { color: Colors.orange }]}>{avatarInitial}</Text>
          </View>
          <Text style={[styles.userName, { color: C.text, fontSize: 20 * scale }]} numberOfLines={1}>{displayName}</Text>
          <Text style={[styles.userMeta, { color: C.textSecondary, fontSize: 13 * scale }]}>
            {displayPhone} · NeethiMitra AI
          </Text>
        </View>

        {/* ── Stats Row ────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          {[
            { label: t.chats,    value: String(sessions.length), accent: Colors.orange },
            { label: t.language, value: selectedLanguage.code.split('-')[0].toUpperCase(), accent: Colors.green },
            { label: t.mode,     value: isDarkMode ? t.dark : t.light, accent: '#3B82F6' },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, {
              backgroundColor: C.surface, borderColor: C.surfaceBorder,
            }]}>
              <Text style={[styles.statValue, { color: s.accent, fontSize: 20 * scale }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: C.textSecondary, fontSize: 11 * scale }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Settings Sections ─────────────────────────────────────── */}
        {SETTINGS.map((section) => (
          <View key={section.section} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: C.textSecondary, fontSize: 11 * scale }]}>{section.section}</Text>
            <View style={[styles.sectionCard, { backgroundColor: C.surface, borderColor: C.surfaceBorder }]}>
              {(section.items as any[]).map((item, idx) => (
                <React.Fragment key={item.label}>
                  <TouchableOpacity
                    style={styles.row}
                    onPress={item.onPress}
                    disabled={!item.onPress}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconBox, {
                      backgroundColor: item.danger
                        ? 'rgba(239,68,68,0.08)'
                        : (isDarkMode ? '#1E1E23' : '#F3F4F6'),
                    }]}>
                      <item.Icon
                        size={15}
                        color={item.danger ? '#EF4444' : Colors.orange}
                        strokeWidth={1.8}
                      />
                    </View>
                    <Text style={[styles.rowLabel, { color: item.danger ? '#EF4444' : C.text, flex: 1, fontSize: 14 * scale }]} adjustsFontSizeToFit={true} minimumFontScale={0.8} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {item.right ?? (
                      item.danger
                        ? <ChevronRight size={15} color="#EF4444" strokeWidth={1.5} />
                        : null
                    )}
                  </TouchableOpacity>
                  {idx < section.items.length - 1 && (
                    <View style={[styles.divider, { backgroundColor: C.surfaceBorder }]} />
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>

      <ConfirmModal
        title={confirmType === 'delete' ? t.deleteTitle : t.signOutTitle}
        description={
          confirmType === 'delete'
            ? t.deleteDesc
            : t.signOutDesc
        }
        confirmText={confirmType === 'delete' ? t.deleteAccount : t.signOut}
        cancelText={t.cancel}
        isDestructive={true}
        onConfirm={confirmType === 'delete' ? handleDeleteAccount : handleSignOut}
        onCancel={() => setConfirmType(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { paddingBottom: 40 },

  profileCard: {
    alignItems: 'center', padding: 28,
    borderBottomWidth: 1, marginBottom: 16,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, marginBottom: 12,
  },
  avatarInitial: {
    fontSize: 28, fontFamily: 'PlusJakartaSans_700Bold',
  },
  userName: { fontSize: 20, fontFamily: 'PlusJakartaSans_700Bold' },
  userMeta: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', marginTop: 4 },

  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 20 },
  statCard: {
    flex: 1, alignItems: 'center', borderRadius: 14,
    paddingVertical: 14, borderWidth: 1,
  },
  statValue: { fontSize: 20, fontFamily: 'PlusJakartaSans_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'PlusJakartaSans_400Regular', marginTop: 3 },

  section:      { paddingHorizontal: 16, marginBottom: 14 },
  sectionTitle: {
    fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  sectionCard: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  row:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  iconBox:{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel:{ fontSize: 14, fontFamily: 'PlusJakartaSans_600SemiBold' },
  divider: { height: 1, marginLeft: 60 },
});
