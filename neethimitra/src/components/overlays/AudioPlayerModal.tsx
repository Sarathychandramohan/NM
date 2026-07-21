/**
 * AudioPlayerModal — Full-featured audio player popup for NeethiMitra AI.
 *
 * Shows when the user taps "Speak" on any assistant message.
 * Features:
 *  - Play / Pause toggle
 *  - Seekable timeline slider (tap any position to jump)
 *  - Current time / total duration display
 *  - Replay from start button
 *  - Dismiss by tapping the X or backdrop
 *  - Dark/light mode aware
 */

import React, { useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
  Platform, TouchableWithoutFeedback, Animated, PanResponder,
  ActivityIndicator,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Colors } from '@constants/colors';
import { Play, Pause, X, RotateCcw, Volume2 } from 'lucide-react-native';

function formatTime(seconds: number): string {
  const s = Math.floor(seconds || 0);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

interface AudioPlayerModalProps {
  visible: boolean;
  audioUri: string | null;
  title?: string;
  isDarkMode: boolean;
  onClose: () => void;
}

export function AudioPlayerModal({
  visible,
  audioUri,
  title,
  isDarkMode,
  onClose,
}: AudioPlayerModalProps) {
  const C = isDarkMode ? Colors.dark : Colors.light;

  // Create player — expo-audio handles null gracefully
  const player = useAudioPlayer(audioUri ?? null);
  const status = useAudioPlayerStatus(player);

  const isPlaying  = status.playing ?? false;
  const currentTime = status.currentTime ?? 0;
  const duration   = status.duration   ?? 0;
  const progress   = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const isLoading  = !status.isLoaded;

  // Auto-play when modal opens with a valid URI
  useEffect(() => {
    if (visible && audioUri && status.isLoaded && !status.playing) {
      player.seekTo(0);
      player.play();
    }
  }, [visible, audioUri, status.isLoaded]);

  // Replay from start when track finishes
  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
    }
  }, [status.didJustFinish]);

  // Pause when modal closes
  useEffect(() => {
    if (!visible) {
      player.pause();
    }
  }, [visible]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      player.pause();
    } else {
      if (currentTime >= duration && duration > 0) {
        player.seekTo(0);
      }
      player.play();
    }
  }, [isPlaying, currentTime, duration, player]);

  const handleReplay = useCallback(() => {
    player.seekTo(0);
    player.play();
  }, [player]);

  // Seekable progress bar — tracks touch X position
  const BAR_WIDTH = 240; // fixed px width used for calculation
  const handleSeekBar = useCallback((evt: any) => {
    const x = evt.nativeEvent.locationX;
    const ratio = Math.max(0, Math.min(x / BAR_WIDTH, 1));
    player.seekTo(ratio * duration);
  }, [duration, player]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.centeredContainer} pointerEvents="box-none">
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.surfaceBorder }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconWrap, { backgroundColor: Colors.orange + '20' }]}>
                <Volume2 size={16} color={Colors.orange} strokeWidth={2} />
              </View>
              <Text style={[styles.title, { color: C.text }]} numberOfLines={2}>
                {title ?? 'AI Response'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={18} color={C.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Loading state */}
          {isLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.orange} />
              <Text style={[styles.loadingText, { color: C.textSecondary }]}>Loading audio…</Text>
            </View>
          )}

          {/* Timeline scrubber */}
          {!isLoading && (
            <>
              <TouchableOpacity
                activeOpacity={1}
                onPress={handleSeekBar}
                style={[styles.progressBarHitbox]}
              >
                <View style={[styles.progressTrack, { backgroundColor: isDarkMode ? '#333' : '#E5E7EB' }]}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
                  {/* Thumb dot */}
                  <View
                    style={[
                      styles.progressThumb,
                      { left: `${Math.max(0, progress * 100 - 1)}%` as any },
                    ]}
                  />
                </View>
              </TouchableOpacity>

              {/* Time labels */}
              <View style={styles.timeRow}>
                <Text style={[styles.timeText, { color: C.textSecondary }]}>
                  {formatTime(currentTime)}
                </Text>
                <Text style={[styles.timeText, { color: C.textSecondary }]}>
                  {formatTime(duration)}
                </Text>
              </View>
            </>
          )}

          {/* Controls */}
          <View style={styles.controls}>
            {/* Replay button */}
            <TouchableOpacity
              onPress={handleReplay}
              style={[styles.controlBtn, { backgroundColor: isDarkMode ? '#1E1E23' : '#F3F4F6' }]}
              activeOpacity={0.7}
              disabled={isLoading}
            >
              <RotateCcw size={16} color={isLoading ? C.textHint : C.textSecondary} strokeWidth={2} />
            </TouchableOpacity>

            {/* Play / Pause */}
            <TouchableOpacity
              onPress={handlePlayPause}
              style={styles.playBtn}
              activeOpacity={0.85}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : isPlaying ? (
                <Pause size={24} color="#FFF" strokeWidth={2} fill="#FFF" />
              ) : (
                <Play size={24} color="#FFF" strokeWidth={2} fill="#FFF" />
              )}
            </TouchableOpacity>

            {/* Spacer for balance */}
            <View style={styles.controlBtn} />
          </View>

          {/* Bulbul branding */}
          <Text style={[styles.poweredBy, { color: C.textHint }]}>
            Powered by Sarvam Bulbul v3
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  centeredContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'box-none',
  } as any,
  card: {
    width: 300,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 14,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    marginTop: -2,
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  loadingText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
  },

  progressBarHitbox: {
    paddingVertical: 8,  // bigger touch target
  },
  progressTrack: {
    height: 5,
    borderRadius: 4,
    position: 'relative',
    overflow: 'visible',
  },
  progressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: Colors.orange,
    borderRadius: 4,
  },
  progressThumb: {
    position: 'absolute',
    top: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.orange,
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  timeText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
  },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 4,
  },
  controlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },

  poweredBy: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 10,
    textAlign: 'center',
    marginTop: -4,
  },
});
