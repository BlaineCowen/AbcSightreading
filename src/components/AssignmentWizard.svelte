<script lang="ts">
  import { onMount, tick } from "svelte";
  import Sparkles from "lucide-svelte/icons/sparkles";
  import Music from "lucide-svelte/icons/music";
  import Upload from "lucide-svelte/icons/upload";
  import Check from "lucide-svelte/icons/check";
  import { presetKeyOf } from "../lib/class-validate";
  import { ladderStages, stepTitle } from "../lib/ladder";
  import { uilPresets } from "../lib/uil-presets";
  import { nyssmaVoiceLevels } from "../lib/nyssma-presets";
  import { TMEA_LEVELS } from "../lib/tmea-presets";
  import { itemForKey, type OwnPreset } from "../lib/class-course";
  import { MAX_MINUTES, isCustomKey } from "../lib/practice";
  import { clearDraft, designHref, draftComplete, needsPage, saveDraft, type AssignDraft } from "../lib/assignment-draft";
  import { uploadPiece } from "../lib/pieces/client";
  import { ACCEPTED, isPieceFileName } from "../lib/pieces/rules";
  import AssignPieceForm from "./pieces/AssignPieceForm.svelte";

  /**
   * Create an assignment, in the order a teacher thinks of one: what kind
   * (sight reading, or a song from My music), what exactly (a preset, or set
   * up on the page; new exercises each time or one exercise for everyone;
   * the song's bars and part), then which classes, when it is due and a
   * note, and Send. A sight-reading one that needs the page goes there and
   * comes back (assignment-draft.ts); a song is AssignPieceForm, as from the
   * piece itself.
   */

  export let classes: { id: string; name: string }[];
  /** The class it was opened from, ticked to start with. */
  export let preselect: string | null = null;
  /** The teacher's saved presets, both pages ("Choral" / "Unison"). */
  export let saved: { id: string; name: string; page: string }[] = [];
  /** Back from the page: carry on at the last step. */
  export let resume: AssignDraft | null = null;
  export let onDone: (r: { classIds: string[]; ids: string[] }) => void;
  export let onCancel: () => void;

  type Stage = "kind" | "design" | "details" | "song" | "sent";
  let stage: Stage = "kind";
  let presetKey = "";
  let fixed = false;
  let classIds: string[] = preselect ? [preselect] : classes.length === 1 ? [classes[0].id] : [];
  let minutes = 15;
  let dueAt = "";
  let note = "";
  let title = "";
  let custom: AssignDraft["custom"];
  let exercise: string | undefined;
  let busy = false;
  let problem = "";
  let sentTo: string[] = [];
  let root: HTMLElement;

  const today = new Date().toISOString().slice(0, 10);
  const input = "rounded-xl border border-sr-hairline bg-sr-panel text-sr-ink text-sm px-2 min-h-10";

  $: own = saved.map((p): OwnPreset => ({ id: p.id, name: p.name, page: p.page.toLowerCase() === "choral" ? "choral" : "unison" }));
  $: isCustom = isCustomKey(presetKey);
  $: labelOf = isCustom ? title.trim() || "Sight reading" : (itemForKey(presetKey, own)?.label ?? "");
  $: goesToPage = !!presetKey && needsPage({ presetKey, fixed });
  /** The page still has something to add: the exercise, or a custom one's settings. */
  $: mustGo = goesToPage && !((!fixed || !!exercise) && (!isCustom || !!custom));
  $: pageName = presetKey === "custom:choral" || /choral/.test(designHref(presetKey, own) ?? "") ? "Choral" : "Unison";

  onMount(async () => {
    if (!resume) return;
    ({ presetKey, fixed, minutes, dueAt, note, title, custom, exercise } = resume);
    classIds = resume.classIds.filter((id) => classes.some((c) => c.id === id));
    if (!classIds.length && preselect) classIds = [preselect];
    stage = draftComplete(resume) ? "details" : "design";
    await tick();
    root?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const draft = (): AssignDraft => ({ presetKey, fixed, classIds, minutes, dueAt, note, title, custom, exercise });

  /** Off to the page to set it up or write the exercise; the page brings the teacher back. */
  function toPage() {
    const href = designHref(presetKey, own);
    if (!href) {
      problem = "That preset could not be opened.";
      return;
    }
    // A change of mind since the last visit: what the page added no longer fits.
    saveDraft({ ...draft(), custom: undefined, exercise: undefined, ready: false });
    location.href = href;
  }

  function next() {
    problem = "";
    if (!presetKey) return void (problem = "Choose what to practise.");
    if (isCustom && !title.trim()) return void (problem = "Give it a title: students see it on their list.");
    if (mustGo) return toPage();
    stage = "details";
  }

  /** Changing what is assigned forgets what the page added for the old choice. */
  function changed() {
    custom = undefined;
    exercise = undefined;
  }

  async function send() {
    problem = "";
    if (!classIds.length) return void (problem = "Choose at least one class.");
    busy = true;
    const body = {
      presetKey,
      minutes,
      dueAt,
      note,
      ...(fixed && exercise ? { exercise } : {}),
      ...(isCustom && custom ? { custom: { ...custom, name: title.trim() || custom.name } } : {}),
    };
    const ids: string[] = [];
    const done: string[] = [];
    for (const classId of classIds) {
      const res = await fetch(`/api/classes/${classId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) {
        problem = `${nameOf(classId)}: ${r.error ?? "could not assign that."}`;
        break;
      }
      ids.push(r.id);
      done.push(classId);
    }
    busy = false;
    if (done.length) window.dispatchEvent(new CustomEvent("sr-assignments-changed", { detail: { classIds: done } }));
    if (done.length < classIds.length) {
      // Sent to some: take those out, so Send again only sends the rest.
      classIds = classIds.filter((id) => !done.includes(id));
      return;
    }
    clearDraft();
    sentTo = done;
    stage = "sent";
    onDone({ classIds: done, ids });
  }

  const nameOf = (id: string) => classes.find((c) => c.id === id)?.name ?? "the class";
  const listOf = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

  function toggleClass(id: string) {
    classIds = classIds.includes(id) ? classIds.filter((x) => x !== id) : [...classIds, id];
  }

  // ── A song: upload one here, then the piece form ───────────────────────
  let uploading = "";
  let uploadedId: string | null = null;
  let fileInput: HTMLInputElement;
  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    problem = "";
    if (!isPieceFileName(file.name)) {
      problem = `${file.name} is not MusicXML. In your notation program: File, Export, MusicXML.`;
      return;
    }
    uploading = file.name;
    try {
      uploadedId = (await uploadPiece(file)).id;
    } catch (e) {
      problem = `${file.name}: ${(e as Error).message}`;
    } finally {
      uploading = "";
      if (fileInput) fileInput.value = "";
    }
  }

  function startOver() {
    stage = "kind";
    presetKey = "";
    fixed = false;
    title = "";
    note = "";
    dueAt = "";
    changed();
    classIds = preselect ? [preselect] : classes.length === 1 ? [classes[0].id] : [];
  }

  function cancel() {
    clearDraft();
    onCancel();
  }

  const STEPS: { stage: Stage; label: string }[] = [
    { stage: "kind", label: "Kind" },
    { stage: "design", label: "What" },
    { stage: "details", label: "Send" },
  ];
  $: stepIndex = stage === "kind" ? 0 : stage === "design" || stage === "song" ? 1 : 2;
</script>

<section bind:this={root} class="wizard flex flex-col gap-4" aria-label="Create an assignment">
  {#if stage !== "sent"}
    <ol class="steps" aria-label="Steps">
      {#each STEPS as s, i}
        <li class:on={i === stepIndex} class:done={i < stepIndex} aria-current={i === stepIndex ? "step" : undefined}>
          <span class="dot">{#if i < stepIndex}<Check size={12} aria-hidden="true" />{:else}{i + 1}{/if}</span>{s.label}
        </li>
      {/each}
    </ol>
  {/if}

  {#if stage === "kind"}
    <p class="font-bold text-sr-ink">What should they practise?</p>
    <div class="grid gap-2 sm:grid-cols-2">
      <button type="button" class="kind-card bg-sr-sky text-sr-sky-ink" on:click={() => (stage = "design")}>
        <span class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide"><Sparkles size={14} aria-hidden="true" /> Sight reading</span>
        <span class="font-bold">Music they have never seen</span>
        <span class="text-sm">A step, a level, one of your presets, or set it up yourself. New exercises each time, or one exercise for everyone.</span>
      </button>
      <button type="button" class="kind-card bg-sr-peach text-sr-peach-ink" on:click={() => (stage = "song")}>
        <span class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide"><Music size={14} aria-hidden="true" /> A song</span>
        <span class="font-bold">Bars of a piece you are learning</span>
        <span class="text-sm">From My music: choose the bars and the part, what plays along and how many tries. The song stays in their library.</span>
      </button>
    </div>
    <button type="button" class="text-sm text-sr-muted underline self-start" on:click={cancel}>Cancel</button>

  {:else if stage === "design"}
    <div class="flex flex-col gap-3">
      <label class="text-sm text-sr-ink-2 flex flex-col gap-1">Start from
        <select class={input} bind:value={presetKey} on:change={changed}>
          <option value="" disabled>Choose…</option>
          <optgroup label="Set it up yourself">
            <option value="custom:unison">Custom: one line (Unison page)</option>
            <option value="custom:choral">Custom: parts (Choral page)</option>
          </optgroup>
          {#each ladderStages() as s}
            <optgroup label="abcStepByStep: {s.stage}">
              {#each s.steps as step}<option value={presetKeyOf.step(step.id)}>{step.number}. {stepTitle(step)}</option>{/each}
            </optgroup>
          {/each}
          <optgroup label="UIL levels">
            {#each Object.entries(uilPresets) as [key, level]}<option value={presetKeyOf.uil(key)}>{level.label ?? key}</option>{/each}
          </optgroup>
          <optgroup label="NYSSMA Voice">
            {#each nyssmaVoiceLevels as l}<option value={presetKeyOf.nyssma(l.id)}>{l.label}</option>{/each}
          </optgroup>
          <optgroup label="TMEA All-State">
            {#each TMEA_LEVELS as l}<option value={presetKeyOf.tmea(l.id)}>{l.label}</option>{/each}
          </optgroup>
          {#if saved.length}
            <optgroup label="Your presets">
              {#each saved as p}<option value={presetKeyOf.saved(p.id)}>{p.name} ({p.page})</option>{/each}
            </optgroup>
          {/if}
        </select>
      </label>

      {#if isCustom}
        <label class="text-sm text-sr-ink-2 flex flex-col gap-1">Title <span class="text-xs text-sr-faint">what students see on their list</span>
          <input class={input} bind:value={title} maxlength="80" placeholder="Week 6: do to so in G" />
        </label>
      {/if}

      <fieldset class="flex flex-col gap-2">
        <legend class="text-sm text-sr-ink-2 mb-1">The music</legend>
        <div class="seg" role="radiogroup" aria-label="The music">
          <button type="button" role="radio" aria-checked={!fixed} class:on={!fixed} on:click={() => ((fixed = false), (exercise = undefined))}>New exercises each time</button>
          <button type="button" role="radio" aria-checked={fixed} class:on={fixed} on:click={() => (fixed = true)}>Same exercise for everyone</button>
        </div>
        <p class="text-xs text-sr-muted">
          {fixed
            ? "You write exercises on the page until you have one you like, and every student sings that one. Fair for grading."
            : "Each student gets freshly written music at these settings, every time, so they read rather than remember."}
        </p>
      </fieldset>

      {#if exercise || custom}
        <p class="text-sm rounded-xl bg-sr-mint text-sr-mint-ink px-3 py-2 flex flex-wrap items-center gap-2">
          <Check size={14} aria-hidden="true" />
          {exercise ? "Exercise chosen." : "Settings chosen."}
          <button type="button" class="underline font-semibold" on:click={toPage}>{exercise ? "Choose another" : "Change them"}</button>
        </p>
      {/if}

      {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
      <div class="flex flex-wrap gap-2 items-center">
        <button type="button" class="sr-btn text-sm" disabled={!presetKey} on:click={next}>
          {#if mustGo}{fixed ? "Choose the exercise" : "Set it up on the page"}{:else}Next{/if}
        </button>
        <button type="button" class="sr-btn-quiet text-sm" on:click={() => ((stage = "kind"), (problem = ""))}>Back</button>
        {#if mustGo}
          <span class="text-xs text-sr-muted">Opens the {pageName} page. Press <strong>Use {fixed ? "this exercise" : "these settings"}</strong> there to come back.</span>
        {/if}
      </div>
    </div>

  {:else if stage === "song"}
    <div class="flex flex-col gap-3">
      <label class="upload text-sm">
        <Upload size={16} aria-hidden="true" />
        {uploading ? `Reading ${uploading}…` : "Upload a new song (MusicXML)"}
        <input bind:this={fileInput} class="sr-only" type="file" accept={ACCEPTED} disabled={!!uploading} on:change={(e) => upload(e.currentTarget.files)} />
      </label>
      {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
      {#key uploadedId}
        <AssignPieceForm
          classId={preselect}
          pieceId={uploadedId}
          onDone={(r) => {
            window.dispatchEvent(new CustomEvent("sr-assignments-changed", { detail: { classIds: [r.classId] } }));
            sentTo = [r.classId];
            stage = "sent";
            onDone({ classIds: [r.classId], ids: [r.id] });
          }}
          onCancel={() => (stage = "kind")}
        />
      {/key}
    </div>

  {:else if stage === "details"}
    <div class="flex flex-col gap-3">
      <p class="text-sm text-sr-ink">
        <strong>{labelOf}</strong>{fixed ? ", one exercise for everyone" : ", new exercises each time"}
        <button type="button" class="ml-1 sr-link text-sm" on:click={() => (stage = "design")}>Change</button>
      </p>
      {#if classes.length > 1}
        <fieldset class="flex flex-col gap-1">
          <legend class="text-sm text-sr-ink-2 mb-1">Classes</legend>
          <div class="flex flex-wrap gap-2">
            {#each classes as c (c.id)}
              <button type="button" class="sr-tok" class:sr-on={classIds.includes(c.id)} aria-pressed={classIds.includes(c.id)} on:click={() => toggleClass(c.id)}>{c.name}</button>
            {/each}
          </div>
        </fieldset>
      {/if}
      <div class="flex flex-wrap gap-3">
        <label class="text-sm text-sr-ink-2 flex items-center gap-2">Minutes <input class="{input} w-20" type="number" min="1" max={MAX_MINUTES} bind:value={minutes} required /></label>
        <label class="text-sm text-sr-ink-2 flex items-center gap-2">Due <input class={input} type="date" min={today} bind:value={dueAt} /></label>
      </div>
      <label class="text-sm text-sr-ink-2 flex flex-col gap-1">Note for students <span class="text-xs text-sr-faint">optional</span>
        <input class={input} bind:value={note} maxlength="300" placeholder="Sing on solfège, then on loo" />
      </label>
      {#if problem}<p class="text-sm text-sr-danger" role="alert">{problem}</p>{/if}
      <div class="flex flex-wrap gap-2">
        <button type="button" class="sr-btn text-sm" disabled={busy || !classIds.length} on:click={send}>
          {busy ? "Sending…" : classIds.length > 1 ? `Send to ${classIds.length} classes` : `Send to ${classIds.length ? nameOf(classIds[0]) : "students"}`}
        </button>
        <button type="button" class="sr-btn-quiet text-sm" on:click={() => (stage = "design")}>Back</button>
        <button type="button" class="text-sm text-sr-muted underline" on:click={cancel}>Cancel</button>
      </div>
    </div>

  {:else if stage === "sent"}
    <div class="rounded-2xl bg-sr-mint text-sr-mint-ink p-4 flex flex-col gap-2" role="status">
      <p class="font-bold">Sent to {listOf(sentTo.map(nameOf))}.</p>
      <p class="text-sm">Students see it on their home page and account as soon as they sign in.</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="sr-btn text-sm" on:click={startOver}>Create another</button>
        <button type="button" class="sr-btn-quiet text-sm" on:click={onCancel}>Done</button>
      </div>
    </div>
  {/if}
</section>

<style>
  .wizard {
    border: 1px solid var(--sr-hairline);
    border-radius: 20px;
    padding: 1rem;
    background: var(--sr-panel);
  }
  .steps {
    display: flex;
    gap: 1rem;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--sr-muted);
  }
  .steps li {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .steps li.on {
    color: var(--sr-ink);
  }
  .dot {
    display: grid;
    place-items: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 999px;
    background: var(--sr-track);
    font-size: 0.7rem;
  }
  .on .dot {
    background: var(--sr-action);
    color: var(--sr-action-ink);
  }
  .done .dot {
    background: var(--sr-mint);
    color: var(--sr-mint-ink);
  }
  .kind-card {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    text-align: left;
    padding: 1rem 1.1rem;
    border-radius: 20px;
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .kind-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--sr-card-shadow);
  }
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.25rem;
    border-radius: 999px;
    background: var(--sr-track);
    align-self: flex-start;
  }
  .seg button {
    padding: 0.45rem 0.9rem;
    border-radius: 999px;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--sr-ink-2);
    min-height: 2.5rem;
  }
  .seg button.on {
    background: var(--sr-panel);
    color: var(--sr-ink);
    box-shadow: var(--sr-card-shadow);
  }
  .upload {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    align-self: flex-start;
    padding: 0.5rem 0.9rem;
    border-radius: 999px;
    border: 1px dashed var(--sr-hairline);
    color: var(--sr-ink-2);
    font-weight: 600;
    cursor: pointer;
  }
  .upload:hover,
  .upload:focus-within {
    border-color: var(--sr-action);
  }
</style>
