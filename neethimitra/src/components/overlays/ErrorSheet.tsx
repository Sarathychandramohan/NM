import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Pressable, Linking, useWindowDimensions } from 'react-native';
import { AlertTriangle, X } from 'lucide-react-native';
import { useAppStore } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming 
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';


interface ErrorSheetProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorSheet({ 
  title = 'Something went wrong', 
  message = 'We encountered an error while communicating with our servers. Please check your connection and try again.', 
  onRetry 
}: ErrorSheetProps) {
  const { activeOverlay, setOverlay, isDarkMode } = useAppStore();
  const C = isDarkMode ? Colors.dark : Colors.light;
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const bgOpacity = useSharedValue(0);

  const isVisible = activeOverlay === 'error';

  useEffect(() => {
    if (isVisible) {
      bgOpacity.value = withTiming(0.4, { duration: 250 });
      translateY.value = withSpring(SCREEN_HEIGHT - 310, { damping: 24, stiffness: 300 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      bgOpacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 });
    }
  }, [isVisible]);

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const animatedBgStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  const handleClose = () => {
    setOverlay(null);
  };

  const handleRetry = () => {
    setOverlay(null);
    if (onRetry) {
      setTimeout(() => onRetry(), 200);
    }
  };

  const handleSupport = () => {
    Linking.openURL('mailto:support@neethimitra.in?subject=NeethiMitra App Support Request');
  };

  if (!isVisible) return null;

  return (
    <View 
      style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
      className="absolute inset-0 z-50 justify-end"
    >
      {/* Background Dim */}
      <Pressable 
        style={[animatedBgStyle]} 
        onPress={handleClose}
        className="absolute inset-0 bg-black"
      />

      {/* Sheet Body */}
      <Animated.View 
        style={[animatedSheetStyle, { backgroundColor: C.surface }]}
        className="w-full rounded-t-[28px] shadow-2xl border-t border-zinc-200/20 px-6 pt-5 pb-8 absolute bottom-0 left-0 right-0 items-center"
      >
        {/* Drag Handle */}
        <View className="w-10 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full mb-6" />

        {/* 48dp warning triangle icon */}
        <View className="w-12 h-12 rounded-full bg-saffron-100 dark:bg-saffron-950/30 items-center justify-center mb-4">
          <AlertTriangle size={26} color={Colors.orange} />
        </View>

        {/* Headline */}
        <Text className="text-[20px] font-jakarta font-bold text-center text-zinc-950 dark:text-zinc-50 mb-2">
          {title}
        </Text>

        {/* Explanation */}
        <Text className="text-[14px] font-jakarta font-medium text-center text-zinc-500 mb-6 max-w-[85%] leading-5">
          {message}
        </Text>

        {/* Try Again button */}
        <TouchableOpacity
          onPress={handleRetry}
          activeOpacity={0.8}
          style={{ backgroundColor: Colors.orange }}
          className="w-full h-12 rounded-xl items-center justify-center shadow-lg shadow-saffron-500/20 mb-4"
        >
          <Text className="text-[15px] font-jakarta font-bold text-white tracking-[0.3px]">
            Try Again
          </Text>
        </TouchableOpacity>

        {/* Contact Support link */}
        <TouchableOpacity onPress={handleSupport} activeOpacity={0.7}>
          <Text className="text-[14px] font-jakarta font-semibold text-saffron-500 underline">
            Contact Support
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
