<script setup>
// 文華鹿 (Wenhwa Deer) map sprite — redrawn as a SIDE-PROFILE walking
// character (classic overworld-RPG silhouette: head + legs facing the
// direction of travel, diagonal-gait leg animation) instead of the previous
// front-facing "bobblehead" pose, which read as a static mascot shuffling
// rather than a character walking across the map. Colour palette and
// character design (warm tan fur, navy/white FCU accent, blue-to-purple
// antlers) still reference the mascot art the user provided — not a copy of
// that artwork. No image-generation tool is available in this environment,
// so this remains hand-authored SVG rather than an AI-rendered sprite sheet;
// this redesign is the best achievable approximation of "a game character
// walking on the map" without one — see README's known-limitations section.
defineProps({
  size: { type: Number, default: 30 },
  facing: { type: String, default: 'right' }, // 'left' | 'right' — direction of travel
  walking: { type: Boolean, default: true },
})
</script>

<template>
  <div
    class="deer-sprite"
    :class="{ walking, 'face-left': facing === 'left' }"
    :style="{ width: size + 'px', height: size * (100 / 140) + 'px' }"
  >
    <svg viewBox="0 0 140 100" class="deer-svg">
      <defs>
        <linearGradient id="antlerGrad2" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stop-color="#3ba7e0" />
          <stop offset="100%" stop-color="#9b6fe0" />
        </linearGradient>
      </defs>

      <g class="gait-bob">
        <!-- far-side legs (behind body, lighter shade, diagonal gait) -->
        <rect class="leg leg-far-back" x="40" y="66" width="8" height="24" rx="4" fill="#c98a4d" />
        <rect class="leg leg-far-front" x="82" y="66" width="8" height="24" rx="4" fill="#c98a4d" />

        <!-- tail -->
        <ellipse cx="26" cy="50" rx="6" ry="7" fill="#fff" opacity="0.95" />

        <!-- body -->
        <ellipse cx="62" cy="54" rx="34" ry="19" fill="#d99a55" />
        <ellipse cx="58" cy="64" rx="23" ry="10" fill="#fff" opacity="0.9" />

        <!-- FCU saddle blanket accent (reads correctly from the side, unlike
             the old front-facing polo chest panel) -->
        <path d="M32 40 Q62 27 92 40 L88 52 Q62 60 36 52 Z" fill="#0a6ea8" />
        <path d="M36 42 Q62 32 88 42 L85 49 Q62 55 39 49 Z" fill="#fff" />
        <text x="62" y="48" text-anchor="middle" class="polo-text">FCU</text>

        <!-- near-side legs (in front, main gait) -->
        <rect class="leg leg-near-back" x="46" y="64" width="9" height="27" rx="4.5" fill="#8a5a2f" />
        <rect class="leg leg-near-front" x="76" y="64" width="9" height="27" rx="4.5" fill="#8a5a2f" />

        <!-- head (profile, facing right = direction of travel) -->
        <ellipse cx="103" cy="45" rx="17" ry="14" fill="#e5aa66" />
        <ellipse cx="112" cy="50" rx="9" ry="6.5" fill="#f6dcb5" />
        <circle cx="118" cy="49" r="2.6" fill="#7a4a22" />
        <circle cx="100" cy="39" r="3.4" fill="#3a2a1e" />
        <circle cx="99" cy="38" r="1.1" fill="#fff" />

        <!-- ear -->
        <ellipse cx="93" cy="27" rx="6.2" ry="10" fill="#d99a55" transform="rotate(-18 93 27)" />
        <ellipse cx="93" cy="28" rx="3.2" ry="5.8" fill="#f3c893" transform="rotate(-18 93 28)" />

        <!-- antler -->
        <path
          d="M97 24 C94 12 88 8 84 2 M97 24 C99 14 104 8 102 0"
          stroke="url(#antlerGrad2)"
          stroke-width="3.4"
          fill="none"
          stroke-linecap="round"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.deer-sprite {
  display: inline-block;
  transform-origin: center;
}
.deer-sprite.face-left .deer-svg {
  transform: scaleX(-1);
}
.deer-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.polo-text {
  font-size: 10px;
  font-weight: 800;
  fill: #0a6ea8;
}
.leg {
  transform-box: fill-box;
  transform-origin: top center;
}
.gait-bob {
  transform-origin: 62px 54px;
}

/* Diagonal quadruped gait: near-front + far-back swing together, near-back +
   far-front swing opposite — reads as a trot/walk cycle even at tiny map
   sizes, and (unlike the old front-facing bob) the silhouette itself now
   clearly reads as "a character walking sideways". */
.deer-sprite.walking .leg-near-front,
.deer-sprite.walking .leg-far-back {
  animation: stride-a 0.45s ease-in-out infinite;
}
.deer-sprite.walking .leg-near-back,
.deer-sprite.walking .leg-far-front {
  animation: stride-b 0.45s ease-in-out infinite;
}
.deer-sprite.walking .gait-bob {
  animation: gait-bounce 0.45s ease-in-out infinite;
}
@keyframes stride-a {
  0%, 100% { transform: rotate(24deg); }
  50% { transform: rotate(-24deg); }
}
@keyframes stride-b {
  0%, 100% { transform: rotate(-24deg); }
  50% { transform: rotate(24deg); }
}
@keyframes gait-bounce {
  0%, 50%, 100% { transform: translateY(0); }
  25%, 75% { transform: translateY(-2.2px); }
}
</style>
