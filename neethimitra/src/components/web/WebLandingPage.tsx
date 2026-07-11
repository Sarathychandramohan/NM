/**
 * WebLandingPage.tsx — Premium public landing page (web-only)
 * Shown to unauthenticated visitors. Mobile is unaffected.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Linking, Platform, Animated, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Logo } from '@/components/ui/Logo';
import {
  Mic, Globe, FileText, Phone, ShieldCheck, Scale, Home,
  Briefcase, ShieldAlert, Heart, User, ChevronRight,
  Star, CheckCircle, ArrowRight, Zap, Lock, BookOpen, MessageSquare, ArrowLeft,
} from 'lucide-react-native';
import { Colors } from '@constants/colors';
import { CATEGORIES, useAppStore } from '@store/useAppStore';
import { LANDING_TRANSLATIONS } from '@constants/landingTranslations';
import { UI_TRANSLATIONS } from '@constants/translations';

export function WebLandingPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { isDarkMode, selectedLanguage, setOverlay } = useAppStore();
  const C = isDarkMode ? Colors.dark : Colors.light;
  
  const t = LANDING_TRANSLATIONS[selectedLanguage.code] || LANDING_TRANSLATIONS['en-IN'];
  const uit = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];

  const isMobile = width < 768;
  const isTablet = width < 1024;

  const heroAnim  = useRef(new Animated.Value(0)).current;
  const heroSlide = useRef(new Animated.Value(30)).current;

  // Scroll View Ref
  const scrollViewRef = useRef<ScrollView>(null);

  // Layout positions for scrolling
  const [yPositions, setYPositions] = useState({ features: 0, how: 0, cats: 0 });

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroAnim,  { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(heroSlide, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();
  }, []);

  const goToLogin = () => router.push('/(auth)/phone-auth' as any);
  const handleBack = () => router.replace('/(auth)/phone-auth' as any);

  const scrollToSection = (section: 'features' | 'how' | 'cats') => {
    const yVal = yPositions[section];
    scrollViewRef.current?.scrollTo({ y: yVal - 70, animated: true }); // Offset by 70px for header
  };

  // Dynamic translated lists
  const FEATURES = [
    { Icon: Mic, title: t.f1_title, desc: t.f1_desc, color: '#E8580C', bg: 'rgba(232,88,12,0.08)' },
    { Icon: ShieldCheck, title: t.f2_title, desc: t.f2_desc, color: '#15803D', bg: 'rgba(21,128,61,0.08)' },
    { Icon: FileText, title: t.f3_title, desc: t.f3_desc, color: '#1D4ED8', bg: 'rgba(29,78,216,0.08)' },
    { Icon: Lock, title: t.f4_title, desc: t.f4_desc, color: '#7C3AED', bg: 'rgba(124,58,237,0.08)' },
    { Icon: Phone, title: t.f5_title, desc: t.f5_desc, color: '#DC2626', bg: 'rgba(220,38,38,0.08)' },
    { Icon: BookOpen, title: t.f6_title, desc: t.f6_desc, color: '#D97706', bg: 'rgba(217,119,6,0.08)' },
  ];

  const STEPS = [
    { n: '01', title: t.s1_title, desc: t.s1_desc, color: '#E8580C' },
    { n: '02', title: t.s2_title, desc: t.s2_desc, color: '#15803D' },
    { n: '03', title: t.s3_title, desc: t.s3_desc, color: '#1D4ED8' },
  ];

  const TESTIMONIALS = [
    { name: t.t1_name, loc: t.t1_loc, text: t.t1_text, stars: 5 },
    { name: t.t2_name, loc: t.t2_loc, text: t.t2_text, stars: 5 },
    { name: t.t3_name, loc: t.t3_loc, text: t.t3_text, stars: 5 },
  ];

  const CATEGORY_ICONS: Record<string, { Icon: any; color: string }> = {
    land:   { Icon: Home,        color: '#78350F' },
    police: { Icon: Briefcase,   color: '#1E3A5F' },
    cyber:  { Icon: ShieldAlert, color: '#1D4ED8' },
    health: { Icon: Heart,       color: '#134E4A' },
    family: { Icon: User,        color: '#5C1A3A' },
    rti:    { Icon: Scale,       color: '#EA580C' },
    general:{ Icon: MessageSquare, color: '#0369A1' },
  };

  return (
    <View style={styles.outerContainer}>
      <ScrollView 
        ref={scrollViewRef}
        style={styles.root} 
        showsVerticalScrollIndicator={false} 
        stickyHeaderIndices={[0]}
      >

        {/* ── TOP NAVBAR ──────────────────────────────────────────────────────── */}
        <View style={[styles.navbar, { backgroundColor: C.surface, borderBottomColor: C.surfaceBorder }]}>
          <View style={styles.navInner}>
            <View style={styles.navLeft}>
              <TouchableOpacity onPress={handleBack} style={[styles.backNavbarBtn, { borderColor: C.surfaceBorder }]} activeOpacity={0.7}>
                <ArrowLeft size={16} color={Colors.orange} strokeWidth={2.5} />
              </TouchableOpacity>
              <Logo size={32} showText lightBg={!isDarkMode} stacked={false} />
            </View>

            <View style={styles.navLinks}>
              {!isMobile && (
                <View style={styles.navTabsContainer}>
                  {/* Features Link */}
                  <TouchableOpacity onPress={() => scrollToSection('features')} style={styles.navLink} activeOpacity={0.7}>
                    <Text style={[styles.navLinkText, { color: C.text }]}>{t.features}</Text>
                  </TouchableOpacity>

                  {/* How it Works Link */}
                  <TouchableOpacity onPress={() => scrollToSection('how')} style={styles.navLink} activeOpacity={0.7}>
                    <Text style={[styles.navLinkText, { color: C.text }]}>{t.howItWorks}</Text>
                  </TouchableOpacity>

                  {/* Categories Link */}
                  <TouchableOpacity onPress={() => scrollToSection('cats')} style={styles.navLink} activeOpacity={0.7}>
                    <Text style={[styles.navLinkText, { color: C.text }]}>{t.categories}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Language selection trigger */}
              <TouchableOpacity onPress={() => setOverlay('language')} style={[styles.langBtn, { borderColor: C.surfaceBorder }]} activeOpacity={0.7}>
                <Globe size={15} color={Colors.orange} strokeWidth={2.5} />
                <Text style={[styles.langBtnText, { color: C.text }]}>
                  {selectedLanguage.code.split('-')[0].toUpperCase()}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={goToLogin} style={styles.navLoginBtn}>
                <Text style={styles.navLoginText}>{t.login}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={goToLogin} style={styles.navCtaBtn}>
                <Text style={styles.navCtaText}>{t.getStarted}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── HERO SECTION ─────────────────────────────────────────────────────── */}
        <LinearGradient
          colors={['#0A3D1F', '#15803D', '#1A5C2A']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          {/* Decorative circles */}
          <View style={[styles.heroBubble, { width: 500, height: 500, top: -150, right: -150, opacity: 0.06 }]} />
          <View style={[styles.heroBubble, { width: 300, height: 300, bottom: -80, left: -60, opacity: 0.07 }]} />

          <Animated.View style={[
            styles.heroContent,
            { opacity: heroAnim, transform: [{ translateY: heroSlide }] }
          ]}>
            {/* Badge */}
            <View style={styles.heroBadge}>
              <Zap size={13} color="#F97316" strokeWidth={2} />
              <Text style={styles.heroBadgeText}>{t.heroBadge}</Text>
            </View>

            {/* Headline */}
            <Text style={[styles.heroH1, { fontSize: isMobile ? 30 : isTablet ? 42 : 52 }]}>
              {t.heroTitle.split(' in ')[0]}
              {'\n'}
              <Text style={{ color: '#F97316' }}>{selectedLanguage.code === 'en-IN' ? 'Every Indian' : selectedLanguage.logoText}</Text>
              {'\n'}
              {t.heroTitle.includes('in Their Own') ? 'in Their Own Language' : (selectedLanguage.code === 'hi-IN' ? 'उनकी अपनी भाषा में' : (selectedLanguage.code === 'ta-IN' ? 'சொந்த மொழியில் சட்ட உதவி' : ''))}
            </Text>

            <Text style={[styles.heroSub, { fontSize: isMobile ? 14 : 17 }]}>
              {t.heroSub}
            </Text>

            {/* CTA Row */}
            <View style={[styles.heroCtaRow, { flexDirection: isMobile ? 'column' : 'row' }]}>
              <TouchableOpacity onPress={goToLogin} style={styles.heroPrimaryBtn} activeOpacity={0.88}>
                <LinearGradient
                  colors={['#F97316', '#EA580C']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.heroPrimaryBtnGrad}
                >
                  <Mic size={18} color="#fff" strokeWidth={2} />
                  <Text style={styles.heroPrimaryBtnText}>{t.startForFree}</Text>
                  <ArrowRight size={16} color="#fff" strokeWidth={2.5} />
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={goToLogin} style={styles.heroSecondaryBtn} activeOpacity={0.8}>
                <Globe size={16} color="#fff" strokeWidth={1.8} />
                <Text style={styles.heroSecondaryBtnText}>{t.languagesBadge}</Text>
              </TouchableOpacity>
            </View>

            {/* Trust row */}
            <View style={styles.heroTrust}>
              {[t.freeToUse, t.noLawyerFees, t.worksOffline].map((txt) => (
                <View key={txt} style={styles.heroTrustItem}>
                  <CheckCircle size={14} color="#4ADE80" strokeWidth={2} />
                  <Text style={styles.heroTrustText}>{txt}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        </LinearGradient>

        {/* ── STATS STRIP ──────────────────────────────────────────────────────── */}
        <View style={[styles.statsStrip, { backgroundColor: C.surface, borderBottomColor: C.surfaceBorder }]}>
          {[
            { n: '50,000+', label: t.citizensHelped },
            { n: '22',      label: t.languagesBadge },
            { n: '6',       label: t.categories },
            { n: '4.8★',   label: t.userRating },
          ].map((s, i) => (
            <View key={i} style={[styles.statItem, i < 3 && [styles.statBorder, { borderRightColor: C.surfaceBorder }]]}>
              <Text style={styles.statNumber}>{s.n}</Text>
              <Text style={[styles.statLabel, { color: C.textSecondary }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── FEATURES SECTION ─────────────────────────────────────────────────── */}
        <View 
          onLayout={(e) => {
            const layoutY = e.nativeEvent.layout.y;
            setYPositions(prev => ({ ...prev, features: layoutY }));
          }}
          style={[styles.section, { backgroundColor: isDarkMode ? '#131316' : '#FAFAFA' }]}
        >
          <View style={styles.container}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionEyebrow}>{t.whyNeethiMitra}</Text>
              <Text style={[styles.sectionTitle, { color: C.text }]}>{t.builtForBharatTitle}</Text>
              <Text style={[styles.sectionSub, { color: C.textSecondary }]}>{t.builtForBharatSub}</Text>
            </View>
            <View style={[styles.featureGrid, { flexDirection: 'row', flexWrap: 'wrap' }]}>
              {FEATURES.map((f, i) => {
                const FIcon = f.Icon;
                return (
                  <View key={i} style={[
                    styles.featureCard,
                    { width: isMobile ? '100%' : isTablet ? '48%' : '31%', backgroundColor: C.surface, borderColor: C.surfaceBorder }
                  ]}>
                    <View style={[styles.featureIconBg, { backgroundColor: f.bg }]}>
                      <FIcon size={22} color={f.color} strokeWidth={1.8} />
                    </View>
                    <Text style={[styles.featureTitle, { color: C.text }]}>{f.title}</Text>
                    <Text style={[styles.featureDesc, { color: C.textSecondary }]}>{f.desc}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
        <View 
          onLayout={(e) => {
            const layoutY = e.nativeEvent.layout.y;
            setYPositions(prev => ({ ...prev, how: layoutY }));
          }}
          style={[styles.section, { backgroundColor: C.background }]}
        >
          <View style={styles.container}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionEyebrow}>{t.howItWorks}</Text>
              <Text style={[styles.sectionTitle, { color: C.text }]}>{t.threeStepsTitle}</Text>
            </View>
            <View style={[styles.stepsRow, { flexDirection: isMobile ? 'column' : 'row' }]}>
              {STEPS.map((s, i) => (
                <View key={i} style={[styles.stepCard, { flex: isMobile ? 0 : 1 }]}>
                  <View style={[styles.stepNum, { borderColor: s.color, backgroundColor: C.surface }]}>
                    <Text style={[styles.stepNumText, { color: s.color }]}>{s.n}</Text>
                  </View>
                  {!isMobile && i < 2 && (
                    <View style={[styles.stepLine, { backgroundColor: C.surfaceBorder }]} />
                  )}
                  <Text style={[styles.stepTitle, { color: C.text }]}>{s.title}</Text>
                  <Text style={[styles.stepDesc, { color: C.textSecondary }]}>{s.desc}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── LEGAL CATEGORIES ─────────────────────────────────────────────────── */}
        <View 
          onLayout={(e) => {
            const layoutY = e.nativeEvent.layout.y;
            setYPositions(prev => ({ ...prev, cats: layoutY }));
          }}
          style={[styles.section, { backgroundColor: isDarkMode ? '#131316' : '#FAFAFA' }]}
        >
          <View style={styles.container}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionEyebrow}>{t.categories}</Text>
              <Text style={[styles.sectionTitle, { color: C.text }]}>{uit.legalCategories}</Text>
            </View>
            <View style={[styles.catGrid, { flexDirection: 'row', flexWrap: 'wrap' }]}>
              {CATEGORIES.map((cat) => {
                const iconInfo = CATEGORY_ICONS[cat.id] || { Icon: Scale, color: Colors.orange };
                const CatIcon = iconInfo.Icon;

                // Dynamic translations for Categories from UI_TRANSLATIONS
                const catLabel = uit[cat.id] || cat.label;
                const catHint = uit[`${cat.id}Hint`] || cat.description;

                return (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={goToLogin}
                    activeOpacity={0.8}
                    style={[styles.catCard, { width: isMobile ? '100%' : isTablet ? '48%' : '31%', backgroundColor: C.surface, borderColor: C.surfaceBorder }]}
                  >
                    <View style={[styles.catIconBg, { backgroundColor: iconInfo.color + '18' }]}>
                      <CatIcon size={24} color={iconInfo.color} strokeWidth={1.6} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.catLabel, { color: C.text }]}>{catLabel}</Text>
                      <Text style={[styles.catHint, { color: C.textSecondary }]}>{catHint}</Text>
                    </View>
                    <ChevronRight size={16} color={C.textHint} strokeWidth={2} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── TESTIMONIALS ─────────────────────────────────────────────────────── */}
        <View style={[styles.section, { backgroundColor: C.background }]}>
          <View style={styles.container}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionEyebrow}>{t.successStoriesTitle}</Text>
              <Text style={[styles.sectionTitle, { color: C.text }]}>{t.realPeopleTitle}</Text>
            </View>
            <View style={[styles.testimonialRow, { flexDirection: isMobile ? 'column' : 'row' }]}>
              {TESTIMONIALS.map((tc, i) => (
                <View key={i} style={[styles.testimonialCard, { flex: isMobile ? 0 : 1, backgroundColor: C.surface, borderColor: C.surfaceBorder }]}>
                  <View style={styles.stars}>
                    {[...Array(tc.stars)].map((_, si) => (
                      <Star key={si} size={14} color="#F59E0B" fill="#F59E0B" strokeWidth={0} />
                    ))}
                  </View>
                  <Text style={[styles.testimonialText, { color: C.text }]}>"{tc.text}"</Text>
                  <View style={styles.testimonialAuthor}>
                    <View style={styles.testimonialAvatar}>
                      <Text style={styles.testimonialAvatarText}>{tc.name ? tc.name[0] : 'U'}</Text>
                    </View>
                    <View>
                      <Text style={[styles.testimonialName, { color: C.text }]}>{tc.name}</Text>
                      <Text style={[styles.testimonialLoc, { color: C.textSecondary }]}>{tc.loc}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── FINAL CTA BAND ───────────────────────────────────────────────────── */}
        <LinearGradient
          colors={['#E8580C', '#F97316', '#15803D']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.ctaBand}
        >
          <Text style={[styles.ctaBandTitle, { fontSize: isMobile ? 24 : 36 }]}>
            {t.ctaBandTitle}
          </Text>
          <Text style={styles.ctaBandSub}>
            {t.ctaBandSub}
          </Text>
          <TouchableOpacity onPress={goToLogin} style={styles.ctaBandBtn} activeOpacity={0.88}>
            <Text style={styles.ctaBandBtnText}>{t.ctaBandBtn}</Text>
            <ArrowRight size={18} color="#E8580C" strokeWidth={2.5} />
          </TouchableOpacity>
        </LinearGradient>

        {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
        <View style={[styles.footer, { backgroundColor: isDarkMode ? '#050508' : '#111827' }]}>
          <View style={[styles.container, styles.footerInner]}>
            <View style={styles.footerBrand}>
              <Logo size={28} showText lightBg={false} whiteVersion stacked={false} />
              <Text style={styles.footerTagline}>{t.footerTagline}</Text>
              <Text style={styles.footerDisc}>
                {t.footerDisc}
              </Text>
            </View>
            <View style={styles.footerLinks}>
              {['Privacy Policy', 'Terms of Service', 'Disclaimer', 'Contact Us'].map((txt) => (
                <TouchableOpacity key={txt} style={styles.footerLink}>
                  <Text style={styles.footerLinkText}>{txt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.footerBottom}>
            <Text style={styles.footerCopy}>{t.madeWithLove}</Text>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1, position: 'relative' },
  root: { flex: 1, backgroundColor: '#FFFFFF' },

  // Navbar
  navbar: { borderBottomWidth: 1, zIndex: 100, elevation: 5 },
  navInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1200, alignSelf: 'center', width: '100%', paddingHorizontal: 24, paddingVertical: 12 },
  navLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backNavbarBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(249,115,22,0.05)' },
  navLinks: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  navTabsContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navLink: { paddingHorizontal: 12, paddingVertical: 8 },
  navLinkText: { fontSize: 14, fontFamily: 'PlusJakartaSans_600SemiBold' },
  navLoginBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  navLoginText: { fontSize: 14, fontFamily: 'PlusJakartaSans_600SemiBold', color: '#E8580C' },
  navCtaBtn: { backgroundColor: '#E8580C', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  navCtaText: { fontSize: 13, fontFamily: 'PlusJakartaSans_700Bold', color: '#FFFFFF' },
  langBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  langBtnText: { fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold' },

  // Hero
  hero: { paddingTop: 80, paddingBottom: 80, paddingHorizontal: 24, overflow: 'hidden' },
  heroBubble: { position: 'absolute', borderRadius: 9999, backgroundColor: '#FFFFFF' },
  heroContent: { maxWidth: 760, alignSelf: 'center', width: '100%', alignItems: 'center' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(249,115,22,0.18)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(249,115,22,0.3)' },
  heroBadgeText: { fontSize: 12, fontFamily: 'PlusJakartaSans_700Bold', color: '#F97316', letterSpacing: 0.5 },
  heroH1: { fontFamily: 'PlusJakartaSans_700Bold', color: '#FFFFFF', textAlign: 'center', lineHeight: 62, letterSpacing: -1, marginBottom: 20 },
  heroSub: { fontFamily: 'PlusJakartaSans_400Regular', color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 28, marginBottom: 36 },
  heroCtaRow: { gap: 14, alignItems: 'center', marginBottom: 28 },
  heroPrimaryBtn: { borderRadius: 14, overflow: 'hidden', shadowColor: '#E8580C', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 8 },
  heroPrimaryBtnGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 16, gap: 10 },
  heroPrimaryBtnText: { fontSize: 16, fontFamily: 'PlusJakartaSans_700Bold', color: '#FFFFFF' },
  heroSecondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)' },
  heroSecondaryBtnText: { fontSize: 14, fontFamily: 'PlusJakartaSans_600SemiBold', color: '#FFFFFF' },
  heroTrust: { flexDirection: 'row', gap: 20, flexWrap: 'wrap', justifyContent: 'center' },
  heroTrustItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroTrustText: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', color: 'rgba(255,255,255,0.75)' },

  // Stats
  statsStrip: { flexDirection: 'row', borderBottomWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  statItem: { flex: 1, paddingVertical: 24, alignItems: 'center' },
  statBorder: { borderRightWidth: 1 },
  statNumber: { fontSize: 28, fontFamily: 'PlusJakartaSans_700Bold', color: '#E8580C', marginBottom: 4 },
  statLabel: { fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular' },

  // Section
  section: { paddingVertical: 72, paddingHorizontal: 24 },
  container: { maxWidth: 1200, alignSelf: 'center', width: '100%' },
  sectionHead: { alignItems: 'center', marginBottom: 48 },
  sectionEyebrow: { fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold', color: '#E8580C', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 },
  sectionTitle: { fontSize: 36, fontFamily: 'PlusJakartaSans_700Bold', textAlign: 'center', lineHeight: 46, marginBottom: 14 },
  sectionSub: { fontSize: 16, fontFamily: 'PlusJakartaSans_400Regular', textAlign: 'center', lineHeight: 26, maxWidth: 560 },

  // Features
  featureGrid: { gap: 20 },
  featureCard: { borderRadius: 20, padding: 28, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3, marginBottom: 4 },
  featureIconBg: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  featureTitle: { fontSize: 16, fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 8 },
  featureDesc: { fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular', lineHeight: 22 },

  // Steps
  stepsRow: { gap: 24, alignItems: 'flex-start' },
  stepCard: { alignItems: 'center', position: 'relative', paddingHorizontal: 16 },
  stepNum: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  stepNumText: { fontSize: 20, fontFamily: 'PlusJakartaSans_700Bold' },
  stepLine: { position: 'absolute', top: 32, left: '60%', right: '-40%', height: 2 },
  stepTitle: { fontSize: 17, fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 8, textAlign: 'center' },
  stepDesc: { fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular', lineHeight: 22, textAlign: 'center' },

  // Categories
  catGrid: { gap: 16 },
  catCard: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 16, padding: 20, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, marginBottom: 4 },
  catIconBg: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 2 },
  catHint: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' },

  // Testimonials
  testimonialRow: { gap: 20 },
  testimonialCard: { borderRadius: 20, padding: 28, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  stars: { flexDirection: 'row', gap: 3, marginBottom: 16 },
  testimonialText: { fontSize: 15, fontFamily: 'PlusJakartaSans_400Regular', lineHeight: 24, marginBottom: 20, fontStyle: 'italic' },
  testimonialAuthor: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  testimonialAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(232,88,12,0.12)', alignItems: 'center', justifyContent: 'center' },
  testimonialAvatarText: { fontSize: 16, fontFamily: 'PlusJakartaSans_700Bold', color: '#E8580C' },
  testimonialName: { fontSize: 14, fontFamily: 'PlusJakartaSans_700Bold' },
  testimonialLoc: { fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular' },

  // CTA Band
  ctaBand: { paddingVertical: 72, paddingHorizontal: 24, alignItems: 'center' },
  ctaBandTitle: { fontFamily: 'PlusJakartaSans_700Bold', color: '#FFFFFF', textAlign: 'center', marginBottom: 14 },
  ctaBandSub: { fontSize: 16, fontFamily: 'PlusJakartaSans_400Regular', color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginBottom: 36 },
  ctaBandBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 32, paddingVertical: 18, borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 8 },
  ctaBandBtnText: { fontSize: 16, fontFamily: 'PlusJakartaSans_700Bold', color: '#E8580C' },

  // Footer
  footer: { paddingTop: 56 },
  footerInner: { flexDirection: 'row', gap: 48, flexWrap: 'wrap', marginBottom: 40 },
  footerBrand: { flex: 1, minWidth: 260 },
  footerTagline: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', color: '#9CA3AF', marginTop: 12, marginBottom: 8 },
  footerDisc: { fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular', color: '#6B7280', lineHeight: 18, maxWidth: 320 },
  footerLinks: { flexDirection: 'column', gap: 10 },
  footerLink: { paddingVertical: 4 },
  footerLinkText: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', color: '#9CA3AF' },
  footerBottom: { borderTopWidth: 1, borderTopColor: '#1F2937', paddingVertical: 20, alignItems: 'center' },
  footerCopy: { fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular', color: '#4B5563' },
});
