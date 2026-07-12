import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { Colors } from '../../constants/colors';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught render error:', error, errorInfo);
  }

  private handleReload = () => {
    if (Platform.OS === 'web') {
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: null });
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <AlertTriangle size={36} color="#EF4444" />
            </View>
            <Text style={styles.title}>Application Error</Text>
            <Text style={styles.message}>
              An unexpected error occurred during rendering. This has been caught gracefully.
            </Text>
            {this.state.error && (
              <ScrollView style={styles.errorScroll}>
                <Text style={styles.errorText}>{this.state.error.toString()}</Text>
              </ScrollView>
            )}
            <TouchableOpacity style={styles.button} onPress={this.handleReload} activeOpacity={0.8}>
              <Text style={styles.buttonText}>Reload Application</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111114',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1E1E24',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2D2D35',
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    fontFamily: Platform.OS === 'web' ? 'System' : 'PlusJakartaSans_700Bold',
  },
  message: {
    fontSize: 14,
    color: '#A1A1AA',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    fontFamily: Platform.OS === 'web' ? 'System' : 'PlusJakartaSans_400Regular',
  },
  errorScroll: {
    maxHeight: 120,
    backgroundColor: '#111114',
    borderRadius: 8,
    padding: 10,
    width: '100%',
    marginBottom: 20,
  },
  errorText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'System',
    color: '#EF4444',
  },
  button: {
    backgroundColor: Colors.orange,
    height: 48,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
