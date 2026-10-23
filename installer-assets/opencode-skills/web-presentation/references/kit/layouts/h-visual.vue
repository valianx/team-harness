<script setup lang="ts">
import HarnessSlide from '../components/HarnessSlide.vue';
defineProps<{ title?: string; eyebrow?: string; footer?: string }>();
</script>
<template><HarnessSlide layout="h-visual" :title="title" :eyebrow="eyebrow" :footer="footer"><template v-if="$slots.title" #title><slot name="title" /></template><section class="harness-visual" data-harness-region="visual"><slot name="visual" /></section><section class="harness-explanation" data-harness-region="explanation"><slot /></section><template v-if="$slots.footer" #footer><slot name="footer" /></template></HarnessSlide></template>
