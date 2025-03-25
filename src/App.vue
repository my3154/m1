<template>
  <div class="app">
    <div class="toolbar">
      <span @click="undo">
        <span>上一步</span> (Ctrl+Z)
      </span>
      <span @click="redo" >
        <span>下一步</span> (Ctrl+Y)
      </span>
      <span >
         | 点击父元素会暂时覆盖子元素
      </span>
      <!-- <span class="element-count">Elements: {{ divs.length }}</span> -->
    </div>
    <DivEditor 
      ref="editorRef"
      v-model:divs="divs"
      @undo="undo"
      @redo="redo"
      @update:divs="onDivsUpdated"
    />
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import DivEditor from './components/DivEditor.vue';
import { useOptimizedHistory } from './components/PerformanceOptimizations';

export default {
  name: 'App',
  components: {
    DivEditor
  },
  setup() {
    const editorRef = ref(null);
    const divs = ref([]);
    const undoStack = ref([]);
    const redoStack = ref([]);
    const { saveChange, undo: historyUndo, redo: historyRedo } = useOptimizedHistory();
    
    const createTestDivs = (count) => {
      const newDivs = [];
      const canvasWidth = window.innerWidth - 450;
      const canvasHeight = window.innerHeight - 50; 
      
      for (let i = 0; i < count; i++) {
        const size = Math.random() * 100 + 20;
        
        newDivs.push({
          id: i + 1,
          x: Math.random() * (canvasWidth - size),
          y: Math.random() * (canvasHeight - size),
          width: size,
          height: size,
          rotation: Math.random() * 360,
          color: `hsl(${Math.random() * 360}, 70%, 70%)`,
          parentId: null
        });
      }
      
      for (let i = 0; i < Math.min(count / 10, 100); i++) {
        const parentIndex = Math.floor(Math.random() * newDivs.length);
        const childIndex = Math.floor(Math.random() * newDivs.length);
        
        if (parentIndex !== childIndex && !newDivs[parentIndex].parentId) {
          const parent = newDivs[parentIndex];
          const child = newDivs[childIndex];
          
          child.width = Math.min(child.width, parent.width * 0.8);
          child.height = Math.min(child.height, parent.height * 0.8);
          
          child.x = (parent.width - child.width) / 2;
          child.y = (parent.height - child.height) / 2;
          child.parentId = parent.id;
        }
      }
      
      divs.value = newDivs;
    };
    
    const onDivsUpdated = (newDivs, oldDivs) => {
      saveChange(oldDivs, newDivs);
    };
    
    const undo = () => {
      if (undoStack.value.length === 0) return;
      
      const oldDivs = [...divs.value];
      divs.value = historyUndo(divs.value);
      redoStack.value.push(oldDivs);
    };
    
    const redo = () => {
      if (redoStack.value.length === 0) return;
      
      const oldDivs = [...divs.value];
      divs.value = historyRedo(divs.value);
      
      undoStack.value.push(oldDivs);
    };
    
    // Set up keyboard shortcuts
    const handleKeyDown = (event) => {
      if (event.ctrlKey && event.key === 'z') {
        event.preventDefault();
        undo();
      }
      if (event.ctrlKey && event.key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    
    onMounted(() => {
      document.addEventListener('keydown', handleKeyDown);
      const urlParams = new URLSearchParams(window.location.search);
      const testCount = parseInt(urlParams.get('count') || '0', 10);
      
      if (testCount > 0) {
        createTestDivs(testCount);
      }
    });
    
    onBeforeUnmount(() => {
      document.removeEventListener('keydown', handleKeyDown);
    });
    
    return {
      editorRef,
      divs,
      undoStack,
      redoStack,
      undo,
      redo,
      onDivsUpdated
    };
  }
};
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: Arial, sans-serif;
  overflow: hidden;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
}

.toolbar {
  height: 50px;
  padding: 10px;
  border-bottom: 1px solid #ccc;
  display: flex;
  align-items: center;
  gap: 10px;
}

button {
  padding: 5px 10px;
  background-color: #f3f3f3;
  border: 1px solid #ccc;
  border-radius: 3px;
  cursor: pointer;
}

button:hover {
  background-color: #e6e6e6;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button small {
  color: #666;
  font-size: 0.8em;
}

.element-count {
  margin-left: auto;
  color: #666;
}
</style>