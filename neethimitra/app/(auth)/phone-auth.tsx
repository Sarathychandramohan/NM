import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  useWindowDimensions, Pressable, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAppStore } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo } from '@/components/ui/Logo';
import { ArrowRight, ShieldCheck, Globe, FileText, X, AlertCircle } from 'lucide-react-native';
import { safeImpact } from '@/utils/haptics';
import * as Haptics from 'expo-haptics';
import { UI_TRANSLATIONS } from '@constants/translations';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
} from 'react-native-reanimated';

const isWeb = (Platform.OS as string) === 'web';

const WEB_FEATURES = [
  { icon: Globe,       text: '11 Indian Languages — speak in your own tongue' },
  { icon: ShieldCheck, text: 'AI-powered legal guidance — free of charge' },
  { icon: FileText,    text: 'Instant FIR drafts, RTI applications, complaint letters' },
];



// ── Google Logo SVG-like using View primitives ────────────────────────────────
function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.9, lineHeight: size, fontFamily: 'PlusJakartaSans_700Bold' }}>G</Text>
    </View>
  );
}

export default function PhoneAuthScreen() {
  const router = useRouter();
  const { enableGuest, requestOtp, isDarkMode, selectedLanguage } = useAppStore();
  const { width } = useWindowDimensions();
  const C = isDarkMode ? Colors.dark : Colors.light;
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];

  const [phone, setPhone]   = useState('');
  const [isSending, setSending] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [googleToast, setGoogleToast] = useState(false);
  const phoneRef = useRef<TextInput>(null);

  const isValid = /^[6-9]\d{9}$/.test(phone);
  const isDesktop = isWeb && width >= 900;

  const handleSendOtp = async () => {
    if (!isValid || isSending) return;
    safeImpact(Haptics.ImpactFeedbackStyle.Medium);
    setSending(true);
    setError(null);
    try {
      await requestOtp(phone);
      router.push({ pathname: '/(auth)/otp-verify' as any, params: { phone } });
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send OTP. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleGuest = async () => {
    safeImpact(Haptics.ImpactFeedbackStyle.Light);
    await enableGuest();
    router.replace('/(tabs)' as any);
  };

  const handleGooglePress = () => {
    safeImpact(Haptics.ImpactFeedbackStyle.Light);
    setGoogleToast(true);
    setTimeout(() => setGoogleToast(false), 2800);
  };

  const goToLanding = () => router.back();

  // ── Google Coming Soon Toast ──────────────────────────────────────────────
  const GoogleComingSoon = () => googleToast ? (
    <View style={{
      position: 'absolute', top: isWeb ? 20 : 60, alignSelf: 'center',
      backgroundColor: isDarkMode ? '#1E1E2E' : '#1F2937',
      paddingHorizontal: 18, paddingVertical: 10,
      borderRadius: 24, zIndex: 999,
      shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
    }}>
      <Text style={{ color: '#FFF', fontSize: 13, fontFamily: 'PlusJakartaSans_500Medium' }}>
        🔜 Google Sign-In coming soon. Please use OTP for now.
      </Text>
    </View>
  ) : null;

  // ── Guest Limitations Card ────────────────────────────────────────────────
  const GuestLimitations = () => (
    <View style={{
      backgroundColor: isDarkMode ? '#13131A' : '#FFF9F0',
      borderRadius: 12,
      padding: 14,
      marginTop: 8,
      borderWidth: 1,
      borderColor: isDarkMode ? '#2A2010' : '#FDE68A',
      gap: 6,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <AlertCircle size={13} color="#D97706" strokeWidth={2} />
        <Text style={{
          fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold',
          color: '#D97706', textTransform: 'uppercase', letterSpacing: 0.6,
        }}>
          {t.guestLimitationsTitle}
        </Text>
      </View>
      {(['guestLim1', 'guestLim2', 'guestLim3', 'guestLim4'] as const).map((key) => (
        <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#EF4444' }} />
          <Text style={{ fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular', color: C.textSecondary, flex: 1 }}>
            {t[key]}
          </Text>
        </View>
      ))}
    </View>
  );

  // ── OR Divider ────────────────────────────────────────────────────────────
  const Divider = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: isDarkMode ? '#2A2A2A' : '#E5E7EB' }} />
      <Text style={{
        fontSize: 12, fontFamily: 'PlusJakartaSans_500Medium',
        color: C.textSecondary,
      }}>
        {t.orDivider}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: isDarkMode ? '#2A2A2A' : '#E5E7EB' }} />
    </View>
  );

  // ── Form Card (shared between mobile and web right panel) ─────────────────
  const FormCard = () => (
    <View style={[styles.formCard, isDesktop && styles.formCardDesktop, { backgroundColor: isDarkMode ? '#111' : '#fff' }]}>
      {/* Logo */}
      <View style={styles.logoWrap}>
        <Logo size={56} showText stacked lightBg={!isDarkMode} />
      </View>

      <Text style={[styles.title, { color: C.text }]}>{t.phoneAuthTitle}</Text>
      <Text style={[styles.sub, { color: C.textSecondary }]}>
        {t.phoneAuthSub}
      </Text>

      {/* ── Google Sign-In Button (Coming Soon) ── */}
      <TouchableOpacity
        onPress={handleGooglePress}
        activeOpacity={0.7}
        style={{
          height: 52, borderRadius: 14,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: 10, marginBottom: 14,
          backgroundColor: isDarkMode ? '#18181B' : '#F3F4F6',
          borderWidth: 1.5,
          borderColor: isDarkMode ? '#2A2A2A' : '#E5E7EB',
          opacity: 0.65,
        }}
      >
        <Text style={{ fontSize: 20, lineHeight: 24, fontFamily: 'PlusJakartaSans_700Bold', color: '#9CA3AF' }}>G</Text>
        <Text style={{ fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold', color: C.textSecondary }}>
          {t.continueWithGoogle}
        </Text>
        <View style={{ backgroundColor: '#F97316', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
          <Text style={{ fontSize: 9, fontFamily: 'PlusJakartaSans_700Bold', color: '#FFF', letterSpacing: 0.5 }}>SOON</Text>
        </View>
      </TouchableOpacity>

      <Divider />

      {/* Phone input */}
      <View style={[styles.inputWrap, {
        backgroundColor: isDarkMode ? '#17171A' : '#F8F9FA',
        borderColor: error ? '#EF4444' : isValid ? Colors.orange : C.surfaceBorder,
      }]}>
        <View style={[styles.prefix, { borderRightColor: C.surfaceBorder }]}>
          <Text style={styles.flag}>🇮🇳</Text>
          <Text style={[styles.prefixText, { color: C.text }]}>+91</Text>
        </View>
        <TextInput
          ref={phoneRef}
          style={[styles.input, { color: C.text }]}
          placeholder="98765 43210"
          placeholderTextColor={C.textHint}
          keyboardType="number-pad"
          value={phone}
          onChangeText={(val) => {
            setPhone(val.replace(/[^0-9]/g, '').slice(0, 10));
            if (error) setError(null);
          }}
          maxLength={10}
          autoFocus
          accessibilityLabel="Mobile number input"
          accessibilityHint="Enter your 10-digit Indian mobile number"
          returnKeyType="done"
          onSubmitEditing={handleSendOtp}
        />
        {phone.length > 0 && (
          <TouchableOpacity
            onPress={() => { setPhone(''); setError(null); phoneRef.current?.focus(); }}
            style={{ padding: 10 }}
          >
            <X size={14} color={C.textHint} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        onPress={handleSendOtp}
        disabled={!isValid || isSending}
        activeOpacity={0.85}
        style={[styles.cta, {
          backgroundColor: isValid && !isSending ? Colors.orange : (isDarkMode ? '#2A2A2A' : '#E5E7EB'),
        }]}
        accessibilityRole="button"
        accessibilityLabel={t.sendOtp}
        accessibilityState={{ disabled: !isValid || isSending }}
      >
        {isSending ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Text style={[styles.ctaText, { color: isValid ? '#FFFFFF' : C.textHint }]}>{t.sendOtp}</Text>
            {isValid && <ArrowRight size={16} color="#FFFFFF" strokeWidth={2} />}
          </>
        )}
      </TouchableOpacity>

      {/* Guest button + limitations card */}
      <TouchableOpacity onPress={handleGuest} activeOpacity={0.7} style={styles.guestBtn}>
        <Text style={[styles.guestText, { color: Colors.orange }]}>
          {t.guestQueryHint}
        </Text>
      </TouchableOpacity>
      <GuestLimitations />

      {isDesktop && (
        <TouchableOpacity onPress={goToLanding} style={styles.backToLanding}>
          <Text style={{ fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular', color: C.textHint }}>
            ← Back to website
          </Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.disclaimerText, { color: C.textHint, marginTop: 16 }]}>
        By proceeding, you agree to NeethiMitra's Terms of Service and Privacy Policy.
      </Text>
    </View>
  );

  // ── Desktop: split-screen ─────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={styles.desktopRoot}>
        <GoogleComingSoon />
        {/* Left branding panel */}
        <LinearGradient
          colors={['#0A3D1F', '#15803D', '#1A5C2A']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.desktopLeft}
        >
          <View style={[styles.heroBubble, { width: 400, height: 400, top: -100, right: -100, opacity: 0.07 }]} />
          <View style={[styles.heroBubble, { width: 260, height: 260, bottom: -60, left: -40, opacity: 0.08 }]} />

          <View style={styles.desktopLeftContent}>
            <Logo size={48} showText stacked={false} lightBg={false} whiteVersion />

            <Text style={styles.desktopBrandTitle}>
              Legal Help for{'\n'}<Text style={{ color: '#F97316' }}>Every Indian</Text>
            </Text>

            <Text style={styles.desktopBrandSub}>
              Speak your problem in any Indian language. Get instant guidance, draft documents, and know your rights — free.
            </Text>

            <View style={styles.desktopFeatures}>
              {WEB_FEATURES.map((f, i) => {
                const FIcon = f.icon;
                return (
                  <View key={i} style={styles.desktopFeatureRow}>
                    <View style={styles.desktopFeatureIcon}>
                      <FIcon size={16} color="#F97316" strokeWidth={2} />
                    </View>
                    <Text style={styles.desktopFeatureText}>{f.text}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.desktopTrust}>
              <Text style={styles.desktopTrustText}>🔒 Encrypted · Free · No lawyer fees</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Right form panel */}
        <ScrollView
          style={[styles.desktopRight, { backgroundColor: isDarkMode ? '#09090B' : '#F9FAFB' }]}
          contentContainerStyle={styles.desktopRightContent}
          showsVerticalScrollIndicator={false}
        >
          <FormCard />
        </ScrollView>
      </View>
    );
  }

  // ── Mobile layout ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <GoogleComingSoon />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoWrap}>
            <Logo size={60} showText stacked lightBg />
          </View>
          <Text style={[styles.title, { color: C.text }]}>{t.phoneAuthTitle}</Text>
          <Text style={[styles.sub, { color: C.textSecondary }]}>{t.phoneAuthSub}</Text>

          {/* Google Sign-In (Coming Soon) */}
          <TouchableOpacity
            onPress={handleGooglePress}
            activeOpacity={0.7}
            style={{
              height: 52, borderRadius: 14,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 10, marginBottom: 14,
              backgroundColor: isDarkMode ? '#18181B' : '#F3F4F6',
              borderWidth: 1.5,
              borderColor: isDarkMode ? '#2A2A2A' : '#E5E7EB',
              opacity: 0.65,
            }}
          >
            <Text style={{ fontSize: 20, lineHeight: 24, fontFamily: 'PlusJakartaSans_700Bold', color: '#9CA3AF' }}>G</Text>
            <Text style={{ fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold', color: C.textSecondary }}>
              {t.continueWithGoogle}
            </Text>
            <View style={{ backgroundColor: '#F97316', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
              <Text style={{ fontSize: 9, fontFamily: 'PlusJakartaSans_700Bold', color: '#FFF', letterSpacing: 0.5 }}>SOON</Text>
            </View>
          </TouchableOpacity>

          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: isDarkMode ? '#2A2A2A' : '#E5E7EB' }} />
            <Text style={{ fontSize: 12, fontFamily: 'PlusJakartaSans_500Medium', color: C.textSecondary }}>{t.orDivider}</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: isDarkMode ? '#2A2A2A' : '#E5E7EB' }} />
          </View>

          {/* Phone input */}
          <View style={[styles.inputWrap, {
            backgroundColor: isDarkMode ? '#17171A' : '#F8F9FA',
            borderColor: error ? '#EF4444' : isValid ? Colors.orange : C.surfaceBorder,
          }]}>
            <View style={[styles.prefix, { borderRightColor: C.surfaceBorder }]}>
              <Text style={styles.flag}>🇮🇳</Text>
              <Text style={[styles.prefixText, { color: C.text }]}>+91</Text>
            </View>
            <TextInput
              ref={phoneRef}
              style={[styles.input, { color: C.text }]}
              placeholder="98765 43210"
              placeholderTextColor={C.textHint}
              keyboardType="number-pad"
              value={phone}
              onChangeText={(val) => {
                setPhone(val.replace(/[^0-9]/g, '').slice(0, 10));
                if (error) setError(null);
              }}
              maxLength={10}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSendOtp}
            />
            {phone.length > 0 && (
              <TouchableOpacity
                onPress={() => { setPhone(''); setError(null); phoneRef.current?.focus(); }}
                style={{ padding: 10 }}
              >
                <X size={14} color={C.textHint} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            onPress={handleSendOtp}
            disabled={!isValid || isSending}
            activeOpacity={0.85}
            style={[styles.cta, {
              backgroundColor: isValid && !isSending ? Colors.orange : (isDarkMode ? '#2A2A2A' : '#E5E7EB'),
            }]}
          >
            {isSending ? <ActivityIndicator color="#FFFFFF" /> : (
              <>
                <Text style={[styles.ctaText, { color: isValid ? '#FFFFFF' : C.textHint }]}>{t.sendOtp}</Text>
                {isValid && <ArrowRight size={16} color="#FFFFFF" strokeWidth={2} />}
              </>
            )}
          </TouchableOpacity>

          {/* Guest + limitations */}
          <TouchableOpacity onPress={handleGuest} activeOpacity={0.7} style={styles.guestBtn}>
            <Text style={[styles.guestText, { color: Colors.orange }]}>{t.guestQueryHint}</Text>
          </TouchableOpacity>
          <GuestLimitations />
        </ScrollView>
        <View style={[styles.disclaimer, { borderTopColor: C.surfaceBorder }]}>
          <Text style={[styles.disclaimerText, { color: C.textHint }]}>
            By proceeding, you agree to NeethiMitra's Terms of Service and Privacy Policy.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Mobile
  container: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 20, flexGrow: 1 },
  logoWrap: { alignItems: 'center', marginBottom: 36 },
  title:   { fontSize: 26, fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 8 },
  sub:     { fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular', lineHeight: 21, marginBottom: 20 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    height: 56, borderRadius: 14, borderWidth: 1.5, marginBottom: 14, overflow: 'hidden',
  },
  prefix: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, gap: 6,
    borderRightWidth: 1, height: '100%',
  },
  flag:       { fontSize: 18 },
  prefixText: { fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold' },
  input: {
    flex: 1, height: '100%', paddingHorizontal: 14,
    fontSize: 16, fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  errorText: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', color: '#EF4444', marginBottom: 10, textAlign: 'center' },
  cta: {
    height: 52, borderRadius: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12,
  },
  ctaText:  { fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 0.3 },
  guestBtn: { paddingVertical: 10, alignItems: 'center' },
  guestText:{ fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' },
  disclaimer: { paddingHorizontal: 24, paddingVertical: 14, borderTopWidth: 1 },
  disclaimerText: { fontSize: 11, fontFamily: 'PlusJakartaSans_400Regular', textAlign: 'center', lineHeight: 17 },

  // Desktop split-screen
  desktopRoot: { flex: 1, flexDirection: 'row' },
  desktopLeft: { flex: 1, justifyContent: 'center', padding: 60, overflow: 'hidden' },
  heroBubble: { position: 'absolute', borderRadius: 9999, backgroundColor: '#FFFFFF' },
  desktopLeftContent: { maxWidth: 460, gap: 24 },
  desktopBrandTitle: { fontSize: 40, fontFamily: 'PlusJakartaSans_700Bold', color: '#FFFFFF', lineHeight: 50, letterSpacing: -0.5 },
  desktopBrandSub: { fontSize: 16, fontFamily: 'PlusJakartaSans_400Regular', color: 'rgba(255,255,255,0.75)', lineHeight: 26 },
  desktopFeatures: { gap: 16 },
  desktopFeatureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  desktopFeatureIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(249,115,22,0.2)', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  desktopFeatureText: { flex: 1, fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular', color: 'rgba(255,255,255,0.85)', lineHeight: 22 },
  desktopTrust: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, alignSelf: 'flex-start' },
  desktopTrustText: { fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold', color: 'rgba(255,255,255,0.9)' },

  desktopRight: { width: 480, flexShrink: 0 },
  desktopRightContent: { flex: 1, justifyContent: 'center', padding: 48, minHeight: '100%' },

  // Form card (desktop)
  formCard: { borderRadius: 24, padding: 36 },
  formCardDesktop: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  backToLanding: { alignItems: 'center', marginTop: 12 },
});
