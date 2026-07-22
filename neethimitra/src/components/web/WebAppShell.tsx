/**
 * WebAppShell.tsx — Desktop layout wrapper for logged-in web users.
 * Provides: left sidebar nav + top header bar on desktop.
 * Sidebar is collapsible: full (280px) ↔ icon-only (64px) via an arrow toggle.
 * On mobile / native: renders children directly (no-op).
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Platform, useWindowDimensions, ScrollView, Pressable, Animated, TextInput,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Logo } from '@/components/ui/Logo';
import { useAppStore, CATEGORIES, Category } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import { LANGUAGES } from '@constants/languages';
import { safeImpact } from '@/utils/haptics';
import * as Haptics from 'expo-haptics';
import { UI_TRANSLATIONS } from '@constants/translations';
import {
  Home, Clock, FolderClosed, User, Mic, PhoneCall,
  Globe, LogOut, ChevronRight, ChevronLeft, ChevronDown, Check, Plus,
  Home as HomeIcon, Briefcase, ShieldAlert, Heart, Scale, MessageSquare,
  ArrowLeft, Search, Trash2,
} from 'lucide-react-native';

const SIDEBAR_FULL = 280;
const SIDEBAR_MINI = 64;
const TOPBAR_H = 72;

const LANGUAGE_FLAGS: Record<string, string> = {
  'en-IN': '🇮🇳', 'hi-IN': '🇮🇳', 'bn-IN': '🇮🇳', 'te-IN': '🇮🇳',
  'mr-IN': '🇮🇳', 'ta-IN': '🇮🇳', 'gu-IN': '🇮🇳', 'kn-IN': '🇮🇳',
  'ml-IN': '🇮🇳', 'pa-IN': '🇮🇳', 'od-IN': '🇮🇳', 'as-IN': '🇮🇳',
  'mai-IN': '🇮🇳', 'ur-IN': '🇮🇳', 'ne-IN': '🇳🇵', 'sa-IN': '🇮🇳',
  'sd-IN': '🇮🇳', 'kok-IN': '🇮🇳', 'doi-IN': '🇮🇳', 'mni-IN': '🇮🇳',
  'brx-IN': '🇮🇳', 'ks-IN': '🇮🇳', 'sat-IN': '🇮🇳',
};

const CATEGORY_ICONS: Record<string, any> = {
  land: HomeIcon, police: Briefcase, cyber: ShieldAlert,
  health: Heart, family: User, rti: Scale, general: MessageSquare,
};

interface WebAppShellProps {
  children: React.ReactNode;
}

export function WebAppShell({ children }: WebAppShellProps) {
  const { width } = useWindowDimensions();
  const isWeb = (Platform.OS as string) === 'web';
  const isDesktop = isWeb && width >= 1024;

  // On native or small web screens, render children directly
  if (!isWeb) return <>{children}</>;

  return (
    <WebAppShellInner isDesktop={isDesktop}>
      {children}
    </WebAppShellInner>
  );
}

/** Inner shell that holds sidebar collapsed state so both sidebar + main can read it */
function WebAppShellInner({ children, isDesktop }: { children: React.ReactNode; isDesktop: boolean }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return localStorage.getItem('nm_sidebar_collapsed') === 'true';
    }
    return false;
  });
  const sidebarWidth = collapsed ? SIDEBAR_MINI : SIDEBAR_FULL;

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        localStorage.setItem('nm_sidebar_collapsed', String(next));
      }
      return next;
    });
  };

  return (
    <View style={styles.shell}>
      {/* Top header (all web sizes) */}
      <WebTopBar isDesktop={isDesktop} />

      <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
        {/* Left sidebar (desktop only) */}
        {isDesktop && (
          <WebSidebar
            collapsed={collapsed}
            onToggle={toggleCollapsed}
            sidebarWidth={sidebarWidth}
          />
        )}

        {/* Main content fills remaining space */}
        <View style={[styles.main, isDesktop && { marginLeft: 0, flex: 1 }]}>
          {children}
        </View>
      </View>
    </View>
  );
}

/* ─── Top Header Bar ─────────────────────────────────────────────────────────── */
function WebTopBar({ isDesktop }: { isDesktop: boolean }) {
  const router = useRouter();
  const { isDarkMode, selectedLanguage, setLanguage, userName, userEmail, isAnonymousGuest } = useAppStore();
  const C = isDarkMode ? Colors.dark : Colors.light;
  const displayName = userName || 'Guest';
  const displayPhone = isAnonymousGuest ? 'Guest' : (userEmail ? userEmail : 'Registered User');
  const initial = displayName.charAt(0).toUpperCase();
  const [showDropdown, setShowDropdown] = useState(false);

  const headerColors = isDarkMode
    ? ['#0F172A', '#0F172A', '#062F1E']
    : ['#FFFFFF', '#FFFFFF', '#EAF5EC'];

  return (
    <LinearGradient
      colors={headerColors as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.topBar, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]}
    >
      <View style={styles.topBarInner}>
        {/* Logo */}
        <Logo size={42} showText lightBg={!isDarkMode} stacked={false} whiteVersion={false} />

        {/* Right controls */}
        <View style={styles.topBarRight}>
          {/* Language chip dropdown */}
          <View style={{ position: 'relative', zIndex: 99999 }}>
            <TouchableOpacity
              onPress={() => setShowDropdown(!showDropdown)}
              style={[
                styles.langChip,
                {
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#FFFFFF',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : '#D1D5DB',
                }
              ]}
            >
              <Globe size={15} color={isDarkMode ? '#FFFFFF' : '#374151'} strokeWidth={2} />
              <Text style={[styles.langText, { color: isDarkMode ? '#FFFFFF' : '#374151' }]}>
                {selectedLanguage.code.split('-')[0].toUpperCase()}
              </Text>
            </TouchableOpacity>

            {showDropdown && (
              <>
                {/* Click-away overlay */}
                <Pressable
                  style={{
                    position: 'fixed' as any,
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'transparent',
                    zIndex: 99998,
                  }}
                  onPress={() => setShowDropdown(false)}
                />

                {/* Small Popup Dropdown */}
                <View
                  style={[
                    styles.dropdownContainer,
                    { backgroundColor: C.surface, borderColor: C.surfaceBorder }
                  ]}
                >
                  <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator>
                    {LANGUAGES.map((lang) => {
                      const isSelected = selectedLanguage.code === lang.code;
                      const flag = LANGUAGE_FLAGS[lang.code] || '🇮🇳';
                      return (
                        <TouchableOpacity
                          key={lang.code}
                          onPress={() => {
                            safeImpact(Haptics.ImpactFeedbackStyle.Medium);
                            setLanguage(lang);
                            setShowDropdown(false);
                          }}
                          style={[
                            styles.dropdownItem,
                            isSelected && { backgroundColor: isDarkMode ? 'rgba(249,115,22,0.15)' : '#FFF7ED' }
                          ]}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 16, marginRight: 8 }}>{flag}</Text>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: 13, fontWeight: isSelected ? '700' : '500',
                                color: C.text, fontFamily: 'PlusJakartaSans_600SemiBold',
                              }}
                              numberOfLines={1}
                            >
                              {lang.nativeName}
                            </Text>
                            <Text
                              style={{ fontSize: 10, color: C.textSecondary, fontFamily: 'PlusJakartaSans_400Regular' }}
                              numberOfLines={1}
                            >
                              {lang.name}
                            </Text>
                          </View>
                          {isSelected && (
                            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.orange, alignItems: 'center', justifyContent: 'center' }}>
                              <Check size={9} color="#FFFFFF" strokeWidth={3} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </>
            )}
          </View>

          {/* Username & Email placement */}
          <View style={{ marginRight: 10, alignItems: 'flex-end', justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: isDarkMode ? '#FFFFFF' : '#111827' }} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={{ fontSize: 11, color: isDarkMode ? '#9CA3AF' : '#6B7280' }} numberOfLines={1}>
              {displayPhone}
            </Text>
          </View>

          {/* User avatar */}
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile' as any)}
            style={[
              styles.avatar,
              {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#15803D',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.25)' : '#0E6F64',
              }
            ]}
          >
            <Text style={[styles.avatarText, { color: '#FFFFFF' }]}>{initial}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}

/* ─── Left Sidebar ───────────────────────────────────────────────────────────── */
function WebSidebar({
  collapsed,
  onToggle,
  sidebarWidth,
}: {
  collapsed: boolean;
  onToggle: () => void;
  sidebarWidth: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isDarkMode, setOverlay, startSession, sessions, loadSession, deleteSession, logout, userName, userEmail, selectedLanguage, fetchSessions, authToken } = useAppStore();
  const C = isDarkMode ? Colors.dark : Colors.light;
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];

  const displayName = userName || 'Guest Citizen';
  const displayPhone = userEmail ? userEmail : 'Guest';
  const initial = displayName.charAt(0).toUpperCase();

  // Fetch sessions from backend when the sidebar mounts or auth token changes
  // This ensures sessions persist after page refresh on web
  React.useEffect(() => {
    if (authToken) {
      fetchSessions().catch(() => {});
    }
  }, [authToken]);

  // Track which categories have their history list expanded
  const [expandedCats, setExpandedCats] = React.useState<Record<string, boolean>>({});
  const [showSearchInput, setShowSearchInput] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const toggleExpand = (catId: string) => {
    setExpandedCats((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  // Returns up to 5 most recent sessions for a given category
  const getRecentForCat = (catId: string) =>
    sessions.filter((s) => s.categoryId === catId).slice(0, 5);

  // Navigate to most recent session of category OR start new
  const handleCategoryPress = async (cat: Category) => {
    const recents = getRecentForCat(cat.id);
    if (recents.length > 0 && recents[0].messages.length > 0) {
      await loadSession(recents[0].id);
    } else {
      await startSession(cat);
    }
    router.push(`/chat/${cat.id}` as any);
  };

  // Always start a brand new session
  const handleNewChat = async (cat: Category, e: any) => {
    e.stopPropagation();
    await startSession(cat);
    router.push(`/chat/${cat.id}` as any);
  };

  // Load and resume a specific past session
  const handleResumeSession = async (sessionId: string, catId: string) => {
    await loadSession(sessionId);
    router.push(`/chat/${catId}` as any);
  };

  const NAV_ITEMS = [
    { label: t.home,        icon: Home,         route: '/(tabs)',               active: pathname === '/' || pathname === '/(tabs)' || pathname === '/index' },
    { label: t.myFiles,     icon: FolderClosed, route: '/(tabs)/my-files',      active: pathname.includes('my-files') },
    { label: t.helplines || 'Helplines', icon: PhoneCall, route: '/helplines',  active: pathname.includes('helplines') },
    { label: t.profile,     icon: User,         route: '/(tabs)/profile',       active: pathname.includes('profile') },
  ];


  const handleNav = (route: string) => {
    safeImpact(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  const handleSignOut = () => {
    safeImpact(Haptics.ImpactFeedbackStyle.Medium);
    setOverlay('confirm_logout');
  };

  const sidebarColors = isDarkMode
    ? ['#0F172A', '#0F172A', '#221A0F']
    : ['#FFFFFF', '#FFFFFF', '#FFF7ED'];

  return (
    <View style={{ width: sidebarWidth, position: 'relative', flexShrink: 0 }}>
      <LinearGradient
        colors={sidebarColors as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[
          styles.sidebar,
          {
            width: sidebarWidth,
            borderRightColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
          }
        ]}
      >
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>

          {/* Search/Find/Back in Sidebar header */}
          {collapsed ? (
            <TouchableOpacity
              onPress={() => onToggle()}
              style={{ alignSelf: 'center', paddingVertical: 20 }}
              activeOpacity={0.7}
            >
              <Search size={18} color={C.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={{
              borderBottomWidth: 1,
              borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#F3F4F6',
              paddingVertical: 16,
              paddingHorizontal: 20,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <TouchableOpacity
                  onPress={() => router.back()}
                  style={{ padding: 4 }}
                  activeOpacity={0.7}
                >
                  <ArrowLeft size={18} color={C.textSecondary} />
                </TouchableOpacity>
                <Text style={{ fontSize: 14, fontFamily: 'PlusJakartaSans_700Bold', color: C.text }}>
                  {t.navigation}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowSearchInput(!showSearchInput)}
                  style={{ padding: 4 }}
                  activeOpacity={0.7}
                >
                  <Search size={18} color={C.textSecondary} />
                </TouchableOpacity>
              </View>

              {showSearchInput && (
                <View style={{
                  marginTop: 10,
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 2,
                }}>
                  <TextInput
                    placeholder={t.searchChats || "Search chats..."}
                    placeholderTextColor={C.textSecondary}
                    style={{
                      height: 32,
                      color: C.text,
                      fontSize: 13,
                      fontFamily: 'PlusJakartaSans_500Medium',
                      borderStyle: 'none',
                      outlineStyle: 'none',
                    } as any}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoFocus
                  />
                </View>
              )}
            </View>
          )}

          {/* Voice mic FAB */}
          {!collapsed ? (
            <TouchableOpacity onPress={() => setOverlay('recording')} style={styles.sidebarMicBtn} activeOpacity={0.85}>
              <LinearGradient
                colors={['#F97316', '#EA580C']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sidebarMicGrad}
              >
                <Mic size={16} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={[styles.sidebarMicText, { color: '#FFFFFF' }]}>{t.askWithVoice}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => setOverlay('recording')}
              activeOpacity={0.85}
              style={{
                alignSelf: 'center',
                width: 42, height: 42, borderRadius: 21,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: Colors.orange,
                marginVertical: 14,
              }}
            >
              <Mic size={18} color="#FFFFFF" strokeWidth={2.2} />
            </TouchableOpacity>
          )}

          {/* Section label */}
          {!collapsed && (
            <Text style={[styles.sidebarSection, { color: C.textHint }]}>{t.navigation}</Text>
          )}

          {/* Nav items */}
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <TouchableOpacity
                key={item.label}
                onPress={() => handleNav(item.route)}
                style={[
                  collapsed ? styles.sidebarNavItemMini : styles.sidebarNavItem,
                  item.active && { backgroundColor: isDarkMode ? 'rgba(249,115,22,0.12)' : '#FFF7ED' },
                ]}
              >
                <Icon
                  size={17}
                  color={item.active ? Colors.orange : (isDarkMode ? '#94A3B8' : '#4B5563')}
                  strokeWidth={item.active ? 2.2 : 1.8}
                />
                {!collapsed && (
                  <Text
                    style={[
                      styles.sidebarNavLabel,
                      { color: item.active ? Colors.orange : C.text },
                      item.active && { fontFamily: 'PlusJakartaSans_700Bold' },
                    ]}
                  >
                    {item.label}
                  </Text>
                )}
                {!collapsed && item.active && (
                  <View style={[styles.sidebarActiveDot, { backgroundColor: Colors.orange }]} />
                )}
              </TouchableOpacity>
            );
          })}

          {/* Legal categories section */}
          {!collapsed && (
            <Text style={[styles.sidebarSection, { color: C.textHint, marginTop: 16 }]}>{t.legalCategories}</Text>
          )}
          {collapsed && <View style={{ height: 8 }} />}

          {CATEGORIES.filter(cat => {
            if (!searchQuery) return true;
            const catLabel = (t[cat.id] ?? cat.label).toLowerCase();
            const matchesCat = catLabel.includes(searchQuery.toLowerCase());
            const recents = getRecentForCat(cat.id);
            const matchesSessions = recents.some(s =>
              s.messages.some(m => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
            );
            return matchesCat || matchesSessions;
          }).map((cat) => {
            const CatIcon = CATEGORY_ICONS[cat.id] ?? Scale;
            const catColor = Colors.category[cat.colorKey as keyof typeof Colors.category]?.color ?? Colors.orange;
            const catLabel = t[cat.id] ?? cat.label;
            const isActiveCat = pathname.includes(`/chat/${cat.id}`);
            const recentSessions = getRecentForCat(cat.id);
            const hasHistory = recentSessions.length > 0;
            const isExpanded = expandedCats[cat.id] ?? false;

            return (
              <View key={cat.id}>
                {/* Category row */}
                <View style={[
                  collapsed ? styles.sidebarNavItemMini : styles.sidebarNavItem,
                  isActiveCat && { backgroundColor: isDarkMode ? 'rgba(249,115,22,0.12)' : '#FFF7ED' },
                  !collapsed && { paddingRight: 4 },
                ]}>
                  {/* Icon — tapping navigates */}
                  <TouchableOpacity
                    onPress={() => handleCategoryPress(cat)}
                    style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}
                    activeOpacity={0.7}
                  >
                    <CatIcon size={15} color={isActiveCat ? Colors.orange : catColor} strokeWidth={1.8} />
                    {!collapsed && (
                      <Text style={[styles.sidebarNavLabel, { color: C.text, fontSize: 13 }]} numberOfLines={1}>
                        {catLabel}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {/* Plus (new chat) + Chevron (expand) — only in full mode */}
                  {!collapsed && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      {/* + new chat */}
                      <TouchableOpacity
                        onPress={(e) => handleNewChat(cat, e)}
                        style={{
                          width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                        }}
                        activeOpacity={0.7}
                      >
                        <Plus size={12} color={C.textSecondary} strokeWidth={2.5} />
                      </TouchableOpacity>

                      {/* Chevron — toggle history */}
                      <TouchableOpacity
                        onPress={() => hasHistory && toggleExpand(cat.id)}
                        style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
                        activeOpacity={hasHistory ? 0.7 : 1}
                      >
                        {isExpanded
                          ? <ChevronDown size={13} color={hasHistory ? C.textSecondary : 'transparent'} strokeWidth={2} />
                          : <ChevronRight size={13} color={hasHistory ? C.textSecondary : 'transparent'} strokeWidth={1.5} />
                        }
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Expanded recent sessions sub-list */}
                {!collapsed && isExpanded && hasHistory && (
                  <View style={{ paddingLeft: 14, marginBottom: 4 }}>
                    {recentSessions.map((sess) => {
                      // Use session title (auto-generated from first message by backend).
                      // New sessions that haven't had a message yet show "New session".
                      const isNew = !sess.title || sess.title === sess.categoryLabel;
                      const preview = isNew ? '💬 New session' : sess.title;
                      return (
                        <View
                          key={sess.id}
                          style={[
                            styles.sidebarSessionItem,
                            {
                              borderLeftColor: catColor,
                              backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingRight: 6,
                            },
                          ]}
                        >
                          <TouchableOpacity
                            onPress={() => handleResumeSession(sess.id, cat.id)}
                            activeOpacity={0.75}
                            style={{ flex: 1, paddingVertical: 6 }}
                          >
                            <Text style={[styles.sidebarSessionText, { color: C.textSecondary }]} numberOfLines={1}>
                              {preview}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={async () => {
                              await deleteSession(sess.id);
                            }}
                            style={{ padding: 4 }}
                            activeOpacity={0.7}
                          >
                            <Trash2 size={12} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}

          <View style={{ height: 16 }} />
        </ScrollView>

        {/* Sign out */}
        <TouchableOpacity
          onPress={handleSignOut}
          activeOpacity={0.8}
          style={[
            collapsed ? styles.sidebarSignOutMini : styles.sidebarSignOut,
            {
              backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
              borderColor: isDarkMode ? 'rgba(239, 68, 68, 0.25)' : '#FCA5A5',
              borderWidth: 1,
              margin: collapsed ? 10 : 16,
              borderRadius: 12,
            }
          ]}
        >
          <LogOut size={16} color="#EF4444" strokeWidth={2} />
          {!collapsed && (
            <Text style={[styles.sidebarSignOutText, { color: '#EF4444' }]}>{t.signOut}</Text>
          )}
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Collapse toggle arrow at right edge ──────────────────── */}
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.85}
        style={[
          styles.collapseBtn,
          {
            backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : '#E5E7EB',
            right: -16,
          }
        ]}
      >
        {collapsed
          ? <ChevronRight size={14} color={isDarkMode ? '#CBD5E1' : '#6B7280'} strokeWidth={2.5} />
          : <ChevronLeft  size={14} color={isDarkMode ? '#CBD5E1' : '#6B7280'} strokeWidth={2.5} />
        }
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },

  // Top bar
  topBar: { height: TOPBAR_H, borderBottomWidth: 1, zIndex: 10 },
  topBarInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: '100%', paddingHorizontal: 24 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  langChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  langText: { fontSize: 14, fontFamily: 'PlusJakartaSans_700Bold' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  avatarText: { fontSize: 18, fontFamily: 'PlusJakartaSans_700Bold' },
  dropdownContainer: {
    position: 'absolute',
    top: 48, right: 0, width: 220,
    borderRadius: 14, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
    zIndex: 99999, paddingVertical: 6,
  },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },

  // Shell body
  body: { flex: 1 },
  bodyDesktop: { flexDirection: 'row' },

  // Sidebar
  sidebar: { flex: 1, borderRightWidth: 1 },
  sidebarUser: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 20, borderBottomWidth: 1 },
  sidebarAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sidebarAvatarText: { fontSize: 18, fontFamily: 'PlusJakartaSans_700Bold', color: '#E8580C' },
  sidebarUserName: { fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 2 },
  sidebarUserPhone: { fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular' },
  sidebarMicBtn: { margin: 16, borderRadius: 12, overflow: 'hidden' },
  sidebarMicGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 13 },
  sidebarMicText: { fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold', color: '#FFFFFF' },
  sidebarSection: { fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 1.5, paddingHorizontal: 20, paddingVertical: 12 },

  // Full nav item
  sidebarNavItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 12,
    marginHorizontal: 10, borderRadius: 12, marginBottom: 4,
  },
  // Mini (icon-only) nav item
  sidebarNavItemMini: {
    alignItems: 'center', justifyContent: 'center',
    width: 44, height: 44, borderRadius: 12,
    alignSelf: 'center', marginBottom: 6,
  },

  sidebarNavLabel: { flex: 1, fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold' },
  sidebarActiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.orange },

  // Sign out — full
  sidebarSignOut: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center',
  },
  // Sign out — icon only
  sidebarSignOutMini: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12,
  },
  sidebarSignOutText: { fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold', color: '#EF4444' },

  // Collapse toggle button (floats at sidebar right edge)
  collapseBtn: {
    position: 'absolute',
    top: '50%' as any,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 4,
    elevation: 4,
    zIndex: 20,
    marginTop: -14, // vertically center (half of height)
  },

  // Session history item under expanded category
  sidebarSessionItem: {
    borderLeftWidth: 2,
    paddingLeft: 10,
    paddingVertical: 6,
    marginBottom: 2,
    borderRadius: 6,
  },
  sidebarSessionText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
  },

  // Main content
  main: { flex: 1 },
});
