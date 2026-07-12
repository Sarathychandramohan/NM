import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Pressable, useWindowDimensions, Platform, Animated } from 'react-native';
import { Camera, Image as ImageIcon, FileText, X } from 'lucide-react-native';
import { useAppStore } from '@store/useAppStore';
import { Colors } from '@constants/colors';
import { safeImpact } from '@/utils/haptics';
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

  const isLargeWeb = Platform.OS === 'web' && SCREEN_WIDTH >= 768;

  const translateY = useRef(new Animated.Value(320)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;
  
  const scaleVal = useRef(new Animated.Value(0.95)).current;
  const opacityVal = useRef(new Animated.Value(0)).current;

  const isVisible = activeOverlay === 'upload';

  useEffect(() => {
    if (isVisible) {
      Animated.parallel([
        Animated.timing(bgOpacity, {
          toValue: 0.45,
          duration: 220,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 24,
          stiffness: 300,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.spring(scaleVal, {
          toValue: 1.0,
          damping: 20,
          stiffness: 260,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacityVal, {
          toValue: 1,
          duration: 200,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(bgOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(translateY, {
          toValue: 320,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(scaleVal, {
          toValue: 0.95,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacityVal, {
          toValue: 0,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
    }
  }, [isVisible]);

  const handleClose = () => {
    setOverlay(null);
  };

  const handleAction = (callback: () => void) => {
    safeImpact(Haptics.ImpactFeedbackStyle.Light);
    setOverlay(null);
    setTimeout(() => {
      callback();
    }, 200);
  };

  if (!isVisible) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 10000,
        justifyContent: isLargeWeb ? 'center' : 'flex-end',
        alignItems: isLargeWeb ? 'center' : 'stretch',
      }}
    >
      {/* Background Dim */}
      <Animated.View 
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'black',
          opacity: bgOpacity,
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={handleClose} />
      </Animated.View>

      {/* Sheet / Dialog Body */}
      <Animated.View 
        style={{
          backgroundColor: C.surface,
          transform: isLargeWeb 
            ? [{ scale: scaleVal }] 
            : [{ translateY: translateY }],
          opacity: isLargeWeb ? opacityVal : 1,
          width: isLargeWeb ? 400 : '100%',
          maxWidth: isLargeWeb ? '90%' : '100%',
          borderRadius: isLargeWeb ? 24 : 0,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderWidth: 1,
          borderColor: isDarkMode ? '#27272A' : '#E5E7EB',
          paddingHorizontal: 24,
          paddingTop: isLargeWeb ? 24 : 12,
          paddingBottom: isLargeWeb ? 24 : 32,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.15,
          shadowRadius: 15,
          elevation: 10,
        }}
      >
        {/* Header bar with optional close button for desktop dialog */}
        {isLargeWeb ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontFamily: 'PlusJakartaSans_700Bold', color: C.text }}>
              Attach Document
            </Text>
            <TouchableOpacity 
              onPress={handleClose} 
              activeOpacity={0.7} 
              style={{ 
                padding: 6, 
                borderRadius: 20, 
                backgroundColor: isDarkMode ? '#27272A' : '#F3F4F6' 
              }}
            >
              <X size={16} color={C.textSecondary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        ) : (
          /* Mobile Drag Handle */
          <View style={{ alignItems: 'center', paddingVertical: 10 }}>
            <View style={{ width: 40, height: 4, backgroundColor: isDarkMode ? '#3F3F46' : '#D1D5DB', borderRadius: 2 }} />
          </View>
        )}

        {!isLargeWeb && (
          /* Mobile Title text */
          <View style={{ marginBottom: 16, marginTop: 4 }}>
            <Text style={{ fontSize: 18, fontFamily: 'PlusJakartaSans_700Bold', color: C.text }}>
              Attach Document
            </Text>
            <Text style={{ fontSize: 12, fontFamily: 'PlusJakartaSans_500Medium', color: C.textHint, marginTop: 2 }}>
              Add support files to analyze or verify
            </Text>
          </View>
        )}

        {isLargeWeb && (
          /* Desktop subtext */
          <Text style={{ fontSize: 13, fontFamily: 'PlusJakartaSans_500Medium', color: C.textSecondary, marginBottom: 20 }}>
            Upload support files (images or PDF documents) to analyze.
          </Text>
        )}

        {/* Options list */}
        <View style={{ gap: 12, marginBottom: isLargeWeb ? 0 : 20 }}>
          {Platform.OS !== 'web' && (
            /* Camera Option */
            <TouchableOpacity
              onPress={() => handleAction(onCaptureImage)}
              activeOpacity={0.75}
              style={{
                flexDirection: 'row', alignItems: 'center', padding: 16,
                backgroundColor: isDarkMode ? '#1E1E24' : '#F9FAFB',
                borderRadius: 16, borderWidth: 1, borderColor: isDarkMode ? '#27272A' : '#F3F4F6',
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Camera size={18} color={Colors.orange} />
              </View>
              <Text style={{ fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold', color: C.text }}>
                Take Photo
              </Text>
            </TouchableOpacity>
          )}

          {/* Gallery Option */}
          <TouchableOpacity
            onPress={() => handleAction(onPickImage)}
            activeOpacity={0.75}
            style={{
              flexDirection: 'row', alignItems: 'center', padding: 16,
              backgroundColor: isDarkMode ? '#1E1E24' : '#F9FAFB',
              borderRadius: 16, borderWidth: 1, borderColor: isDarkMode ? '#27272A' : '#F3F4F6',
            }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <ImageIcon size={18} color={Colors.green} />
            </View>
            <Text style={{ fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold', color: C.text }}>
              {Platform.OS === 'web' ? 'Upload Image' : 'Choose from Gallery'}
            </Text>
          </TouchableOpacity>

          {/* Files PDF Option */}
          <TouchableOpacity
            onPress={() => handleAction(onPickDocument)}
            activeOpacity={0.75}
            style={{
              flexDirection: 'row', alignItems: 'center', padding: 16,
              backgroundColor: isDarkMode ? '#1E1E24' : '#F9FAFB',
              borderRadius: 16, borderWidth: 1, borderColor: isDarkMode ? '#27272A' : '#F3F4F6',
            }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <FileText size={18} color="#2563EB" />
            </View>
            <Text style={{ fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold', color: C.text }}>
              Select PDF File
            </Text>
          </TouchableOpacity>
        </View>

        {/* Separate Cancel card below (only on mobile layout) */}
        {!isLargeWeb && (
          <TouchableOpacity
            onPress={handleClose}
            activeOpacity={0.75}
            style={{
              width: '100%', backgroundColor: isDarkMode ? '#27272A' : '#F3F4F6',
              paddingVertical: 14, borderRadius: 14,
            }}
          >
            <Text style={{ fontSize: 14, fontFamily: 'PlusJakartaSans_700Bold', textAlign: 'center', color: C.textSecondary }}>
              Cancel
            </Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}
