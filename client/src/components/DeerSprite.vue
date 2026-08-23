<script setup>
// 文華鹿 map sprite. The provided walking PNG is used as the character art;
// the parent map component still animates its position along the route.
defineProps({
  size: { type: Number, default: 30 },
})
</script>

<template>
  <div
    class="deer-sprite"
    :style="{ width: size + 'px', height: size * (267 / 320) + 'px' }"
  >
    <img src="/stickers/deer-go-walk.png" alt="文華鹿" class="deer-image" />
  </div>
</template>

<style scoped>
.deer-sprite {
  display: inline-block;
  transform-origin: center;
}
.deer-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}
</style>
