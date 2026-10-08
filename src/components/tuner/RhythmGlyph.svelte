<!-- One beat's rhythm drawn as notation (click-pattern.ts SUB_PATTERNS' abc),
     on a single line, stems up, in the text colour. abcjs draws it, as it
     draws the exercises, so the picker reads like the music. -->
<script lang="ts">
  import { onMount } from "svelte";
  import abcjs from "abcjs";

  /** The beat, ABC at L:1/16. No staff line: the notes alone read better this small. */
  export let abc: string;
  export let scale = 1;

  let el: HTMLDivElement;
  const draw = () => {
    if (!el) return;
    abcjs.renderAbc(el, `X:1\nL:1/16\nK:C clef=none stafflines=0\nV:1 stem=up\n${abc}`, {
      staffwidth: 64,
      scale,
      paddingtop: 4,
      paddingbottom: 0,
      paddingleft: 0,
      paddingright: 0,
      foregroundColor: "currentColor",
    });
    // abcjs gives the SVG a fixed size; fit it inside the button, whole -
    // a triplet's bracket makes it taller than the rest.
    const svg = el.querySelector("svg");
    if (svg) {
      svg.removeAttribute("height");
      svg.removeAttribute("width");
      svg.style.width = "100%";
      svg.style.height = "100%";
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }
  };
  onMount(draw);
  $: abc, scale, draw();
</script>

<div bind:this={el} class="rhythm-glyph w-full h-full pointer-events-none" aria-hidden="true"></div>
