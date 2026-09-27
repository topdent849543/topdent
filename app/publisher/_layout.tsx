import { Stack } from 'expo-router';
import { RequirePermission } from '@/components/RequirePermission';

export default function PublisherLayout() {
  return (
    <RequirePermission permission="affiliate.manage_self">
      <Stack screenOptions={{ headerShown: false }} />
    </RequirePermission>
  );
}
