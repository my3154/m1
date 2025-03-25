/**
* @fileoverview FPS显示组件
* @module components/MessageDisplay
*
* @description
* 展示页面的实时FPS
* 公共组件、暂时放在这里
*
* @author 马扬
* @date 2025-03-25
*
* @dependencies
* - Vue 3.x
*
* @example
*  <MessageDisplay />
*/

<template>
  <div class="fps-display">
    <p>实时FPS: {{ fps }}</p>
  </div>
</template>

<script>
export default {
  name: 'MessageDisplay',
  data() {
    return {
      fps: 0,
      frameCount: 0,
      lastTime: 0
    };
  },
  methods: {
    updateFPS(timestamp) {
      if (this.lastTime !== 0) {
        const delta = timestamp - this.lastTime;
        this.frameCount++;
        if (delta >= 1000) {
          this.fps = this.frameCount;
          this.frameCount = 0; 
          this.lastTime = timestamp;
        }
      } else {
        this.lastTime = timestamp;
      }
      requestAnimationFrame(this.updateFPS);
    }
  },
  mounted() {
    requestAnimationFrame(this.updateFPS);
  }
};
</script>

<style scoped>
.fps-display {
  position: fixed;
  top: 10px;
  right: 10px;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  font-size: 18px;
  padding: 5px;
  border-radius: 5px;
}
</style>
