/**
 * نظام الأصوات الاحترافي للتطبيق والموقع.
 *
 * - يشغّل صوتاً قصيراً ومناسباً لكل إجراء (دفع، تأكيد طلب، تسجيل دخول، شحن محفظة، إشعار…).
 * - يعمل على iOS / Android عبر `expo-av`، وعلى الويب عبر Web Audio بدون أي إعداد إضافي.
 * - جميع الاستدعاءات آمنة تماماً: أي خطأ في تشغيل الصوت لا يؤثر على واجهة المستخدم إطلاقاً.
 * - يمكن كتم الأصوات عبر `setSoundEnabled(false)` (يُحفظ في التخزين المحلي).
 */
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

export type SoundName =
  | 'tap'
  | 'success'
  | 'order'
  | 'payment'
  | 'login'
  | 'logout'
  | 'wallet'
  | 'notify'
  | 'message'
  | 'error'
  | 'delete'
  | 'addToCart';

const SOURCES: Record<SoundName, number> = {
  tap: require('../assets/sounds/tap.wav'),
  success: require('../assets/sounds/success.wav'),
  order: require('../assets/sounds/order.wav'),
  payment: require('../assets/sounds/payment.wav'),
  login: require('../assets/sounds/login.wav'),
  logout: require('../assets/sounds/logout.wav'),
  wallet: require('../assets/sounds/wallet.wav'),
  notify: require('../assets/sounds/notify.wav'),
  message: require('../assets/sounds/message.wav'),
  error: require('../assets/sounds/error.wav'),
  delete: require('../assets/sounds/delete.wav'),
  addToCart: require('../assets/sounds/add-to-cart.wav'),
};

const VOLUMES: Record<SoundName, number> = {
  tap: 0.25,
  success: 0.6,
  order: 0.7,
  payment: 0.7,
  login: 0.55,
  logout: 0.45,
  wallet: 0.65,
  notify: 0.7,
  message: 0.55,
  error: 0.5,
  delete: 0.45,
  addToCart: 0.45,
};

const STORAGE_KEY = '@varlo/sound_enabled';

let enabled = true;
let audioModeReady = false;
const cache = new Map<SoundName, Audio.Sound>();

/** استرجاع تفضيل المستخدم عند إقلاع التطبيق. */
export async function initSounds(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === '0') enabled = false;
  } catch {
    /* تجاهل */
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export async function setSoundEnabled(value: boolean): Promise<void> {
  enabled = value;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* تجاهل */
  }
}

async function ensureAudioMode() {
  if (audioModeReady || Platform.OS === 'web') return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
  } catch {
    /* تجاهل */
  }
  audioModeReady = true;
}

/** تشغيل صوت — لا يرمي أي خطأ أبداً. */
export async function playSound(name: SoundName): Promise<void> {
  if (!enabled) return;
  try {
    await ensureAudioMode();
    let sound = cache.get(name);
    if (!sound) {
      const { sound: created } = await Audio.Sound.createAsync(SOURCES[name], {
        volume: VOLUMES[name] ?? 0.5,
      });
      cache.set(name, created);
      sound = created;
    }
    await sound.setPositionAsync(0);
    await sound.setVolumeAsync(VOLUMES[name] ?? 0.5);
    await sound.playAsync();
  } catch {
    /* تجاهل أي فشل في تشغيل الصوت */
  }
}

/** صوت + اهتزاز خفيف مناسب للإجراءات المهمة. */
export function playFeedback(name: SoundName): void {
  playSound(name);
  if (Platform.OS === 'web') return;
  try {
    if (name === 'error') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (name === 'success' || name === 'order' || name === 'payment' || name === 'wallet') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch {
    /* تجاهل */
  }
}

/** تحرير الموارد (يُستدعى عند إغلاق التطبيق فقط). */
export async function unloadSounds(): Promise<void> {
  for (const sound of cache.values()) {
    try {
      await sound.unloadAsync();
    } catch {
      /* تجاهل */
    }
  }
  cache.clear();
}
