<script setup lang="ts">
import { computed, unref } from 'vue';
import { useIsSlideActive, useSlideContext } from '@slidev/client';
import { TOKENS } from '../logic/tokens.mjs';

const props = defineProps<{ layout: string; title?: string; eyebrow?: string; footer?: string }>();
const context = useSlideContext();
const nativeActive = useIsSlideActive();
const active = computed(() => nativeActive.value && ['slide', 'presenter'].includes(unref(context.$renderContext)));
const frontmatter = computed(() => unref(context.$frontmatter));
const heading = computed(() => props.title ?? frontmatter.value.title ?? '');
const eyebrow = computed(() => props.eyebrow ?? frontmatter.value.eyebrow);
const footer = computed(() => props.footer ?? frontmatter.value.footer ?? '');
const variables = {
  '--h-width': `${TOKENS.width}px`, '--h-height': `${TOKENS.height}px`, '--h-inset': `${TOKENS.inset}px`,
  '--h-gap': `${TOKENS.gap}px`, '--h-region-gap': `${TOKENS.regionGap}px`, '--h-body-font': `${TOKENS.bodyFont}px`,
  '--h-title-font': `${TOKENS.titleFont}px`, '--h-cover-font': `${TOKENS.coverFont}px`, '--h-section-font': `${TOKENS.sectionFont}px`,
  '--h-footer-font': `${TOKENS.footerFont}px`, '--h-font-family': TOKENS.fontFamily,
  '--h-title-top': `${TOKENS.titleTop}px`, '--h-title-height': `${TOKENS.titleHeight}px`,
  '--h-body-top': `${TOKENS.bodyTop}px`, '--h-body-height': `${TOKENS.bodyHeight}px`,
  '--h-cover-title-top': `${TOKENS.coverTitleTop}px`, '--h-cover-title-height': `${TOKENS.coverTitleHeight}px`,
  '--h-cover-body-top': `${TOKENS.coverBodyTop}px`, '--h-cover-body-height': `${TOKENS.coverBodyHeight}px`,
  '--h-footer-top': `${TOKENS.footerTop}px`, '--h-footer-height': `${TOKENS.footerHeight}px`,
};
</script>

<template>
  <main class="harness-slide" :class="layout" :style="variables" tabindex="-1" :data-harness-slide="frontmatter.routeAlias ?? unref(context.$page)" :data-harness-alias="frontmatter.routeAlias ?? ''" :data-harness-layout="layout" :data-harness-context="unref(context.$renderContext)" :data-harness-active="active ? 'true' : 'false'" :data-harness-page="unref(context.$page)" :data-harness-clicks="unref(context.$clicks)" :data-harness-clicks-total="unref(context.$clicksContext).total">
    <header class="harness-title" data-harness-region="title">
      <p v-if="eyebrow" class="harness-eyebrow">{{ eyebrow }}</p>
      <slot name="title"><h1>{{ heading }}</h1></slot>
    </header>
    <div class="harness-body" data-harness-region="body"><slot /></div>
    <footer class="harness-footer" data-harness-region="footer"><div><slot name="footer">{{ footer }}</slot></div><span class="harness-page" aria-label="Slide number">{{ unref(context.$page) }}</span></footer>
  </main>
</template>
