import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Pressable, ScrollView, Dimensions, Platform, StyleSheet } from 'react-native';
import { useAppStore, CATEGORIES, Category, getTextScale } from '@store/useAppStore';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  Home, 
  Clock, 
  FileText, 
  Bell, 
  ShieldAlert,
  Briefcase,
  User,
  Heart,
  Scale,
  LogOut,
  MessageSquare
} from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { Logo } from './Logo';
import { useRouter, usePathname } from 'expo-router';
import { safeImpact } from '@/utils/haptics';
import * as Haptics from 'expo-haptics';
import { UI_TRANSLATIONS } from '@constants/translations';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.8;

// Maps store category IDs to the sidebar's display metadata
const CATEGORY_ICONS: Record<string, {
  color: string;
  IconComponent: any;
}> = {
  land: { color: '#78350F', IconComponent: Home },
  police: { color: '#1E3A5F', IconComponent: Briefcase },
  cyber: { color: '#1D4ED8', IconComponent: ShieldAlert },
  health: { color: '#134E4A', IconComponent: Heart },
  family: { color: '#5C1A3A', IconComponent: User },
  rti: { color: '#EA580C', IconComponent: Scale },
  general: { color: '#0369A1', IconComponent: MessageSquare },
};

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { 
    isSidebarOpen, setSidebarOpen, isDarkMode, startSession, 
    logout, setOverlay, userName, userPhone, profileImage, isAnonymousGuest, selectedLanguage, textSize 
  } = useAppStore();

  const scale = getTextScale(textSize);

  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];

  // Derive display values — fall back gracefully for guests
  const displayName   = userName || 'Guest Citizen';
  const displayPhone  = isAnonymousGuest ? t.guestLimitationsTitle : (userPhone ? `+91 ${userPhone.slice(-10)}` : 'Registered User');
  const avatarInitial = displayName.charAt(0).toUpperCase();
  // Google users store their account color in profileImage field
  const avatarBg = profileImage && profileImage.startsWith('#') ? profileImage : 'rgba(255,255,255,0.2)';

  const translateX = useSharedValue(-DRAWER_WIDTH);

  useEffect(() => {
    if (isSidebarOpen) {
      translateX.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.ease) });
    } else {
      translateX.value = withTiming(-DRAWER_WIDTH, { duration: 210, easing: Easing.in(Easing.ease) });
    }
  }, [isSidebarOpen]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleNavigate = (route: string) => {
    safeImpact(Haptics.ImpactFeedbackStyle.Light);
    setSidebarOpen(false);
    router.push(route as any);
  };

  const handleCategoryPress = async (category: Category) => {
    safeImpact(Haptics.ImpactFeedbackStyle.Light);
    setSidebarOpen(false);
    await startSession(category);
    router.push(`/chat/${category.id}` as any);
  };

  const handleSignOut = async () => {
    setSidebarOpen(false);
    await logout();
    router.replace('/(auth)/phone-auth' as any);
  };

  const isWeb = Platform.OS === 'web';
  if (isWeb) return null;

  if (!isSidebarOpen) return null;

  return (
    <View 
      style={[sidebarStyles.overlay, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}
    >
      {/* Background Dim Overlay */}
      <Pressable 
        onPress={() => setSidebarOpen(false)}
        style={sidebarStyles.dimBackground}
      />

      {/* Drawer Container — BUG-F033 FIX: use StyleSheet instead of NativeWind className on Animated.View */}
      <Animated.View 
        style={[
          animatedStyle,
          sidebarStyles.drawer,
          { width: DRAWER_WIDTH, backgroundColor: isDarkMode ? '#18181B' : '#FFFFFF' },
        ]}
      >
        {/* Drawer Header (Saffron Gradient) */}
        <LinearGradient
          colors={isDarkMode ? ['#7C2D12', '#C2410C'] : ['#F97316', '#EA580C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: 48, paddingBottom: 24, paddingHorizontal: 20 }}
        >
          {/* Logo Horizontal White */}
          <Logo size={32} showText={true} stacked={false} lightBg={false} whiteVersion={true} />

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 16 }} />

          {/* User Info Row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: avatarBg,
              borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 18 * scale, fontFamily: 'PlusJakartaSans_700Bold', color: '#FFFFFF' }}>
                {avatarInitial}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16 * scale, fontFamily: 'PlusJakartaSans_700Bold', color: '#FFFFFF', lineHeight: 22 }} numberOfLines={1}>
                {displayName}
              </Text>
              {isAnonymousGuest ? (
                <TouchableOpacity
                  onPress={() => { setSidebarOpen(false); setOverlay('login_prompt'); }}
                  style={{ marginTop: 2 }}
                >
                  <Text style={{ fontSize: 11 * scale, fontFamily: 'PlusJakartaSans_600SemiBold', color: '#FED7AA' }}>
                    {t.registerToUnlock} →
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ fontSize: 12 * scale, fontFamily: 'PlusJakartaSans_400Regular', color: 'rgba(255,255,255,0.75)', marginTop: 2 }} numberOfLines={1}>
                  {displayPhone}
                </Text>
              )}
            </View>
          </View>
        </LinearGradient>

        {/* Drawer Scrollable Menu */}
        <ScrollView style={sidebarStyles.scrollMenu} showsVerticalScrollIndicator={false}>
          {/* MAIN SECTION */}
          <Text style={[sidebarStyles.sectionLabel, { color: isDarkMode ? '#71717A' : '#9CA3AF', fontSize: 10 * scale }]}>
            {t.navigation}
          </Text>

          {/* BUG-F023 FIX: Use /(tabs)/ prefix for all routes so Expo Router resolves them */}
          <TouchableOpacity 
            onPress={() => handleNavigate('/(tabs)')}
            style={[
              sidebarStyles.navItem,
              pathname === '/' || pathname === '/(tabs)' ? { backgroundColor: isDarkMode ? 'rgba(234,88,12,0.12)' : '#FFF7ED', borderRadius: 12 } : null,
            ]}
          >
            <Home size={18} color={pathname === '/' || pathname === '/(tabs)' ? '#E8580C' : '#71717A'} strokeWidth={1.8} />
            <Text
              style={[
                sidebarStyles.navLabel,
                { color: pathname === '/' || pathname === '/(tabs)' ? '#E8580C' : (isDarkMode ? '#D4D4D8' : '#3F3F46'), fontSize: 14 * scale },
                pathname === '/' || pathname === '/(tabs)' ? { fontFamily: 'PlusJakartaSans_700Bold' } : null,
              ]}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.8}
              numberOfLines={1}
            >
              {t.home}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => handleNavigate('/(tabs)/chat-history')}
            style={[
              sidebarStyles.navItem,
              pathname === '/chat-history' ? { backgroundColor: isDarkMode ? 'rgba(234,88,12,0.12)' : '#FFF7ED', borderRadius: 12 } : null,
            ]}
          >
            <Clock size={18} color={pathname === '/chat-history' ? '#E8580C' : '#71717A'} strokeWidth={1.8} />
            <Text
              style={[
                sidebarStyles.navLabel,
                { color: pathname === '/chat-history' ? '#E8580C' : (isDarkMode ? '#D4D4D8' : '#3F3F46'), fontSize: 14 * scale },
                pathname === '/chat-history' ? { fontFamily: 'PlusJakartaSans_700Bold' } : null,
              ]}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.8}
              numberOfLines={1}
            >
              {t.chatHistory}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => handleNavigate('/(tabs)/my-files')}
            style={[
              sidebarStyles.navItem,
              pathname === '/my-files' ? { backgroundColor: isDarkMode ? 'rgba(234,88,12,0.12)' : '#FFF7ED', borderRadius: 12 } : null,
            ]}
          >
            <FileText size={18} color={pathname === '/my-files' ? '#E8580C' : '#71717A'} strokeWidth={1.8} />
            <Text
              style={[
                sidebarStyles.navLabel,
                { color: pathname === '/my-files' ? '#E8580C' : (isDarkMode ? '#D4D4D8' : '#3F3F46'), fontSize: 14 * scale },
                pathname === '/my-files' ? { fontFamily: 'PlusJakartaSans_700Bold' } : null,
              ]}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.8}
              numberOfLines={1}
            >
              {t.myFiles}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => safeImpact(Haptics.ImpactFeedbackStyle.Light)}
            style={[sidebarStyles.navItem, { marginBottom: 8 }]}
          >
            <Bell size={18} color="#71717A" strokeWidth={1.8} />
            <Text style={[sidebarStyles.navLabel, { color: isDarkMode ? '#D4D4D8' : '#3F3F46', fontSize: 14 * scale }]} adjustsFontSizeToFit={true} minimumFontScale={0.8} numberOfLines={1}>
              {t.notifications}
            </Text>
          </TouchableOpacity>

          {/* LEGAL CATEGORIES SECTION */}
          <View style={[sidebarStyles.divider, { backgroundColor: isDarkMode ? '#27272A' : '#E5E7EB' }]} />
          <Text style={[sidebarStyles.sectionLabel, { color: isDarkMode ? '#71717A' : '#9CA3AF', fontSize: 10 * scale }]}>
            {t.legalCategories}
          </Text>

          {CATEGORIES.map((cat) => {
            const cc = CATEGORY_ICONS[cat.id] || { color: '#E8580C', IconComponent: Scale };
            const CatIcon = cc.IconComponent;
            const catLabel = t[cat.id] ?? cat.label;
            return (
              <TouchableOpacity 
                key={cat.id}
                onPress={() => handleCategoryPress(cat)}
                style={sidebarStyles.navItem}
                activeOpacity={0.7}
              >
                <View style={[sidebarStyles.catIconBadge, { backgroundColor: cc.color + '18' }]}>
                  <CatIcon size={14} color={cc.color} strokeWidth={2} />
                </View>
                <Text style={[sidebarStyles.navLabel, { color: isDarkMode ? '#D4D4D8' : '#3F3F46', fontSize: 13 * scale }]} adjustsFontSizeToFit={true} minimumFontScale={0.8} numberOfLines={1}>
                  {catLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
          
          <View style={[sidebarStyles.divider, { backgroundColor: isDarkMode ? '#27272A' : '#E5E7EB', marginVertical: 12 }]} />

          {/* SIGN OUT */}
          <TouchableOpacity 
            onPress={handleSignOut}
            style={[sidebarStyles.navItem, { marginBottom: 48 }]}
            activeOpacity={0.7}
          >
            <LogOut size={18} color="#EF4444" strokeWidth={1.8} />
            <Text style={[sidebarStyles.navLabel, { color: '#EF4444', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 * scale }]} adjustsFontSizeToFit={true} minimumFontScale={0.8} numberOfLines={1}>
              {t.signOut}
            </Text>
          </TouchableOpacity>
          
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const sidebarStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 50,
    flexDirection: 'row',
  },
  dimBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  drawer: {
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 20,
  },
  scrollMenu: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: 'PlusJakartaSans_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 12,
    marginBottom: 6,
    marginTop: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 2,
  },
  navLabel: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
  catIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    marginHorizontal: 12,
    marginBottom: 10,
  },
});
