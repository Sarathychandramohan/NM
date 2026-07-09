import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Pressable, useWindowDimensions } from 'react-native';
import { Camera, Image as ImageIcon, FileText, X } from 'lucide-react-native';
import { useAppStore } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming 
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';


interface DocumentUploadProps {
  onCaptureImage: () => void;
  onPickImage: () => void;
  onPickDocument: () => void;
}

export function DocumentUpload({ onCaptureImage, onPickImage, onPickDocument }: DocumentUploadProps) {
  const { activeOverlay, setOverlay, isDarkMode } = useAppStore();
  const C = isDarkMode ? Colors.dark : Colors.light;
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();

  const translateY = useSharedValue(SCREEN_HEIGHT);
  const bgOpacity = useSharedValue(0);

  const isVisible = activeOverlay === 'upload';

  useEffect(() => {
    if (isVisible) {
      bgOpacity.value = withTiming(0.4, { duration: 200 });
      translateY.value = withSpring(SCREEN_HEIGHT - 320, { damping: 24, stiffness: 300 });
    } else {
      bgOpacity.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 180 });
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

  const handleAction = (callback: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOverlay(null);
    setTimeout(() => {
      callback();
    }, 200);
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
        className="w-full rounded-t-[28px] shadow-2xl border-t border-zinc-200/20 px-6 pt-2 pb-8 absolute bottom-0 left-0 right-0"
      >
        {/* Drag Handle */}
        <View className="items-center py-2.5">
          <View className="w-10 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
        </View>

        {/* Title */}
        <View className="mb-4">
          <Text className="text-[18px] font-jakarta font-bold text-zinc-950 dark:text-zinc-50">
            Attach Document
          </Text>
          <Text className="text-[12px] font-jakarta font-medium text-zinc-500 mt-0.5">
            Add support files to analyze or verify
          </Text>
        </View>

        {/* 3 Options list */}
        <View className="gap-2.5 mb-4">
          {/* Camera Option */}
          <TouchableOpacity
            onPress={() => handleAction(onCaptureImage)}
            activeOpacity={0.7}
            className="flex-row items-center p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl"
          >
            <View className="w-10 h-10 rounded-full bg-saffron-100 dark:bg-saffron-950/30 items-center justify-center mr-3">
              <Camera size={20} color={Colors.orange} />
            </View>
            <Text className="text-[15px] font-jakarta font-semibold text-zinc-900 dark:text-zinc-100">
              Take Photo
            </Text>
          </TouchableOpacity>

          {/* Gallery Option */}
          <TouchableOpacity
            onPress={() => handleAction(onPickImage)}
            activeOpacity={0.7}
            className="flex-row items-center p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl"
          >
            <View className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/30 items-center justify-center mr-3">
              <ImageIcon size={20} color={Colors.green} />
            </View>
            <Text className="text-[15px] font-jakarta font-semibold text-zinc-900 dark:text-zinc-100">
              Choose from Gallery
            </Text>
          </TouchableOpacity>

          {/* Files PDF Option */}
          <TouchableOpacity
            onPress={() => handleAction(onPickDocument)}
            activeOpacity={0.7}
            className="flex-row items-center p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl"
          >
            <View className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950/30 items-center justify-center mr-3">
              <FileText size={20} color="#2563EB" />
            </View>
            <Text className="text-[15px] font-jakarta font-semibold text-zinc-900 dark:text-zinc-100">
              Select PDF File
            </Text>
          </TouchableOpacity>
        </View>

        {/* Separate Cancel card below */}
        <TouchableOpacity
          onPress={handleClose}
          activeOpacity={0.75}
          className="w-full bg-zinc-100 dark:bg-zinc-800 py-3.5 rounded-xl border border-zinc-200/50 dark:border-zinc-700/50"
        >
          <Text className="text-[14px] font-jakarta font-bold text-center text-zinc-700 dark:text-zinc-300">
            Cancel
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
