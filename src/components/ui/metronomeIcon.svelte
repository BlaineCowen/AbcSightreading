<!--
  Metronome icon. Lucide has no metronome, so this one stays hand-drawn, but it
  takes the same props as a lucide-svelte icon so call sites look identical.
  Stroke follows currentColor -- do not reintroduce a <style> block here: nested
  inside the <svg> it ships as a global, unscoped <style> DOM node.
-->
<script lang="ts">
  export let size: number | string = 24;
  export let strokeWidth: number | string = 2;
  let className = "";
  export { className as class };
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 32 32"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
  aria-hidden="true"
>
  <line x1="16" y1="20" x2="29" y2="3" />
  <line x1="15" y1="7" x2="17" y2="7" />
  <line x1="15" y1="10" x2="17" y2="10" />
  <line x1="15" y1="13" x2="17" y2="13" />
  <path
    d="M22.7,16l2.5,9.7c0.4,1.7-0.8,3.3-2.6,3.3H9.3c-1.7,0-3-1.6-2.6-3.2l4.7-20.5C11.8,3.9,13,3,14.3,3h3.4
	c1.4,0,2.5,1,2.8,2.3l1.4,7"
  />
  <line x1="7.4" y1="23" x2="24" y2="23" />
</svg>
