/** Splash animado de FitTrack mientras la app termina de cargar. */
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const DURATION = 600;

export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: {
      transform: [{ scale: 1 }],
      opacity: 1,
    },
    20: {
      opacity: 1,
    },
    70: {
      opacity: 0,
      easing: Easing.elastic(0.7),
    },
    100: {
      opacity: 0,
      transform: [{ scale: 1 }],
      easing: Easing.elastic(0.7),
    },
  });

  const image = (
    <View style={styles.brand}>
      <View style={styles.brandIcon}>
        <Text style={styles.brandIconText}>FT</Text>
      </View>
      <Text style={styles.brandText}>FITTRACK</Text>
    </View>
  );

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.splashOverlay}>
      {image}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={styles.splashOverlay}>
      {image}
    </View>
  );
}

const styles = StyleSheet.create({
  brand: {
    alignItems: 'center',
    gap: 12,
  },
  brandIcon: {
    width: 76,
    height: 76,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIconText: {
    color: '#16A34A',
    fontSize: 30,
    fontWeight: '800',
  },
  brandText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 3,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});