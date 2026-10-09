/** Linea divisoria de 1px que sigue el color del tema. */
import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export function Divider({ style, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      {...rest}
      style={[{ height: 1, backgroundColor: theme.backgroundSelected }, style]}
    />
  );
}