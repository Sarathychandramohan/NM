import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useAppStore, Session } from '@store/useAppStore';
import { useRouter } from 'expo-router';
import { 
  Home, 
  Briefcase, 
  ShieldAlert, 
  User, 
  Heart, 
  Scale,
  MessageSquare
} from 'lucide-react-native';
import { Colors } from '@constants/colors';
import { UI_TRANSLATIONS } from '@constants/translations';

const CATEGORY_ICONS: Record<string, { Icon: any; color: string }> = {
  land: { Icon: Home, color: '#78350F' },
  police: { Icon: Briefcase, color: '#1E3A5F' },
  cyber: { Icon: ShieldAlert, color: '#1D4ED8' },
  health: { Icon: Heart, color: '#134E4A' },
  family: { Icon: User, color: '#5C1A3A' },
  rti: { Icon: Scale, color: '#EA580C' },
  general: { Icon: MessageSquare, color: '#0369A1' },
};

export function RecentSessionsStrip() {
  const router = useRouter();
  const { sessions, isDarkMode, loadSession, selectedLanguage } = useAppStore();
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];

  const handleSessionPress = async (session: Session) => {
    await loadSession(session.id);
    router.push(`/chat/${session.categoryId}` as any);
  };

  const formatDate = (date: any) => {
    try {
      const d = new Date(date);
      return d.toLocaleDateString(selectedLanguage.code, { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  const activeSessions = sessions.slice(0, 5); // Display top 5 recent sessions

  return (
    <View className="mb-8">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-[12px] font-jakarta font-bold text-zinc-900 dark:text-zinc-50 uppercase tracking-widest">
          {t.recentActivity}
        </Text>
        {sessions.length > 0 && (
          <TouchableOpacity onPress={() => router.push('/chat-history' as any)}>
            <Text className="text-xs font-jakarta font-bold text-saffron-600">
              {t.seeAll} →
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {sessions.length === 0 ? (
        <View className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/80 rounded-2xl p-6 items-center justify-center">
          <View className="bg-zinc-100 dark:bg-zinc-800/60 p-2.5 rounded-full mb-2">
            <MessageSquare size={20} color="#94A3B8" />
          </View>
          <Text className="text-xs font-jakarta text-zinc-400 dark:text-zinc-500 text-center">
            {t.pastConsultationsHint}
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 20 }}
          className="flex-row"
        >
          {activeSessions.map((session) => {
            const catLabel = t[session.categoryId] || session.categoryLabel;
            return (
              <TouchableOpacity
                key={session.id}
                onPress={() => handleSessionPress(session)}
                activeOpacity={0.8}
                style={{
                  width: 160,
                  height: 80,
                  backgroundColor: isDarkMode ? Colors.dark.surface : '#FFFFFF',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: isDarkMode ? 0.2 : 0.02,
                  shadowRadius: 3,
                  elevation: 1,
                }}
                className="border border-zinc-100 dark:border-zinc-800/80 rounded-xl p-3 mr-3 justify-between"
              >
                <View className="flex-row items-center">
                  {(() => {
                    const iconInfo = CATEGORY_ICONS[session.categoryId] || { Icon: MessageSquare, color: '#EA580C' };
                    const CatIcon = iconInfo.Icon;
                    return <CatIcon size={16} color={iconInfo.color} strokeWidth={1.8} className="mr-1.5" />;
                  })()}
                  <Text className="text-[12px] font-jakarta font-bold text-zinc-900 dark:text-zinc-100 flex-1" numberOfLines={1}>
                    {catLabel}
                  </Text>
                </View>
                
                <View className="flex-row justify-between items-end mt-1">
                  <Text className="text-[10px] font-jakarta text-zinc-400 dark:text-zinc-500">
                    {formatDate(session.startedAt)}
                  </Text>
                  <Text className="text-[10px] font-jakarta font-bold text-saffron-500">
                    {session.messages.length} {t.msgs}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
