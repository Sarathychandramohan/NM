import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { useAppStore, Category, getTextScale } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import { Home, Briefcase, ShieldAlert, User, Heart, Scale, MessageSquare } from 'lucide-react-native';
import { UI_TRANSLATIONS } from '@constants/translations';

const isWeb = (Platform.OS as string) === 'web';

interface CategoryCardProps {
  category: Category;
  onPress: (category: Category) => void;
  webFullWidth?: boolean; // tablet: full row width; desktop: handled by parent grid
}

const CATEGORY_META: Record<string, { label: string; hint: string; Icon: any }> = {
  land:   { label: 'Land & Property',  hint: 'Encroachment, inheritance, title', Icon: Home       },
  police: { label: 'Police & FIR',     hint: 'Draft FIR, rights, complaints',    Icon: Briefcase  },
  cyber:  { label: 'Cyber Fraud',      hint: 'UPI scam, OTP theft, fake jobs',   Icon: ShieldAlert },
  health: { label: 'Health Rights',    hint: 'Negligence, insurance, bills',     Icon: Heart      },
  family: { label: 'Women & Seniors',  hint: 'Domestic violence, maintenance',   Icon: User       },
  rti:    { label: 'Govt Schemes',     hint: 'PM-KISAN, ration card, RTI',       Icon: Scale      },
  general:{ label: 'General Legal Query', hint: "Ask any legal question if you're unsure which category it belongs to.", Icon: MessageSquare },
};

export function CategoryCard({ category, onPress, webFullWidth = false }: CategoryCardProps) {
  const { isDarkMode, selectedLanguage, textSize } = useAppStore();
  const scale = getTextScale(textSize);
  const C    = isDarkMode ? Colors.dark : Colors.light;
  const { width: screenWidth } = useWindowDimensions();
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];

  // Responsive card width
  const cardWidth = isWeb
    ? webFullWidth
      ? '48%'   // tablet: two-per-row
      : '47%'   // desktop: ~two-per-row within right panel
    : (screenWidth - 52) / 2; // mobile: fixed half-width

  const meta = CATEGORY_META[category.id] ?? {
    label: category.label,
    hint:  category.description,
    Icon:  Scale,
  };
  
  const label = t[category.id] ?? meta.label;
  const hint = t[`${category.id}Hint`] ?? meta.hint;
  
  const accent = Colors.category[category.colorKey] ?? { color: Colors.orange, bg: 'rgba(249,115,22,0.09)' };
  const Icon   = meta.Icon;

  const isDesktop = isWeb && screenWidth >= 1024;

  return (
    <TouchableOpacity
      onPress={() => onPress(category)}
      activeOpacity={0.72}
      style={[styles.card, {
        width: cardWidth as any,
        backgroundColor: C.surface,
        borderColor:     C.surfaceBorder,
        shadowColor:     C.shadow,
        borderLeftColor: accent.color,
        height: isDesktop ? 140 : 118,
        padding: isDesktop ? 18 : 14,
      }]}
    >
      {/* Icon badge */}
      <View style={[
        styles.iconWrap, 
        { 
          backgroundColor: accent.bg,
          width: isDesktop ? 46 : 38,
          height: isDesktop ? 46 : 38,
          borderRadius: isDesktop ? 12 : 10,
        }
      ]}>
        <Icon size={isDesktop ? 24 : 20} color={accent.color} strokeWidth={1.8} />
      </View>

      {/* Text */}
      <View style={styles.textWrap}>
        <Text
          style={[
            styles.label,
            { color: C.text },
            isDesktop
              ? { fontSize: 16 * scale, lineHeight: 22 * scale }
              : { fontSize: 13 * scale, lineHeight: 18 * scale }
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit={true}
          minimumFontScale={0.75}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.hint,
            { color: C.textSecondary },
            isDesktop
              ? { fontSize: 12 * scale, lineHeight: 16 * scale }
              : { fontSize: 10 * scale, lineHeight: 14 * scale }
          ]}
          numberOfLines={2}
          adjustsFontSizeToFit={true}
          minimumFontScale={0.75}
        >
          {hint}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 118,
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 14,
    marginBottom: 12,
    justifyContent: 'space-between',
    // shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    gap: 3,
  },
  label: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    lineHeight: 18,
  },
  hint: {
    fontSize: 10,
    fontFamily: 'PlusJakartaSans_400Regular',
    lineHeight: 14,
  },
});
