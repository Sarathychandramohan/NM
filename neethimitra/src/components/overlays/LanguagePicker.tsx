import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Pressable, useWindowDimensions, Platform } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { useAppStore, getTextScale } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import { LANGUAGES, Language } from '@constants/languages';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming 
} from 'react-native-reanimated';
import { safeImpact } from '../../utils/haptics';
import * as Haptics from 'expo-haptics';


// Flags mappings for all 23 languages
const LANGUAGE_FLAGS: Record<string, string> = {
  'en-IN': '🇮🇳',
  'hi-IN': '🇮🇳',
  'bn-IN': '🇮🇳',
  'te-IN': '🇮🇳',
  'mr-IN': '🇮🇳',
  'ta-IN': '🇮🇳',
  'gu-IN': '🇮🇳',
  'kn-IN': '🇮🇳',
  'ml-IN': '🇮🇳',
  'pa-IN': '🇮🇳',
  'od-IN': '🇮🇳',
  'as-IN': '🇮🇳',
  'mai-IN': '🇮🇳',
  'ur-IN': '🇮🇳',
  'ne-IN': '🇳🇵',
  'sa-IN': '🇮🇳',
  'sd-IN': '🇮🇳',
  'kok-IN': '🇮🇳',
  'doi-IN': '🇮🇳',
  'mni-IN': '🇮🇳',
  'brx-IN': '🇮🇳',
  'ks-IN': '🇮🇳',
  'sat-IN': '🇮🇳',
};

export function LanguagePicker() {
  const { activeOverlay, setOverlay, selectedLanguage, setLanguage, isDarkMode, textSize } = useAppStore();
  const scale = getTextScale(textSize);
  const C = isDarkMode ? Colors.dark : Colors.light;
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const bgOpacity = useSharedValue(0);

  const isWeb = (Platform.OS as string) === 'web';
  const isVisible = activeOverlay === 'language';

  // Temporary selection state for Web version until OK is clicked
  const [tempLanguage, setTempLanguage] = useState<Language | null>(null);

  useEffect(() => {
    if (isVisible) {
      bgOpacity.value = withTiming(0.5, { duration: 250 });
      if (!isWeb) {
        translateY.value = withSpring(SCREEN_HEIGHT * 0.4, { damping: 24, stiffness: 300 });
      }
      setTempLanguage(selectedLanguage);
    } else {
      bgOpacity.value = withTiming(0, { duration: 200 });
      if (!isWeb) {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 });
      }
    }
  }, [isVisible, selectedLanguage]);

  const animatedSheetStyle = useAnimatedStyle(() => {
    if (isWeb) {
      return {
        opacity: isVisible ? withTiming(1, { duration: 200 }) : withTiming(0, { duration: 150 }),
        transform: [{ scale: isVisible ? withSpring(1) : withSpring(0.96) }],
      };
    }
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const animatedBgStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  const handleClose = () => {
    setOverlay(null);
  };

  const handleSelectLanguageNative = (lang: Language) => {
    safeImpact(Haptics.ImpactFeedbackStyle.Medium);
    setLanguage(lang);
    
    // Auto-close after 500ms
    setTimeout(() => {
      setOverlay(null);
    }, 500);
  };

  if (!isVisible) return null;

  return (
    <View 
      style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
      className={`absolute inset-0 z-50 ${isWeb ? 'justify-center items-center p-4' : 'justify-end'}`}
    >
      {/* Background Dim */}
      <Pressable 
        style={[animatedBgStyle]} 
        onPress={handleClose}
        className="absolute inset-0 bg-black"
      />

      {/* Sheet / Popup Body */}
      <Animated.View 
        style={[
          animatedSheetStyle, 
          isWeb 
            ? { width: '90%', maxWidth: 420, borderRadius: 20, padding: 24, backgroundColor: C.surface }
            : { height: SCREEN_HEIGHT * 0.6, backgroundColor: C.surface }
        ]}
        className={isWeb ? "shadow-2xl border border-zinc-200/20" : "w-full rounded-t-[28px] shadow-2xl border-t border-zinc-200/20"}
      >
        {isWeb ? (
          <View className="w-full">
            {/* Title Header */}
            <View className="flex-row justify-between items-center pb-4 mb-4 border-b border-zinc-100 dark:border-zinc-800">
              <View>
                <Text className="text-[20px] font-jakarta font-bold text-zinc-950 dark:text-zinc-50" style={{ fontSize: 18 * scale }} numberOfLines={1}>
                  Choose Your Language
                </Text>
                <Text className="text-[12px] font-jakarta font-medium text-zinc-500 mt-0.5" style={{ fontSize: 11 * scale }}>
                  Select your primary language for reading and voice interaction
                </Text>
              </View>
              <TouchableOpacity 
                onPress={handleClose}
                className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full"
              >
                <X size={16} color={isDarkMode ? '#F3F4F6' : '#374151'} />
              </TouchableOpacity>
            </View>

            {/* Scrollable vertical list for Web */}
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={true}>
              {LANGUAGES.map((lang) => {
                const isSelected = tempLanguage?.code === lang.code;
                const localCode = lang.code.split('-')[0].toUpperCase();
                return (
                  <TouchableOpacity
                    key={lang.code}
                    onPress={() => {
                      safeImpact(Haptics.ImpactFeedbackStyle.Medium);
                      setTempLanguage(lang);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 12,
                      marginVertical: 4,
                      borderRadius: 12,
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected ? Colors.orange : (isDarkMode ? '#334155' : '#E2E8F0'),
                      backgroundColor: isSelected 
                        ? (isDarkMode ? 'rgba(249,115,22,0.12)' : '#FFF7ED')
                        : (isDarkMode ? '#1E293B' : '#FFFFFF'),
                    }}
                    activeOpacity={0.7}
                  >
                    {/* Local code badge */}
                    <View 
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: isSelected ? Colors.orange : (isDarkMode ? '#475569' : '#F1F5F9'),
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      <Text style={{ color: isSelected ? '#FFFFFF' : (isDarkMode ? '#94A3B8' : '#64748B'), fontWeight: 'bold', fontSize: 12 }}>
                        {localCode}
                      </Text>
                    </View>

                    {/* Language Names */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontWeight: isSelected ? '700' : '600', fontSize: 14 * scale }}>
                        {lang.nativeName}
                      </Text>
                      <Text style={{ color: C.textSecondary, fontSize: 11 * scale, marginTop: 1 }}>
                        {lang.name}
                      </Text>
                    </View>

                    {/* Selection Indicator */}
                    {isSelected && (
                      <View 
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          backgroundColor: Colors.orange,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={10} color="#FFFFFF" strokeWidth={3.5} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Bottom Buttons OK and Cancel */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                onPress={handleClose}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: isDarkMode ? '#334155' : '#F1F5F9',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: C.text, fontWeight: 'bold', fontSize: 14 * scale }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={() => {
                  if (tempLanguage) {
                    safeImpact(Haptics.ImpactFeedbackStyle.Medium);
                    setLanguage(tempLanguage);
                  }
                  setOverlay(null);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: Colors.orange,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 * scale }}>
                  OK
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* Drag Handle */}
            <View className="items-center py-3">
              <View className="w-10 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
            </View>

            {/* Title */}
            <View className="flex-row justify-between items-center px-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <View>
                <Text className="text-[20px] font-jakarta font-bold text-zinc-950 dark:text-zinc-50" style={{ fontSize: 20 * scale }} adjustsFontSizeToFit={true} minimumFontScale={0.8} numberOfLines={1}>
                  Choose Your Language
                </Text>
                <Text className="text-[12px] font-jakarta font-medium text-zinc-500 mt-0.5" style={{ fontSize: 12 * scale }}>
                  Choose the dialect you want to speak and read
                </Text>
              </View>
              <TouchableOpacity 
                onPress={handleClose}
                className="p-1 bg-zinc-100 dark:bg-zinc-800 rounded-full"
              >
                <X size={18} color={isDarkMode ? '#F3F4F6' : '#374151'} />
              </TouchableOpacity>
            </View>

            {/* 3-Column language cards grid */}
            <ScrollView 
              className="flex-1 px-5 py-4"
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              <View className="flex-row flex-wrap justify-between">
                {LANGUAGES.map((lang) => {
                  const isSelected = selectedLanguage.code === lang.code;
                  const flag = LANGUAGE_FLAGS[lang.code] || '🇮🇳';

                  return (
                    <TouchableOpacity
                      key={lang.code}
                      onPress={() => handleSelectLanguageNative(lang)}
                      activeOpacity={0.8}
                      style={{
                        width: (SCREEN_WIDTH - 56) / 3,
                        height: 84,
                        borderColor: isSelected ? Colors.orange : 'transparent',
                        borderWidth: isSelected ? 2 : 0,
                        backgroundColor: isSelected 
                          ? (isDarkMode ? 'rgba(249, 115, 22, 0.15)' : '#FFF7ED')
                          : (isDarkMode ? '#334155' : '#F3F4F6'),
                      }}
                      className="rounded-xl p-2.5 mb-3 items-center justify-center relative shadow-sm"
                    >
                      <Text className="text-2xl mb-1">{flag}</Text>
                      
                      <Text 
                        className="text-[12px] font-jakarta font-semibold text-center text-zinc-800 dark:text-zinc-200"
                        style={{ fontSize: 12 * scale }}
                        numberOfLines={1}
                      >
                        {lang.nativeName}
                      </Text>
                      
                      <Text 
                        className="text-[10px] font-jakarta font-medium text-zinc-500 text-center mt-0.5"
                        style={{ fontSize: 10 * scale }}
                        numberOfLines={1}
                      >
                        {lang.name}
                      </Text>

                      {/* Selection Mark */}
                      {isSelected && (
                        <View 
                          style={{ backgroundColor: Colors.orange }}
                          className="absolute top-1.5 right-1.5 p-0.5 rounded-full items-center justify-center"
                        >
                          <Check size={8} color="#FFFFFF" strokeWidth={3} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </>
        )}
      </Animated.View>
    </View>
  );
}
