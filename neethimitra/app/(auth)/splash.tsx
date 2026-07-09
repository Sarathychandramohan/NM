import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Logo } from '@/components/ui/Logo';
import { useAppStore } from '@store/useAppStore';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, Easing,
} from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';

// Ashoka-Chakra style 12-spoke loader
const ChakraLoader = ({ spinStyle }: { spinStyle: any }) => (
  <Animated.View style={[spinStyle, styles.loader]}>
    <Svg width={40} height={40} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="4" />
      <Circle cx="50" cy="50" r="10" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="4" />
      {[...Array(12)].map((_, i) => {
        const a = (i * Math.PI) / 6;
        return (
          <Line
            key={i}
            x1="50" y1="50"
            x2={(50 + 44 * Math.cos(a)).toString()}
            y2={(50 + 44 * Math.sin(a)).toString()}
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="3"
          />
        );
      })}
    </Svg>
  </Animated.View>
);

export default function SplashScreen() {
  const router = useRouter();
  const { checkAuthStatus } = useAppStore();
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(360, { duration: 2200, easing: Easing.linear }),
      -1, false
    );
    const run = async () => {
      await checkAuthStatus();
      setTimeout(() => {
        const s = useAppStore.getState();
        const isWeb = (Platform.OS as string) === 'web';
        if (s.authToken) {
          router.replace('/(tabs)' as any);
        } else if (isWeb) {
          // Web visitors see landing page
          router.replace('/web-landing' as any);
        } else if (s.hasCompletedOnboarding) {
          router.replace('/(auth)/phone-auth' as any);
        } else {
          router.replace('/(auth)/onboarding' as any);
        }
      }, 2000);
    };
    run();
  }, []);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));



  return (
    <LinearGradient
      colors={['#0F4C35', '#F97316']}
      locations={[0, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.6, y: 1 }}
      style={styles.container}
    >
      <View style={styles.centre}>
        <Logo size={100} showText={true} stacked={true} lightBg={false} whiteVersion={true} />
        <Text style={styles.tagline}>Know Your Rights. In Your Voice.</Text>
      </View>
      <View style={styles.bottom}>
        <ChakraLoader spinStyle={spinStyle} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 60 },
  centre:    { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  tagline:   { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', letterSpacing: 0.5, marginTop: 8 },
  bottom:    { height: 60, justifyContent: 'flex-end', alignItems: 'center' },
  loader:    { width: 40, height: 40 },
});
