<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { useIsSlideActive, useSlideContext } from '@slidev/client';
import { resolveFrameUrl } from '../logic/frame.mjs';

const props = withDefaults(defineProps<{ src: string; title: string; fallback: string; fallbackAlt?: string; timeoutMs?: number }>(), { timeoutMs: 8000 });
const nativeActive = useIsSlideActive();
const { $renderContext } = useSlideContext();
const active = computed(() => nativeActive.value && ['slide', 'presenter'].includes($renderContext.value));
const frame = ref<HTMLIFrameElement>();
const enter = ref<HTMLButtonElement>();
const phase = ref<'loading' | 'ready' | 'error' | 'unverified'>('loading');
const detail = ref('Preparing the demo.');
const fallbackFailed = ref(false);
const attempt = ref(0);
const statusId = useId();
let timer: ReturnType<typeof setTimeout> | undefined;
let removeBridge: (() => void) | undefined;

const urls = computed(() => {
  const origin = typeof location === 'undefined' ? 'http://localhost' : location.origin;
  const base = import.meta.env.BASE_URL;
  let source: string | undefined, fallback: string | undefined, sourceError: string | undefined, fallbackError: string | undefined;
  try { source = resolveFrameUrl(props.src, base, origin); }
  catch (error) { sourceError = error instanceof Error ? error.message : String(error); }
  try { fallback = resolveFrameUrl(props.fallback, base, origin); }
  catch (error) { fallbackError = error instanceof Error ? error.message : String(error); }
  return { source, fallback, sourceError, fallbackError };
});

function cleanup() {
  clearTimeout(timer);
  removeBridge?.();
  removeBridge = undefined;
}

function recoverFocus() {
  const target = enter.value;
  if (target && !target.disabled) target.focus();
  else target?.closest<HTMLElement>('[data-harness-slide]')?.focus();
}

function begin() {
  cleanup();
  fallbackFailed.value = false;
  if (urls.value.sourceError) { phase.value = 'error'; detail.value = urls.value.sourceError; return; }
  phase.value = 'loading';
  detail.value = 'Loading demo. The static fallback is available below.';
  if (active.value) timer = setTimeout(() => fail('The demo did not become ready within its loading limit. Use the static fallback.'), Math.max(1, props.timeoutMs));
}

function fail(message: string) {
  cleanup();
  phase.value = 'error';
  detail.value = message;
}

function loaded() {
  if (!active.value || phase.value === 'error') return;
  clearTimeout(timer);
  try {
    const document = frame.value?.contentDocument;
    if (!document) throw new Error('Cross-origin document access is unavailable.');
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      recoverFocus();
    };
    document.addEventListener('keydown', escape, true);
    removeBridge = () => document.removeEventListener('keydown', escape, true);
    phase.value = 'ready';
    detail.value = 'Loaded locally. Interaction still requires verification. Escape returns to the presentation.';
  }
  catch {
    phase.value = 'unverified';
    detail.value = 'External frame: framing and keyboard recovery cannot be verified. Use the return control or static fallback.';
  }
}

function enterDemo() {
  frame.value?.focus();
  try {
    const control = frame.value?.contentDocument?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]');
    control?.focus();
  }
  catch { frame.value?.contentWindow?.focus(); }
}

function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); recoverFocus(); return; }
  const target = event.target as HTMLElement;
  if (target.closest('input, textarea, select, [contenteditable="true"]') || ((event.key === 'Enter' || event.key === ' ') && target.closest('button, a'))) event.stopPropagation();
}

async function retry() { attempt.value++; await nextTick(); begin(); }

watch([() => props.src, () => props.fallback, () => props.timeoutMs, active], begin, { immediate: true });
onBeforeUnmount(cleanup);
</script>

<template>
  <div class="harness-frame" data-harness-frame :data-harness-frame-state="phase" @keydown="keyboard">
    <div class="harness-frame-toolbar" data-harness-frame-ui>
      <span :id="statusId" class="harness-frame-status" role="status">{{ phase === 'loading' ? 'Loading demo' : phase === 'error' ? 'Demo unavailable' : phase === 'unverified' ? 'External demo · unverified' : 'Local demo · verification pending' }}</span>
      <div class="harness-frame-actions"><button ref="enter" type="button" data-harness-frame-enter :aria-describedby="statusId" :disabled="phase === 'loading' || phase === 'error'" @click="enterDemo">Enter demo</button><button type="button" data-harness-frame-exit @click="recoverFocus">Return to presentation</button></div>
    </div>
    <div class="harness-frame-window" :data-harness-overlay="`${statusId}-window`">
      <iframe v-if="active && urls.source" :key="attempt" ref="frame" :src="urls.source" :title="title" :tabindex="phase === 'ready' || phase === 'unverified' ? 0 : -1" sandbox="allow-scripts allow-same-origin allow-forms" referrerpolicy="no-referrer" @load="loaded" @error="fail('The demo could not be loaded. Use the static fallback below.')" />
      <div v-if="phase === 'loading' || phase === 'error'" class="harness-frame-placeholder" data-harness-frame-ui :role="phase === 'error' ? 'alert' : undefined"><strong>{{ phase === 'error' ? 'The demo is unavailable' : 'Loading the demonstration' }}</strong><p>{{ detail }}</p><button v-if="phase === 'error' && !urls.sourceError" type="button" @click="retry">Retry demo</button></div>
    </div>
    <figure class="harness-frame-fallback" data-harness-fallback data-harness-frame-ui>
      <img v-if="urls.fallback && !fallbackFailed" :src="urls.fallback" :alt="fallbackAlt ?? `Static overview of ${title}`" @error="fallbackFailed = true" />
      <figcaption><a v-if="urls.fallback" :href="urls.fallback" target="_blank" rel="noopener noreferrer">Open static fallback</a><strong v-else>Static fallback unavailable</strong><p :class="{ 'harness-frame-fallback-error': fallbackFailed || urls.fallbackError }">{{ fallbackFailed ? 'The fallback image could not be loaded.' : urls.fallbackError ?? (phase === 'ready' || phase === 'unverified' ? detail : fallbackAlt ?? 'Continue with the static explanation while the demo is unavailable.') }}</p></figcaption>
    </figure>
  </div>
</template>
