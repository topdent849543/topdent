import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/**
 * Cloudinary upload configuration.
 *
 * You need to set these environment variables in your .env file:
 *
 * EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
 * EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your_unsigned_upload_preset
 *
 * Steps to get these values:
 * 1. Create a free account at https://cloudinary.com
 * 2. Go to Settings > Upload > Upload presets
 * 3. Create an unsigned upload preset (or use the default one)
 * 4. Copy your Cloud Name from the dashboard
 * 5. Add both values to your .env file
 */

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || '';
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || '';

const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;

type UploadResult = {
  secure_url: string;
  public_id: string;
  format: string;
  resource_type: string;
};

/**
 * Opens the image picker and returns the selected image URI.
 *
 * @param allowsEditing when true (default), shows the native crop/preview
 *  screen after picking. Pass false to return the image immediately after
 *  selection, with no extra confirmation step.
 */
export async function pickImage(allowsEditing: boolean = true): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Media library permission is required to upload images.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: false,
    aspect: [4, 3],
    quality: 0.8,
    selectionLimit: 1,
    allowsEditing,
    exif: false,
    orderedSelection: true,
    legacy: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  return result.assets[0].uri;
}

/**
 * Opens the video picker and returns the selected video URI.
 */
export async function pickVideo(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Media library permission is required to upload videos.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    allowsMultipleSelection: false,
    quality: 0.8,
    selectionLimit: 1,
    allowsEditing: true,
    exif: false,
    orderedSelection: true,
    legacy: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  return result.assets[0].uri;
}

/**
 * Uploads a file (image or video) to Cloudinary using an unsigned upload preset.
 * Returns the secure URL of the uploaded file.
 *
 * @param onProgress optional callback fired with a 0–100 percentage as the
 *  upload progresses. Only works via XHR, so progress is only reported when
 *  the upload is actually running (native and web both supported).
 */
export async function uploadToCloudinary(
  fileUri: string,
  resourceType: 'image' | 'video' = 'image',
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      'Cloudinary is not configured. Set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET in your .env file.'
    );
  }

  const formData = new FormData();

  if (Platform.OS === 'web') {
    // On web, FormData needs a real Blob/File — passing {uri, type, name}
    // gets coerced to the string "[object Object]" and Cloudinary rejects it
    // with "Unsupported source URL: [object Object]".
    const fileResponse = await fetch(fileUri);
    const blob = await fileResponse.blob();
    const fileName = resourceType === 'video' ? 'upload.mp4' : 'upload.jpg';
    formData.append('file', blob, fileName);
  } else {
    // @ts-ignore - React Native FormData accepts URI strings on native
    formData.append('file', {
      uri: fileUri,
      type: resourceType === 'video' ? 'video/mp4' : 'image/jpeg',
      name: resourceType === 'video' ? 'upload.mp4' : 'upload.jpg',
    });
  }

  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('resource_type', resourceType);

  // Use XHR instead of fetch so we can report upload progress.
  const data = await new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', CLOUDINARY_UPLOAD_URL);
    xhr.setRequestHeader('Accept', 'application/json');

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      let parsed: any = null;
      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        // fallthrough to error handling below
      }
      if (xhr.status >= 200 && xhr.status < 300 && parsed) {
        resolve(parsed);
      } else {
        const message = parsed?.error?.message || xhr.responseText || `HTTP ${xhr.status}`;
        reject(new Error(`Cloudinary upload failed (${xhr.status}): ${message}`));
      }
    };

    xhr.onerror = () => reject(new Error('Cloudinary upload failed: network error'));
    xhr.onabort = () => reject(new Error('Cloudinary upload cancelled'));

    xhr.send(formData);
  });

  if (!data.secure_url) {
    throw new Error('Cloudinary upload failed: no URL returned');
  }

  return {
    secure_url: data.secure_url,
    public_id: data.public_id,
    format: data.format,
    resource_type: data.resource_type,
  };
}

/**
 * Convenience: picks an image and uploads it to Cloudinary.
 * Returns the secure URL or null if the user cancelled.
 */
export async function pickAndUploadImage(): Promise<string | null> {
  const uri = await pickImage();
  if (!uri) return null;
  const result = await uploadToCloudinary(uri, 'image');
  return result.secure_url;
}

/**
 * Convenience: picks a video and uploads it to Cloudinary.
 * Returns the secure URL or null if the user cancelled.
 * Pass onProgress to receive 0–100 percentage updates during the upload.
 */
export async function pickAndUploadVideo(
  onProgress?: (percent: number) => void
): Promise<string | null> {
  const uri = await pickVideo();
  if (!uri) return null;
  const result = await uploadToCloudinary(uri, 'video', onProgress);
  return result.secure_url;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}
