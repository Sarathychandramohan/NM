import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { LogIn, X } from 'lucide-react-native';
import { useAppStore } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import { UI_TRANSLATIONS } from '@constants/translations';
import { safeImpact } from '@/utils/haptics';
import * as Haptics from 'expo-haptics';

const LIMITATION_KEYS = ['guestLim1', 'guestLim2', 'guestLim3', 'guestLim4'] as const;

export function LoginPromptModal() {
  const router = useRouter();
  const { activeOverlay, setOverlay, isDarkMode, selectedLanguage } = useAppStore();
  const C = isDarkMode ? Colors.dark : Colors.light;
  const { width: SW, height: SH } = useWindowDimensions();
  const isWeb = (Platform.OS as string) === 'web';
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];

  const isVisible = activeOverlay === 'login_prompt';

  const scale = useSharedValue(0.88);
  const opacity = useSharedValue(0);
  const bgOpacity = useSharedValue(0);

  useEffect(() => {
    if (isVisible) {
      bgOpacity.value = withTiming(1, { duration: 220 });
      opacity.value = withTiming(1, { duration: 220 });
      scale.value = withSpring(1, { damping: 18, stiffness: 220 });
      safeImpact(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      bgOpacity.value = withTiming(0, { duration: 160 });
      opacity.value = withTiming(0, { duration: 160 });
      scale.value = withTiming(0.88, { duration: 160 });
    }
  }, [isVisible]);

  const modalStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  const bgStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));

  if (!isVisible) return null;

  const handleLogin = () => {
    safeImpact(Haptics.ImpactFeedbackStyle.Medium);
    setOverlay(null);
    setTimeout(() => router.replace('/(auth)/phone-auth' as any), 200);
  };
  const handleDismiss = () => {
    setOverlay(null);
  };

  return (
    <View
      style={{
        position: 'absolute', top: 0, left: 0,
        width: SW, height: SH,
        alignItems: 'center', justifyContent: 'center',
        zIndex: 999,
      }}
    >
      {/* Dim background */}
      <Animated.View
        style={[bgStyle, {
          position: 'absolute', top: 0, left: 0, width: SW, height: SH,
          backgroundColor: 'rgba(0,0,0,0.55)',
        }]}
      >
        <Pressable style={{ flex: 1 }} onPress={handleDismiss} />
      </Animated.View>

      {/* Card */}
      <Animated.View
        style={[modalStyle, {
          width: isWeb ? Math.min(400, SW * 0.92) : SW * 0.88,
          backgroundColor: isDarkMode ? '#111114' : '#FFFFFF',
          borderRadius: 24,
          padding: 28,
          borderWidth: 1,
          borderColor: isDarkMode ? '#2A2A30' : '#F0F0F4',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.18,
          shadowRadius: 30,
          elevation: 16,
        }]}
      >
        {/* Close X */}
        <TouchableOpacity
          onPress={handleDismiss}
          style={{
            position: 'absolute', top: 16, right: 16,
            padding: 6,
            borderRadius: 99,
            backgroundColor: isDarkMode ? '#23232A' : '#F3F4F6',
          }}
        >
          <X size={16} color={C.textSecondary} strokeWidth={2} />
        </TouchableOpacity>

        {/* Icon */}
        <View style={{
          width: 60, height: 60, borderRadius: 30,
          backgroundColor: isDarkMode ? '#1A1A22' : '#FFF7ED',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 18,
          alignSelf: 'center',
        }}>
          <LogIn size={26} color={Colors.orange} strokeWidth={1.8} />
        </View>

        {/* Title */}
        <Text style={{
          fontSize: 20, fontFamily: 'PlusJakartaSans_700Bold',
          color: C.text, textAlign: 'center', marginBottom: 8,
        }}>
          {t.loginToContinue}
        </Text>

        <Text style={{
          fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular',
          color: C.textSecondary, textAlign: 'center',
          lineHeight: 20, marginBottom: 20,
        }}>
          {t.loginToSave}
        </Text>

        {/* Limitations list */}
        <View style={{
          backgroundColor: isDarkMode ? '#17171C' : '#F9FAFB',
          borderRadius: 14, padding: 14, marginBottom: 22,
          gap: 8,
        }}>
          <Text style={{
            fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold',
            color: Colors.orange, textTransform: 'uppercase',
            letterSpacing: 0.8, marginBottom: 4,
          }}>
            {t.guestLimitationsTitle}
          </Text>
          {LIMITATION_KEYS.map((key) => (
            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{
                width: 6, height: 6, borderRadius: 3,
                backgroundColor: '#EF4444',
              }} />
              <Text style={{
                fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular',
                color: C.textSecondary, flex: 1,
              }}>
                {t[key]}
              </Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          onPress={handleLogin}
          activeOpacity={0.85}
          style={{
            height: 50, borderRadius: 14,
            backgroundColor: Colors.orange,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 10,
          }}
        >
          <Text style={{
            fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold',
            color: '#FFFFFF', letterSpacing: 0.3,
          }}>
            {t.registerToUnlock}
          </Text>
        </TouchableOpacity>

        {/* Dismiss */}
        <TouchableOpacity onPress={handleDismiss} activeOpacity={0.7} style={{ alignItems: 'center', paddingVertical: 6 }}>
          <Text style={{ fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold', color: C.textHint }}>
            {t.cancel}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
