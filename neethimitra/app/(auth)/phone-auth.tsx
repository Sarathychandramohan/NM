import React, { useState, useRef, useEffect } from 'react';
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
import { ArrowRight, ShieldCheck, Globe, FileText, X, AlertCircle, Mail, Lock, User as UserIcon, ArrowLeft } from 'lucide-react-native';
import { safeImpact } from '@/utils/haptics';
import * as Haptics from 'expo-haptics';
import { UI_TRANSLATIONS } from '@constants/translations';

const isWeb = (Platform.OS as string) === 'web';

const WEB_FEATURES = [
  { icon: Globe,       text: '11 Indian Languages — speak in your own tongue' },
  { icon: ShieldCheck, text: 'AI-powered legal guidance — free of charge' },
  { icon: FileText,    text: 'Instant FIR drafts, RTI applications, complaint letters' },
];

export default function PhoneAuthScreen() {
  const router = useRouter();
  const { enableGuest, login, register, upgradeGuestAccount, loginWithGoogle, isDarkMode, selectedLanguage, isAnonymousGuest, setOverlay } = useAppStore();
  const { width } = useWindowDimensions();
  const C = isDarkMode ? Colors.dark : Colors.light;
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];

  // Tabs: 'login' | 'register'
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  // Input states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isPasswordValid = password.length >= 6;
  const isNameValid = name.trim().length >= 2;

  const isValid = activeTab === 'login'
    ? (isEmailValid && isPasswordValid)
    : (isNameValid && isEmailValid && isPasswordValid);

  const isDesktop = isWeb && width >= 900;
  const isGoogleEnabled = !!process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

  // Google OAuth verification setup on Web
  useEffect(() => {
    if (Platform.OS !== 'web' || !isGoogleEnabled) return;

    const scriptId = 'google-gsi-client';
    if (document.getElementById(scriptId)) {
      initializeGoogleSignIn();
      return;
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      initializeGoogleSignIn();
    };
    document.body.appendChild(script);
  }, []);

  const initializeGoogleSignIn = () => {
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    try {
      (window as any).google?.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredentialResponse,
      });

      (window as any).google?.accounts.id.renderButton(
        document.getElementById('google-signin-btn-container'),
        {
          theme: isDarkMode ? 'filled_blue' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 320,
        }
      );
    } catch (err) {
      console.warn('Failed to render Google Sign-In button:', err);
    }
  };

  const handleGoogleCredentialResponse = async (response: any) => {
    setLoading(true);
    setError(null);
    try {
      const idToken = response.credential;
      await loginWithGoogle(idToken, selectedLanguage.code);
      router.replace('/(tabs)' as any);
    } catch (err: any) {
      setError(err?.message ?? 'Google Sign-In failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleMockGooglePress = async () => {
    safeImpact(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setError(null);
    try {
      const mockIdToken = `mock_google_${email || 'citizen@neethimitra.ai'}_NeethiMitra Citizen`;
      await loginWithGoogle(mockIdToken, selectedLanguage.code);
      router.replace('/(tabs)' as any);
    } catch (err: any) {
      setError(err?.message ?? 'Google Sign-In failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSubmit = async () => {
    if (!isValid || isLoading) return;
    safeImpact(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'login') {
        await login(email, password);
      } else {
        if (isAnonymousGuest) {
          await upgradeGuestAccount(email, name, password, true);
        } else {
          await register(name, email, password);
        }
      }
      router.replace('/(tabs)' as any);
    } catch (err: any) {
      setError(err?.message ?? 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    safeImpact(Haptics.ImpactFeedbackStyle.Light);
    await enableGuest();
    router.replace('/(tabs)' as any);
  };

  const goToLanding = () => router.back();

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
  const renderFormCard = () => (
    <View style={[styles.formCard, isDesktop && styles.formCardDesktop, { backgroundColor: isDarkMode ? '#111' : '#fff' }]}>
      {/* Back and Language top bar */}
      <View style={styles.formHeader}>
        <TouchableOpacity onPress={() => router.replace('/(auth)/splash' as any)} style={styles.backButton} activeOpacity={0.7}>
          <ArrowLeft size={16} color={Colors.orange} strokeWidth={2.5} />
          <Text style={[styles.backButtonText, { color: C.text }]}>{t.back || 'Back'}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => setOverlay('language')} style={[styles.langSelector, { borderColor: C.surfaceBorder }]} activeOpacity={0.7}>
          <Globe size={14} color={Colors.orange} strokeWidth={2.5} />
          <Text style={[styles.langSelectorText, { color: C.text }]}>
            {selectedLanguage.code.split('-')[0].toUpperCase()}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Logo */}
      <View style={styles.logoWrap}>
        <Logo size={56} showText stacked lightBg={!isDarkMode} />
      </View>

      <Text style={[styles.title, { color: C.text, textAlign: 'center' }]}>
        {activeTab === 'login' ? 'Welcome Back' : 'Create Account'}
      </Text>
      <Text style={[styles.sub, { color: C.textSecondary, textAlign: 'center', marginBottom: 24 }]}>
        {activeTab === 'login' ? 'Sign in to access your chat history' : 'Register to get secure AI legal assistance'}
      </Text>

      {/* ── Segmented Tabs ── */}
      <View style={[styles.tabContainer, { backgroundColor: isDarkMode ? '#18181B' : '#F3F4F6' }]}>
        <TouchableOpacity
          onPress={() => { setActiveTab('login'); setError(null); }}
          style={[styles.tabButton, activeTab === 'login' && { backgroundColor: Colors.orange }]}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, { color: activeTab === 'login' ? '#FFF' : C.textSecondary }]}>Login</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setActiveTab('register'); setError(null); }}
          style={[styles.tabButton, activeTab === 'register' && { backgroundColor: Colors.orange }]}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, { color: activeTab === 'register' ? '#FFF' : C.textSecondary }]}>Register</Text>
        </TouchableOpacity>
      </View>

      {/* Name Input (Register Only) */}
      {activeTab === 'register' && (
        <View style={[styles.inputWrap, {
          backgroundColor: isDarkMode ? '#17171A' : '#F8F9FA',
          borderColor: error ? '#EF4444' : isNameValid ? Colors.orange : C.surfaceBorder,
        }]}>
          <View style={[styles.prefix, { borderRightColor: C.surfaceBorder }]}>
            <UserIcon size={16} color={C.textSecondary} />
          </View>
          <TextInput
            ref={nameRef}
            style={[styles.input, { color: C.text }]}
            placeholder="Your Username"
            placeholderTextColor={C.textHint}
            value={name}
            onChangeText={(val) => { setName(val); if (error) setError(null); }}
            autoFocus
            accessibilityLabel="Username input"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
          />
        </View>
      )}

      {/* Email input */}
      <View style={[styles.inputWrap, {
        backgroundColor: isDarkMode ? '#17171A' : '#F8F9FA',
        borderColor: error ? '#EF4444' : isEmailValid ? Colors.orange : C.surfaceBorder,
      }]}>
        <View style={[styles.prefix, { borderRightColor: C.surfaceBorder }]}>
          <Mail size={16} color={C.textSecondary} />
        </View>
        <TextInput
          ref={emailRef}
          style={[styles.input, { color: C.text }]}
          placeholder="your.email@example.com"
          placeholderTextColor={C.textHint}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={(val) => { setEmail(val.trim()); if (error) setError(null); }}
          accessibilityLabel="Email input"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        {email.length > 0 && (
          <TouchableOpacity
            onPress={() => { setEmail(''); setError(null); emailRef.current?.focus(); }}
            style={{ padding: 10 }}
          >
            <X size={14} color={C.textHint} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>

      {/* Password input */}
      <View style={[styles.inputWrap, {
        backgroundColor: isDarkMode ? '#17171A' : '#F8F9FA',
        borderColor: error ? '#EF4444' : isPasswordValid ? Colors.orange : C.surfaceBorder,
      }]}>
        <View style={[styles.prefix, { borderRightColor: C.surfaceBorder }]}>
          <Lock size={16} color={C.textSecondary} />
        </View>
        <TextInput
          ref={passwordRef}
          style={[styles.input, { color: C.text }]}
          placeholder="Password (min 6 chars)"
          placeholderTextColor={C.textHint}
          secureTextEntry
          value={password}
          onChangeText={(val) => { setPassword(val); if (error) setError(null); }}
          accessibilityLabel="Password input"
          returnKeyType="done"
          onSubmitEditing={handleAuthSubmit}
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* CTA Auth Action Button */}
      <TouchableOpacity
        onPress={handleAuthSubmit}
        disabled={!isValid || isLoading}
        activeOpacity={0.85}
        style={[styles.cta, {
          backgroundColor: isValid && !isLoading ? Colors.orange : (isDarkMode ? '#2A2A2A' : '#E5E7EB'),
        }]}
        accessibilityRole="button"
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Text style={[styles.ctaText, { color: isValid ? '#FFFFFF' : C.textHint }]}>
              {activeTab === 'login' ? 'Sign In' : 'Sign Up'}
            </Text>
            {isValid && <ArrowRight size={16} color="#FFFFFF" strokeWidth={2} />}
          </>
        )}
      </TouchableOpacity>
      {/* ── Google Sign-In Section ── */}
      {Platform.OS === 'web' && isGoogleEnabled ? (
        <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 8 }}>
          <View id="google-signin-btn-container" style={{ height: 44, width: '100%', maxWidth: 320 }} />
        </View>
      ) : (
        /* Fallback Mock Google Login Button for Dev/Demo or Mobile */
        <TouchableOpacity
          onPress={handleMockGooglePress}
          activeOpacity={0.7}
          style={{
            height: 52, borderRadius: 14,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 10, marginTop: 14, marginBottom: 14,
            backgroundColor: isDarkMode ? '#18181B' : '#F3F4F6',
            borderWidth: 1.5,
            borderColor: isDarkMode ? '#2A2A2A' : '#E5E7EB',
          }}
        >
          <Text style={{ fontSize: 16, fontFamily: 'PlusJakartaSans_700Bold', color: '#4285F4' }}>G</Text>
          <Text style={{ fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold', color: C.text }}>
            {t.continueWithGoogle || 'Continue with Google'}
          </Text>
        </TouchableOpacity>
      )}

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

  // ── Desktop Layout ─────────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={styles.desktopRoot}>
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
          {renderFormCard()}
        </ScrollView>
      </View>
    );
  }

  // ── Mobile Layout ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
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
          {renderFormCard()}
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
  logoWrap: { alignItems: 'center', marginBottom: 20 },
  title:   { fontSize: 26, fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 8 },
  sub:     { fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular', lineHeight: 21, marginBottom: 20 },
  
  // Tabs Style
  tabContainer: {
    flexDirection: 'row',
    height: 48,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
  },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    height: 56, borderRadius: 14, borderWidth: 1.5, marginBottom: 14, overflow: 'hidden',
  },
  prefix: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, height: '100%',
    borderRightWidth: 1,
  },
  input: {
    flex: 1, height: '100%', paddingHorizontal: 14,
    fontSize: 16, fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  errorText: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', color: '#EF4444', marginBottom: 10, textAlign: 'center' },
  cta: {
    height: 52, borderRadius: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, marginTop: 6,
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
  formCard: { borderRadius: 24, padding: 36, width: '100%' },
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
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    width: '100%',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  langSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  langSelectorText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
});
