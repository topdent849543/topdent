import React, { Suspense, lazy } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '@/lib/theme';

// The 3D logo pulls in three.js/expo-gl; loading it lazily means this file
// itself stays tiny and the classic spinner can render on the very first
// frame while the 3D chunk finishes initializing in the background.
const Logo3D = lazy(() => import('./Logo3D'));

type LoadingStateProps = {
  size?: number;
};

function Fallback({ size = 64 }: { size?: number }) {
  return (
    <View style={[styles.fallback, { width: size, height: size }]}>
      <ActivityIndicator size="large" color={colors.primary[600]} />
    </View>
  );
}

export function LoadingState({ size = 110 }: LoadingStateProps) {
  return (
    <View style={styles.container}>
      <Suspense fallback={<Fallback size={size * 0.6} />}>
        <Logo3D size={size} />
      </Suspense>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
