import { forwardRef, memo, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming, Easing } from 'react-native-reanimated';
import { swipeChoice, type Choice } from '../domain/decisions';

export type PhotoCardHandle = { exit: (choice: Choice) => Promise<void>; reset: () => void };

type Props = {
  id: string;
  nextId?: string;
  disabled: boolean;
  reducedMotion: boolean;
  onChoice: (choice: Choice) => void;
  onError: () => void;
  onLoad: () => void;
};

export const PhotoCard = memo(forwardRef<PhotoCardHandle, Props>(function PhotoCard({ id, nextId, disabled, reducedMotion, onChoice, onError, onLoad }, ref) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const committed = useSharedValue(false);
  useImperativeHandle(ref, () => ({
    exit: choice => new Promise<void>(resolve => {
      committed.set(true);
      if (reducedMotion) { x.set(choice === 'keep' ? -width * 1.4 : width * 1.4); resolve(); return; }
      x.set(withTiming(choice === 'keep' ? -width * 1.4 : width * 1.4, { duration: 220, easing: Easing.out(Easing.cubic) }, () => { runOnJS(resolve)(); }));
    }),
    reset: () => {
      committed.set(false);
      x.set(reducedMotion ? 0 : withSpring(0, { damping: 22, stiffness: 220, mass: 0.8 }));
    },
  }), [committed, reducedMotion, width, x]);
  const pan = Gesture.Pan().enabled(!disabled).activeOffsetX([-12, 12]).failOffsetY([-25, 25])
    .onUpdate(event => { if (!committed.get()) x.set(event.translationX); })
    .onEnd(event => {
      if (committed.get()) return;
      const choice = swipeChoice(event.translationX, width);
      if (choice) {
        committed.set(true);
        runOnJS(onChoice)(choice);
      } else {
        x.set(reducedMotion ? 0 : withSpring(0, { damping: 22, stiffness: 220, mass: 0.8 }));
      }
    }).onFinalize(() => {
      if (!committed.get()) x.set(reducedMotion ? 0 : withSpring(0, { damping: 22, stiffness: 220, mass: 0.8 }));
    });
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { rotate: reducedMotion ? '0deg' : `${x.get() / 35}deg` }],
  }));
  const keepStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [-90, -20], [1, 0], Extrapolation.CLAMP) }));
  const deleteStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [20, 90], [0, 1], Extrapolation.CLAMP) }));
  const nextStyle = useAnimatedStyle(() => {
    const progress = reducedMotion ? 1 : interpolate(Math.abs(x.get()), [0, width * 0.9], [0, 1], Extrapolation.CLAMP);
    return { opacity: 0.75 + progress * 0.25, transform: [{ scale: 0.96 + progress * 0.04 }, { translateY: -7 + progress * 7 }] };
  });
  return <View style={styles.deck}>
    {nextId && <Animated.View style={[styles.nextCard, nextStyle]} pointerEvents="none"><Image source={{ uri: nextId }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory" recyclingKey={nextId} transition={0} /></Animated.View>}
    <GestureDetector gesture={pan}>
    <Animated.View style={[styles.card, cardStyle]} accessible accessibilityLabel="Current photo. Use the Keep and Delete buttons below to decide.">
      <Image source={{ uri: id }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory" recyclingKey={id} onError={onError} onLoad={onLoad} transition={0} />
      <Animated.View pointerEvents="none" style={[styles.stamp, styles.keep, keepStyle]}><Text style={styles.keepText}>KEEP</Text></Animated.View>
      <Animated.View pointerEvents="none" style={[styles.stamp, styles.remove, deleteStyle]}><Text style={styles.deleteText}>DELETE</Text></Animated.View>
      {disabled && <View style={styles.veil} pointerEvents="none" />}
    </Animated.View>
    </GestureDetector>
  </View>;
}));

const styles = StyleSheet.create({
  deck: { flex: 1 },
  nextCard: { ...StyleSheet.absoluteFill, borderRadius: 24, overflow: 'hidden', backgroundColor: '#EDECE6' },
  card: { flex: 1, width: '100%', backgroundColor: '#EDECE6', borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E1D9' },
  stamp: { position: 'absolute', top: 24, borderWidth: 2, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 17, backgroundColor: '#FFFFFFEF' },
  keep: { left: 20, borderColor: '#276951', transform: [{ rotate: '-9deg' }] },
  remove: { right: 20, borderColor: '#B63E32', transform: [{ rotate: '9deg' }] },
  keepText: { color: '#276951', fontSize: 25, fontWeight: '800', letterSpacing: 2 },
  deleteText: { color: '#B63E32', fontSize: 25, fontWeight: '800', letterSpacing: 2 },
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#F8F7F322' },
});
