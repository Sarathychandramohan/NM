import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { CustomTabBar } from '@/components/ui/CustomTabBar';
import { WebAppShell } from '@/components/web/WebAppShell';

const isWeb = (Platform.OS as string) === 'web';

function TabNavigator() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="chat-history" />
      <Tabs.Screen name="speak" />
      <Tabs.Screen name="my-files" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

export default function TabsLayout() {
  if (isWeb) {
    return (
      <WebAppShell>
        <TabNavigator />
      </WebAppShell>
    );
  }
  return <TabNavigator />;
}
