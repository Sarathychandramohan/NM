/**
 * ChatHistorySidebar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Collapsible sidebar shown on the right of the chat screen.
 * Groups past sessions by the 6 legal categories. Tapping a category
 * expands its session list. Tapping a session loads it into the active view.
 *
 * On mobile: slides in as an overlay from the left (toggle via props).
 * On web/desktop: renders as a fixed left panel.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Platform, useWindowDimensions, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore, CATEGORIES, Session, getTextScale } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import { UI_TRANSLATIONS } from '@constants/translations';
import {
  Home, Briefcase, ShieldAlert, Heart, User, Scale,
  ChevronDown, ChevronRight, Clock, MessageSquare, X,
} from 'lucide-react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing,
} from 'react-native-reanimated';

const CATEGORY_META: Record<string, { Icon: any; color: string; bg: string; bgDark: string }> = {
  land:   { Icon: Home,        color: '#78350F', bg: '#FEF3C7', bgDark: '#2D1E0A' },
  police: { Icon: Briefcase,   color: '#1E3A5F', bg: '#DBEAFE', bgDark: '#0A1929' },
  cyber:  { Icon: ShieldAlert, color: '#1D4ED8', bg: '#EFF6FF', bgDark: '#0A122A' },
  health: { Icon: Heart,       color: '#134E4A', bg: '#CCFBF1', bgDark: '#091E1B' },
  family: { Icon: User,        color: '#5C1A3A', bg: '#FCE7F3', bgDark: '#240A17' },
  rti:    { Icon: Scale,       color: '#EA580C', bg: '#FFF7ED', bgDark: '#1E0E03' },
  general:{ Icon: MessageSquare, color: '#0369A1', bg: '#E0F2FE', bgDark: '#0A1C2A' },
};

// BUG-F028 FIX: Use ms-based diff so month-boundaries (e.g. May 31 → June 1) work correctly
// BUG-F044 FIX: Accept langCode so dates respect the user's selected language
function fmtTime(d: Date, langCode: string): string {
  return new Date(d).toLocaleTimeString(langCode, { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(d: Date, langCode: string): string {
  const now     = new Date();
  const date    = new Date(d);
  // Strip time components to compare whole days
  const nowDay  = new Date(now.getFullYear(),  now.getMonth(),  now.getDate());
  const tgtDay  = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs  = nowDay.getTime() - tgtDay.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString(langCode, { day: 'numeric', month: 'short' });
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentCategoryId: string;
}

export function ChatHistorySidebar({ isOpen, onClose, currentCategoryId }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const { isDarkMode, sessions, loadSession, selectedLanguage, textSize, startSession } = useAppStore();
  const router = useRouter();
  const C = isDarkMode ? Colors.dark : Colors.light;
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];
  const scale = getTextScale(textSize);
  const isWeb = Platform.OS === 'web';

  // Horizontal resizing state on Web
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const isResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(280);

  useEffect(() => {
    if (!isWeb) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      // Left-aligned sidebar: dragging to the right increases width
      const deltaX = e.clientX - startXRef.current;
      const newWidth = Math.max(200, Math.min(600, startWidthRef.current + deltaX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isWeb]);

  const startResize = (e: any) => {
    if (e.nativeEvent && typeof e.nativeEvent.clientX === 'number') {
      isResizingRef.current = true;
      startXRef.current = e.nativeEvent.clientX;
      startWidthRef.current = sidebarWidth;
      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }
    }
  };

  // Track which category groups are expanded
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    // Start with current category open
    return { [currentCategoryId]: true };
  });

  // Slide animation for mobile overlay (slides from Left: -300 to 0)
  const translateX = useSharedValue(isOpen ? 0 : -300);
  useEffect(() => {
    translateX.value = withTiming(isOpen ? 0 : -300, {
      duration: 240,
      easing: Easing.out(Easing.ease),
    });
  }, [isOpen]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const SIDEBAR_W = isWeb ? sidebarWidth : Math.min(300, screenWidth * 0.82);

  // Group sessions by category
  const grouped: Record<string, Session[]> = {};
  for (const cat of CATEGORIES) {
    grouped[cat.id] = sessions.filter((s) => s.categoryId === cat.id);
  }

  const handleLoadSession = async (session: Session) => {
    // Find matching category
    const cat = CATEGORIES.find((c) => c.id === session.categoryId);
    if (!cat) return;
    await loadSession(session.id);
    onClose();
    // Navigate to the correct chat screen
    router.push(`/chat/${session.categoryId}` as any);
  };

  const toggleCategory = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const totalSessions = sessions.length;

  const SidebarContent = (
    <View
      style={[
        styles.sidebar,
        {
          width: SIDEBAR_W,
          backgroundColor: C.surface,
          borderRightColor: C.surfaceBorder,
        },
      ]}
    >
      {/* Resizer Handle on the Right side for Web */}
      {isWeb && (
        <View
          style={[
            styles.resizer,
            {
              backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
              cursor: 'col-resize',
            } as any
          ]}
          // @ts-ignore
          onMouseDown={startResize}
        />
      )}

      {/* Header */}
      <View style={[styles.sidebarHeader, { borderBottomColor: C.surfaceBorder }]}>
        <View style={styles.sidebarHeaderLeft}>
          <Clock size={16} color={Colors.orange} strokeWidth={2} />
          <Text style={[styles.sidebarTitle, { color: C.text, fontSize: 14 * scale }]}>
            {t.chatHistory ?? 'Chat History'}
          </Text>
        </View>
        <View style={styles.sidebarHeaderRight}>
          <View style={[styles.countBadge, { backgroundColor: Colors.orange + '20' }]}>
            <Text style={[styles.countText, { color: Colors.orange, fontSize: 10 * scale }]}>
              {totalSessions}
            </Text>
          </View>
          {!isWeb && (
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={16} color={C.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category groups */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {totalSessions === 0 && (
          <View style={styles.emptyState}>
            <MessageSquare size={32} color={C.textSecondary} strokeWidth={1.4} />
            <Text style={[styles.emptyText, { color: C.textSecondary, fontSize: 13 * scale }]}>
              {t.noHistory ?? 'No chat history yet'}
            </Text>
          </View>
        )}

        {CATEGORIES.map((cat) => {
          const catSessions = grouped[cat.id] ?? [];
          const meta = CATEGORY_META[cat.id] ?? { Icon: Scale, color: Colors.orange, bg: '#FFF7ED', bgDark: '#1E0E03' };
          const CatIcon = meta.Icon;
          const isExpanded = !!expanded[cat.id];
          const isCurrent = cat.id === currentCategoryId;

          if (catSessions.length === 0) return null;

          return (
            <View key={cat.id} style={styles.categoryGroup}>
              {/* Category header row — tapping expands/collapses */}
              <TouchableOpacity
                onPress={() => toggleCategory(cat.id)}
                activeOpacity={0.7}
                style={[
                  styles.categoryRow,
                  isCurrent && {
                    backgroundColor: isDarkMode ? meta.bgDark : meta.bg,
                  },
                ]}
              >
                <View style={[styles.catIconWrap, { backgroundColor: isDarkMode ? meta.bgDark : meta.bg }]}>
                  <CatIcon size={13} color={meta.color} strokeWidth={2} />
                </View>
                <Text
                  style={[
                    styles.catLabel,
                    { color: isCurrent ? meta.color : C.text, fontSize: 12 * scale },
                    isCurrent && { fontFamily: 'PlusJakartaSans_700Bold' },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {t[cat.id] ?? cat.label}
                </Text>
                <View style={[styles.sessionCountPill, { backgroundColor: isDarkMode ? meta.bgDark : meta.bg }]}>
                  <Text style={[styles.sessionCountText, { color: meta.color, fontSize: 9 * scale }]}>
                    {catSessions.length}
                  </Text>
                </View>
                {isExpanded
                  ? <ChevronDown size={13} color={C.textSecondary} strokeWidth={2} />
                  : <ChevronRight size={13} color={C.textSecondary} strokeWidth={2} />
                }
              </TouchableOpacity>

              {/* Session list */}
              {isExpanded && catSessions.map((session) => {
                const lastMsg = session.messages[session.messages.length - 1];
                const preview = lastMsg?.text ?? (t.noMessages ?? 'No messages');
                const isActiveSession = session.categoryId === currentCategoryId &&
                  session.messages.length > 0;

                return (
                  <TouchableOpacity
                    key={session.id}
                    onPress={() => handleLoadSession(session)}
                    activeOpacity={0.75}
                    style={[
                      styles.sessionRow,
                      { borderLeftColor: meta.color + '40' },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.sessionTopRow}>
                        <Text
                          style={[styles.sessionDate, { color: C.textSecondary, fontSize: 10 * scale }]}
                          numberOfLines={1}
                        >
                          {fmtDate(session.startedAt, selectedLanguage.code)} · {fmtTime(session.startedAt, selectedLanguage.code)}
                        </Text>
                        <View style={[styles.msgCountBadge, { backgroundColor: isDarkMode ? '#2A2A35' : '#F1F5F9' }]}>
                          <Text style={[styles.msgCountText, { color: C.textSecondary, fontSize: 9 * scale }]}>
                            {session.messages.length}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[styles.sessionPreview, { color: C.text, fontSize: 12 * scale }]}
                        numberOfLines={2}
                      >
                        {preview}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );

  if (isWeb) {
    // On web: always visible fixed panel to the right of chat
    return SidebarContent;
  }

  // On mobile: overlay with dim background
  if (!isOpen) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Dim background */}
      <Pressable
        style={[styles.dimOverlay]}
        onPress={onClose}
      />
      {/* Slide-in panel from right */}
      <Animated.View
        style={[
          styles.mobilePanel,
          animatedStyle,
        ]}
      >
        {SidebarContent}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sidebar container
  sidebar: {
    flex: 1,
    borderRightWidth: 1,
    position: 'relative',
  },
  resizer: {
    position: 'absolute',
    top: 0,
    right: -3,
    bottom: 0,
    width: 6,
    zIndex: 100,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sidebarHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sidebarHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sidebarTitle: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontSize: 10,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  closeBtn: {
    padding: 4,
    borderRadius: 14,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    textAlign: 'center',
    paddingHorizontal: 16,
  },

  // Category group
  categoryGroup: {
    marginTop: 4,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderRadius: 0,
  },
  catIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catLabel: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  sessionCountPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  sessionCountText: {
    fontSize: 9,
    fontFamily: 'PlusJakartaSans_700Bold',
  },

  // Session row
  sessionRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 8,
    marginBottom: 2,
    borderRadius: 10,
    borderLeftWidth: 3,
  },
  sessionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  sessionDate: {
    fontSize: 10,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  msgCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  msgCountText: {
    fontSize: 9,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  sessionPreview: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    lineHeight: 17,
  },

  // Mobile overlay
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  mobilePanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 16,
  },
});

