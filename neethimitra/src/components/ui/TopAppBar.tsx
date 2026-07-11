import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Globe, User, Menu } from 'lucide-react-native';
import { useAppStore, getTextScale } from '@store/useAppStore';
import { Logo } from './Logo';
import { useRouter } from 'expo-router';
import { Colors } from '@constants/colors';

interface TopAppBarProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
}

export function TopAppBar({ title, showBack = false, onBack }: TopAppBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { selectedLanguage, setSidebarOpen, setOverlay, isDarkMode, textSize, userName, userEmail, isAnonymousGuest } = useAppStore();
  const scale = getTextScale(textSize);
  const C = isDarkMode ? Colors.dark : Colors.light;

  const displayName = userName || 'Guest Citizen';
  const displayPhone = isAnonymousGuest ? 'Guest' : (userEmail ? userEmail : 'Registered User');
  const initial = displayName.charAt(0).toUpperCase();

  const handleBack = () => {
    if (onBack) onBack();
    else router.back();
  };

  const isWeb = Platform.OS === 'web';
  if (isWeb) return null;

  const topColors = isDarkMode
    ? ['#17171C', '#1A140F']
    : ['#FFFFFF', '#FFF8F0']; // Pure white to very light saffron glow

  return (
    <LinearGradient
      colors={topColors as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[
        styles.container, 
        { 
          paddingTop: insets.top + 10,
          borderBottomWidth: 1.5,
          borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#FFEEDB',
        }
      ]}
    >
      <View style={styles.row}>
        {/* Left — hamburger or back */}
        <TouchableOpacity
          onPress={showBack ? handleBack : () => setSidebarOpen(true)}
          style={styles.iconBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {showBack
            ? <ArrowLeft size={22} color={isDarkMode ? '#FFFFFF' : '#E8580C'} strokeWidth={1.8} />
            : <Menu       size={22} color={isDarkMode ? '#FFFFFF' : '#E8580C'} strokeWidth={1.8} />
          }
        </TouchableOpacity>

        {/* Centre — logo pill or screen title */}
        <View style={styles.centre}>
          {showBack ? (
            title ? (
              <Text style={[styles.title, { color: C.text, fontSize: 17 * scale }]} adjustsFontSizeToFit={true} minimumFontScale={0.8} numberOfLines={1}>{title}</Text>
            ) : null
          ) : (
            <View style={[styles.logoPill, { backgroundColor: isDarkMode ? '#27272A' : '#FFF7ED' }]}>
              <Logo size={22} showText={true} lightBg={!isDarkMode} />
            </View>
          )}
        </View>

        {/* Right — language + avatar (home only) */}
        {!showBack ? (
          <View style={styles.rightRow}>
            <TouchableOpacity
              onPress={() => setOverlay('language')}
              style={[
                styles.langChip,
                {
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#FFF7ED',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#FFEEDB',
                }
              ]}
              activeOpacity={0.8}
            >
              <Globe size={12} color={isDarkMode ? '#FFFFFF' : '#E8580C'} strokeWidth={2} />
              <Text style={[styles.langText, { color: isDarkMode ? '#FFFFFF' : '#E8580C', fontSize: 11 * scale }]}>
                {selectedLanguage.code.split('-')[0].toUpperCase()}
              </Text>
            </TouchableOpacity>

            <View style={{ marginRight: 4, alignItems: 'flex-end', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12 * scale, fontFamily: 'PlusJakartaSans_700Bold', color: C.text }} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={{ fontSize: 9 * scale, fontFamily: 'PlusJakartaSans_400Regular', color: C.textSecondary }} numberOfLines={1}>
                {displayPhone}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => router.push('/profile')}
              style={[
                styles.avatarBtn,
                {
                  backgroundColor: '#E8580C',
                  borderColor: '#FFEEDB',
                }
              ]}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 14 * scale, fontFamily: 'PlusJakartaSans_700Bold', color: '#FFFFFF' }}>{initial}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Spacer so title stays centred
          <View style={{ width: 44 }} />
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    // shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  centre: {
    flex: 1,
    alignItems: 'flex-start',
    marginLeft: 4,
  },
  logoPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  title: {
    fontSize: 17,
    fontFamily: 'PlusJakartaSans_700Bold',
    letterSpacing: -0.3,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 52,
    justifyContent: 'center',
  },
  langText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
