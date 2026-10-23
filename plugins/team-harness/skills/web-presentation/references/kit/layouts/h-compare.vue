<script setup lang="ts">
import HarnessSlide from '../components/HarnessSlide.vue';
defineProps<{ title?: string; eyebrow?: string; footer?: string }>();
</script>
<template><HarnessSlide layout="h-compare" :title="title" :eyebrow="eyebrow" :footer="footer"><template v-if="$slots.title" #title><slot name="title" /></template><section class="harness-column" data-harness-region="left"><slot /></section><section class="harness-column" data-harness-region="right"><slot name="right" /></section><template v-if="$slots.footer" #footer><slot name="footer" /></template></HarnessSlide></template>
