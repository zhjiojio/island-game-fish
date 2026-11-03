<template>
  <div class="brand-mark" :class="{ 'brand-mark--hero': hero }" aria-label="幕间 Studio">
    <img class="brand-mark__symbol" src="../assets/logo/mujian-mark.svg" alt="" />
    <span class="brand-mark__wordmark">
      <span class="brand-mark__name">幕间</span>
      <span class="brand-mark__studio">STUDIO</span>
    </span>
  </div>
</template>

<script setup>
defineProps({ hero: Boolean })
</script>

<style scoped>
.brand-mark {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: inherit;
  cursor: pointer;
  user-select: none;
}

.brand-mark__symbol {
  width: 34px;
  height: 34px;
  object-fit: contain;
  flex: none;
}

.brand-mark__wordmark {
  display: grid;
  line-height: 1;
}

.brand-mark__name {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: .24em;
  white-space: nowrap;
}

.brand-mark__studio {
  margin-top: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 7px;
  letter-spacing: .5em;
  color: #c9a84c;
}

.brand-mark--hero {
  gap: 24px;
  cursor: default;
}

.brand-mark--hero .brand-mark__symbol {
  width: min(22vw, 260px);
  height: min(22vw, 260px);
}

.brand-mark--hero .brand-mark__name {
  font-size: clamp(32px, 4vw, 64px);
  letter-spacing: .18em;
}

.brand-mark--hero .brand-mark__studio {
  margin-top: 12px;
  font-size: clamp(10px, 1vw, 15px);
  letter-spacing: .65em;
}
</style>
