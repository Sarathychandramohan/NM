import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, Linking, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@constants/colors';
import { useAppStore, getTextScale } from '@store/useAppStore';
import { TopAppBar } from '@/components/ui/TopAppBar';
import { DocumentUpload } from '@/components/overlays/DocumentUpload';
import { WebAppShell } from '@/components/web/WebAppShell';
import { UI_TRANSLATIONS } from '@constants/translations';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  Upload, FileText, User, Home, Briefcase,
  Heart, Scale, CheckCircle2, Clock, AlertCircle,
} from 'lucide-react-native';

const DOC_TYPE_ICONS: Record<string, any> = {
  Aadhaar:      User,
  'Land Records': Home,
  'FIR Copy':   Briefcase,
  'Medical Bills': Heart,
  'RTI Reply':  FileText,
  'Court Notice': Scale,
};

export default function DocumentsScreen() {
  const { isDarkMode, documents, uploadDocument, setOverlay, selectedLanguage, textSize, isAnonymousGuest } = useAppStore();
  const C      = isDarkMode ? Colors.dark : Colors.light;
  const router = useRouter();
  const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];
  const scale = getTextScale(textSize);
  const isWeb = Platform.OS === 'web';

  const handlePickDocument = async () => {
    // Block guest users — show login prompt
    if (isAnonymousGuest) {
      setOverlay('login_prompt');
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.length) {
        const a = result.assets[0];
        await uploadDocument(a.uri, a.name, a.mimeType || 'Document');
        setOverlay('success');
      }
    } catch { setOverlay('error'); }
  };

  const showAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  const handleCaptureImage = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { showAlert(t.permissionDenied, t.cameraAccessRequired); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets?.length) {
        const a = result.assets[0];
        await uploadDocument(a.uri, a.fileName ?? `capture_${Date.now()}.jpg`, 'Image/Document');
        setOverlay('success');
      }
    } catch { setOverlay('error'); }
  };

  const handlePickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { showAlert(t.permissionDenied, t.galleryAccessRequired); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets?.length) {
        const a = result.assets[0];
        await uploadDocument(a.uri, a.fileName ?? `image_${Date.now()}.jpg`, 'Image/Document');
        setOverlay('success');
      }
    } catch { setOverlay('error'); }
  };

  const handleDocPress = async (doc: any) => {
    if (doc.status === 'failed') {
      showAlert('Analysis Failed', 'Please try uploading a clearer file.');
    } else if (doc.status === 'pending') {
      showAlert('Analysis Pending', 'Document is being analysed. Please check back in a moment.');
    } else if (doc.sessionId) {
      try {
        const { loadSession } = useAppStore.getState();
        await loadSession(doc.sessionId);
        const session = useAppStore.getState().activeSession;
        if (session) {
          router.replace(`/chat/${session.categoryId}` as any);
        } else {
          showAlert('Error', 'Unable to find chat session for this document.');
        }
      } catch (err) {
        showAlert('Error', 'Failed to load chat session.');
      }
    } else if (doc.fileUrl) {
      if (Platform.OS === 'web') {
        window.open(doc.fileUrl, '_blank');
      } else {
        Linking.openURL(doc.fileUrl).catch(() => {
          showAlert('Error', 'Unable to open document link.');
        });
      }
    } else {
      showAlert('Info', 'Document has been analysed successfully.');
    }
  };

  const DOC_TYPES = [
    { label: 'Aadhaar',       Icon: User      },
    { label: 'Land Records',  Icon: Home      },
    { label: 'FIR Copy',      Icon: Briefcase },
    { label: 'Medical Bills', Icon: Heart     },
    { label: 'RTI Reply',     Icon: FileText  },
    { label: 'Court Notice',  Icon: Scale     },
  ];

  const docTypeLabels: Record<string, string> = {
    'Aadhaar': t.aadhaar,
    'Land Records': t.landRecords,
    'FIR Copy': t.firCopy,
    'Medical Bills': t.medicalBills,
    'RTI Reply': t.rtiReply,
    'Court Notice': t.courtNotice,
  };

  const screenContent = (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]} edges={['bottom']}>
      <TopAppBar title={t.documentsHeader} showBack={false} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Page title */}
        <View style={styles.titleRow}>
          <Text style={[styles.pageTitle, { color: C.text, fontSize: 18 * scale }]} adjustsFontSizeToFit={true} minimumFontScale={0.8} numberOfLines={1}>{t.documentsHeader}</Text>
          <Text style={[styles.count, { color: C.textSecondary, fontSize: 12 * scale }]}>
            {documents.length} {documents.length === 1 ? t.fileCount : t.filesCount}
          </Text>
        </View>

        {/* Upload trigger — tap opens the upload bottom sheet (guest blocked inside DocumentUpload) */}
        <TouchableOpacity
          onPress={() => {
            if (isAnonymousGuest) { setOverlay('login_prompt'); return; }
            setOverlay('upload');
          }}
          style={[styles.uploadCard, {
            backgroundColor: isDarkMode ? '#1A1207' : '#FFF7ED',
            borderColor:     Colors.orange + '60',
          }]}
          activeOpacity={0.8}
        >
          <View style={styles.uploadIconWrap}>
            <Upload size={22} color={Colors.orange} strokeWidth={1.8} />
          </View>
          <Text style={[styles.uploadTitle, { color: C.text, fontSize: 15 * scale }]}>{t.uploadPrompt}</Text>
          <Text style={[styles.uploadHint, { color: C.textSecondary, fontSize: 12 * scale }]}>
            {t.uploadCardHint}
          </Text>
        </TouchableOpacity>

        {/* Supported types */}
        <Text style={[styles.sectionLabel, { color: C.textSecondary, fontSize: 11 * scale }]}>{t.supportedTypes}</Text>
        <View style={styles.chipRow}>
          {DOC_TYPES.map((docType) => {
            const Icon = docType.Icon;
            const translatedLabel = docTypeLabels[docType.label] ?? docType.label;
            return (
              <View key={docType.label} style={[styles.chip, {
                backgroundColor: C.surface, borderColor: C.surfaceBorder,
              }]}>
                <Icon size={11} color={C.textSecondary} strokeWidth={1.6} />
                <Text style={[styles.chipText, { color: C.textSecondary, fontSize: 10 * scale }]} adjustsFontSizeToFit={true} minimumFontScale={0.8} numberOfLines={1}>{translatedLabel}</Text>
              </View>
            );
          })}
        </View>

        {/* Recent uploads */}
        {documents.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: C.textSecondary, fontSize: 11 * scale }]}>{t.recentUploads}</Text>
            {documents.map((doc) => (
              <TouchableOpacity
                key={doc.id}
                style={[styles.docCard, {
                  backgroundColor: C.surface, borderColor: C.surfaceBorder,
                  shadowColor: C.shadow,
                }]}
                activeOpacity={0.78}
                onPress={() => handleDocPress(doc)}
              >
                <View style={[styles.docIcon, { backgroundColor: isDarkMode ? '#1E1E23' : '#F3F4F6' }]}>
                  <FileText size={20} color={Colors.orange} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.docName, { color: C.text, fontSize: 14 * scale }]} numberOfLines={1}>{doc.name}</Text>
                  <Text style={[styles.docMeta, { color: C.textSecondary, fontSize: 12 * scale }]}>
                    {docTypeLabels[doc.type] ?? doc.type} · {doc.date}
                  </Text>
                </View>
                {/* Status badge: analysed = green, failed = red, pending = orange */}
                <View style={[styles.badge, {
                  backgroundColor:
                    doc.status === 'analysed' ? (isDarkMode ? 'rgba(22,163,74,0.15)'   : '#DCFCE7') :
                    doc.status === 'failed'   ? (isDarkMode ? 'rgba(239,68,68,0.15)'   : '#FEE2E2') :
                                               (isDarkMode ? 'rgba(249,115,22,0.15)'  : '#FFF7ED'),
                }]}>
                  {doc.status === 'analysed'
                    ? <CheckCircle2 size={12} color={Colors.green}  strokeWidth={2} />
                    : doc.status === 'failed'
                    ? <AlertCircle  size={12} color="#EF4444"       strokeWidth={2} />
                    : <Clock        size={12} color={Colors.orange} strokeWidth={2} />
                  }
                  <Text style={[styles.badgeText, {
                    fontSize: 11 * scale,
                    color:
                      doc.status === 'analysed' ? Colors.green  :
                      doc.status === 'failed'   ? '#EF4444'      :
                                                  Colors.orange,
                  }]}>
                    {doc.status === 'analysed' ? t.analysed : doc.status === 'failed' ? t.failed : t.pending}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      <DocumentUpload
        onCaptureImage={handleCaptureImage}
        onPickImage={handlePickImage}
        onPickDocument={handlePickDocument}
      />
    </SafeAreaView>
  );

  return screenContent;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { padding: 16, paddingBottom: 120, gap: 12 },
  titleRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  pageTitle: { fontSize: 20, fontFamily: 'PlusJakartaSans_700Bold' },
  count:     { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' },

  uploadCard: {
    borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed',
    padding: 20, alignItems: 'center', gap: 8,
  },
  uploadIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(249,115,22,0.1)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  uploadTitle: { fontSize: 16, fontFamily: 'PlusJakartaSans_700Bold' },
  uploadHint:  { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', textAlign: 'center', lineHeight: 20 },

  sectionLabel: {
    fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText:{ fontSize: 11, fontFamily: 'PlusJakartaSans_600SemiBold' },

  docCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1,
    padding: 14, gap: 12,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 5, elevation: 2,
  },
  docIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docName: { fontSize: 14, fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 3 },
  docMeta: { fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular' },
  badge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  badgeText:{ fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold' },
});
