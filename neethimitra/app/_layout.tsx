import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAppStore } from '@store/useAppStore';
import { ThemeProvider } from '@/theme/ThemeContext';
import { 
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  NotoSans_400Regular,
  NotoSans_500Medium,
  NotoSans_600SemiBold,
  NotoSans_700Bold,
  NotoSans_400Regular_Italic,
} from '@expo-google-fonts/noto-sans';
import * as SplashScreen from 'expo-splash-screen';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

// Custom Overlays mounted globally
import { RecordingOverlay } from '@/components/overlays/RecordingOverlay';
import { LanguagePicker } from '@/components/overlays/LanguagePicker';
import { ErrorSheet } from '@/components/overlays/ErrorSheet';
import { SuccessSheet } from '@/components/overlays/SuccessSheet';
import { Sidebar } from '@/components/ui/Sidebar';
import { LoginPromptModal } from '@/components/overlays/LoginPromptModal';

// Disable Reanimated strict mode to suppress shared value read warnings during render
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const { isDarkMode, checkAuthStatus } = useAppStore();

  const [fontsLoaded, fontError] = useFonts({
    // Map Outfit fonts aliases to Plus Jakarta Sans for instant fallback
    Outfit_400Regular: PlusJakartaSans_400Regular,
    Outfit_600SemiBold: PlusJakartaSans_600SemiBold,
    Outfit_700Bold: PlusJakartaSans_700Bold,
    
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,

    NotoSans_400Regular,
    NotoSans_500Medium,
    NotoSans_600SemiBold,
    NotoSans_700Bold,
    NotoSans_400Regular_Italic,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
      
      // Auto-redirect to splash on mount to determine path
      router.replace('/(auth)/splash' as any);
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <StatusBar style={isDarkMode ? 'light' : 'dark'} translucent />
          
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="chat/[category]" />
          </Stack>

          {/* Global overlays — mounted here so setOverlay() works from any screen */}
          <RecordingOverlay />
          <LanguagePicker />
          <ErrorSheet />
          <SuccessSheet />
          <Sidebar />
          <LoginPromptModal />
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
