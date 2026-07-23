import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, KeyboardAvoidingView, Platform, Animated,
  Alert, ScrollView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { AudioPlayerModal } from '@/components/overlays/AudioPlayerModal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '@constants/colors';
import { useAppStore, CATEGORIES, Message, getTextScale } from '@store/useAppStore';
import { UI_TRANSLATIONS } from '@constants/translations';
import { LinearGradient } from 'expo-linear-gradient';
import { ChatHistorySidebar } from '@/components/ui/ChatHistorySidebar';
import { WebAppShell } from '@/components/web/WebAppShell';
import { DocumentUpload } from '@/components/overlays/DocumentUpload';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft, Camera, FolderOpen, FileText,
  Home, Briefcase, Heart, User, Scale, ShieldAlert,
  Send, Mic, Keyboard as KeyboardIcon, Volume2, Phone,
  CheckCircle, ChevronRight, History, MessageSquare,
} from 'lucide-react-native';
import AnimatedR, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { safeImpact } from '@/utils/haptics';
import * as Haptics from 'expo-haptics';

function getImageMimeType(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const filename = asset.fileName || asset.uri;
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'image/jpeg';
}

const CATEGORY_ICONS: Record<string, { Icon: any; color: string }> = {
  land:   { Icon: Home,        color: '#78350F' },
  police: { Icon: Briefcase,   color: '#1E3A5F' },
  cyber:  { Icon: ShieldAlert, color: '#1D4ED8' },
  health: { Icon: Heart,       color: '#134E4A' },
  family: { Icon: User,        color: '#5C1A3A' },
  rti:    { Icon: Scale,       color: '#EA580C' },
  general:{ Icon: MessageSquare, color: '#0369A1' },
};

const HELPLINE_MAP: Record<string, string> = {
  cyber: '1930', family: '1091', health: '104',
  police: '100', land: '1800115565', rti: '1800110001',
};

const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  consumer: [
    "Amazon/Flipkart is refusing my product refund.",
    "I bought a phone with 1-year warranty but seller won't repair it.",
    "I received a fake product. How to claim my money back?",
  ],
  cybercrime: [
    "I shared an OTP and lost money from my bank account.",
    "Someone is blackmailing me online. What should I do?",
    "I got a fake electricity bill SMS containing a malicious link.",
  ],
  land: [
    "My neighbor encroached on my agricultural boundary.",
    "What documents are needed to verify land ownership (Patta)?",
    "How to register a land partition deed among family members?",
  ],
  labor: [
    "My employer terminated me without paying my last month salary.",
    "I have not received my minimum wage compensation.",
    "Is it legal to terminate a contract without notice period?",
  ],
  women_dv: [
    "How do I seek a protection order against domestic violence?",
    "Where is the nearest One Stop Centre for women assistance?",
    "What is the procedure to file a harassment complaint?",
  ],
  senior: [
    "My children took my property and are now neglecting me.",
    "How to apply for maintenance under the Senior Citizens Act?",
    "What government helplines are active for elder abuse?",
  ],
  general: [
    "How do I file a general Right to Information (RTI) query?",
    "Where do I file a grievance against a government department?",
    "How do I obtain legal aid if I cannot afford a lawyer?",
  ],
};

// ─── Custom Message Bubble with Translation Toggle ─────────────────────────
function MessageBubble({
  item,
  isDarkMode,
  C,
  scale,
  t,
  playResponseAudio,
  loadingAudioId,
  systemLangCode,
}: {
  item: Message;
  isDarkMode: boolean;
  C: any;
  scale: number;
  t: any;
  playResponseAudio: (messageId: string, uri?: string, messageText?: string) => void;
  loadingAudioId: string | null;
  systemLangCode: string;
}) {
  const isUser = item.role === 'user';
  const [showTranslation, setShowTranslation] = useState(false);

  // ── Translation logic ────────────────────────────────────────────────────
  // item.text             = the text in the session's regional language (may be English
  //                         if the user chose en-IN)
  // item.englishTranslation = always the English version
  //
  // Rule:
  //  - If system lang != en-IN: primary = regional, translation = English
  //  - If system lang == en-IN: primary = English (item.text), no translate button
  //    (response is already in English — nothing to translate to)
  //  - For USER messages: translate button shows English equivalent of what they typed
  //    (useful when they type in a regional language and want to confirm the English)

  const isEnglishSession = systemLangCode === 'en-IN';

  // What to show in the translation panel when expanded
  // Backend stores: text_content = regional text, english_translation = English text
  // Translate button toggles between them
  const translationText = item.englishTranslation ?? '';

  // Show translate button only when:
  // 1. There IS a translation (not empty)
  // 2. Session is not already in English (nothing to translate to/from)
  // 3. Translation text DIFFERS from primary text (avoids duplicate display when user typed in English)
  const hasTranslation = (
    !!translationText &&
    !isEnglishSession &&
    translationText.trim() !== item.text.trim()
  );

  // Button label: shows the direction (original = regional language)
  const translateLabel = showTranslation ? 'Show Original' : '⇄ English';

  return (
    <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAI]}>
      {/* AI avatar dot */}
      {!isUser && (
        <View style={[styles.aiDot, { backgroundColor: isDarkMode ? '#1E1E23' : '#F3F4F6', borderColor: C.surfaceBorder }]}>
          <Scale size={13} color={Colors.orange} strokeWidth={2} />
        </View>
      )}
      {isUser ? (
        <LinearGradient
          colors={Colors.gradients.primary as any}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[
            styles.bubble,
            { borderBottomRightRadius: 4 }
          ]}
        >
          {item.isVoice && (
            <View style={styles.voiceTag}>
              <Mic size={10} color="#FFF" strokeWidth={2.5} />
              <Text style={[styles.voiceTagText, { fontSize: 10 * scale }]}>{t.voice}</Text>
            </View>
          )}

          {/* Primary text — always shown */}
          <Text style={[styles.bubbleText, { color: '#FFFFFF', fontSize: 14 * scale }]}>
            {item.text}
          </Text>

          {/* Translation panel — same weight/color, just separated by divider */}
          {showTranslation && hasTranslation && (
            <View style={{ gap: 6, marginTop: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 2 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.25)' }} />
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>English</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.25)' }} />
              </View>
              {/* Plain text — no italic, full white, same weight */}
              <Text style={[styles.bubbleText, { color: '#FFFFFF', fontSize: 14 * scale }]}>
                {translationText}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 10 }}>
            {/* Translate trigger button */}
            {hasTranslation && (
              <TouchableOpacity
                onPress={() => setShowTranslation(!showTranslation)}
                style={[
                  styles.translateBtn,
                  {
                    borderColor: 'rgba(255,255,255,0.35)',
                    backgroundColor: showTranslation ? 'rgba(255,255,255,0.15)' : 'transparent',
                  }
                ]}
                activeOpacity={0.7}
              >
                <Text style={[styles.translateBtnText, { color: '#FFFFFF', fontSize: 11 * scale }]}>
                  {translateLabel}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>
      ) : (
        <View style={[
          styles.bubble,
          {
            backgroundColor: isDarkMode ? Colors.aiBubbleDark : Colors.aiBubbleLight,
            borderWidth: 1, borderColor: C.surfaceBorder, borderBottomLeftRadius: 4
          },
        ]}>
          {/* Primary text — always shown */}
          <Text style={[styles.bubbleText, { color: C.text, fontSize: 14 * scale }]}>
            {item.text}
          </Text>

          {/* ── Structured Legal Insights (Priority P1 Enhancement) ──────── */}
          {item.insights && (
            <View style={{ marginTop: 10, gap: 8 }}>
              {/* Relevant Laws Chips */}
              {item.insights.relevant_laws && item.insights.relevant_laws.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {item.insights.relevant_laws.map((law, lIdx) => (
                    <View
                      key={lIdx}
                      style={{
                        backgroundColor: isDarkMode ? '#1F2937' : '#EFF6FF',
                        borderColor: '#3B82F6',
                        borderWidth: 1,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 12,
                      }}
                    >
                      <Text style={{ fontSize: 10 * scale, color: '#2563EB', fontFamily: 'PlusJakartaSans_600SemiBold' }}>
                        ⚖ {law}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Next Steps Action Cards */}
              {item.insights.next_steps && item.insights.next_steps.length > 0 && (
                <View style={{
                  backgroundColor: isDarkMode ? '#1E1E23' : '#FFF7ED',
                  borderColor: Colors.orange + '40',
                  borderWidth: 1,
                  borderRadius: 12,
                  padding: 10,
                  gap: 6,
                }}>
                  <Text style={{ fontSize: 11 * scale, fontFamily: 'PlusJakartaSans_700Bold', color: Colors.orange }}>
                    📋 Recommended Next Actions:
                  </Text>
                  {item.insights.next_steps.map((step, sIdx) => (
                    <Text key={sIdx} style={{ fontSize: 12 * scale, color: C.text, fontFamily: 'PlusJakartaSans_500Medium', lineHeight: 17 }}>
                      • {step}
                    </Text>
                  ))}
                </View>
              )}

              {/* Legal Basis Callout */}
              {item.insights.legal_basis && (
                <View style={{
                  backgroundColor: isDarkMode ? '#142018' : '#F0FDF4',
                  borderColor: '#16A34A40',
                  borderWidth: 1,
                  borderRadius: 10,
                  padding: 8,
                }}>
                  <Text style={{ fontSize: 11 * scale, color: '#16A34A', fontFamily: 'PlusJakartaSans_600SemiBold', lineHeight: 16 }}>
                    💡 Legal Basis: {item.insights.legal_basis}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Translation panel — plain text, same color as primary, no italic */}
          {showTranslation && hasTranslation && (
            <View style={{ gap: 6, marginTop: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 2 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: C.surfaceBorder }} />
                <Text style={{ fontSize: 12, color: Colors.orange }}>English</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: C.surfaceBorder }} />
              </View>
              {/* Plain text — same color/weight as original, no italic */}
              <Text style={[styles.bubbleText, { color: C.text, fontSize: 14 * scale }]}>
                {translationText}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 10 }}>
            {/* Translate trigger button */}
            {hasTranslation && (
              <TouchableOpacity
                onPress={() => setShowTranslation(!showTranslation)}
                style={[
                  styles.translateBtn,
                  {
                    borderColor: Colors.orange + '40',
                    backgroundColor: showTranslation ? Colors.orange + '20' : 'transparent',
                  }
                ]}
                activeOpacity={0.7}
              >
                <Text style={[styles.translateBtnText, { color: Colors.orange, fontSize: 11 * scale }]}>
                  {translateLabel}
                </Text>
              </TouchableOpacity>
            )}

            {/* Voice speak helper */}
            <TouchableOpacity
              onPress={() => playResponseAudio(item.id, item.audioUri, item.text)}
              style={[styles.speakBtn, { borderColor: Colors.orange + '40', marginTop: 0 }]}
              disabled={loadingAudioId === item.id}
            >
              <Volume2 size={12} color={Colors.orange} strokeWidth={2} />
              <Text style={[styles.speakBtnText, { color: Colors.orange, fontSize: 11 * scale }]}>
                {loadingAudioId === item.id ? 'Generating...' : (item.audioUri ? '▶ Play' : 'Speak')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { category: categoryParam, initialQuery } = useLocalSearchParams<{ category?: string; initialQuery?: string }>();

  const {
    isDarkMode, activeSession, sendMessageToBackend,
    setOverlay, isProcessing, selectedLanguage, generateComplaint, startSession,
    textSize, isAnonymousGuest, guestQueriesRemaining, decrementQueries, uploadDocument,
    generateMessageAudio, authToken,
  } = useAppStore();

  const C = isDarkMode ? Colors.dark : Colors.light;
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];
  const scale = getTextScale(textSize);
  const flatListRef  = useRef<FlatList>(null);
  const [inputText, setInputText]       = useState('');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [showHistory, setShowHistory]   = useState(false);
  // Audio player modal state
  const [audioModal, setAudioModal] = useState<{ visible: boolean; uri: string | null; title?: string }>(
    { visible: false, uri: null, title: undefined }
  );
  const isWeb = Platform.OS === 'web';
  const typingDots = useRef(new Animated.Value(0)).current;

  // Standard Animated values to bypass Reanimated web crashes
  const pdfBannerY = useRef(new Animated.Value(120)).current;
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const pulseScale = useRef(new Animated.Value(1.0)).current;
  const pulseOpacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    const animatePulse = () => {
      pulseScale.setValue(1.0);
      pulseOpacity.setValue(0.5);
      anim = Animated.parallel([
        Animated.timing(pulseScale, {
          toValue: 1.65,
          duration: 1400,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseOpacity, {
          toValue: 0.0,
          duration: 1400,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]);
      anim.start(() => {
        animatePulse();
      });
    };
    animatePulse();
    return () => {
      if (anim) anim.stop();
    };
  }, []);

  const category   = CATEGORIES.find((c) => c.id === (categoryParam || activeSession?.categoryId)) || CATEGORIES[0];
  const iconInfo   = CATEGORY_ICONS[category.id] ?? { Icon: Scale, color: Colors.orange };
  const CatIcon    = iconInfo.Icon;

  const hasSentInitialQuery = useRef(false);

  // BUG-F024 FIX: Only start a new session if there is no active session OR
  // the active session is for a different category AND was not just loaded from history.
  // This prevents ChatHistory navigation from being overwritten immediately.
  useEffect(() => {
    const s = useAppStore.getState();
    const alreadyLoaded =
      s.activeSession &&
      s.activeSession.categoryId === category.id &&
      s.activeSession.messages.length > 0;
    if (!alreadyLoaded) {
      startSession(category);
    }
  }, [category.id]);

  // Submit initial query when the session is ready
  useEffect(() => {
    if (initialQuery && !hasSentInitialQuery.current && activeSession && activeSession.categoryId === category.id) {
      hasSentInitialQuery.current = true;
      setTimeout(() => {
        sendMessage(initialQuery);
      }, 200);
    }
  }, [initialQuery, activeSession?.id, category.id]);

  // Typing indicator animation
  useEffect(() => {
    if (isProcessing) {
      Animated.loop(Animated.sequence([
        Animated.timing(typingDots, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(typingDots, { toValue: 0, duration: 450, useNativeDriver: true }),
      ])).start();
    } else {
      typingDots.stopAnimation();
    }
  }, [isProcessing]);

  // PDF banner spring
  useEffect(() => {
    if (pdfUrl) {
      Animated.spring(pdfBannerY, {
        toValue: 0,
        damping: 18,
        stiffness: 200,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    } else {
      Animated.timing(pdfBannerY, {
        toValue: 120,
        duration: 180,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
  }, [pdfUrl]);

  const sendMessage = async (text: string, isVoice = false) => {
    if (!text.trim()) return;

    // Guest limit gate: block on 0 remaining queries and show login prompt
    if (isAnonymousGuest && guestQueriesRemaining <= 0) {
      setOverlay('login_prompt');
      return;
    }

    setInputText('');
    await sendMessageToBackend(text.trim(), isVoice);

    // Decrement guest query counter AFTER the message is sent
    if (isAnonymousGuest) {
      await decrementQueries();
    }

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 250);
  };

  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);

  const openAudioPlayer = async (messageId: string, audioUri?: string, messageText?: string) => {
    safeImpact(Haptics.ImpactFeedbackStyle.Medium);
    let targetUri = audioUri;

    if (!targetUri) {
      // No cached audio — generate via backend /speak endpoint
      setLoadingAudioId(messageId);
      try {
        const generated = await generateMessageAudio(messageId);
        targetUri = generated ?? undefined;
      } catch {
        setLoadingAudioId(null);
        showAlert('Audio Error', 'Failed to generate audio. Please try again.');
        return;
      }
      setLoadingAudioId(null);
    }

    if (!targetUri) {
      showAlert('Audio Error', 'No audio available for this message.');
      return;
    }

    // On web: use native <audio> element (expo-audio doesn't work on web)
    if (Platform.OS === 'web') {
      try {
        const a = new (window as any).Audio(targetUri);
        a.play();
      } catch { /* silent */ }
      return;
    }

    // On native: open full player modal
    setAudioModal({ visible: true, uri: targetUri, title: messageText?.slice(0, 80) });
  };

  // Alias for backward compat with MessageBubble prop name
  const playResponseAudio = openAudioPlayer;


  const showAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  const openProtectedPdf = async () => {
    if (!pdfUrl) return;
    if (Platform.OS !== 'web') {
      // On native, open in the in-app browser — works for all Android/iOS
      // even when no dedicated PDF app is installed (unlike Linking.openURL)
      try {
        await WebBrowser.openBrowserAsync(pdfUrl);
      } catch {
        // fallback: direct Linking if WebBrowser is somehow unavailable
        const { Linking } = await import('react-native');
        Linking.openURL(pdfUrl);
      }
      return;
    }
    // On web: fetch with auth token and open as blob URL
    try {
      const response = await fetch(pdfUrl, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      });
      if (!response.ok) throw new Error(`PDF fetch failed: ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch {
      showAlert(t.draftingError, 'Unable to open the PDF. Please sign in again and retry.');
    }
  };

  // ── File / Camera handlers (wired to DocumentUpload overlay) ──────────────
  const handlePickDocument = async () => {
    if (isAnonymousGuest) { setOverlay('login_prompt'); return; }
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.length) {
        const a = result.assets[0];
        await uploadDocument(a.uri, a.name, a.mimeType || 'Document');
        setOverlay('success');
      }
    } catch { setOverlay('error'); }
  };

  const handlePickImage = async () => {
    if (isAnonymousGuest) { setOverlay('login_prompt'); return; }
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { showAlert(t.permissionDenied, t.galleryAccessRequired); return; }
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets?.length) {
        const a = result.assets[0];
        await uploadDocument(a.uri, a.fileName ?? `image_${Date.now()}.jpg`, getImageMimeType(a));
        setOverlay('success');
      }
    } catch { setOverlay('error'); }
  };

  const handleCaptureImage = async () => {
    if (isAnonymousGuest) { setOverlay('login_prompt'); return; }
    try {
      // On web, camera capture isn't supported — fall back to gallery/file picker
      if (Platform.OS === 'web') {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
        if (!result.canceled && result.assets?.length) {
          const a = result.assets[0];
          await uploadDocument(a.uri, a.fileName ?? `image_${Date.now()}.jpg`, getImageMimeType(a));
          setOverlay('success');
        }
        return;
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { showAlert(t.permissionDenied, t.cameraAccessRequired); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets?.length) {
        const a = result.assets[0];
        await uploadDocument(a.uri, a.fileName ?? `capture_${Date.now()}.jpg`, getImageMimeType(a));
        setOverlay('success');
      }
    } catch { setOverlay('error'); }
  };


  const handleActionChip = async (action: string) => {
    safeImpact(Haptics.ImpactFeedbackStyle.Medium);
    if (action === 'complaint') {
      const url = await generateComplaint();
      if (url) { setPdfUrl(url); setOverlay('success'); }
      else showAlert(t.draftingError, t.describeIssue);
    } else if (action === 'helpline') {
      // tel: links need Linking — WebBrowser doesn't handle phone calls
      const { Linking } = require('react-native');
      Linking.openURL(`tel:${HELPLINE_MAP[category.id] ?? '112'}`);
    } else if (action === 'upload') {
      setOverlay('upload');
    }
  };

  const messages = activeSession?.messages ?? [];

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    return (
      <MessageBubble
        item={item}
        isDarkMode={isDarkMode}
        C={C}
        scale={scale}
        t={t}
        playResponseAudio={playResponseAudio}
        loadingAudioId={loadingAudioId}
        systemLangCode={selectedLanguage.code}
      />
    );
  }, [isDarkMode, C, scale, t, loadingAudioId, selectedLanguage.code]);



  const chatContent = (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]} edges={isWeb ? ['bottom'] : ['bottom', 'top']}>
      {/* ── Header — hidden on web (WebAppShell provides its own header) ── */}
      {!isWeb && (
      <View style={[styles.header, {
        backgroundColor: isDarkMode ? '#0F0F12' : '#FFFFFF',
        borderBottomColor: C.surfaceBorder,
      }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={22} color={C.text} strokeWidth={1.8} />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <View style={[styles.catIconWrap, { backgroundColor: isDarkMode ? '#1E1E23' : '#F3F4F6' }]}>
            <CatIcon size={16} color={iconInfo.color} strokeWidth={1.8} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: C.text, fontSize: 16 * scale }]} adjustsFontSizeToFit={true} minimumFontScale={0.8} numberOfLines={1}>{t[category.id] ?? category.label}</Text>
            <Text style={[styles.headerSub, { color: C.textSecondary, fontSize: 11 * scale }]}>
              {selectedLanguage.name}
            </Text>
          </View>
        </View>
      </View>
      )}

      {/* ── Main layout: chat ────────────────────────────────────────── */}
      <View style={styles.mainRow}>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          {/* ── Messages ─────────────────────────────────────────────────── */}

        {messages.length === 0 ? (
          <ScrollView contentContainerStyle={styles.emptyScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: isDarkMode ? '#1E1E23' : '#F3F4F6' }]}>
                <CatIcon size={36} color={iconInfo.color} strokeWidth={1.5} />
              </View>
              <Text style={[styles.emptyTitle, { color: C.text, fontSize: 20 * scale }]}>{t.emptyTitle}</Text>
              <Text style={[styles.emptyHint, { color: C.textSecondary, fontSize: 13 * scale, marginBottom: 24 }]}>
                {t.emptyHint}
              </Text>

              {/* Suggestion Chips */}
              <View style={styles.suggestionsContainer}>
                {(CATEGORY_SUGGESTIONS[category.id] || CATEGORY_SUGGESTIONS['general']).map((suggestion, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => {
                      setInputText(suggestion);
                      sendMessage(suggestion);
                    }}
                    style={[
                      styles.suggestionCard,
                      {
                        backgroundColor: isDarkMode ? '#1E1E23' : '#FFFFFF',
                        borderColor: isDarkMode ? '#2D2D35' : '#E5E7EB',
                        shadowColor: isDarkMode ? '#000000' : '#D1D5DB',
                      }
                    ]}
                    activeOpacity={0.8}
                  >
                    <MessageSquare size={13} color={Colors.orange} strokeWidth={2} />
                    <Text style={[styles.suggestionText, { color: C.text, fontSize: 12 * scale }]} numberOfLines={2}>
                      {suggestion}
                    </Text>
                    <ChevronRight size={14} color={C.textSecondary} strokeWidth={1.8} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.msgList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* ── Typing indicator ─────────────────────────────────────────── */}
        {isProcessing && (
          <View style={styles.typingRow}>
            <View style={[styles.typingBubble, {
              backgroundColor: isDarkMode ? Colors.aiBubbleDark : Colors.aiBubbleLight,
              borderColor: C.surfaceBorder,
            }]}>
              <Animated.Text style={[styles.typingDots, { opacity: typingDots, color: C.textSecondary }]}>
                ● ● ●
              </Animated.Text>
            </View>
          </View>
        )}

        {/* ── Action chips ─────────────────────────────────────────────── */}
        {messages.length > 0 && !isProcessing && (
          <View style={styles.chipsRow}>
            {[
              { label: t.draftComplaint,  action: 'complaint', Icon: FileText },
              { label: t.helpline,   action: 'helpline',  Icon: Phone    },
              { label: t.uploadDoc, action: 'upload',    Icon: FolderOpen},
            ].map((chip) => (
              <TouchableOpacity
                key={chip.action}
                onPress={() => handleActionChip(chip.action)}
                style={[styles.chip, {
                  backgroundColor: isDarkMode ? '#1E1E23' : '#FFF7ED',
                  borderColor:     Colors.orange + '60',
                }]}
                activeOpacity={0.75}
              >
                <chip.Icon size={11} color={Colors.orange} strokeWidth={2} />
                <Text style={[styles.chipText, { fontSize: 11 * scale }]} adjustsFontSizeToFit={true} minimumFontScale={0.8} numberOfLines={1}>{chip.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── PDF banner ───────────────────────────────────────────────── */}
        {pdfUrl && (
          <Animated.View style={[styles.pdfBanner, { transform: [{ translateY: pdfBannerY }] }]}>
            <CheckCircle size={18} color="#FFFFFF" strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.pdfTitle, { fontSize: 13 * scale }]}>{t.pdfReady}</Text>
              <Text style={[styles.pdfSub, { fontSize: 11 * scale }]}>{t.pdfSub}</Text>
            </View>
            <TouchableOpacity
              onPress={openProtectedPdf}
              style={styles.pdfBtn}
            >
              <Text style={[styles.pdfBtnText, { fontSize: 12 * scale }]}>{t.open}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Input bar ────────────────────────────────────────────────── */}
        <View style={[styles.inputBar, {
          backgroundColor: isDarkMode ? '#111114' : '#FFFFFF',
          borderColor: isDarkMode ? '#2D2D35' : '#E5E7EB',
        }]}>
          {/* Camera / attach */}
          <TouchableOpacity style={styles.inputIconBtn} onPress={() => setOverlay('upload')}>
            <Camera size={20} color={C.textSecondary} strokeWidth={1.6} />
          </TouchableOpacity>

          {/* Text input (always visible) */}
          <TextInput
            style={[styles.textInput, {
              backgroundColor: isDarkMode ? '#1E1E23' : '#F3F4F6',
              color: C.text,
              fontSize: 14 * scale,
            }]}
            placeholder={t.typeQuestion}
            placeholderTextColor={C.textHint}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={() => sendMessage(inputText)}
            returnKeyType="send"
            multiline
            maxLength={1000}
          />

          {/* Keyboard / mic toggle */}
          <TouchableOpacity
            style={styles.inputIconBtn}
            onPress={() => {
              if (showKeyboard) {
                setShowKeyboard(false);
                setOverlay('recording');
              } else {
                setShowKeyboard(true);
              }
            }}
          >
            {showKeyboard
              ? <Mic         size={20} color={C.textSecondary} strokeWidth={1.6} />
              : <KeyboardIcon size={20} color={C.textSecondary} strokeWidth={1.6} />
            }
          </TouchableOpacity>

          {/* Send button */}
          {inputText.trim().length > 0 ? (
            <TouchableOpacity
              onPress={() => sendMessage(inputText)}
              style={[styles.sendBtn, { backgroundColor: Colors.orange }]}
              activeOpacity={0.85}
            >
              <Send size={16} color="#FFFFFF" strokeWidth={2} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 44, height: 44, position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View
                style={[
                  {
                    transform: [{ scale: pulseScale }],
                    opacity: pulseOpacity,
                    position: 'absolute',
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: 'rgba(234, 88, 12, 0.25)',
                    borderWidth: 1,
                    borderColor: 'rgba(234, 88, 12, 0.3)',
                    zIndex: 0,
                  },
                ]}
              />
              <TouchableOpacity
                onPress={() => { safeImpact(Haptics.ImpactFeedbackStyle.Medium); setOverlay('recording'); }}
                activeOpacity={0.85}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1,
                }}
              >
                <LinearGradient
                  colors={Colors.gradients.primary as any}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{
                    ...StyleSheet.absoluteFillObject,
                    borderRadius: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Mic size={18} color="#FFFFFF" strokeWidth={2} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </View>
        </KeyboardAvoidingView>
      </View>

      {/* ── Document / image upload overlay ─────────────────────── */}
      <DocumentUpload
        onCaptureImage={handleCaptureImage}
        onPickImage={handlePickImage}
        onPickDocument={handlePickDocument}
      />

      {/* ── Audio player modal — opens when user taps Speak ────────── */}
      {!isWeb && (
        <AudioPlayerModal
          visible={audioModal.visible}
          audioUri={audioModal.uri}
          title={audioModal.title}
          isDarkMode={isDarkMode}
          onClose={() => setAudioModal({ visible: false, uri: null, title: undefined })}
        />
      )}
    </SafeAreaView>
  );

  if (isWeb) {
    return <WebAppShell>{chatContent}</WebAppShell>;
  }
  return chatContent;
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
    paddingVertical: 12, borderBottomWidth: 1, gap: 10,
  },
  backBtn:     { padding: 4, borderRadius: 20 },
  headerInfo:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  catIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold' },
  headerSub:   { fontSize: 11, fontFamily: 'PlusJakartaSans_400Regular', marginTop: 1 },
  historyBtn:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  // Main row (chat + optional web sidebar)
  mainRow:           { flex: 1, flexDirection: 'row' },
  mainRowWithSidebar: { flex: 1, flexDirection: 'row' },

  // Empty state
  emptyScroll: { flexGrow: 1, justifyContent: 'center' },
  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, paddingVertical: 40 },
  emptyIcon:  { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 20, fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 8 },
  emptyHint:  { fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular', textAlign: 'center', lineHeight: 22 },

  // Suggestions
  suggestionsContainer: { width: '100%', gap: 12, marginTop: 12 },
  suggestionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16,
    borderWidth: 1, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 1
  },
  suggestionText: {
    flex: 1, fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13, lineHeight: 18
  },

  // Messages
  msgList:    { paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  msgRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAI:   { justifyContent: 'flex-start' },
  aiDot:      { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 2 },
  bubble:     { maxWidth: '78%', borderRadius: 16, padding: 12 },
  voiceTag:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 },
  voiceTagText:{ fontSize: 10, fontFamily: 'PlusJakartaSans_600SemiBold', color: 'rgba(255,255,255,0.85)' },
  bubbleText: { fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular', lineHeight: 21 },
  speakBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  speakBtnText:{ fontSize: 11, fontFamily: 'PlusJakartaSans_600SemiBold' },
  translateBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  translateBtnText: { fontSize: 11, fontFamily: 'PlusJakartaSans_600SemiBold' },

  // Typing
  typingRow:    { flexDirection: 'row', paddingHorizontal: 14, marginBottom: 6 },
  typingBubble: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  typingDots:   { fontSize: 12, letterSpacing: 3, fontFamily: 'PlusJakartaSans_400Regular' },

  // Chips
  chipsRow: { flexDirection: 'row', paddingHorizontal: 14, paddingBottom: 8, gap: 8 },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold', color: '#EA580C' },

  // PDF banner
  pdfBanner: {
    marginHorizontal: 14, marginBottom: 8, backgroundColor: '#16A34A',
    borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  pdfTitle:   { color: '#FFFFFF', fontSize: 13, fontFamily: 'PlusJakartaSans_700Bold' },
  pdfSub:     { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontFamily: 'PlusJakartaSans_400Regular' },
  pdfBtn:     { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  pdfBtnText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'PlusJakartaSans_700Bold' },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8,
    paddingVertical: 8, borderRadius: 28, gap: 4,
    marginHorizontal: 14, marginBottom: Platform.OS === 'ios' ? 8 : 16,
    borderWidth: 1,
  },
  inputIconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  textInput: {
    flex: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular', maxHeight: 100, lineHeight: 20,
  },
  sendBtn:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  micGrad:  { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
});
