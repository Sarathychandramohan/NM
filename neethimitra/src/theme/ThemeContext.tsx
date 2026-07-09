import React, { createContext, useContext, useEffect } from 'react';
import { Platform } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useAppStore } from '@store/useAppStore';
import { Colors, ThemeColors } from './colors';

interface ThemeContextType {
  isDarkMode: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isDarkMode, toggleDarkMode } = useAppStore();
  const { colorScheme, setColorScheme } = useColorScheme();

  useEffect(() => {
    const expectedScheme = isDarkMode ? 'dark' : 'light';
    if (colorScheme !== expectedScheme) {
      setColorScheme(expectedScheme);
    }
    // On web, NativeWind 'class' dark mode also requires toggling the class on <html>
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    toggleDarkMode();
  };

  const colors = isDarkMode ? Colors.dark : Colors.light;

  return (
    <ThemeContext.Provider value={{ isDarkMode, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
