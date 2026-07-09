import React from 'react';
import { View, Text, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { useAppStore, getTextScale } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import { UI_TRANSLATIONS } from '@constants/translations';

const isWeb = Platform.OS === 'web';

export function WelcomeBanner() {
  const { selectedLanguage, isDarkMode, textSize } = useAppStore();
  const { width } = useWindowDimensions();
  const C = isDarkMode ? Colors.dark : Colors.light;
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];
  const scale = getTextScale(textSize);

  const isDesktop = isWeb && width >= 1024;

  return (
    <View style={[
      styles.card,
      {
        backgroundColor: isDarkMode ? '#1A1207' : '#FFF8F0',
        borderColor:     isDarkMode ? '#3D2B0A' : '#FED7AA',
        padding: isDesktop ? 28 : 18,
        marginBottom: isDesktop ? 24 : 20,
      }
    ]}>
      <Text style={[styles.greeting, { fontSize: 22 * scale }, isDesktop && { fontSize: 32 * scale, marginBottom: 8 }]}>{t.welcomeBack} 👋</Text>
      <Text style={[styles.subGreeting, { color: C.text, fontSize: 15 * scale, lineHeight: 22 * scale }, isDesktop && { fontSize: 20 * scale, lineHeight: 28 * scale, marginBottom: 12 }]}>
        {selectedLanguage.greeting}
      </Text>
      <Text style={[styles.hint, { color: C.textSecondary, fontSize: 12 * scale, lineHeight: 18 * scale }, isDesktop && { fontSize: 15 * scale, lineHeight: 22 * scale }]}>
        {t.welcomeHint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
  },
  greeting: {
    fontSize: 22,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#EA580C',
    marginBottom: 4,
  },
  subGreeting: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    marginBottom: 6,
    lineHeight: 22,
  },
  hint: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    lineHeight: 18,
  },
});
