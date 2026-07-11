import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Pressable, useWindowDimensions } from 'react-native';
import { Check } from 'lucide-react-native';
import { useAppStore } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  withDelay
} from 'react-native-reanimated';
import { safeNotification } from '../../utils/haptics';
import * as Haptics from 'expo-haptics';


interface SuccessSheetProps {
  title?: string;
  description?: string;
  ctaText?: string;
  onPressCta?: () => void;
}

export function SuccessSheet({ 
  title = 'Done!', 
  description = 'Your document was compiled and saved to My Files successfully.', 
  ctaText = 'View File', 
  onPressCta 
}: SuccessSheetProps) {
  const { activeOverlay, setOverlay, isDarkMode } = useAppStore();
  const C = isDarkMode ? Colors.dark : Colors.light;
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();

  const translateY = useSharedValue(SCREEN_HEIGHT);
  const bgOpacity = useSharedValue(0);

  // Success animations
  const circleScale = useSharedValue(0.3);
  const checkmarkOpacity = useSharedValue(0);

  const isVisible = activeOverlay === 'success';

  useEffect(() => {
    let dismissTimer: any;

    if (isVisible) {
      bgOpacity.value = withTiming(0.4, { duration: 250 });
      translateY.value = withSpring(SCREEN_HEIGHT - 280, { damping: 24, stiffness: 300 });

      // Animate checkmark circle
      circleScale.value = withSpring(1.0, { damping: 15, stiffness: 200 });
      checkmarkOpacity.value = withDelay(400, withTiming(1, { duration: 200 }));

      safeNotification(Haptics.NotificationFeedbackType.Success);

      // Auto-dismiss after 4 seconds
      dismissTimer = setTimeout(() => {
        handleClose();
      }, 4000);
    } else {
      bgOpacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 });
      circleScale.value = 0.3;
      checkmarkOpacity.value = 0;
    }

    return () => {
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  }, [isVisible]);

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const animatedBgStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  const animatedCircleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: circleScale.value }],
  }));

  const animatedCheckmarkStyle = useAnimatedStyle(() => ({
    opacity: checkmarkOpacity.value,
  }));

  const handleClose = () => {
    setOverlay(null);
  };

  const handleCta = () => {
    setOverlay(null);
    if (onPressCta) {
      setTimeout(() => onPressCta(), 200);
    }
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

        {/* Large 64dp checkmark circle */}
        <Animated.View 
          style={[animatedCircleStyle]}
          className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/30 items-center justify-center mb-4"
        >
          <Animated.View style={[animatedCheckmarkStyle]}>
            <Check size={32} color={Colors.green} strokeWidth={3} />
          </Animated.View>
        </Animated.View>

        {/* Title */}
        <Text className="text-[24px] font-jakarta font-bold text-center text-zinc-950 dark:text-zinc-50 mb-2">
          {title}
        </Text>

        {/* Body Text */}
        <Text className="text-[14px] font-jakarta font-medium text-center text-zinc-500 mb-6 max-w-[80%] leading-5">
          {description}
        </Text>

        {/* Full-width green gradient CTA */}
        <TouchableOpacity
          onPress={handleCta}
          activeOpacity={0.8}
          className="w-full h-12 rounded-xl overflow-hidden"
        >
          <LinearGradient
            colors={Colors.gradients.forest as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="flex-1 items-center justify-center"
          >
            <Text className="text-[15px] font-jakarta font-bold text-white tracking-[0.3px]">
              {ctaText}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
