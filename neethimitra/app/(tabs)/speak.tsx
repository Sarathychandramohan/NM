import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useAppStore } from '@store/useAppStore';
import { useNavigation } from 'expo-router';

export default function SpeakTabScreen() {
  const { setOverlay } = useAppStore();
  const navigation = useNavigation();

  useEffect(() => {
    // Open recording overlay immediately when focused
    const unsubscribe = navigation.addListener('focus', () => {
      setOverlay('recording');
    });

    return unsubscribe;
  }, [navigation]);

  return (
    <View className="flex-1 bg-zinc-50 dark:bg-zinc-950 items-center justify-center">
      <Text className="text-zinc-400 dark:text-zinc-500 font-jakarta">
        Opening voice recorder...
      </Text>
    </View>
  );
}
