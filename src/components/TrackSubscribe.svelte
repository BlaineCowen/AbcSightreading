<!-- Subscribe to a set or track (src/lib/curriculum/catalogue.ts), on
     /curriculum and each track's page; what is subscribed is what the preset
     menu lists. The built-in sets (`free`) are anyone's, kept in this browser
     when signed out; every course is free now too, so `free` is passed for all. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Check } from "lucide-svelte";
  import { loadTrackPrefs, setSubscribed, trackPrefs } from "../lib/track-prefs";
  export let trackId: string;
  /** Where "Try it" goes: a track's first step, or a set's page. */
  export let tryHref: string;
  export let tryLabel = "Try step 1";
  /** Where it is used, for "Open it". */
  export let openHref = "/sightreading";
  /** A built-in set: free, and kept in this browser when signed out. */
  export let free = false;
  /** "card" sits at the foot of a catalogue card; "hero" on a track's own page. */
  export let variant: "card" | "hero" = "card";

  let ready = false;
  let busy = false;
  let problem = "";

  onMount(() => {
    loadTrackPrefs().catch(() => {}).finally(() => (ready = true));
  });

  $: subscribed = $trackPrefs.tracks.includes(trackId);

  async function toggle() {
    busy = true;
    problem = "";
    try {
      await setSubscribed(trackId, !subscribed);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  const here = () => encodeURIComponent(window.location.pathname);
</script>

<div class="flex flex-wrap items-center gap-2 {variant === 'hero' ? 'mt-2' : ''}">
  {#if !ready}
    <span class="h-9 w-32 rounded-full bg-sr-track/60 animate-pulse" aria-hidden="true"></span>
  {:else if !free && !$trackPrefs.signedIn}
    <a class="sr-btn text-sm" href="/login?mode=signup&next={here()}">Sign up to subscribe</a>
  {:else if !free && !$trackPrefs.canSubscribe}
    <a class="sr-btn text-sm" href="/pricing">Get Pro to subscribe</a>
  {:else}
    <button
      type="button"
      class="text-sm font-extrabold rounded-full px-4 py-2 inline-flex items-center gap-1.5 transition
        {subscribed ? 'bg-sr-raise text-sr-ink ring-2 ring-sr-action' : 'bg-sr-action text-sr-action-ink hover:brightness-95'}"
      aria-pressed={subscribed}
      disabled={busy}
      on:click={toggle}
    >
      {#if subscribed}<Check size={15} /> Subscribed{:else}Subscribe{/if}
    </button>
    {#if subscribed}
      <a class="text-sm font-bold underline" href={openHref}>In your presets</a>
    {/if}
  {/if}
  <a class="text-sm font-bold underline" href={tryHref}>{tryLabel}</a>
  {#if problem}<span class="text-xs text-sr-danger w-full" role="alert">{problem}</span>{/if}
</div>
