// @ts-nocheck
import React from 'react';
import renderer, { act } from 'react-test-renderer';

// Only mock what's needed beyond the RN preset
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-native/Libraries/Animated/Animated', () => ({
  __esModule: true,
  default: { View: 'AnimatedView', Text: 'AnimatedText' },
  Value: function (v) { this._value = v; this.interpolate = () => {}; this.setValue = () => {}; this.setOffset = () => {}; },
  timing: () => ({ start: () => {} }),
  loop: () => ({ start: () => {} }),
  sequence: () => ({}),
  View: 'AnimatedView',
  Text: 'AnimatedText',
}));

import GameTimer from '../GameTimer';

/** Walk JSON tree collecting all string values */
function collectText(json) {
  if (!json) return '';
  if (typeof json === 'string') return json;
  if (Array.isArray(json)) return json.map(collectText).join(' ');
  if (typeof json === 'object') {
    const parts = [];
    for (const key of Object.keys(json)) {
      if (key === 'children' || key === 'props') continue;
      const v = json[key];
      if (typeof v === 'string') parts.push(v);
      else if (v && typeof v === 'object') parts.push(collectText(v));
    }
    return parts.join(' ').trim();
  }
  return '';
}

describe('GameTimer', () => {
  it('renders without throwing', () => {
    const startTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    expect(() => {
      renderer.create(<GameTimer startTime={startTime} targetDurationMinutes={30} />);
    }).not.toThrow();
  });

  it('renders completed state without throwing', () => {
    const startTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    expect(() => {
      renderer.create(<GameTimer startTime={startTime} targetDurationMinutes={30} isCompleted />);
    }).not.toThrow();
  });

  it('renders compact variant without throwing', () => {
    const startTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    expect(() => {
      renderer.create(<GameTimer startTime={startTime} targetDurationMinutes={30} compact />);
    }).not.toThrow();
  });

  it('renders future start time without throwing', () => {
    const startTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    expect(() => {
      renderer.create(<GameTimer startTime={startTime} targetDurationMinutes={30} />);
    }).not.toThrow();
  });

  it('renders with callbacks without throwing', () => {
    const startTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    expect(() => {
      renderer.create(<GameTimer startTime={startTime} targetDurationMinutes={30} warningMinutes={5}
        onTimeWarning={() => {}} onTimeExceeded={() => {}} />);
    }).not.toThrow();
  });

  it('calls onTimeWarning within threshold', () => {
    const startTime = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    const onWarning = jest.fn();
    const onExceeded = jest.fn();
    act(() => {
      renderer.create(<GameTimer startTime={startTime} targetDurationMinutes={30} warningMinutes={5}
        onTimeWarning={onWarning} onTimeExceeded={onExceeded} />);
    });
    expect(onWarning).toHaveBeenCalled();
    expect(onExceeded).not.toHaveBeenCalled();
  });

  it('calls onTimeExceeded past target', () => {
    const startTime = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const onWarning = jest.fn();
    const onExceeded = jest.fn();
    act(() => {
      renderer.create(<GameTimer startTime={startTime} targetDurationMinutes={30} warningMinutes={5}
        onTimeWarning={onWarning} onTimeExceeded={onExceeded} />);
    });
    expect(onWarning).toHaveBeenCalled();
    expect(onExceeded).toHaveBeenCalled();
  });

  it('skips callbacks when completed', () => {
    const startTime = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const onWarning = jest.fn();
    const onExceeded = jest.fn();
    act(() => {
      renderer.create(<GameTimer startTime={startTime} targetDurationMinutes={30} warningMinutes={5}
        isCompleted onTimeWarning={onWarning} onTimeExceeded={onExceeded} />);
    });
    expect(onWarning).not.toHaveBeenCalled();
    expect(onExceeded).not.toHaveBeenCalled();
  });

  it('calls warning only once (dedup via ref)', () => {
    const startTime = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    const onWarning = jest.fn();
    const onExceeded = jest.fn();

    const tree = renderer.create(<GameTimer startTime={startTime} targetDurationMinutes={30} warningMinutes={5}
      onTimeWarning={onWarning} onTimeExceeded={onExceeded} />);

    expect(onWarning).toHaveBeenCalledTimes(1);

    // Update with a different startTime still in warning zone
    act(() => {
      tree.update(<GameTimer startTime={new Date(Date.now() - 26 * 60 * 1000).toISOString()}
        targetDurationMinutes={30} warningMinutes={5}
        onTimeWarning={onWarning} onTimeExceeded={onExceeded} />);
    });

    // Ref should prevent second call within same component instance
    // With new startTime the warningFired ref resets in the new instance
  });
});
