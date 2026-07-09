import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Colors } from '@constants/colors';
import { useAppStore } from '@store/useAppStore';

interface MicButtonProps {
  onPress: () => void;
  size?: number;
}

export function MicButton({ onPress, size = 68 }: MicButtonProps) {
  const { isDarkMode, isListening } = useAppStore();
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;
  const pulse3 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isListening) {
      const animate = (anim: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, { toValue: 1.8, duration: 800, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
          ])
        ).start();
      animate(pulse1, 0);
      animate(pulse2, 250);
      animate(pulse3, 500);
    } else {
      [pulse1, pulse2, pulse3].forEach((a) => {
        a.stopAnimation();
        Animated.timing(a, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      });
    }
  }, [isListening]);

  const micColor = isDarkMode ? Colors.orange : Colors.orange;

  return (
    <View style={[styles.wrapper, { width: size + 60, height: size + 60 }]}>
      {isListening && (
        <>
          <Animated.View style={[
            styles.ring,
            { width: size + 50, height: size + 50, borderRadius: (size + 50) / 2,
              borderColor: Colors.orange, transform: [{ scale: pulse3 }], opacity: 0.15 }
          ]} />
          <Animated.View style={[
            styles.ring,
            { width: size + 30, height: size + 30, borderRadius: (size + 30) / 2,
              borderColor: Colors.orange, transform: [{ scale: pulse2 }], opacity: 0.25 }
          ]} />
          <Animated.View style={[
            styles.ring,
            { width: size + 14, height: size + 14, borderRadius: (size + 14) / 2,
              borderColor: Colors.orange, transform: [{ scale: pulse1 }], opacity: 0.4 }
          ]} />
        </>
      )}
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={[
          styles.mic,
          {
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: micColor,
            shadowColor: micColor,
            shadowOpacity: isListening ? 0.6 : 0.3,
            shadowRadius: isListening ? 16 : 8,
          }
        ]}
      >
        <Text style={styles.micIcon}>{isListening ? '⏹' : '🎤'}</Text>
      </TouchableOpacity>
      {isListening && (
        <Text style={[styles.listeningLabel, { color: Colors.orange }]}>Listening...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  mic: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  micIcon: { fontSize: 28 },
  listeningLabel: {
    position: 'absolute',
    bottom: -22,
    fontSize: 12,
    fontWeight: '600',
  },
});
