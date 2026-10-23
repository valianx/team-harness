<script setup lang="ts">
import HarnessSlide from '../components/HarnessSlide.vue';
defineProps<{ title?: string; eyebrow?: string; footer?: string }>();
</script>
<template><HarnessSlide layout="h-content" :title="title" :eyebrow="eyebrow" :footer="footer"><template v-if="$slots.title" #title><slot name="title" /></template><slot /><template v-if="$slots.footer" #footer><slot name="footer" /></template></HarnessSlide></template>
