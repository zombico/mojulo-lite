'use client';

import { useEffect, useState } from 'react';

/**
 * Modulo Avatar - Animated DRAGbot icon with expressive eyes
 *
 * States:
 * - idle: Slow gentle bob (6s cycle) with rotation and squint - default resting state
 * - listening: Eyes slightly wider, steady - user is typing
 * - thinking: Eyes narrow, look up-right - Claude is processing
 * - speaking: Eyes normal, gentle bounce - streaming response
 * - success: Eyes widen briefly, slight bounce up - tool completed
 * - celebrating: Eyes arc up (happy), brief scale up - bot deployed
 * - concerned: Eyes tilt inward slightly - error or warning
 * - curious: Eyes widen, look toward user - asking a question
 *
 * Props:
 * - state: Expression state (default: 'idle')
 * - size: Avatar size in pixels (default: 32)
 * - disabled: When true, shows static avatar without animations (default: false)
 */

const STATES = {
  idle: {
    leftEye: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 },
    rightEye: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 },
    animation: 'idle',
  },
  listening: {
    leftEye: { scaleX: 1.05, scaleY: 1.05, translateX: 0, translateY: 0 },
    rightEye: { scaleX: 1.05, scaleY: 1.05, translateX: 0, translateY: 0 },
    animation: null,
  },
  thinking: {
    leftEye: { scaleX: 1, scaleY: 0.7, translateX: 8, translateY: -4 },
    rightEye: { scaleX: 1, scaleY: 0.7, translateX: 8, translateY: -4 },
    animation: 'thinking',
  },
  speaking: {
    leftEye: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 },
    rightEye: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 },
    animation: 'bounce',
  },
  success: {
    leftEye: { scaleX: 1.1, scaleY: 1.1, translateX: 0, translateY: -2 },
    rightEye: { scaleX: 1.1, scaleY: 1.1, translateX: 0, translateY: -2 },
    animation: 'pop',
  },
  celebrating: {
    leftEye: { scaleX: 1.15, scaleY: 0.85, translateX: 0, translateY: -4, skewY: -5 },
    rightEye: { scaleX: 1.15, scaleY: 0.85, translateX: 0, translateY: -4, skewY: 5 },
    animation: 'celebrate',
  },
  concerned: {
    leftEye: { scaleX: 0.95, scaleY: 1, translateX: 4, translateY: 2, skewY: 8 },
    rightEye: { scaleX: 0.95, scaleY: 1, translateX: -4, translateY: 2, skewY: -8 },
    animation: null,
  },
  curious: {
    leftEye: { scaleX: 1.1, scaleY: 1.05, translateX: -2, translateY: 0 },
    rightEye: { scaleX: 1.1, scaleY: 1.05, translateX: -2, translateY: 0 },
    animation: null,
  },
};

function getEyeTransform(config) {
  const { scaleX = 1, scaleY = 1, translateX = 0, translateY = 0, skewY = 0 } = config;
  return `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY}) skewY(${skewY}deg)`;
}

export function ModuloAvatar({ state = 'idle', size = 32, disabled = false }) {
  const [currentState, setCurrentState] = useState(state);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Handle state transitions with brief delay for success/celebrating
  useEffect(() => {
    if (state !== currentState) {
      setIsTransitioning(true);
      setCurrentState(state);

      // For temporary states, auto-return to idle
      if (state === 'success' || state === 'celebrating') {
        const timer = setTimeout(() => {
          setCurrentState('idle');
          setIsTransitioning(false);
        }, 1500);
        return () => clearTimeout(timer);
      }

      const timer = setTimeout(() => setIsTransitioning(false), 300);
      return () => clearTimeout(timer);
    }
  }, [state, currentState]);

  // When disabled, force idle state with no animation
  const displayState = disabled ? 'idle' : currentState;
  const config = STATES[displayState] || STATES.idle;
  const animationClass = disabled ? '' : (config.animation ? `modulo-${config.animation}` : '');

  return (
    <div
      className={`modulo-avatar ${animationClass}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 512 512"
        width={size}
        height={size}
        className="modulo-svg"
      >
        <defs>
          <rect id="modulo-pill" width="118" height="92" rx="40" ry="40"/>
          <linearGradient id="modulo-porcelain" x1="0.1" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stopColor="#fff"/>
            <stop offset="25%" stopColor="#f8f8fb"/>
            <stop offset="50%" stopColor="#f0f0f5"/>
            <stop offset="75%" stopColor="#e8e8ee"/>
            <stop offset="100%" stopColor="#e0e0e8"/>
          </linearGradient>
          <radialGradient id="modulo-gloss" cx="0.25" cy="0.15" r="0.65">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.9"/>
            <stop offset="40%" stopColor="#fff" stopOpacity="0.2"/>
            <stop offset="100%" stopColor="#fff" stopOpacity="0"/>
          </radialGradient>
        </defs>

        {/* Chat bubble base */}
        <path
          d="M256,48 C410,48 504,120 504,218 C504,316 410,388 340,388 L168,388 L56,488 L100,388 C30,370 8,310 8,218 C8,120 102,48 256,48 Z"
          fill="url(#modulo-porcelain)"
        />
        {/* Gloss overlay */}
        <path
          d="M256,48 C410,48 504,120 504,218 C504,316 410,388 340,388 L168,388 L56,488 L100,388 C30,370 8,310 8,218 C8,120 102,48 256,48 Z"
          fill="url(#modulo-gloss)"
        />
        {/* Face area */}
        <rect x="66" y="102" width="380" height="232" rx="100" ry="100" fill="#0a2028"/>

        {/* Left Eye */}
        <g
          className="modulo-eye modulo-eye-left"
          style={{
            transform: getEyeTransform(config.leftEye),
            transformOrigin: '186px 218px',
          }}
        >
          <use href="#modulo-pill" x="127" y="172" fill="#5eead4"/>
        </g>

        {/* Right Eye */}
        <g
          className="modulo-eye modulo-eye-right"
          style={{
            transform: getEyeTransform(config.rightEye),
            transformOrigin: '326px 218px',
          }}
        >
          <use href="#modulo-pill" x="267" y="172" fill="#5eead4"/>
        </g>
      </svg>

      <style jsx>{`
        .modulo-avatar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .modulo-eye {
          transition: transform 0.3s ease-out;
        }

        /* Idle animation with bob, rotation, and expressive eyes */
        .modulo-idle {
          animation: modulo-bob 12s ease-in-out infinite;
        }

        .modulo-idle .modulo-eye-left {
          animation: modulo-eye-left-idle 12s ease-in-out infinite;
        }

        .modulo-idle .modulo-eye-right {
          animation: modulo-eye-right-idle 12s ease-in-out infinite;
        }

        @keyframes modulo-bob {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          8% { transform: translateY(-1px) rotate(1.5deg); }
          16% { transform: translateY(-2px) rotate(0deg); }
          24% { transform: translateY(-1px) rotate(-1.5deg); }
          32% { transform: translateY(0) rotate(0deg); }
          40% { transform: translateY(-1px) rotate(1deg); }
          48% { transform: translateY(-2px) rotate(-0.5deg); }
          56% { transform: translateY(-1px) rotate(0deg); }
          64% { transform: translateY(0) rotate(0.5deg); }
          72% { transform: translateY(-1px) rotate(-1deg); }
          80% { transform: translateY(-2px) rotate(0deg); }
          88% { transform: translateY(-1px) rotate(1deg); }
        }

        /* Left eye idle: blinks, looks left, looks right, squints, circle eyes */
        @keyframes modulo-eye-left-idle {
          /* Rest */
          0%, 5% { transform: scaleY(1) scaleX(1) translateX(0); }
          /* Blink */
          6%, 7% { transform: scaleY(0.2) scaleX(1) translateX(0); }
          8%, 15% { transform: scaleY(1) scaleX(1) translateX(0); }
          /* Circle eyes - surprised/alert */
          17%, 24% { transform: scaleY(1.28) scaleX(0.78) translateX(0); }
          /* Return to normal */
          26%, 30% { transform: scaleY(1) scaleX(1) translateX(0); }
          /* Look left - squeeze toward left */
          32%, 38% { transform: scaleY(1) scaleX(0.85) translateX(-8px); }
          /* Look right - squeeze toward right */
          40%, 46% { transform: scaleY(1) scaleX(0.85) translateX(8px); }
          /* Rest */
          48%, 52% { transform: scaleY(1) scaleX(1) translateX(0); }
          /* Narrow squint - suspicious/focused */
          55%, 62% { transform: scaleY(0.4) scaleX(1.05) translateX(0); }
          /* Blink */
          64%, 65% { transform: scaleY(0.15) scaleX(1) translateX(0); }
          66%, 70% { transform: scaleY(1) scaleX(1) translateX(0); }
          /* Circle eyes again - cute/interested */
          72%, 78% { transform: scaleY(1.28) scaleX(0.78) translateX(0); }
          /* Look down-left (contemplative) */
          81%, 87% { transform: scaleY(0.9) scaleX(0.9) translateX(-6px) translateY(3px); }
          /* Return */
          90%, 100% { transform: scaleY(1) scaleX(1) translateX(0); }
        }

        /* Right eye idle: mirrors left with slight offset for character */
        @keyframes modulo-eye-right-idle {
          /* Rest */
          0%, 5% { transform: scaleY(1) scaleX(1) translateX(0); }
          /* Blink */
          6%, 7% { transform: scaleY(0.2) scaleX(1) translateX(0); }
          8%, 15% { transform: scaleY(1) scaleX(1) translateX(0); }
          /* Circle eyes - surprised/alert */
          17%, 24% { transform: scaleY(1.28) scaleX(0.78) translateX(0); }
          /* Return to normal */
          26%, 30% { transform: scaleY(1) scaleX(1) translateX(0); }
          /* Look left - squeeze toward left */
          32%, 38% { transform: scaleY(1) scaleX(0.85) translateX(-8px); }
          /* Look right - squeeze toward right */
          40%, 46% { transform: scaleY(1) scaleX(0.85) translateX(8px); }
          /* Rest */
          48%, 52% { transform: scaleY(1) scaleX(1) translateX(0); }
          /* Narrow squint - asymmetric, even narrower */
          55%, 62% { transform: scaleY(0.35) scaleX(1.05) translateX(0); }
          /* Blink */
          64%, 65% { transform: scaleY(0.15) scaleX(1) translateX(0); }
          66%, 70% { transform: scaleY(1) scaleX(1) translateX(0); }
          /* Circle eyes again - cute/interested */
          72%, 78% { transform: scaleY(1.28) scaleX(0.78) translateX(0); }
          /* Look down-left (contemplative) */
          81%, 87% { transform: scaleY(0.9) scaleX(0.9) translateX(-6px) translateY(3px); }
          /* Return */
          90%, 100% { transform: scaleY(1) scaleX(1) translateX(0); }
        }

        /* Speaking bounce */
        .modulo-bounce {
          animation: modulo-bounce 0.6s ease-in-out infinite;
        }

        @keyframes modulo-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }

        /* Success pop */
        .modulo-pop {
          animation: modulo-pop 0.4s ease-out;
        }

        @keyframes modulo-pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }

        /* Celebrating */
        .modulo-celebrate {
          animation: modulo-celebrate 2s ease-in-out infinite;
        }

        .modulo-celebrate .modulo-eye-left {
          animation: modulo-eye-celebrate-left 2s ease-in-out infinite;
        }

        .modulo-celebrate .modulo-eye-right {
          animation: modulo-eye-celebrate-right 2s ease-in-out infinite;
        }

        @keyframes modulo-celebrate {
          0%, 100% { transform: scale(1) rotate(0deg); }
          15% { transform: scale(1.1) rotate(-2deg); }
          30% { transform: scale(1.1) rotate(2deg); }
          45% { transform: scale(1.05) rotate(0deg); }
          60% { transform: scale(1.08) rotate(-1deg); }
          75% { transform: scale(1.08) rotate(1deg); }
        }

        /* Left eye celebrating: happy ^ ^ expression with tilted lines */
        @keyframes modulo-eye-celebrate-left {
          /* Happy wide eyes */
          0%, 20% { transform: scaleY(1.1) scaleX(0.9) translateY(-2px) rotate(0deg); }
          /* Transition to ^ ^ happy squint - rotated 30deg */
          25%, 45% { transform: scaleY(0.25) scaleX(1.1) translateY(0) rotate(30deg); }
          /* Back to happy wide */
          50%, 70% { transform: scaleY(1.1) scaleX(0.9) translateY(-2px) rotate(0deg); }
          /* Another ^ ^ flash */
          75%, 90% { transform: scaleY(0.25) scaleX(1.1) translateY(0) rotate(30deg); }
          /* Return */
          95%, 100% { transform: scaleY(1.1) scaleX(0.9) translateY(-2px) rotate(0deg); }
        }

        /* Right eye celebrating: mirrors left with opposite rotation */
        @keyframes modulo-eye-celebrate-right {
          /* Happy wide eyes */
          0%, 20% { transform: scaleY(1.1) scaleX(0.9) translateY(-2px) rotate(0deg); }
          /* Transition to ^ ^ happy squint - rotated -30deg */
          25%, 45% { transform: scaleY(0.25) scaleX(1.1) translateY(0) rotate(-30deg); }
          /* Back to happy wide */
          50%, 70% { transform: scaleY(1.1) scaleX(0.9) translateY(-2px) rotate(0deg); }
          /* Another ^ ^ flash */
          75%, 90% { transform: scaleY(0.25) scaleX(1.1) translateY(0) rotate(-30deg); }
          /* Return */
          95%, 100% { transform: scaleY(1.1) scaleX(0.9) translateY(-2px) rotate(0deg); }
        }

        /* Thinking animation - processing with periodic squints */
        .modulo-thinking {
          animation: modulo-thinking-bob 3s ease-in-out infinite;
        }

        .modulo-thinking .modulo-eye-left {
          animation: modulo-eye-thinking-left 4s ease-in-out infinite;
        }

        .modulo-thinking .modulo-eye-right {
          animation: modulo-eye-thinking-right 4s ease-in-out infinite;
        }

        @keyframes modulo-thinking-bob {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-2px) rotate(1deg); }
          50% { transform: translateY(-1px) rotate(-0.5deg); }
          75% { transform: translateY(-2px) rotate(0.5deg); }
        }

        /* Left eye thinking: squints, narrows more, shifts gaze */
        @keyframes modulo-eye-thinking-left {
          /* Base squint looking up-right */
          0%, 10% { transform: scaleY(0.7) scaleX(1) translateX(8px) translateY(-4px); }
          /* Squint harder - concentrating */
          15%, 25% { transform: scaleY(0.35) scaleX(1.05) translateX(8px) translateY(-4px); }
          /* Return to base squint */
          30%, 40% { transform: scaleY(0.7) scaleX(1) translateX(8px) translateY(-4px); }
          /* Glance slightly left while squinting */
          45%, 55% { transform: scaleY(0.6) scaleX(0.95) translateX(2px) translateY(-2px); }
          /* Back to up-right */
          60%, 70% { transform: scaleY(0.7) scaleX(1) translateX(8px) translateY(-4px); }
          /* Deep squint - really thinking */
          75%, 85% { transform: scaleY(0.3) scaleX(1.08) translateX(6px) translateY(-4px); }
          /* Return */
          90%, 100% { transform: scaleY(0.7) scaleX(1) translateX(8px) translateY(-4px); }
        }

        /* Right eye thinking: mirrors with slight asymmetry */
        @keyframes modulo-eye-thinking-right {
          /* Base squint looking up-right */
          0%, 10% { transform: scaleY(0.7) scaleX(1) translateX(8px) translateY(-4px); }
          /* Squint harder - concentrating (slightly different timing) */
          15%, 25% { transform: scaleY(0.32) scaleX(1.05) translateX(8px) translateY(-4px); }
          /* Return to base squint */
          30%, 40% { transform: scaleY(0.7) scaleX(1) translateX(8px) translateY(-4px); }
          /* Glance slightly left while squinting */
          45%, 55% { transform: scaleY(0.55) scaleX(0.95) translateX(2px) translateY(-2px); }
          /* Back to up-right */
          60%, 70% { transform: scaleY(0.7) scaleX(1) translateX(8px) translateY(-4px); }
          /* Deep squint - really thinking (narrower than left for character) */
          75%, 85% { transform: scaleY(0.25) scaleX(1.08) translateX(6px) translateY(-4px); }
          /* Return */
          90%, 100% { transform: scaleY(0.7) scaleX(1) translateX(8px) translateY(-4px); }
        }
      `}</style>
    </div>
  );
}

export default ModuloAvatar;
