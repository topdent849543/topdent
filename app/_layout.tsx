import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nManager, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider } from '@/lib/AuthContext';
import { CartProvider } from '@/lib/CartContext';
import { WishlistProvider } from '@/lib/WishlistContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NotificationsProvider } from '@/lib/NotificationsContext';
import { AIAssistant } from '@/components/AIAssistant';

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

export default function RootLayout() {
  useFrameworkReady();

  return (
    <SafeAreaProvider>
    <View style={{ flex: 1, direction: 'rtl' }}>
      <ErrorBoundary>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <NotificationsProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="+not-found" />
            </Stack>
              <AIAssistant />
              <StatusBar style="auto" />
            </NotificationsProvider>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
      </ErrorBoundary>
    </View>
    </SafeAreaProvider>
  );
}
