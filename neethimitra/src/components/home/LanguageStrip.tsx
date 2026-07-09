import React from 'react';
import { ScrollView, Text, TouchableOpacity, View, Platform } from 'react-native';
import { useAppStore } from '@store/useAppStore';
import { LANGUAGES, Language } from '@constants/languages';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@constants/colors';
import * as Haptics from 'expo-haptics';
import { UI_TRANSLATIONS } from '@constants/translations';

// Top languages to show in strip before "More"
const STRIP_LANG_CODES = ['ta-IN', 'hi-IN', 'te-IN', 'kn-IN', 'mr-IN', 'bn-IN', 'en-IN'];

export function LanguageStrip() {
  const { selectedLanguage, setLanguage, setOverlay, isDarkMode } = useAppStore();

  const handleLanguageSelect = (lang: Language) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLanguage(lang);
  };

  const handleMorePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setOverlay('language');
  };

  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];
  const stripLanguages = LANGUAGES.filter((l) => STRIP_LANG_CODES.includes(l.code));

  return (
    <View className="mb-5">
      <Text className="text-[12px] font-jakarta font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2.5">
        {t.chooseLanguage}
      </Text>
      
      <ScrollView 
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 20 }}
        className="flex-row"
      >
        {stripLanguages.map((lang) => {
          const isSelected = lang.code === selectedLanguage.code;
          
          if (isSelected) {
            return (
              <TouchableOpacity
                key={lang.code}
                onPress={() => handleLanguageSelect(lang)}
                activeOpacity={0.7}
                style={{
                  marginRight: 10,
                  borderRadius: 9999,
                  overflow: 'hidden',
                  ...Platform.select({
                    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
                    android: { elevation: 2 },
                    web: { boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } as any
                  })
                }}
              >
                <LinearGradient
                  colors={Colors.gradients.primary as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ paddingHorizontal: 16, paddingVertical: 8 }}
                >
                  <Text className="font-jakarta text-[13px] font-bold text-white">
                    {lang.nativeName}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={lang.code}
              onPress={() => handleLanguageSelect(lang)}
              activeOpacity={0.7}
              style={{
                marginRight: 10,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 9999,
                borderWidth: 1,
                borderColor: isDarkMode ? '#27272A' : '#E4E4E7',
                backgroundColor: isDarkMode ? 'rgba(39,39,42,0.8)' : '#F4F4F5'
              }}
            >
              <Text className="font-jakarta text-[13px] font-semibold text-zinc-700 dark:text-zinc-300">
                {lang.nativeName}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* More... Chip */}
        <TouchableOpacity
          onPress={handleMorePress}
          activeOpacity={0.7}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 9999,
            borderWidth: 1,
            borderColor: isDarkMode ? '#27272A' : '#E4E4E7',
            backgroundColor: isDarkMode ? 'rgba(39,39,42,0.8)' : '#F4F4F5'
          }}
        >
          <Text className="font-jakarta text-[13px] font-bold text-saffron-600">
            {t.more}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
