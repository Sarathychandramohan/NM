/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  // Required for NativeWind web: allows setColorScheme() to toggle dark mode via class
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        saffron: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          500: '#FF9933', // Brand saffron
          600: '#EA580C',
        },
        navy: {
          50: '#F0F2F5',
          100: '#E1E4EB',
          800: '#1A2E5A',
          900: '#121F3E', // Brand navy dark
          950: '#0B132B',
        },
        emerald: {
          50: '#EEFBF7',
          500: '#128C7E', // Brand green/emerald
          600: '#0E6F64',
        },
        gold: {
          500: '#D4AF37', // Brand gold
        },
      },
      fontFamily: {
        outfit: ["Outfit_400Regular", "Outfit_600SemiBold", "Outfit_700Bold"],
        noto: ["NotoSans_400Regular", "NotoSans_700Bold"],
        jakarta: [
          "PlusJakartaSans_400Regular",
          "PlusJakartaSans_500Medium",
          "PlusJakartaSans_600SemiBold",
          "PlusJakartaSans_700Bold",
        ],
      },
    },
  },
  plugins: [],
}
