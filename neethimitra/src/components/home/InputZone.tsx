import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform, useWindowDimensions, StyleSheet } from 'react-native';
import { useAppStore, getTextScale } from '@store/useAppStore';
import { Mic, Paperclip } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { safeImpact } from '@/utils/haptics';
import * as Haptics from 'expo-haptics';
import { Colors } from '@constants/colors';
import { UI_TRANSLATIONS } from '@constants/translations';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const isWeb = Platform.OS === 'web';

export function InputZone() {
  const router = useRouter();
  const { isDarkMode, startSession, setOverlay, selectedLanguage, textSize } = useAppStore();
  const { width } = useWindowDimensions();
  const [isFocused, setIsFocused] = useState(false);
  const [inputText, setInputText] = useState('');
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];
  const scale = getTextScale(textSize);

  const isDesktop = isWeb && width >= 1024;

  // Pulse ring animation for input mic button
  const pulseScale = useSharedValue(1.0);
  const pulseOpacity = useSharedValue(0.5);

  React.useEffect(() => {
    pulseScale.value = withRepeat(
      withTiming(1.6, { duration: 1400, easing: Easing.out(Easing.ease) }),
      -1, false
    );
    pulseOpacity.value = withRepeat(
      withTiming(0, { duration: 1400, easing: Easing.out(Easing.ease) }),
      -1, false
    );
  }, []);

  const pulseRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const handleMicPress = async () => {
    safeImpact(Haptics.ImpactFeedbackStyle.Medium);
    await startSession({ id: 'general', label: 'General Legal Query', emoji: '💬', description: '', colorKey: 'general' });
    setOverlay('recording');
    router.push('/chat/general' as any);
  };

  const handleTextInputSubmit = async () => {
    if (!inputText.trim()) return;
    safeImpact(Haptics.ImpactFeedbackStyle.Light);
    await startSession({ id: 'general', label: 'General Legal Query', emoji: '💬', description: '', colorKey: 'general' });
    router.push({ pathname: '/chat/general' as any, params: { initialQuery: inputText } });
    setInputText('');
  };

  const handleAttachPress = async () => {
    safeImpact(Haptics.ImpactFeedbackStyle.Light);
    await startSession({ id: 'general', label: 'General Legal Query', emoji: '💬', description: '', colorKey: 'general' });
    setOverlay('upload');
    router.push('/chat/general' as any);
  };

  return (
    <View 
      className={`border bg-zinc-50 dark:bg-zinc-800/40 ${
        isDesktop ? 'rounded-3xl p-6 mb-8' : 'rounded-2xl p-4 mb-6'
      } ${
        isFocused 
          ? 'border-saffron-500 shadow-md shadow-saffron-500/10' 
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
      style={{ minHeight: isDesktop ? 150 : 120 }}
    >
      <View className="flex-row flex-1">
        {/* Left Side: Text Input */}
        <View className="flex-1 justify-center pr-3">
          <TextInput
            multiline
            placeholder={t.typeQuestion}
            placeholderTextColor={isDarkMode ? '#64748B' : '#94A3B8'}
            className="font-jakarta text-zinc-900 dark:text-zinc-50 p-0 text-left align-top"
            style={{ minHeight: isDesktop ? 64 : 48, fontSize: (isDesktop ? 18 : 15) * scale }}
            value={inputText}
            onChangeText={setInputText}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onSubmitEditing={handleTextInputSubmit}
            blurOnSubmit={true}
            returnKeyType="send"
          />
        </View>

        {/* Vertical Divider */}
        <View className="w-[1px] bg-zinc-200 dark:bg-zinc-800 my-1 mx-1" />

        {/* Right Side: Mic Button */}
        <View className="justify-center items-center pl-2.5" style={{ position: 'relative' }}>
          {/* Animated pulse rings */}
          <Animated.View
            style={[
              pulseRingStyle,
              {
                position: 'absolute',
                width: isDesktop ? 60 : 52,
                height: isDesktop ? 60 : 52,
                borderRadius: isDesktop ? 30 : 26,
                backgroundColor: 'rgba(234, 88, 12, 0.25)',
                borderWidth: 1.5,
                borderColor: 'rgba(234, 88, 12, 0.35)',
                zIndex: 0,
              },
            ]}
          />
          <TouchableOpacity
            onPress={handleMicPress}
            activeOpacity={0.8}
            className="shadow-md shadow-saffron-500/20"
            style={{
              width: isDesktop ? 60 : 52,
              height: isDesktop ? 60 : 52,
              borderRadius: isDesktop ? 30 : 26,
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
            }}
          >
            <LinearGradient
              colors={Colors.gradients.primary as any}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                ...StyleSheet.absoluteFillObject,
                borderRadius: isDesktop ? 30 : 26,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              className="border border-white dark:border-zinc-700"
            >
              <Mic size={isDesktop ? 26 : 22} color="#FFFFFF" strokeWidth={1.8} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Row: Attach Document */}
      <View className="flex-row items-center justify-between border-t border-zinc-100 dark:border-zinc-800/80 pt-3 mt-2">
        <TouchableOpacity 
          onPress={handleAttachPress}
          className="flex-row items-center active:opacity-60"
          style={{ minHeight: 32 }}
        >
          <Paperclip size={isDesktop ? 16 : 14} color="#EA580C" strokeWidth={1.8} className="mr-1.5" />
          <Text className="font-jakarta font-bold text-saffron-600" style={{ fontSize: (isDesktop ? 14 : 12) * scale }}>
            {t.attachDocument}
          </Text>
        </TouchableOpacity>
        
        {inputText.trim().length > 0 && (
          <TouchableOpacity 
            onPress={handleTextInputSubmit}
            className="bg-saffron-50 dark:bg-saffron-950/20 px-4 py-1.5 rounded-full border border-saffron-200"
          >
            <Text className="font-jakarta font-bold text-saffron-600" style={{ fontSize: (isDesktop ? 14 : 12) * scale }}>
              {t.submit}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
