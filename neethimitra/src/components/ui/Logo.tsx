import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useAppStore } from '@store/useAppStore';

interface LogoProps {
  size?: number;
  showText?: boolean;
  stacked?: boolean;
  lightBg?: boolean;
  whiteVersion?: boolean;
}

const TAGLINES: Record<string, string> = {
  'en-IN': 'Know Your Rights. In Your Voice.',
  'hi-IN': 'अपने अधिकार जानें। अपनी आवाज़ में।',
  'ta-IN': 'உங்கள் உரிமைகளை அறியுங்கள். உங்கள் குரலில்.',
  'te-IN': 'మీ హక్కులను తెలుసుకోండి. మీ వాయిస్‌లో.',
  'bn-IN': 'আপনার অধিকার জানুন। আপনার কণ্ঠে।',
  'mr-IN': 'तुमचे हक्क जाणून घ्या। तुमच्या आवाजात.',
  'kn-IN': 'ನಿಮ್ಮ ಹಕ್ಕುಗಳನ್ನು ತಿಳियಿರಿ. ನಿಮ್ಮ ಧ್ವನಿಯಲ್ಲಿ.',
  'ml-IN': 'നിങ്ങളുടെ അവകാശങ്ങൾ അറിയുക. നിങ്ങളുടെ ശബ്ദത്തിൽ.',
  'gu-IN': 'તમારા અધિકારો જાણો. તમારા અવાજમાં.',
  'pa-IN': 'ਆਪਣੇ ਅਧਿਕਾਰ ਜਾਣੋ। ਆਪਣੀ ਆਵਾਜ਼ ਵਿੱਚ।',
  'od-IN': 'ଆପଣଙ୍କର ଅଧିକାର ଜାଣନ୍ତୁ | ଆପଣଙ୍କ ସ୍ୱରରେ |',
};

export function Logo({ size = 40, showText = true, stacked = false, lightBg = true, whiteVersion = false }: LogoProps) {
  const { selectedLanguage } = useAppStore();
  
  // SVG Logo Mark Component
  const LogoMark = () => {
    const strokeWidth = 4;
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          {/* Left is Green (#1A6B3C), Right is Saffron/Orange (#E8580C) */}
          <LinearGradient id="logoBorder" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={whiteVersion ? "#FFFFFF" : "#1A6B3C"} />
            <Stop offset="100%" stopColor={whiteVersion ? "#FFFFFF" : "#E8580C"} />
          </LinearGradient>
          {/* Gold center gradient for scales */}
          <LinearGradient id="scalesGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={whiteVersion ? "#FFFFFF" : "#FBBF24"} />
            <Stop offset="100%" stopColor={whiteVersion ? "#FFFFFF" : "#E8580C"} />
          </LinearGradient>
        </Defs>

        {/* 12 spokes subtle radial burst behind scales */}
        {[...Array(12)].map((_, i) => {
          const angle = (i * Math.PI) / 6;
          const x2 = 50 + 32 * Math.cos(angle);
          const y2 = 45 + 32 * Math.sin(angle);
          return (
            <Line
              key={i}
              x1="50"
              y1="45"
              x2={x2.toString()}
              y2={y2.toString()}
              stroke={whiteVersion ? "#FFFFFF" : "#E8580C"}
              strokeWidth="0.8"
              opacity={whiteVersion ? "0.2" : "0.08"}
            />
          );
        })}

        {/* Speech bubble outer shell */}
        <Path
          d="M 50 7 A 38 38 0 1 0 78 72 L 86 86 L 72 78 A 38 38 0 0 0 50 7 Z"
          fill="transparent"
          stroke="url(#logoBorder)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Scales of Justice */}
        {/* Vertical Pillar */}
        <Line x1="50" y1="26" x2="50" y2="70" stroke="url(#scalesGrad)" strokeWidth="4.5" strokeLinecap="round" />
        <Circle cx="50" cy="23" r="3.5" fill={whiteVersion ? "#FFFFFF" : "#E8580C"} />

        {/* Base stand */}
        <Path d="M 38 70 L 62 70" stroke="url(#scalesGrad)" strokeWidth="4.5" strokeLinecap="round" />

        {/* Main balance beam */}
        <Line x1="24" y1="36" x2="76" y2="36" stroke="url(#scalesGrad)" strokeWidth="4" strokeLinecap="round" />

        {/* Left balance plate & strings */}
        <Line x1="24" y1="36" x2="16" y2="52" stroke={whiteVersion ? "#FFFFFF" : "#E8580C"} strokeWidth="1.5" />
        <Line x1="24" y1="36" x2="32" y2="52" stroke={whiteVersion ? "#FFFFFF" : "#E8580C"} strokeWidth="1.5" />
        <Path d="M 12 52 L 36 52 A 12 6 0 0 0 12 52 Z" fill={whiteVersion ? "#FFFFFF" : "#E8580C"} />

        {/* Right balance plate & strings */}
        <Line x1="76" y1="36" x2="68" y2="52" stroke={whiteVersion ? "#FFFFFF" : "#E8580C"} strokeWidth="1.5" />
        <Line x1="76" y1="36" x2="84" y2="52" stroke={whiteVersion ? "#FFFFFF" : "#E8580C"} strokeWidth="1.5" />
        <Path d="M 64 52 L 88 52 A 12 6 0 0 0 64 52 Z" fill={whiteVersion ? "#FFFFFF" : "#E8580C"} />
      </Svg>
    );
  };

  // Dynamic scaling calculations based on icon size
  const titleSize = Math.max(15, Math.round(size * 0.48));
  const subtitleSize = Math.max(8, Math.round(size * 0.22));
  const aiSize = Math.max(10, Math.round(size * 0.3));
  const spacing = Math.max(4, Math.round(size * 0.15));

  if (!showText) {
    return <LogoMark />;
  }

  const logoText = selectedLanguage.logoText || 'NeethiMitra';
  const isEnglish = selectedLanguage.code === 'en-IN';
  const tagline = TAGLINES[selectedLanguage.code] || TAGLINES['en-IN'];

  if (stacked) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', gap: spacing / 2 }}>
        <LogoMark />
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: titleSize, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: -0.5 }}>
            {whiteVersion ? (
              <Text style={{ color: '#FFFFFF' }}>{logoText}</Text>
            ) : isEnglish ? (
              <>
                <Text style={{ color: '#E8580C' }}>Neethi</Text>
                <Text style={{ color: '#1A6B3C' }}>Mitra</Text>
              </>
            ) : (
              <Text style={{ color: '#E8580C' }}>{logoText}</Text>
            )}
            <Text style={{ fontSize: aiSize, position: 'relative', top: -aiSize * 0.2, marginLeft: 2, color: whiteVersion ? 'rgba(255,255,255,0.8)' : '#6B7280' }}>AI</Text>
          </Text>
          <Text style={{ fontSize: subtitleSize, fontFamily: 'PlusJakartaSans_400Regular_Italic', marginTop: 2, color: whiteVersion ? 'rgba(255,255,255,0.8)' : '#9CA3AF', textAlign: 'center' }}>
            {tagline}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing }}>
      <LogoMark />
      <View style={{ justifyContent: 'center' }}>
        <Text style={{ fontSize: titleSize, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: -0.5, lineHeight: titleSize * 1.1 }}>
          {whiteVersion ? (
            <Text style={{ color: '#FFFFFF' }}>{logoText}</Text>
          ) : isEnglish ? (
            <>
              <Text style={{ color: '#E8580C' }}>Neethi</Text>
              <Text style={{ color: '#1A6B3C' }}>Mitra</Text>
            </>
          ) : (
            <Text style={{ color: '#E8580C' }}>{logoText}</Text>
          )}
          <Text style={{ fontSize: aiSize, position: 'relative', top: -aiSize * 0.2, marginLeft: 2, color: whiteVersion ? 'rgba(255,255,255,0.8)' : '#6B7280' }}>AI</Text>
        </Text>
        <Text style={{ fontSize: subtitleSize, fontFamily: 'PlusJakartaSans_400Regular_Italic', color: whiteVersion ? 'rgba(255,255,255,0.7)' : '#9CA3AF', lineHeight: subtitleSize * 1.2 }}>
          {tagline}
        </Text>
      </View>
    </View>
  );
}
