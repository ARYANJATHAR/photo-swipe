import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type MediaManagementStatus = { supported: boolean; granted: boolean };
const native = Platform.OS === 'android' ? requireOptionalNativeModule<{
  getStatus(): Promise<MediaManagementStatus>;
  openSettings(): Promise<void>;
}>('PhotoSwipeMedia') : null;

export async function getMediaManagementStatus(): Promise<MediaManagementStatus> {
  return native ? native.getStatus() : { supported: false, granted: false };
}

export async function openMediaManagementSettings() {
  if (!native) throw new Error('Media management requires the Android APK.');
  await native.openSettings();
}
