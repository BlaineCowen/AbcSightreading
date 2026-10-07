<!-- Subscribe to a curriculum track (src/lib/curriculum), on /curriculum and
     each track's page. Signed out it offers sign-up, on a free account Pro; a
     subscribed track shows in the Unison page's preset menu. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Check } from "lucide-svelte";
  import { loadTrackPrefs, setSubscribed, trackPrefs } from "../lib/track-prefs";
  import { trackHref } from "../lib/curriculum/tracks";

  export let trackId: string;
  export let firstStepId: string;
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
  {:else if !$trackPrefs.signedIn}
    <a class="sr-btn text-sm" href="/login?mode=signup&next={here()}">Sign up to subscribe</a>
  {:else if !$trackPrefs.canSubscribe}
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
      <a class="text-sm font-bold underline" href="/sightreading">Open it in the preset menu</a>
    {/if}
  {/if}
  <a class="text-sm font-bold underline" href={trackHref(firstStepId, "rhythm")}>Try step 1</a>
  {#if problem}<span class="text-xs text-sr-danger w-full" role="alert">{problem}</span>{/if}
</div>
