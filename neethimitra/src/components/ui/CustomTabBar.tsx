import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Home, Clock, Mic, FolderClosed, User } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore, getTextScale } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UI_TRANSLATIONS } from '@constants/translations';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { safeImpact } from '@/utils/haptics';
import * as Haptics from 'expo-haptics';

const TAB_CONFIG = [
  { name: 'index',        Icon: Home },
  { name: 'chat-history', Icon: Clock },
  { name: 'speak',        Icon: Mic },  // FAB slot
  { name: 'my-files',    Icon: FolderClosed },
  { name: 'profile',     Icon: User },
];

export function CustomTabBar({ state, descriptors, navigation }: any) {
  const { setOverlay, isDarkMode, selectedLanguage, textSize } = useAppStore();
  const scale = getTextScale(textSize);
  const insets = useSafeAreaInsets();

  // Pulse ring animation for the mic FAB
  const pulseScale   = useSharedValue(1.0);
  const pulseOpacity = useSharedValue(0.5);

  React.useEffect(() => {
    pulseScale.value = withRepeat(
      withTiming(1.65, { duration: 1400, easing: Easing.out(Easing.ease) }),
      -1, false
    );
    pulseOpacity.value = withRepeat(
      withTiming(0, { duration: 1400, easing: Easing.out(Easing.ease) }),
      -1, false
    );
  }, []);

  const pulseRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity:   pulseOpacity.value,
  }));

  // Hide tab bar inside chat screens
  const currentRoute = state.routes[state.index].name;
  if (currentRoute.startsWith('chat/') || currentRoute === 'chat') return null;

  const isWeb = Platform.OS === 'web';
  if (isWeb) return null;

  const BAR_HEIGHT = 58;
  const bottomPad  = insets.bottom > 0 ? insets.bottom / 2 : 8;

  const barStyle = {
    position: 'absolute' as const,
    bottom: 12,
    left: 16,
    right: 16,
    height: BAR_HEIGHT + bottomPad,
    paddingBottom: bottomPad,
    borderRadius: 32,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-around' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isDarkMode ? 0.4 : 0.08,
    shadowRadius: 16,
    elevation: 14,
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
  };

  const navColors = isDarkMode
    ? ['#18181B', '#121B18'] // Dark charcoal to soft dark forest green
    : ['#FFFFFF', '#F0F8F4']; // White to soft minty green

  return (
    <LinearGradient
      colors={navColors as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={barStyle}
    >
      {state.routes.map((route: any, index: number) => {
        const isFocused = state.index === index;
        const tabCfg    = TAB_CONFIG.find((t) => t.name === route.name) ?? TAB_CONFIG[0];

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            if (route.name === 'speak') {
              setOverlay('recording');
            } else {
              navigation.navigate(route.name, route.params);
            }
          }
        };

        // ── Centre Mic FAB (Mobile only) ────────────────────────────────────
        if (route.name === 'speak') {
          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.85}
              style={{ alignItems: 'center', justifyContent: 'center', marginTop: -24, flex: 1 }}
              accessibilityLabel="Voice Search"
              accessibilityRole="button"
            >
              <Animated.View
                style={[
                  pulseRingStyle,
                  {
                    position: 'absolute',
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: 'rgba(249,115,22,0.25)',
                    borderWidth: 1,
                    borderColor: 'rgba(249,115,22,0.3)',
                  },
                ]}
              />
              <LinearGradient
                colors={Colors.gradients.primary as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#EA580C',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.45,
                  shadowRadius: 8,
                  elevation: 10,
                  borderWidth: 2,
                  borderColor: 'rgba(255,255,255,0.2)',
                }}
              >
                <Mic size={24} color="#FFFFFF" strokeWidth={1.8} />
              </LinearGradient>
            </TouchableOpacity>
          );
        }

        // ── Standard Tab Item (Mobile only) ──────────────────────────────────
        const TabIcon = tabCfg.Icon;
        const unfocusedColor = isDarkMode ? '#94A3B8' : '#71717A';
        const focusedColor   = isDarkMode ? '#4ADE80' : '#15803D';
        const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];
        
        // BUG-F026 FIX: split(' ').pop() safely handles single-word translations
        const labelText = route.name === 'index' ? t.home :
                          route.name === 'chat-history' ? (t.chatHistory.split(' ')[0]) :
                          route.name === 'my-files' ? (t.myFiles.split(' ').pop() ?? t.myFiles) :
                          t.profile;

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            activeOpacity={0.7}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 6 }}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={labelText}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: isFocused 
                  ? (isDarkMode ? 'rgba(74,222,128,0.15)' : 'rgba(21,128,61,0.08)') 
                  : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TabIcon
                size={19}
                color={isFocused ? focusedColor : unfocusedColor}
                strokeWidth={isFocused ? 2.2 : 1.6}
              />
            </View>
            <Text
              style={{
                fontSize: 9 * scale,
                marginTop: 2,
                fontFamily: isFocused ? 'PlusJakartaSans_700Bold' : 'PlusJakartaSans_400Regular',
                color: isFocused ? focusedColor : unfocusedColor,
              }}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.8}
              numberOfLines={1}
            >
              {labelText}
            </Text>
          </TouchableOpacity>
        );
      })}
    </LinearGradient>
  );
}
