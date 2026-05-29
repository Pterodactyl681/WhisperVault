import type { CSSProperties } from "react";

type StarParticle = {
  x: number;
  y: number;
  size: number;
  opacity: number;
  dx: number;
  dy: number;
  drift: number;
  twinkle: number;
  delay: number;
};

type StreakParticle = {
  x: number;
  y: number;
  width: number;
  angle: number;
  opacity: number;
  travelX: number;
  travelY: number;
  duration: number;
  delay: number;
};

type LargeObject = {
  x: number;
  y: number;
  size: number;
  opacity: number;
  drift: number;
  delay: number;
  variant: "orb" | "shard" | "nebula";
};

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createStars(count: number, seed: number, sizeRange: [number, number], opacityRange: [number, number]): StarParticle[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => {
    const x = random() * 100;
    const y = random() * 100;
    const size = sizeRange[0] + random() * (sizeRange[1] - sizeRange[0]);
    const opacity = opacityRange[0] + random() * (opacityRange[1] - opacityRange[0]);
    const dx = (random() * 24 - 12).toFixed(1);
    const dy = (random() * 22 - 11).toFixed(1);
    const drift = 24 + random() * 30;
    const twinkle = 3.2 + random() * 5.5;
    const delay = -random() * 26;

    return {
      x,
      y,
      size,
      opacity,
      dx: Number(dx),
      dy: Number(dy),
      drift,
      twinkle,
      delay
    };
  });
}

function createStreaks(count = 3): StreakParticle[] {
  const random = createSeededRandom(8026);
  return Array.from({ length: count }, () => ({
    x: random() * 100,
    y: random() * 100,
    width: 26 + random() * 38,
    angle: -28 + random() * 56,
    opacity: 0.18 + random() * 0.2,
    travelX: 28 + random() * 38,
    travelY: -16 + random() * 24,
    duration: 18 + random() * 20,
    delay: -random() * 24
  }));
}

const FAR_STARS = createStars(42, 2026, [1, 2.2], [0.12, 0.42]);
const MID_PARTICLES = createStars(14, 1337, [1.6, 3], [0.14, 0.48]);
const STREAKS = createStreaks();

const LARGE_OBJECTS: LargeObject[] = [
  { x: 14, y: 28, size: 320, opacity: 0.14, drift: 84, delay: -8, variant: "nebula" },
  { x: 82, y: 18, size: 290, opacity: 0.12, drift: 78, delay: -18, variant: "orb" },
  { x: 26, y: 78, size: 250, opacity: 0.1, drift: 96, delay: -25, variant: "shard" }
];

function asStyle(vars: Record<string, string>): CSSProperties {
  return vars as CSSProperties;
}

function starStyle(star: StarParticle): CSSProperties {
  return asStyle({
    "--x": `${star.x.toFixed(2)}%`,
    "--y": `${star.y.toFixed(2)}%`,
    "--size": `${star.size.toFixed(2)}px`,
    "--opacity": `${star.opacity.toFixed(2)}`,
    "--dx": `${star.dx}px`,
    "--dy": `${star.dy}px`,
    "--drift-duration": `${star.drift.toFixed(2)}s`,
    "--twinkle-duration": `${star.twinkle.toFixed(2)}s`,
    "--delay": `${star.delay.toFixed(2)}s`
  });
}

function streakStyle(streak: StreakParticle): CSSProperties {
  return asStyle({
    "--x": `${streak.x.toFixed(2)}%`,
    "--y": `${streak.y.toFixed(2)}%`,
    "--width": `${streak.width.toFixed(2)}px`,
    "--angle": `${streak.angle.toFixed(2)}deg`,
    "--streak-opacity": `${streak.opacity.toFixed(2)}`,
    "--travel-x": `${streak.travelX.toFixed(2)}px`,
    "--travel-y": `${streak.travelY.toFixed(2)}px`,
    "--duration": `${streak.duration.toFixed(2)}s`,
    "--delay": `${streak.delay.toFixed(2)}s`
  });
}

function objectStyle(object: LargeObject): CSSProperties {
  return asStyle({
    "--x": `${object.x}%`,
    "--y": `${object.y}%`,
    "--size": `${object.size}px`,
    "--object-opacity": `${object.opacity}`,
    "--object-drift": `${object.drift}s`,
    "--delay": `${object.delay}s`
  });
}

export function AnimatedBackground(): JSX.Element {
  return (
    <div className="ambient-background" aria-hidden="true">
      <span className="ambient-flow" />
      <span className="ambient-chroma" />
      <span className="ambient-orb ambient-orb-violet" />
      <span className="ambient-orb ambient-orb-cyan" />

      <span className="ambient-layer ambient-layer-stars">
        {FAR_STARS.map((star, index) => (
          <span key={`far-star-${index}`} className="ambient-star ambient-star-far" style={starStyle(star)} />
        ))}
      </span>

      <span className="ambient-layer ambient-layer-particles">
        {MID_PARTICLES.map((star, index) => (
          <span key={`mid-particle-${index}`} className="ambient-star ambient-star-mid" style={starStyle(star)} />
        ))}
      </span>

      <span className="ambient-layer ambient-layer-streaks">
        {STREAKS.map((streak, index) => (
          <span key={`streak-${index}`} className="ambient-streak" style={streakStyle(streak)} />
        ))}
      </span>

      <span className="ambient-layer ambient-layer-objects">
        {LARGE_OBJECTS.map((object, index) => (
          <span
            key={`object-${index}`}
            className={`ambient-object ambient-object-${object.variant}`}
            style={objectStyle(object)}
          />
        ))}
      </span>

      <span className="ambient-vignette" />
    </div>
  );
}
