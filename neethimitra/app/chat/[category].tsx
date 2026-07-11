import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, KeyboardAvoidingView, Platform, Animated,
  Linking, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '@constants/colors';
import { useAppStore, CATEGORIES, Message, getTextScale } from '@store/useAppStore';
import { useAudioPlayer } from 'expo-audio';
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
import { safeImpact, safeNotification } from '@/utils/haptics';
import * as Haptics from 'expo-haptics';


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
  land: [
    "My neighbor encroached on my agricultural boundary.",
    "What documents are needed to verify land ownership (Patta)?",
    "How to register a land partition deed among family members?",
  ],
  police: [
    "How do I file an FIR at the police station?",
    "The police are refusing to register my complaint. What can I do?",
    "What are my rights if I am arrested?",
  ],
  cyber: [
    "I shared an OTP and lost money from my bank account.",
    "Someone is blackmailing me online. What should I do?",
    "I got a fake electricity bill SMS containing a malicious link.",
  ],
  health: [
    "A hospital is refusing to treat me without advance payment.",
    "How do I file a complaint against a doctor for negligence?",
    "My insurance claim was rejected unfairly. What are my options?",
  ],
  family: [
    "How do I seek a protection order against domestic violence?",
    "Where is the nearest One Stop Centre for women assistance?",
    "What is the procedure to file a harassment complaint?",
  ],
  rti: [
    "How do I file a general Right to Information (RTI) query?",
    "Where do I file a grievance against a government department?",
    "How do I obtain legal aid if I cannot afford a lawyer?",
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
}: {
  item: Message;
  isDarkMode: boolean;
  C: any;
  scale: number;
  t: any;
  playResponseAudio: (messageId: string, uri?: string) => void;
  loadingAudioId: string | null;
}) {
  const isUser = item.role === 'user';
  const [showTranslation, setShowTranslation] = useState(false);
  const hasTranslation = !!item.englishTranslation;

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

          {!showTranslation ? (
            <Text style={[styles.bubbleText, { color: '#FFFFFF', fontSize: 14 * scale }]}>
              {item.text}
            </Text>
          ) : (
            <View style={{ gap: 6 }}>
              {/* Original regional content */}
              <Text style={[styles.bubbleText, { color: '#FFFFFF', fontSize: 14 * scale }]}>
                {item.text}
              </Text>
              {/* ⇄ Divider line */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 2 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.25)' }} />
                <Text style={{ fontSize: 13, color: '#FFFFFF' }}>⇄</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.25)' }} />
              </View>
              {/* English translation */}
              <Text style={[styles.bubbleText, { color: 'rgba(255,255,255,0.85)', fontSize: 14 * scale, fontStyle: 'italic' }]}>
                {item.englishTranslation || '(No translation available)'}
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
                  ⇄ {showTranslation ? 'Show Original' : 'Translate'}
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
          {!showTranslation ? (
            <Text style={[styles.bubbleText, { color: C.text, fontSize: 14 * scale }]}>
              {item.text}
            </Text>
          ) : (
            <View style={{ gap: 6 }}>
              {/* Original regional content */}
              <Text style={[styles.bubbleText, { color: C.text, fontSize: 14 * scale }]}>
                {item.text}
              </Text>
              {/* ⇄ Divider line */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 2 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: C.surfaceBorder }} />
                <Text style={{ fontSize: 13, color: Colors.orange }}>⇄</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: C.surfaceBorder }} />
              </View>
              {/* English translation */}
              <Text style={[styles.bubbleText, { color: C.textSecondary, fontSize: 14 * scale, fontStyle: 'italic' }]}>
                {item.englishTranslation || '(No translation available)'}
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
                  ⇄ {showTranslation ? 'Show Original' : 'Translate'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Voice speak helper */}
            <TouchableOpacity
              onPress={() => playResponseAudio(item.id, item.audioUri)}
              style={[styles.speakBtn, { borderColor: Colors.orange + '40', marginTop: 0 }]}
              disabled={loadingAudioId === item.id}
            >
              <Volume2 size={12} color={Colors.orange} strokeWidth={2} />
              <Text style={[styles.speakBtnText, { color: Colors.orange, fontSize: 11 * scale }]}>
                {loadingAudioId === item.id ? 'Generating...' : (item.audioUri ? t.play : 'Speak')}
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
    generateMessageAudio,
  } = useAppStore();

  const player = useAudioPlayer(null);
  const C = isDarkMode ? Colors.dark : Colors.light;
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];
  const scale = getTextScale(textSize);
  const flatListRef  = useRef<FlatList>(null);
  const [inputText, setInputText]       = useState('');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [showHistory, setShowHistory]   = useState(false);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const isWeb = Platform.OS === 'web';
  const typingDots = useRef(new Animated.Value(0)).current;

  const pdfBannerY = useSharedValue(120);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const pulseScale = useSharedValue(1.0);
  const pulseOpacity = useSharedValue(0.5);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withTiming(1.65, { duration: 1400, easing: Easing.out(Easing.ease) }),
      -1, false
    );
    pulseOpacity.value = withRepeat(
      withTiming(0, { duration: 1400, easing: Easing.out(Easing.ease) }),
      -1, false
    );
  }, []);

  const pulseRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id, activeSession?.id]);

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
    pdfBannerY.value = pdfUrl ? withSpring(0, { damping: 18, stiffness: 200 }) : 120;
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

  const playResponseAudio = async (messageId: string, audioUri?: string) => {
    let targetUri = audioUri;
    if (!targetUri) {
      safeImpact(Haptics.ImpactFeedbackStyle.Medium);
      setLoadingAudioId(messageId);
      try {
        const generated = await generateMessageAudio(messageId);
        if (generated) {
          targetUri = generated;
        } else {
          setLoadingAudioId(null);
          return;
        }
      } catch {
        setLoadingAudioId(null);
        return;
      }
      setLoadingAudioId(null);
    }

    safeImpact(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (Platform.OS === 'web') {
        const a = new (window as any).Audio(targetUri);
        a.play();
      } else {
        player.replace(targetUri);
        player.play();
      }
    } catch { /* silent */ }
  };

  const showAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
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
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { showAlert(t.permissionDenied, t.galleryAccessRequired); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets?.length) {
        const a = result.assets[0];
        await uploadDocument(a.uri, a.fileName ?? `image_${Date.now()}.jpg`, 'Image/Document');
        setOverlay('success');
      }
    } catch { setOverlay('error'); }
  };

  const handleCaptureImage = async () => {
    if (isAnonymousGuest) { setOverlay('login_prompt'); return; }
    try {
      // On web, camera capture isn't supported — fall back to gallery picker
      if (Platform.OS === 'web') { handlePickImage(); return; }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { showAlert(t.permissionDenied, t.cameraAccessRequired); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets?.length) {
        const a = result.assets[0];
        await uploadDocument(a.uri, a.fileName ?? `capture_${Date.now()}.jpg`, 'Image/Document');
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
      />
    );
  }, [isDarkMode, C, scale, t, loadingAudioId, playResponseAudio]);

  const pdfBannerAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: pdfBannerY.value }],
  }));

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

        {/* History toggle button */}
        <TouchableOpacity
          onPress={() => setShowHistory((v) => !v)}
          style={[
            styles.historyBtn,
            {
              backgroundColor: showHistory
                ? (isDarkMode ? 'rgba(249,115,22,0.2)' : '#FFF7ED')
                : (isDarkMode ? '#1E1E23' : '#F3F4F6'),
              borderColor: showHistory ? Colors.orange + '60' : C.surfaceBorder,
            },
          ]}
          activeOpacity={0.75}
        >
          <History size={16} color={showHistory ? Colors.orange : C.textSecondary} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>
      )}

      {/* ── Main layout: chat + optional history sidebar (web) ────── */}
      <View style={[styles.mainRow, isWeb && showHistory && styles.mainRowWithSidebar]}>
        {/* ── Web: inline history sidebar ───────────────────────── */}
        {isWeb && showHistory && (
          <ChatHistorySidebar
            isOpen={true}
            onClose={() => setShowHistory(false)}
            currentCategoryId={category.id}
          />
        )}

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
                    onPress={() => sendMessage(suggestion)}
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
          <AnimatedR.View style={[styles.pdfBanner, pdfBannerAnim]}>
            <CheckCircle size={18} color="#FFFFFF" strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.pdfTitle, { fontSize: 13 * scale }]}>{t.pdfReady}</Text>
              <Text style={[styles.pdfSub, { fontSize: 11 * scale }]}>{t.pdfSub}</Text>
            </View>
            <TouchableOpacity
              onPress={() => Platform.OS === 'web' ? (window as any).open(pdfUrl, '_blank') : Linking.openURL(pdfUrl!)}
              style={styles.pdfBtn}
            >
              <Text style={[styles.pdfBtnText, { fontSize: 12 * scale }]}>{t.open}</Text>
            </TouchableOpacity>
          </AnimatedR.View>
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
              <AnimatedR.View
                style={[
                  pulseRingStyle,
                  {
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
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setOverlay('recording'); }}
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

      {/* ── Mobile: overlay history sidebar ──────────────────────── */}
      {!isWeb && (
        <ChatHistorySidebar
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          currentCategoryId={category.id}
        />
      )}

      {/* ── Document / image upload overlay ─────────────────────── */}
      <DocumentUpload
        onCaptureImage={handleCaptureImage}
        onPickImage={handlePickImage}
        onPickDocument={handlePickDocument}
      />
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
