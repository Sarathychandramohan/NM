// NeethiMitra AI - Language Data
// All 23 Sarvam AI supported languages

export interface Language {
  code: string;         // BCP-47 language code used by Sarvam AI
  name: string;         // English name
  nativeName: string;   // Name in its own script
  logoText: string;     // App name rendered in native script
  greeting: string;     // Welcome message in that language
  script: 'latin' | 'devanagari' | 'bengali' | 'telugu' | 'tamil' | 'gujarati'
         | 'kannada' | 'malayalam' | 'gurmukhi' | 'odia' | 'arabic' | 'meitei'
         | 'perso-arabic';
}

export const LANGUAGES: Language[] = [
  {
    code: 'en-IN',
    name: 'English',
    nativeName: 'English',
    logoText: 'NeethiMitra',
    greeting: 'Welcome! How can we help you today?',
    script: 'latin',
  },
  {
    code: 'hi-IN',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    logoText: 'नीतिमित्र',
    greeting: 'नमस्ते! आज हम आपकी कैसे मदद कर सकते हैं?',
    script: 'devanagari',
  },
  {
    code: 'bn-IN',
    name: 'Bengali',
    nativeName: 'বাংলা',
    logoText: 'নীতিমিত্র',
    greeting: 'স্বাগতম! আজ আমরা আপনাকে কীভাবে সাহায্য করতে পারি?',
    script: 'bengali',
  },
  {
    code: 'ta-IN',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    logoText: 'நீதிமித்ர',
    greeting: 'வணக்கம்! இன்று நாங்கள் உங்களுக்கு எப்படி உதவலாம்?',
    script: 'tamil',
  },
  {
    code: 'te-IN',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    logoText: 'నీతిమిత్ర',
    greeting: 'స్వాగతం! ఈరోజు మేము మీకు ఎలా సహాయం చేయగలం?',
    script: 'telugu',
  },
  {
    code: 'kn-IN',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    logoText: 'ನೀತಿಮಿತ್ರ',
    greeting: 'ಸ್ವಾಗತ! ಇಂದು ನಾವು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?',
    script: 'kannada',
  },
  {
    code: 'ml-IN',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    logoText: 'നീതിമിത്ര',
    greeting: 'സ്വാഗതം! ഇന്ന് ഞങ്ങൾ നിങ്ങൾക്ക് എങ്ങനെ സഹായിക്കാം?',
    script: 'malayalam',
  },
  {
    code: 'mr-IN',
    name: 'Marathi',
    nativeName: 'मराठी',
    logoText: 'नीतिमित्र',
    greeting: 'स्वागत! आज आम्ही तुमची कशी मदद करू?',
    script: 'devanagari',
  },
  {
    code: 'gu-IN',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    logoText: 'નીતિમિત્ર',
    greeting: 'સ્વાગત! આજે અમે તમારી કેવી રીતે મદદ કરી શકીએ?',
    script: 'gujarati',
  },
  {
    code: 'pa-IN',
    name: 'Punjabi',
    nativeName: 'ਪੰਜਾਬੀ',
    logoText: 'ਨੀਤੀਮਿੱਤਰ',
    greeting: 'ਜੀ ਆਇਆਂ ਨੂੰ! ਅੱਜ ਅਸੀਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦੇ ਹਾਂ?',
    script: 'gurmukhi',
  },
  {
    code: 'od-IN',
    name: 'Odia',
    nativeName: 'ଓଡ଼િଆ',
    logoText: 'ନୀତିମିତ୍ର',
    greeting: 'ସ୍ୱାਗତ! ଆଜି ଆମେ ଆପଣଙ୍କୁ କିପରି ସାହାଯ୍ୟ କରିପାରିବୁ?',
    script: 'odia',
  },
];

export const DEFAULT_LANGUAGE = LANGUAGES[0]; // English
