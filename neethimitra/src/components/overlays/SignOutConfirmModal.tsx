import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { useAppStore } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import { UI_TRANSLATIONS } from '@constants/translations';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { safeImpact } from '@/utils/haptics';
import * as Haptics from 'expo-haptics';

export function SignOutConfirmModal() {
  const { activeOverlay, setOverlay, logout, isDarkMode, selectedLanguage } = useAppStore();
  const router = useRouter();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const isWeb = (Platform.OS as string) === 'web';
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];
  const C = isDarkMode ? Colors.dark : Colors.light;

  const isVisible = activeOverlay === 'confirm_logout';

  const overlayScale = useSharedValue(0.96);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    if (isVisible) {
      overlayScale.value = withSpring(1.0, { damping: 20, stiffness: 240 });
      overlayOpacity.value = withTiming(1, { duration: 200 });
      safeImpact(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      overlayScale.value = 0.96;
      overlayOpacity.value = 0;
    }
  }, [isVisible]);

  const animatedOverlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    transform: [{ scale: overlayScale.value }],
  }));

  const handleClose = () => {
    safeImpact(Haptics.ImpactFeedbackStyle.Light);
    setOverlay(null);
  };

  const handleConfirm = async () => {
    safeImpact(Haptics.ImpactFeedbackStyle.Medium);
    setOverlay(null);
    await logout();
    router.replace('/(auth)/phone-auth' as any);
  };

  if (!isVisible) return null;

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        zIndex: 99999, // Render on top of everything
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Animated.View
        style={[
          animatedOverlayStyle,
          {
            width: Math.min(SCREEN_WIDTH - 48, 360),
            borderRadius: 24,
            padding: 28,
            alignItems: 'center',
            backgroundColor: isDarkMode ? 'rgba(30, 30, 35, 0.85)' : 'rgba(255, 255, 255, 0.85)',
            borderWidth: 1,
            borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.45)',
            ...Platform.select({
              web: {
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              },
            }),
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 16 },
            shadowOpacity: 0.15,
            shadowRadius: 24,
            elevation: 12,
          }
        ]}
      >
        {/* Warning Icon Badge */}
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
            borderWidth: 1,
            borderColor: isDarkMode ? 'rgba(239, 68, 68, 0.3)' : '#FEE2E2',
          }}
        >
          <LogOut size={24} color="#EF4444" strokeWidth={2} />
        </View>

        {/* Title */}
        <Text
          style={{
            fontSize: 20,
            fontFamily: 'PlusJakartaSans_700Bold',
            color: C.text,
            textAlign: 'center',
            marginBottom: 10,
          }}
        >
          {t.signOutTitle ?? 'Sign Out?'}
        </Text>

        {/* Description */}
        <Text
          style={{
            fontSize: 14,
            fontFamily: 'PlusJakartaSans_400Regular',
            color: C.textSecondary,
            textAlign: 'center',
            lineHeight: 20,
            marginBottom: 24,
          }}
        >
          {t.signOutDesc ?? 'Are you sure you want to sign out of NeethiMitra AI?'}
        </Text>

        {/* Action Buttons */}
        <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
          <TouchableOpacity
            onPress={handleClose}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontFamily: 'PlusJakartaSans_700Bold',
                color: isDarkMode ? '#D1D5DB' : '#4B5563',
              }}
            >
              {t.cancel}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleConfirm}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: '#EF4444',
              alignItems: 'center',
              shadowColor: '#EF4444',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 6,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontFamily: 'PlusJakartaSans_700Bold',
                color: '#FFFFFF',
              }}
            >
              {t.signOut}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}
