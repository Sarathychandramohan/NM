import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Dimensions,
  ScrollView, TouchableOpacity, ActivityIndicator,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageSquare, Landmark, Award } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { safeImpact, safeSelection } from '@/utils/haptics';

const { width: SW } = Dimensions.get('window');

const SLIDES = [
  {
    key: 's1', title: 'Speak in Your Language',
    desc: 'Describe your legal issue in any Indian language. NeethiMitra supports 23+ dialects powered by Sarvam AI.',
    Icon: MessageSquare, color: Colors.orange,
  },
  {
    key: 's2', title: 'Get Free Legal Guidance',
    desc: 'Understand your rights instantly — simplified, personalised advice at no cost.',
    Icon: Landmark, color: Colors.green,
  },
  {
    key: 's3', title: 'Draft & File Complaints',
    desc: 'Get step-by-step guidance on filing police complaints, RTI requests, and resolving legal queries.',
    Icon: Award, color: '#2563EB',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { enableGuest } = useAppStore();
  const insets = useSafeAreaInsets();

  const [idx, setIdx] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / SW);
    if (next !== idx && next >= 0 && next < SLIDES.length) {
      setIdx(next);
      safeSelection();
    }
  };

  const next = () => {
    if (idx < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (idx + 1) * SW, animated: true });
      setIdx(idx + 1);
      safeImpact(Haptics.ImpactFeedbackStyle.Light);
    } else { goStart(); }
  };

  const goStart = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try { await enableGuest(); } catch { /* ignore — guest mode proceeds anyway */ }
    router.replace('/(auth)/phone-auth' as any);
  };

  const slide = SLIDES[idx];

  return (
    <SafeAreaView style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Skip */}
      <View style={styles.header}>
        {idx < SLIDES.length - 1 ? (
          <TouchableOpacity onPress={goStart} activeOpacity={0.6}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : <View />}
      </View>

      {/* Carousel */}
      <ScrollView
        ref={scrollRef}
        horizontal pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s) => {
          const SlideIcon = s.Icon;
          return (
            <View key={s.key} style={styles.slide}>
              {/* Icon circle */}
              <View style={[styles.iconCircle, { backgroundColor: s.color + '15' }]}>
                <SlideIcon size={60} color={s.color} strokeWidth={1.4} />
              </View>
              <Text style={styles.slideTitle}>{s.title}</Text>
              <Text style={styles.slideDesc}>{s.desc}</Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === idx
                  ? { backgroundColor: Colors.orange, width: 22 }
                  : { backgroundColor: '#E5E7EB', width: 8 },
              ]}
            />
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          onPress={next}
          activeOpacity={0.85}
          disabled={isLoading}
          style={[styles.cta, { backgroundColor: Colors.orange, opacity: isLoading ? 0.7 : 1 }]}
        >
          {isLoading
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Text style={styles.ctaText}>
                {idx === SLIDES.length - 1 ? 'Get Started' : 'Next'}
              </Text>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'space-between' },
  header: {
    height: 52, paddingHorizontal: 24,
    justifyContent: 'center', alignItems: 'flex-end',
  },
  skipText: { fontSize: 14, fontFamily: 'PlusJakartaSans_600SemiBold', color: '#9CA3AF' },

  slide: {
    width: SW, paddingHorizontal: 36,
    justifyContent: 'center', alignItems: 'center', gap: 20,
  },
  iconCircle: {
    width: 160, height: 160, borderRadius: 80,
    alignItems: 'center', justifyContent: 'center',
  },
  slideTitle: {
    fontSize: 26, fontFamily: 'PlusJakartaSans_700Bold',
    color: '#111827', textAlign: 'center', lineHeight: 34,
  },
  slideDesc: {
    fontSize: 15, fontFamily: 'PlusJakartaSans_400Regular',
    color: '#6B7280', textAlign: 'center', lineHeight: 24,
  },

  footer: { paddingHorizontal: 24, paddingBottom: 36, gap: 24, alignItems: 'center' },
  dots:   { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot:    { height: 8, borderRadius: 4 },
  cta: {
    width: '100%', height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: {
    fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF', letterSpacing: 0.3,
  },
});
