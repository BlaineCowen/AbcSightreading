// svelte-slider.d.ts
declare module "@bulatdashiev/svelte-slider" {
  import { SvelteComponentTyped } from "svelte";
  export default class Slider extends SvelteComponentTyped<{
    min: number;
    max: number;
    step?: number;
    range?: boolean;
    value?: number | number[];
    // Add other props as necessary
  }> {}
}
