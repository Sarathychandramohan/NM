import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Keyboard, ActivityIndicator,
  Clipboard, ScrollView, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAppStore } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withDelay, withSpring, withSequence,
} from 'react-native-reanimated';
import { ShieldCheck, ArrowLeft, Edit2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { safeImpact } from '@/utils/haptics';
import { UI_TRANSLATIONS } from '@constants/translations';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function OtpVerifyScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const { login, upgradeGuestAccount, requestOtp, isDarkMode, selectedLanguage, isAnonymousGuest } = useAppStore();
  const C = isDarkMode ? Colors.dark : Colors.light;
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];

  const [otp, setOtp]               = useState(Array(OTP_LENGTH).fill(''));
  const [timer, setTimer]           = useState(RESEND_SECONDS);
  const [isVerifying, setVerifying] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [autoVerifying, setAutoVerifying] = useState(false);
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Reanimated shared values (must be declared at top level, never in map) ─
  const boxFill0 = useSharedValue(0);
  const boxFill1 = useSharedValue(0);
  const boxFill2 = useSharedValue(0);
  const boxFill3 = useSharedValue(0);
  const boxFill4 = useSharedValue(0);
  const boxFill5 = useSharedValue(0);
  const boxShake0 = useSharedValue(0);
  const boxShake1 = useSharedValue(0);
  const boxShake2 = useSharedValue(0);
  const boxShake3 = useSharedValue(0);
  const boxShake4 = useSharedValue(0);
  const boxShake5 = useSharedValue(0);

  const boxFills  = [boxFill0, boxFill1, boxFill2, boxFill3, boxFill4, boxFill5];
  const boxShakes = [boxShake0, boxShake1, boxShake2, boxShake3, boxShake4, boxShake5];

  const boxStyle0 = useAnimatedStyle(() => ({
    borderColor: boxFill0.value === 1 ? Colors.green : undefined,
    backgroundColor: boxFill0.value === 1 ? (isDarkMode ? 'rgba(22,163,74,0.15)' : '#DCFCE7') : undefined,
    transform: [{ translateX: boxShake0.value }],
  }));
  const boxStyle1 = useAnimatedStyle(() => ({
    borderColor: boxFill1.value === 1 ? Colors.green : undefined,
    backgroundColor: boxFill1.value === 1 ? (isDarkMode ? 'rgba(22,163,74,0.15)' : '#DCFCE7') : undefined,
    transform: [{ translateX: boxShake1.value }],
  }));
  const boxStyle2 = useAnimatedStyle(() => ({
    borderColor: boxFill2.value === 1 ? Colors.green : undefined,
    backgroundColor: boxFill2.value === 1 ? (isDarkMode ? 'rgba(22,163,74,0.15)' : '#DCFCE7') : undefined,
    transform: [{ translateX: boxShake2.value }],
  }));
  const boxStyle3 = useAnimatedStyle(() => ({
    borderColor: boxFill3.value === 1 ? Colors.green : undefined,
    backgroundColor: boxFill3.value === 1 ? (isDarkMode ? 'rgba(22,163,74,0.15)' : '#DCFCE7') : undefined,
    transform: [{ translateX: boxShake3.value }],
  }));
  const boxStyle4 = useAnimatedStyle(() => ({
    borderColor: boxFill4.value === 1 ? Colors.green : undefined,
    backgroundColor: boxFill4.value === 1 ? (isDarkMode ? 'rgba(22,163,74,0.15)' : '#DCFCE7') : undefined,
    transform: [{ translateX: boxShake4.value }],
  }));
  const boxStyle5 = useAnimatedStyle(() => ({
    borderColor: boxFill5.value === 1 ? Colors.green : undefined,
    backgroundColor: boxFill5.value === 1 ? (isDarkMode ? 'rgba(22,163,74,0.15)' : '#DCFCE7') : undefined,
    transform: [{ translateX: boxShake5.value }],
  }));
  const boxStyles = [boxStyle0, boxStyle1, boxStyle2, boxStyle3, boxStyle4, boxStyle5];

  // ── Timer ───────────────────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    setTimer(RESEND_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    startTimer();
    // Auto-focus first box
    setTimeout(() => inputRefs.current[0]?.focus(), 200);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // ── Shake animation on error ─────────────────────────────────────────────
  const triggerShake = () => {
    boxShakes.forEach((sv) => {
      sv.value = withSequence(
        withTiming(-6, { duration: 60 }),
        withTiming(6,  { duration: 60 }),
        withTiming(-4, { duration: 50 }),
        withTiming(4,  { duration: 50 }),
        withTiming(0,  { duration: 40 }),
      );
    });
  };

  // ── Handle single digit change (auto-advance) ────────────────────────────
  const handleChange = (text: string, i: number) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    setError(null);

    // Handle paste (6 digits in first box)
    if (cleaned.length >= OTP_LENGTH && i === 0) {
      const digits = cleaned.slice(0, OTP_LENGTH).split('');
      setOtp(digits);
      digits.forEach((d, idx) => { if (inputRefs.current[idx]) (inputRefs.current[idx] as any).setNativeProps?.({ text: d }); });
      inputRefs.current[OTP_LENGTH - 1]?.focus();
      // Auto-verify after paste
      setTimeout(() => handleVerifyWithOtp(digits.join('')), 350);
      return;
    }

    if (!cleaned) {
      const next = [...otp]; next[i] = ''; setOtp(next);
      return;
    }

    const ch = cleaned[cleaned.length - 1];
    const next = [...otp]; next[i] = ch; setOtp(next);
    safeImpact(Haptics.ImpactFeedbackStyle.Light);

    if (i < OTP_LENGTH - 1) {
      inputRefs.current[i + 1]?.focus();
    } else {
      // Last digit filled — auto-verify
      const completed = [...otp]; completed[i] = ch;
      if (completed.every((v) => v !== '')) {
        Keyboard.dismiss();
        setTimeout(() => handleVerifyWithOtp(completed.join('')), 300);
      }
    }
  };

  // ── Backspace: jump back ─────────────────────────────────────────────────
  const handleKeyPress = (e: any, i: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
      const next = [...otp]; next[i - 1] = ''; setOtp(next);
    }
  };

  // ── Handle clipboard paste (web only) ────────────────────────────────────
  const handlePaste = async (i: number) => {
    if (Platform.OS !== 'web') return;
    try {
      const text = await (navigator as any).clipboard?.readText?.();
      if (text && /^\d{6}$/.test(text.trim())) {
        const digits = text.trim().split('');
        setOtp(digits);
        inputRefs.current[OTP_LENGTH - 1]?.focus();
        setTimeout(() => handleVerifyWithOtp(digits.join('')), 350);
      }
    } catch {}
  };

  const isComplete = otp.every((v) => v !== '');

  // ── Verify OTP ───────────────────────────────────────────────
  const handleVerifyWithOtp = async (otpStr: string) => {
    if (isVerifying || autoVerifying) return;
    setAutoVerifying(true);
    setError(null);
    safeImpact(Haptics.ImpactFeedbackStyle.Medium);

    // Helper that finishes login after we know migrate preference
    const doLogin = async (migrateHistory?: boolean) => {
      try {
        if (isAnonymousGuest && migrateHistory !== undefined) {
          // Guest upgrade path: call /api/auth/guest/upgrade
          await upgradeGuestAccount(phone ?? '', otpStr, migrateHistory);
        } else {
          // Normal login path
          await login(phone ?? '', otpStr);
        }

        Keyboard.dismiss();
        boxFills.forEach((v, idx) => {
          v.value = withDelay(idx * 55, withTiming(1, { duration: 160 }));
          setTimeout(() => safeImpact(Haptics.ImpactFeedbackStyle.Light), idx * 55);
        });
        setTimeout(() => router.replace('/(tabs)' as any), 480);
      } catch (err: any) {
        setAutoVerifying(false);
        const msg = err?.message ?? 'Invalid OTP. Please try again.';
        setError(msg);
        triggerShake();
        safeImpact(Haptics.ImpactFeedbackStyle.Heavy);
        setOtp(Array(OTP_LENGTH).fill(''));
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
      }
    };

    if (isAnonymousGuest) {
      // Ask user if they want to import their guest chat history
      if (Platform.OS === 'web') {
        const want = window.confirm(
          'Import your guest chat history?\n\nSelect OK to keep your conversation, or Cancel to start fresh.'
        );
        await doLogin(want);
      } else {
        Alert.alert(
          'Import Chat History?',
          'Would you like to import the conversations you had as a guest into your new account?',
          [
            {
              text: 'Start Fresh',
              style: 'cancel',
              onPress: () => doLogin(false),
            },
            {
              text: 'Import Chats',
              onPress: () => doLogin(true),
            },
          ],
          { cancelable: false }
        );
        // Alert.alert is async/callback based on mobile — don't call doLogin again here
        return;
      }
    } else {
      // Not a guest — plain login
      await doLogin();
    }
  };

  const handleVerify = () => {
    if (!isComplete || isVerifying || autoVerifying) return;
    setVerifying(true);
    handleVerifyWithOtp(otp.join('')).finally(() => setVerifying(false));
  };

  const handleResend = async () => {
    if (timer > 0) return;
    safeImpact(Haptics.ImpactFeedbackStyle.Light);
    startTimer();
    setOtp(Array(OTP_LENGTH).fill(''));
    setError(null);
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
    if (phone) {
      try { await requestOtp(phone); } catch {}
    }
  };

  const handleChangeNumber = () => {
    router.back();
  };

  const isBusy = isVerifying || autoVerifying;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Back nav */}
        <TouchableOpacity onPress={handleChangeNumber} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
          <ArrowLeft size={22} color={C.text} strokeWidth={1.8} />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.body}>
            {/* Icon */}
            <View style={[styles.iconBubble, { backgroundColor: isDarkMode ? '#1E1E23' : '#FFF7ED' }]}>
              <ShieldCheck size={28} color={Colors.orange} strokeWidth={1.8} />
            </View>

            <Text style={[styles.title, { color: C.text }]}>{t.verificationCode}</Text>

            {/* Phone row with edit button */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 36, gap: 8 }}>
              <Text style={[styles.sub, { color: C.textSecondary, marginBottom: 0 }]}>
                {t.otpSub} +91 {phone ?? 'xxxxxxxxxx'}
              </Text>
              <TouchableOpacity
                onPress={handleChangeNumber}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingHorizontal: 8, paddingVertical: 4,
                  borderRadius: 8,
                  backgroundColor: isDarkMode ? '#1E1E23' : '#FFF3E0',
                }}
                accessibilityRole="button"
                accessibilityLabel={t.editPhone}
              >
                <Edit2 size={12} color={Colors.orange} strokeWidth={2} />
                <Text style={{ fontSize: 11, fontFamily: 'PlusJakartaSans_600SemiBold', color: Colors.orange }}>
                  {t.editPhone}
                </Text>
              </TouchableOpacity>
            </View>

            {/* OTP boxes */}
            <View style={styles.otpRow}>
              {otp.map((digit, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.otpBox,
                    {
                      borderColor: boxFills[i].value === 1
                        ? Colors.green
                        : digit ? Colors.orange : (isDarkMode ? '#262629' : '#E5E7EB'),
                      backgroundColor: isDarkMode ? '#17171A' : '#FFFFFF',
                    },
                    boxStyles[i],
                  ]}
                >
                  <TextInput
                    ref={(r) => { inputRefs.current[i] = r; }}
                    style={[styles.otpInput, { color: isBusy ? Colors.green : C.text }]}
                    keyboardType="number-pad"
                    maxLength={i === 0 ? OTP_LENGTH : 1}  // first box accepts full paste
                    value={digit}
                    onChangeText={(text) => handleChange(text, i)}
                    onKeyPress={(e) => handleKeyPress(e, i)}
                    onFocus={() => handlePaste(i)}
                    selectTextOnFocus
                    autoFocus={i === 0}
                    editable={!isBusy}
                    accessibilityLabel={`OTP digit ${i + 1}`}
                  />
                </Animated.View>
              ))}
            </View>

            {/* Auto-verify indicator */}
            {autoVerifying && !error && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, justifyContent: 'center' }}>
                <ActivityIndicator color={Colors.orange} size="small" />
                <Text style={{ fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', color: C.textSecondary }}>
                  Verifying…
                </Text>
              </View>
            )}

            {/* Error message */}
            {error ? (
              <Text style={[styles.errorText, { color: '#EF4444' }]}>{error}</Text>
            ) : null}

            {/* Resend */}
            <View style={styles.resendRow}>
              <Text style={[styles.resendHint, { color: C.textSecondary }]}>{t.didNotReceive}</Text>
              <TouchableOpacity onPress={handleResend} disabled={timer > 0} accessibilityRole="button">
                <Text style={[styles.resendLink, { color: timer > 0 ? C.textHint : Colors.orange }]}>
                  {timer > 0 ? `${t.resendIn} ${timer}s` : t.resendOtp}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Verify button (shown when auto-verify doesn't fire) */}
            {!autoVerifying && (
              <TouchableOpacity
                onPress={handleVerify}
                disabled={!isComplete || isBusy}
                activeOpacity={0.85}
                style={[styles.cta, { backgroundColor: isComplete && !isBusy ? Colors.orange : (isDarkMode ? '#2A2A2A' : '#E5E7EB') }]}
                accessibilityRole="button"
                accessibilityLabel={t.verifyProceed}
                accessibilityState={{ disabled: !isComplete || isBusy }}
              >
                {isVerifying ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={[styles.ctaText, { color: isComplete && !isBusy ? '#FFFFFF' : C.textHint }]}>
                    {t.verifyProceed}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {/* Paste hint for mobile */}
            {Platform.OS !== 'web' && (
              <Text style={{ fontSize: 11, fontFamily: 'PlusJakartaSans_400Regular', color: C.textHint, textAlign: 'center', marginTop: 10 }}>
                Paste a 6-digit code to auto-fill
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  back: { padding: 16, width: 52, alignItems: 'center' },
  body: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', gap: 0 },
  iconBubble: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title: { fontSize: 26, fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 8 },
  sub:   { fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular', lineHeight: 21, marginBottom: 36 },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  otpBox: {
    width: 46, height: 56, borderRadius: 12, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  otpInput: {
    width: '100%', height: '100%', textAlign: 'center',
    fontSize: 20, fontFamily: 'PlusJakartaSans_700Bold',
  },
  errorText: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', marginBottom: 12, textAlign: 'center' },
  resendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 28 },
  resendHint:{ fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' },
  resendLink:{ fontSize: 13, fontFamily: 'PlusJakartaSans_700Bold' },
  cta: {
    height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 0.3 },
});
