import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

interface TypingIndicatorProps {
  users: string[];
  isVisible?: boolean;
}

/**
 * Animated typing indicator showing bouncing dots and user names.
 * Builds a string like "Alice is typing..." or "Alice, Bob are typing..."
 */
const formatTypingText = (users: string[]): string => {
  if (users.length === 0) return '';
  if (users.length === 1) return `${users[0]} is typing...`;
  if (users.length === 2) return `${users[0]}, ${users[1]} are typing...`;
  return `${users[0]}, ${users[1]} and ${users.length - 2} other${users.length - 2 > 1 ? 's' : ''} are typing...`;
};

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  users,
  isVisible = true,
}) => {
  // Three animated dots
  const dot1Opacity = useRef(new Animated.Value(0.3)).current;
  const dot2Opacity = useRef(new Animated.Value(0.3)).current;
  const dot3Opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!isVisible || users.length === 0) return;

    const createDotAnimation = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const anim1 = createDotAnimation(dot1Opacity, 0);
    const anim2 = createDotAnimation(dot2Opacity, 200);
    const anim3 = createDotAnimation(dot3Opacity, 400);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [isVisible, users.length, dot1Opacity, dot2Opacity, dot3Opacity]);

  if (!isVisible || users.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <View style={styles.dotsContainer}>
          <Animated.View style={[styles.dot, { opacity: dot1Opacity }]} />
          <Animated.View style={[styles.dot, { opacity: dot2Opacity }]} />
          <Animated.View style={[styles.dot, { opacity: dot3Opacity }]} />
        </View>
        <Text style={styles.text} numberOfLines={1}>
          {formatTypingText(users)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E8E8E8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  dotsContainer: {
    flexDirection: 'row',
    marginRight: 8,
    gap: 3,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#888',
  },
  text: {
    fontSize: 13,
    color: '#757575',
    fontStyle: 'italic',
    flexShrink: 1,
  },
});

export default TypingIndicator;
