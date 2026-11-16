<script lang="ts">
  import Flame from "lucide-svelte/icons/flame";
  import Clock from "lucide-svelte/icons/clock";
  import Music from "lucide-svelte/icons/music";
  import Target from "lucide-svelte/icons/target";
  import Sparkles from "lucide-svelte/icons/sparkles";
  import Mountain from "lucide-svelte/icons/mountain";
  import CalendarCheck from "lucide-svelte/icons/calendar-check";
  import Crown from "lucide-svelte/icons/crown";
  import Users from "lucide-svelte/icons/users";
  import KeyRound from "lucide-svelte/icons/key-round";
  import Music2 from "lucide-svelte/icons/music-2";
  import BadgeCheck from "lucide-svelte/icons/badge-check";
  import Drum from "lucide-svelte/icons/drum";
  import Crosshair from "lucide-svelte/icons/crosshair";
  import Hand from "lucide-svelte/icons/hand";
  import Moon from "lucide-svelte/icons/moon";
  import Waves from "lucide-svelte/icons/waves";
  import Anchor from "lucide-svelte/icons/anchor";
  import Trophy from "lucide-svelte/icons/trophy";
  import TrendingUp from "lucide-svelte/icons/trending-up";
  import RotateCcw from "lucide-svelte/icons/rotate-ccw";
  import Presentation from "lucide-svelte/icons/presentation";
  import Sunrise from "lucide-svelte/icons/sunrise";
  import Compass from "lucide-svelte/icons/compass";
  import Star from "lucide-svelte/icons/star";
  import Smile from "lucide-svelte/icons/smile";
  import HandHeart from "lucide-svelte/icons/hand-heart";
  import Award from "lucide-svelte/icons/award";
  import type { Colour } from "../lib/badges";

  /**
   * A badge's round medal (badges.ts): a pastel circle with its icon, its
   * level in the corner, grey and dashed while it is still to earn.
   */
  export let icon: string;
  export let colour: Colour | string = "tint";
  export let level: number | null = null;
  export let locked = false;
  export let size = 76;

  const ICONS: Record<string, typeof Award> = {
    "flame": Flame,
    "clock": Clock,
    "music": Music,
    "target": Target,
    "sparkles": Sparkles,
    "mountain": Mountain,
    "calendar-check": CalendarCheck,
    "crown": Crown,
    "users": Users,
    "key-round": KeyRound,
    "music-2": Music2,
    "badge-check": BadgeCheck,
    "drum": Drum,
    "crosshair": Crosshair,
    "hand": Hand,
    "moon": Moon,
    "waves": Waves,
    "anchor": Anchor,
    "trophy": Trophy,
    "trending-up": TrendingUp,
    "rotate-ccw": RotateCcw,
    "presentation": Presentation,
    "sunrise": Sunrise,
    "compass": Compass,
    "star": Star,
    "smile": Smile,
    "hand-heart": HandHeart,
    "award": Award,
  };
</script>

<span class="medal {locked ? 'locked' : `c-${colour}`}" style="--s: {size}px" aria-hidden="true">
  <svelte:component this={ICONS[icon] ?? Award} size={Math.round(size * 0.45)} />
  {#if level && !locked}<span class="lv">{level}</span>{/if}
</span>

<style>
  .medal { position: relative; flex: none; width: var(--s); height: var(--s); border-radius: 999px; display: grid; place-items: center; box-shadow: inset 0 -5px 0 rgb(0 0 0 / 0.08); }
  .lv { position: absolute; bottom: -4px; right: -4px; min-width: 26px; height: 26px; padding: 0 5px; border-radius: 999px; display: grid; place-items: center; background: var(--sr-ink); color: var(--sr-raise); font-family: var(--sr-font-display); font-size: 13px; font-weight: 700; border: 3px solid var(--sr-raise); }
  .locked { background: var(--sr-track); color: var(--sr-faint); box-shadow: none; border: 2px dashed var(--sr-hairline); }
  .c-mint { background: var(--sr-mint); color: var(--sr-mint-ink); }
  .c-peach { background: var(--sr-peach); color: var(--sr-peach-ink); }
  .c-butter { background: var(--sr-butter); color: var(--sr-butter-ink); }
  .c-sky { background: var(--sr-sky); color: var(--sr-sky-ink); }
  .c-tint { background: var(--sr-tint); color: var(--sr-action-fg); }
</style>
