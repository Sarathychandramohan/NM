import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, PanResponder, Platform, useWindowDimensions, TouchableOpacity, StyleSheet } from 'react-native';
import { Mic, Trash } from 'lucide-react-native';
import { useAppStore } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import { UI_TRANSLATIONS } from '@constants/translations';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useAudioRecorder, useAudioRecorderState, AudioModule, setAudioModeAsync, RecordingPresets } from 'expo-audio';
import * as Haptics from 'expo-haptics';

export function RecordingOverlay() {
  const { activeOverlay, setOverlay, setListening, isDarkMode, sendVoiceRecording, sendVoiceTranscript, selectedLanguage } = useAppStore();
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];
  const C = isDarkMode ? Colors.dark : Colors.light;
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  // Platform.OS doesn't include 'web' in RN types — cast to string to avoid TS2367
  const isWeb = (Platform.OS as string) === 'web';

  // ── Reanimated values for overlay entry/exit ─────────────────────────
  const overlayScale   = useSharedValue(0.96);
  const overlayOpacity = useSharedValue(0);

  // Pulse ring animation
  const pulseScale   = useSharedValue(1.0);
  const pulseOpacity = useSharedValue(0.6);

  // Swipe-up translation tracker
  const swipeY = useSharedValue(0);

  // ── BUG-F002 FIX: Pre-declare all 12 shared values individually ────────
  // useSharedValue must never be called inside Array.from callbacks or loops
  const wave0  = useSharedValue(12);
  const wave1  = useSharedValue(12);
  const wave2  = useSharedValue(12);
  const wave3  = useSharedValue(12);
  const wave4  = useSharedValue(12);
  const wave5  = useSharedValue(12);
  const wave6  = useSharedValue(12);
  const wave7  = useSharedValue(12);
  const wave8  = useSharedValue(12);
  const wave9  = useSharedValue(12);
  const wave10 = useSharedValue(12);
  const wave11 = useSharedValue(12);
  const waveSharedValues = [wave0, wave1, wave2, wave3, wave4, wave5, wave6, wave7, wave8, wave9, wave10, wave11];

  // Pre-declare all 12 animated bar styles — cannot use useAnimatedStyle inside .map()
  const barStyle0  = useAnimatedStyle(() => ({ height: wave0.value }));
  const barStyle1  = useAnimatedStyle(() => ({ height: wave1.value }));
  const barStyle2  = useAnimatedStyle(() => ({ height: wave2.value }));
  const barStyle3  = useAnimatedStyle(() => ({ height: wave3.value }));
  const barStyle4  = useAnimatedStyle(() => ({ height: wave4.value }));
  const barStyle5  = useAnimatedStyle(() => ({ height: wave5.value }));
  const barStyle6  = useAnimatedStyle(() => ({ height: wave6.value }));
  const barStyle7  = useAnimatedStyle(() => ({ height: wave7.value }));
  const barStyle8  = useAnimatedStyle(() => ({ height: wave8.value }));
  const barStyle9  = useAnimatedStyle(() => ({ height: wave9.value }));
  const barStyle10 = useAnimatedStyle(() => ({ height: wave10.value }));
  const barStyle11 = useAnimatedStyle(() => ({ height: wave11.value }));
  const barStyles = [barStyle0, barStyle1, barStyle2, barStyle3, barStyle4, barStyle5,
                     barStyle6, barStyle7, barStyle8, barStyle9, barStyle10, barStyle11];
  // ─────────────────────────────────────────────────────────────────────

  // ── BUG-F007: Real audio recording state (native + web) ─────────────
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);  // web MediaRecorder
  const chunksRef         = useRef<Blob[]>([]);                  // web audio chunks
  const wsRef             = useRef<WebSocket | null>(null);      // WS-STT connection (web)
  const chunkIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null); // WS chunk send timer
  const waveIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const [transcript, setTranscript] = useState<string>('Listening to your query…');
  // ─────────────────────────────────────────────────────────────────────────────

  const isRecording = activeOverlay === 'recording';

  // ── Start/stop real recording based on overlay visibility ─────────────
  useEffect(() => {
    if (isRecording) {
      setTranscript(t.listeningQuery || 'Listening to your query…');
      startAudioRecording();
      startVisualAnimations();
    } else {
      stopAndDiscardRecording();
      stopVisualAnimations();
    }

    return () => {
      // Cleanup on unmount
      if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
    };
  }, [isRecording]);

  const startAudioRecording = async () => {
    // ─ Web: use WebSocket STT streaming + MediaRecorder ─────────────────────
    if (isWeb) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunksRef.current = [];
        setTranscript('🎤 Listening… speak now');

        // ── Open WebSocket to backend /ws/stt ────────────────────────────
        const wsUrl = (process.env.EXPO_PUBLIC_API_URL || 'https://neethimitra-backend.onrender.com')
          .replace(/^http/, 'ws')   // http→ws, https→wss
          + '/ws/stt';
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[RecordingOverlay] WS-STT connected:', wsUrl);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.transcript) {
              setTranscript(data.transcript);
            }
            if (data.error) {
              console.warn('[RecordingOverlay] WS-STT server error:', data.error);
            }
          } catch { /* ignore malformed frames */ }
        };

        ws.onerror = (err) => {
          console.warn('[RecordingOverlay] WS-STT error:', err);
          setTranscript('Recognition error — tap Send to try anyway');
        };

        // ── Start MediaRecorder, flush chunks to WS every 3s ────────────
        const mr = new MediaRecorder(stream);
        mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        mr.start(500);  // timeslice=500ms — Sarvam docs Q1: 100-500ms optimal for real-time STT
        mediaRecorderRef.current = mr;

        // Send accumulated chunks to WS every 500ms for live transcription
        chunkIntervalRef.current = setInterval(() => {
          if (chunksRef.current.length === 0) return;
          const ws = wsRef.current;
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          chunksRef.current = [];
          blob.arrayBuffer().then((buf) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(buf);
          }).catch(() => {});
        }, 500);

      } catch {
        setTranscript('Microphone unavailable in browser');
      }
      return;
    }
    // ─ Native: use expo-audio ──────────────────────────────────────────────
    try {
      const { status } = await AudioModule.requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        if (!isWeb) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setOverlay(null);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setTranscript('Listening to your query…');
    } catch (err) {
      console.warn('RecordingOverlay: Failed to start recording:', err);
      setTranscript('Microphone unavailable');
    }
  };

  const stopAndDiscardRecording = async () => {
    // Web — stop MediaRecorder and close WebSocket cleanly
    if (isWeb) {
      if (chunkIntervalRef.current) {
        clearInterval(chunkIntervalRef.current);
        chunkIntervalRef.current = null;
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
      }
      // Close WS without sending the final signal (discard = no message sent)
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      chunksRef.current = [];
      return;
    }
    // Native
    if (recorderState.isRecording) {
      try { await audioRecorder.stop(); } catch { /* already stopped */ }
    }
    try { await setAudioModeAsync({ allowsRecording: false }); } catch {}
  };

  const startVisualAnimations = () => {
    // Overlay entry animation
    overlayScale.value = withTiming(1.0, { duration: 200, easing: Easing.out(Easing.cubic) });
    overlayOpacity.value = withTiming(1, { duration: 200 });

    // Pulse ring
    pulseScale.value   = withRepeat(withTiming(1.6, { duration: 1200, easing: Easing.out(Easing.ease) }), -1, false);
    pulseOpacity.value = withRepeat(withTiming(0,   { duration: 1200, easing: Easing.out(Easing.ease) }), -1, false);

    // BUG-F002 FIX: Animate waveform bars using setInterval + setState (JS-thread),
    // avoiding the hooks-in-map anti-pattern entirely. For a mic visualiser
    // this gives perfectly smooth 150ms updates without needing UI-thread worklets.
    waveIntervalRef.current = setInterval(() => {
      waveSharedValues.forEach((sv) => {
        sv.value = withTiming(Math.random() * 44 + 8, { duration: 130 });
      });
    }, 150);
  };

  const stopVisualAnimations = () => {
    if (waveIntervalRef.current) {
      clearInterval(waveIntervalRef.current);
      waveIntervalRef.current = null;
    }
    // Reset all values
    overlayScale.value   = 0.96;
    overlayOpacity.value = 0;
    pulseScale.value     = 1.0;
    pulseOpacity.value   = 0.6;
    waveSharedValues.forEach((sv) => { sv.value = 12; });
  };

  // ── Animated style objects ─────────────────────────────────────────────
  const animatedOverlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    transform: [{ scale: overlayScale.value }, { translateY: swipeY.value }],
  }));

  const animatedRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!isWeb) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setListening(false);
    await stopAndDiscardRecording();
    setOverlay(null);
    swipeY.value = 0;
  };

  const handleSend = async () => {
    if (!isWeb) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setListening(false);

    // ─ Web: finalize WebSocket STT and send transcript as text ─────────
    if (isWeb) {
      // Stop the chunk interval so no more audio is sent
      if (chunkIntervalRef.current) {
        clearInterval(chunkIntervalRef.current);
        chunkIntervalRef.current = null;
      }

      const ws = wsRef.current;
      const mr = mediaRecorderRef.current;

      // Collect the final captured transcript before cleanup
      // (transcript state holds the last WS message received)
      let finalTranscript = transcript;
      if (finalTranscript === '🎤 Listening… speak now' || finalTranscript === '') {
        finalTranscript = '';
      }

      const cleanupWeb = () => {
        if (mr) {
          mr.stream.getTracks().forEach((t) => t.stop());
          mediaRecorderRef.current = null;
        }
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
        chunksRef.current = [];
        setOverlay(null);
        swipeY.value = 0;
        setTranscript('Listening to your query…');
      };

      if (ws && ws.readyState === WebSocket.OPEN) {
        // Send any remaining buffered audio
        if (chunksRef.current.length > 0) {
          const remaining = new Blob(chunksRef.current, { type: 'audio/webm' });
          chunksRef.current = [];
          remaining.arrayBuffer().then((buf) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(buf);
          }).catch(() => {});
        }
        // Signal end-of-stream with empty bytes
        ws.send(new ArrayBuffer(0));
        // Wait briefly for the final transcript, then send
        setTimeout(async () => {
          const captured = transcript;
          cleanupWeb();
          if (captured && captured !== '🎤 Listening… speak now') {
            await sendVoiceTranscript(captured);
          } else if (finalTranscript) {
            await sendVoiceTranscript(finalTranscript);
          }
        }, 800);
      } else {
        // WS not open — fall back to whatever transcript was received
        cleanupWeb();
        if (finalTranscript) {
          await sendVoiceTranscript(finalTranscript);
        }
      }

      if (mr && mr.state !== 'inactive') mr.stop();
      return;
    }

    // ─ Native: stop expo-audio and send URI ───────────────────────────
    if (recorderState.isRecording) {
      try {
        await audioRecorder.stop();
        const uri = audioRecorder.uri;
        await setAudioModeAsync({ allowsRecording: false });
        setOverlay(null);
        swipeY.value = 0;
        if (uri) await sendVoiceRecording(uri);
      } catch (err) {
        console.warn('RecordingOverlay: Failed to stop/send recording:', err);
        setOverlay(null);
        swipeY.value = 0;
      }
    } else {
      setOverlay(null);
      swipeY.value = 0;
    }
  };

  // ── Swipe-up to cancel pan responder ──────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy < 0) swipeY.value = gestureState.dy;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -120) {
          handleCancel();
        } else {
          swipeY.value = withSpring(0, { damping: 20, stiffness: 250 });
        }
      },
    })
  ).current;

  if (!isRecording) return null;

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        zIndex: 50,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Animated.View
        style={[
          animatedOverlayStyle,
          {
            width: 340,
            borderRadius: 24,
            padding: 28,
            alignItems: 'center',
            backgroundColor: isDarkMode ? 'rgba(30, 30, 35, 0.85)' : 'rgba(255, 255, 255, 0.85)',
            borderWidth: 1,
            borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.45)',
            ...Platform.select({
              web: {
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              },
            }),
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 16 },
            shadowOpacity: 0.15,
            shadowRadius: 24,
            elevation: 12,
          }
        ]}
        {...(isWeb ? {} : panResponder.panHandlers)}
      >
        {isWeb ? (
          <View style={{ alignItems: 'center', width: '100%' }}>
            {/* Header */}
            <Text style={{ fontSize: 20, fontWeight: '700', color: isDarkMode ? '#F3F4F6' : '#1F2937', marginBottom: 20 }}>
              {t.voiceInput}
            </Text>

            {/* Pulse Button (Mic) */}
            <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: 16 }}>
              <Animated.View
                style={[
                  animatedRingStyle,
                  {
                    position: 'absolute',
                    width: 100,
                    height: 100,
                    borderRadius: 50,
                    borderWidth: 2,
                    borderColor: 'rgba(249, 115, 22, 0.25)',
                    backgroundColor: 'rgba(249, 115, 22, 0.12)',
                  }
                ]}
              />
              <Pressable
                onPress={handleSend}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: Colors.orange,
                  shadowColor: Colors.orange,
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.35,
                  shadowRadius: 12,
                  zIndex: 2,
                }}
              >
                <Mic size={32} color="#FFFFFF" strokeWidth={1.8} />
              </Pressable>
            </View>

            <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.orange, marginBottom: 16 }}>
              {t.listeningState}
            </Text>

            {/* Waveform visualizer */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, marginBottom: 16 }}>
              {barStyles.map((barStyle, index) => (
                <Animated.View
                  key={index}
                  style={[
                    barStyle,
                    {
                      width: 5,
                      borderRadius: 10,
                      backgroundColor: Colors.orange,
                    }
                  ]}
                />
              ))}
            </View>

            {/* Transcript — shows live WS-STT text when available */}
            <View style={{ minHeight: 56, width: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, marginBottom: 20 }}>
              {transcript && transcript !== '🎤 Listening… speak now' ? (
                <View style={{
                  backgroundColor: isDarkMode ? 'rgba(249, 115, 22, 0.12)' : 'rgba(249, 115, 22, 0.08)',
                  borderRadius: 10,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  width: '100%',
                  borderWidth: 1,
                  borderColor: 'rgba(249, 115, 22, 0.25)',
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', textAlign: 'center', color: isDarkMode ? '#FDE68A' : '#92400E', lineHeight: 19 }}>
                    {transcript}
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: 14, fontWeight: '500', textAlign: 'center', color: isDarkMode ? '#9CA3AF' : '#6B7280', lineHeight: 20, fontStyle: 'italic' }}>
                  {transcript}
                </Text>
              )}
            </View>

            {/* Web Action Buttons: OK/Send & Cancel */}
            <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
              <TouchableOpacity
                onPress={handleCancel}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: isDarkMode ? '#D1D5DB' : '#4B5563' }}>
                  {t.cancel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSend}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: Colors.orange,
                  alignItems: 'center',
                  shadowColor: Colors.orange,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 6,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                  {t.send}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          // ── MOBILE NATIVE OVERLAY — glassmorphic bottom-card style ──────────────
          <View style={overlayStyles.mobileCard}>
            {/* Swipe hint */}
            <View style={overlayStyles.swipeHint}>
              <View style={overlayStyles.swipeBar} />
            </View>

            {/* Header row */}
            <View style={overlayStyles.mobileHeaderRow}>
              <Text style={[overlayStyles.mobileTitle, { color: isDarkMode ? '#F9FAFB' : '#111827' }]}>
                {t.voiceInput}
              </Text>
              <TouchableOpacity onPress={handleCancel} style={overlayStyles.mobileCancelIcon} activeOpacity={0.7}>
                <Text style={{ fontSize: 20, color: isDarkMode ? '#9CA3AF' : '#6B7280' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Pulse Button */}
            <View style={overlayStyles.pulseContainer}>
              <Animated.View
                style={[animatedRingStyle, overlayStyles.pulseRingOuter]}
              />
              <Animated.View
                style={[animatedRingStyle, overlayStyles.pulseRingInner]}
              />
              <Pressable
                onPress={handleSend}
                style={overlayStyles.micButton}
              >
                <Mic size={38} color="#FFFFFF" strokeWidth={1.8} />
              </Pressable>
            </View>

            {/* Listening label */}
            <Text style={[overlayStyles.listeningLabel, { color: Colors.orange }]}>
              {t.listeningState}
            </Text>

            {/* Waveform */}
            <View style={overlayStyles.waveRow}>
              {barStyles.map((barStyle, index) => (
                <Animated.View
                  key={index}
                  style={[barStyle, overlayStyles.waveBar]}
                />
              ))}
            </View>

            {/* Transcript */}
            <View style={overlayStyles.transcriptWrap}>
              <Text style={[overlayStyles.transcriptText, { color: isDarkMode ? '#D1D5DB' : '#4B5563' }]}>
                {transcript}
              </Text>
            </View>

            {/* Action buttons */}
            <View style={overlayStyles.actionRow}>
              <TouchableOpacity
                onPress={handleCancel}
                style={[overlayStyles.cancelBtn, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                activeOpacity={0.75}
              >
                <Text style={[overlayStyles.cancelBtnText, { color: isDarkMode ? '#D1D5DB' : '#4B5563' }]}>
                  {t.cancel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSend}
                style={overlayStyles.sendBtn}
                activeOpacity={0.85}
              >
                <Text style={overlayStyles.sendBtnText}>{t.send}</Text>
              </TouchableOpacity>
            </View>

            {/* Swipe hint text */}
            <Text style={[overlayStyles.swipeHintText, { color: isDarkMode ? '#6B7280' : '#9CA3AF' }]}>
              {t.swipeUp}
            </Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const overlayStyles = StyleSheet.create({
  mobileCard: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 8,
  },
  swipeHint: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  swipeBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(156,163,175,0.5)',
  },
  mobileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  mobileTitle: {
    fontSize: 20,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  mobileCancelIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(156,163,175,0.15)',
  },
  pulseContainer: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 16,
  },
  pulseRingOuter: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(249,115,22,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(249,115,22,0.20)',
  },
  pulseRingInner: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(249,115,22,0.08)',
  },
  micButton: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#EA580C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.40,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  listeningLabel: {
    fontSize: 22,
    fontFamily: 'PlusJakartaSans_700Bold',
    marginBottom: 16,
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 60,
    marginBottom: 14,
  },
  waveBar: {
    width: 5,
    borderRadius: 10,
    backgroundColor: '#EA580C',
  },
  transcriptWrap: {
    minHeight: 52,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginBottom: 24,
  },
  transcriptText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    marginBottom: 14,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  sendBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#EA580C',
    alignItems: 'center',
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 8,
    elevation: 6,
  },
  sendBtnText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
  swipeHintText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_400Regular',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});
