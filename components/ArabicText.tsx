import {
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';

function translateChild(child: ReactNode): ReactNode {
  if (typeof child === 'string') return t(child);
  if (Array.isArray(child)) return child.map(translateChild);
  return child;
}

export function ArabicText({ children, style, ...props }: TextProps) {
  return (
    <NativeText {...props} style={[{ writingDirection: 'rtl' }, style]}>
      {translateChild(children)}
    </NativeText>
  );
}

export function ArabicTextInput({ placeholder, style, ...props }: TextInputProps) {
  return (
    <NativeTextInput
      {...props}
      placeholder={placeholder ? t(placeholder) : placeholder}
      style={[{ writingDirection: 'rtl', textAlign: 'right' }, style]}
    />
  );
}