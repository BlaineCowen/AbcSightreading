<script>
    import { onMount, onDestroy } from 'svelte';

    let isSpacebarPressed = false;

    function handleKeyDown(event) {
        if (event.code === 'Space') {
            isSpacebarPressed = true;
        }
    }

    function handleKeyUp(event) {
        if (event.code === 'Space') {
            isSpacebarPressed = false;
        }
    }

    onMount(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
    });

    onDestroy(() => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    });
</script>

<style>
    .bg-white { background-color: white; }
    .bg-red { background-color: red; }
</style>

<div id="spacebar" class="w-1/2 h-10 rounded-md border-slate-600 border-2 shadow-sm"
     class:bg-white={!isSpacebarPressed}
     class:bg-red={isSpacebarPressed}>
</div>
