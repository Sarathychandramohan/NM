import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Phone, ArrowRight } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors } from '@constants/colors';
import { useAppStore, getTextScale } from '@store/useAppStore';
import { UI_TRANSLATIONS } from '@constants/translations';

const HELPLINES = [
  {
    id: 'cyber',
    label: 'Cyber Fraud',
    number: '1930',
    colors: Colors.gradients.cyber,
  },
  {
    id: 'domestic',
    label: 'Domestic Violence',
    number: '181',
    colors: Colors.gradients.domestic,
  },
  {
    id: 'seniors',
    label: 'Senior Citizens',
    number: '14567',
    colors: Colors.gradients.senior,
  },
  {
    id: 'consumer',
    label: 'Consumer Rights',
    number: '1915',
    colors: Colors.gradients.consumer,
  },
];

export function EmergencyHelplines() {
  const { selectedLanguage, textSize } = useAppStore();
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];
  const scale = getTextScale(textSize);
  const pulseOpacity = useSharedValue(0.4);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.4, { duration: 800 })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const handleCall = async (number: string) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await Linking.openURL(`tel:${number}`);
    } catch (err) {
      console.warn('Failed to place call:', err);
    }
  };

  return (
    <View className="mb-6">
      <Text className="text-[12px] font-jakarta font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3" style={{ fontSize: 12 * scale }}>
        {t.emergencyHelplines}
      </Text>
      
      <View className="flex-row flex-wrap justify-between gap-y-2.5">
        {HELPLINES.map((line) => {
          const helplineLabel = t[line.id] ?? line.label;
          return (
            <TouchableOpacity
              key={line.id}
              onPress={() => handleCall(line.number)}
              activeOpacity={0.9}
              className="w-[48.5%] rounded-2xl overflow-hidden shadow-sm"
              style={{ elevation: 2 }}
            >
              <LinearGradient
                colors={line.colors as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }} // Represents 120° angle approximately
                className="relative p-3.5 h-[72px] flex-row justify-between items-center"
              >
                {/* Pulse Indicator Dot */}
                <Animated.View 
                  style={pulseStyle}
                  className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-400"
                />

                {/* Call Icon - Filled for Urgency Signal */}
                <View className="bg-white/15 p-1.5 rounded-full mr-2">
                  <Phone size={16} color="#FFFFFF" fill="#FFFFFF" />
                </View>

                {/* Text Info */}
                <View className="flex-1 justify-center pr-1">
                  <Text className="text-[11px] font-jakarta font-semibold text-white/90" numberOfLines={1} style={{ fontSize: 11 * scale }} adjustsFontSizeToFit={true} minimumFontScale={0.75}>
                    {helplineLabel}
                  </Text>
                  <Text className="text-[14px] font-jakarta font-bold text-white tracking-wide mt-0.5" style={{ fontSize: 14 * scale }}>
                    {line.number}
                  </Text>
                </View>

                {/* Arrow Indicator */}
                <View className="bg-white/20 w-5 h-5 rounded-full items-center justify-center">
                  <ArrowRight size={10} color="#FFFFFF" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
