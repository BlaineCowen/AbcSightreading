<script lang="ts">
  /** Pip in tune (pitch-guide.ts, challenge/scene.ts): the face that points to /challenge. */
  let className = "";
  export { className as class };
</script>

<svg class="pip {className}" viewBox="-52 -52 104 104" aria-hidden="true">
  <circle r="46" fill="#2fb383" stroke="#15213a" stroke-width="6" />
  <path d="M-23.5 -3 Q-15.6 -19 -7.7 -3 M7.7 -3 Q15.6 -19 23.5 -3" fill="none" stroke="#15213a" stroke-width="6" stroke-linecap="round" />
  <circle cx="-28" cy="10" r="7" fill="rgba(255,138,102,.6)" />
  <circle cx="28" cy="10" r="7" fill="rgba(255,138,102,.6)" />
  <path d="M-14 10 Q0 27 14 10" fill="none" stroke="#15213a" stroke-width="6" stroke-linecap="round" />
</svg>

<style>
  .pip {
    animation: pip-bob 2.4s ease-in-out infinite;
  }
  @keyframes pip-bob {
    0%, 100% { transform: translateY(0) scale(1, 1); }
    45% { transform: translateY(-10%) scale(0.97, 1.03); }
    55% { transform: translateY(-10%) scale(0.97, 1.03); }
    90% { transform: translateY(0) scale(1.05, 0.95); }
  }
  @media (prefers-reduced-motion: reduce) {
    .pip { animation: none; }
  }
</style>
