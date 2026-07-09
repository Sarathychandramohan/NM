import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Pressable, Platform, useWindowDimensions } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { useAppStore } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { safeImpact } from '@/utils/haptics';
import * as Haptics from 'expo-haptics';

interface ConfirmModalProps {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function ConfirmModal({ 
  title = 'Are you sure?', 
  description = 'This action cannot be undone. Do you want to proceed?', 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  isDestructive = true,
  onConfirm,
  onCancel 
}: ConfirmModalProps) {
  const { activeOverlay, setOverlay, isDarkMode } = useAppStore();
  const C = isDarkMode ? Colors.dark : Colors.light;
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);
  const bgOpacity = useSharedValue(0);

  // Button transitions
  const btn1Scale = useSharedValue(0.9);
  const btn2Scale = useSharedValue(0.9);

  const isVisible = activeOverlay === 'confirm';
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    if (isVisible) {
      bgOpacity.value = withTiming(0.6, { duration: 200 });
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1.0, { damping: 20, stiffness: 240 });

      btn1Scale.value = withTiming(1, { duration: 150 });
      btn2Scale.value = withDelay(80, withTiming(1, { duration: 150 }));

      safeImpact(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      bgOpacity.value = withTiming(0, { duration: 150 });
      opacity.value = withTiming(0, { duration: 150 });
      scale.value = withTiming(0.9, { duration: 150 });
      btn1Scale.value = 0.9;
      btn2Scale.value = 0.9;
    }
  }, [isVisible]);

  const animatedModalStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const animatedBgStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  const animatedBtn1 = useAnimatedStyle(() => ({
    transform: [{ scale: btn1Scale.value }],
    flex: isWeb ? 1 : undefined,
  }));

  const animatedBtn2 = useAnimatedStyle(() => ({
    transform: [{ scale: btn2Scale.value }],
    flex: isWeb ? 1 : undefined,
  }));

  const handleClose = () => {
    setOverlay(null);
    if (onCancel) onCancel();
  };

  const handleConfirm = () => {
    setOverlay(null);
    if (onConfirm) {
      setTimeout(() => onConfirm(), 200);
    }
  };

  if (!isVisible) return null;

  return (
    <View 
      style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
      className="absolute inset-0 z-50 justify-center items-center px-6"
    >
      {/* Background Dim Backdrop */}
      <Pressable 
        style={[animatedBgStyle]} 
        onPress={handleClose}
        className="absolute inset-0 bg-black"
      />

      {/* Modal Container */}
      <Animated.View 
        style={[
          animatedModalStyle, 
          { 
            backgroundColor: isDarkMode ? '#17171C' : '#FFFFFF', 
            width: Math.min(SCREEN_WIDTH - 48, isWeb ? 420 : 360),
            borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
            borderWidth: 1,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.15,
            shadowRadius: 30,
            elevation: 10,
          }
        ]}
        className="rounded-[24px] p-7 items-center"
      >
        {/* Warning Icon Badge */}
        <View 
          style={{ 
            backgroundColor: isDarkMode ? 'rgba(239,68,68,0.15)' : '#FEF2F2',
            borderColor: isDarkMode ? 'rgba(239,68,68,0.3)' : '#FEE2E2',
            borderWidth: 1,
          }}
          className="w-14 h-14 rounded-full items-center justify-center mb-5"
        >
          <AlertCircle size={28} color="#EF4444" strokeWidth={2} />
        </View>

        {/* Title */}
        <Text style={{ color: C.text }} className="text-[22px] font-jakarta font-bold text-center mb-2.5">
          {title}
        </Text>

        {/* Description */}
        <Text style={{ color: C.textSecondary }} className="text-[14px] font-jakarta font-medium text-center mb-8 leading-6">
          {description}
        </Text>

        {/* Action Buttons: Row on Web, Column on Mobile */}
        <View style={{ flexDirection: isWeb ? 'row' : 'column', gap: 12, width: '100%' }}>
          
          {/* Outlined Cancel button */}
          <Animated.View style={[animatedBtn2]}>
            <TouchableOpacity
              onPress={handleClose}
              activeOpacity={0.7}
              style={{
                borderColor: isDarkMode ? '#3F3F46' : '#D1D5DB',
                borderWidth: 1.2,
                backgroundColor: isDarkMode ? 'transparent' : '#FFFFFF',
              }}
              className="w-full h-12 rounded-xl items-center justify-center"
            >
              <Text style={{ color: isDarkMode ? '#E4E4E7' : '#374151' }} className="text-[15px] font-jakarta font-bold">
                {cancelText}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Destructive Confirm button */}
          <Animated.View style={[animatedBtn1]}>
            <TouchableOpacity
              onPress={handleConfirm}
              activeOpacity={0.85}
              style={{ backgroundColor: '#EF4444' }}
              className="w-full h-12 rounded-xl items-center justify-center shadow-lg shadow-red-500/15"
            >
              <Text className="text-[15px] font-jakarta font-bold text-white tracking-[0.3px]">
                {confirmText}
              </Text>
            </TouchableOpacity>
          </Animated.View>

        </View>
      </Animated.View>
    </View>
  );
}
