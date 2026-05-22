import { useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  View,
} from 'react-native';
import { Colors } from '../constants/theme';

type Props = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
};

const THUMB = 22;
const TRACK_H = 6;

/**
 * Minimal slider built on PanResponder + core RN — intentionally avoids
 * react-native-gesture-handler / reanimated worklets, which have been the
 * fragile part of this project's build. Smooth enough for a settings control.
 */
export function Slider({ value, min = 0, max = 100, step = 1, onChange }: Props) {
  const [trackW, setTrackW] = useState(0);
  const trackWRef = useRef(0);
  const startXRef = useRef(0);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  const range = max - min;

  const valueToX = (v: number, w: number) =>
    w > THUMB ? ((v - min) / range) * (w - THUMB) : 0;

  const xToValue = (x: number, w: number) => {
    if (w <= THUMB) return min;
    const ratio = Math.min(1, Math.max(0, x / (w - THUMB)));
    const raw = min + ratio * range;
    return Math.min(max, Math.max(min, Math.round(raw / step) * step));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const w = trackWRef.current;
        const v = xToValue(evt.nativeEvent.locationX - THUMB / 2, w);
        startXRef.current = valueToX(v, w);
        onChangeRef.current(v);
      },
      onPanResponderMove: (_, g) => {
        const x = startXRef.current + g.dx;
        onChangeRef.current(xToValue(x, trackWRef.current));
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    trackWRef.current = w;
    setTrackW(w);
  };

  const x = valueToX(value, trackW);

  return (
    <View style={styles.wrap} onLayout={onLayout} {...pan.panHandlers}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: x + THUMB / 2 }]} />
      </View>
      <View style={[styles.thumb, { left: x }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: THUMB,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: '#666666',
    overflow: 'hidden',
  },
  fill: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: Colors.pink,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
