// src/components/DivEditor.vue

<template>
  <div class="editor-container">
    <div class="element-area">
      <div class="template-element" @mousedown="startDragNewElement"
        :style="{ backgroundColor: 'lightblue', width: '100px', height: '50px' }">
        拖动我
      </div>
    </div>

    <div class="canvas-area" ref="canvasRef" @mousedown="onCanvasMouseDown" @mousemove="onCanvasMouseMove"
      @mouseup="onCanvasMouseUp" @keydown.ctrl="onCtrlKeyDown" @keyup.ctrl="onCtrlKeyUp" tabindex="0">
      <div v-for="div in divs" :key="div.id" class="canvas-element"
        :class="{ 'selected': selectedDivIds.includes(div.id), 'parent': hasChildren(div.id) }"
        :style="getDivStyle(div)" :data-id="div.id" :ref="el => { if (el) divRefs[div.id] = el }">
        <div v-if="selectedDivIds.includes(div.id)" class="resize-handle top-left"
          @mousedown.stop="startResize(div.id, 'top-left', $event)"></div>
        <div v-if="selectedDivIds.includes(div.id)" class="resize-handle top-right"
          @mousedown.stop="startResize(div.id, 'top-right', $event)"></div>
        <div v-if="selectedDivIds.includes(div.id)" class="resize-handle bottom-left"
          @mousedown.stop="startResize(div.id, 'bottom-left', $event)"></div>
        <div v-if="selectedDivIds.includes(div.id)" class="resize-handle bottom-right"
          @mousedown.stop="startResize(div.id, 'bottom-right', $event)"></div>
        <div v-if="selectedDivIds.includes(div.id)" class="rotation-handle"
          @mousedown.stop="startRotation(div.id, $event)"></div>
      </div>
    </div>

    <div class="property-panel" v-if="selectedDivIds.length === 1">
      <div class="property-row">
        <label>宽:</label>
        <input type="number" v-model.number="selectedDiv.width" @change="updateProperty('width')">
      </div>
      <div class="property-row">
        <label>高:</label>
        <input type="number" v-model.number="selectedDiv.height" @change="updateProperty('height')">
      </div>
      <div class="property-row">
        <label>X:</label>
        <input type="number" v-model.number="selectedDiv.x" @change="updateProperty('x')">
      </div>
      <div class="property-row">
        <label>Y:</label>
        <input type="number" v-model.number="selectedDiv.y" @change="updateProperty('y')">
      </div>
      <div class="property-row">
        <label>旋转:</label>
        <input type="number" v-model.number="selectedDiv.rotation" @change="updateProperty('rotation')">
      </div>
      <div class="property-row">
        <label>颜色:</label>
        <input type="color" v-model="selectedDiv.color" @change="updateProperty('color')">
      </div>
      <div class="property-row" v-if="selectedDiv.parentId">
        <label>父ID:</label>
        <span>{{ selectedDiv.parentId }}</span>
      </div>
      <button @click="deleteSelectedDivs">删除</button>
    </div>
  </div>
</template>

<script>
import { ref, computed, reactive, onMounted, onBeforeUnmount } from 'vue';

export default {
  name: 'DivEditor',
  setup() {
    const canvasRef = ref(null);
    const divs = ref([]);
    const nextId = ref(1);
    const divRefs = reactive({});

    // 检查元素是否有子元素
    const hasChildren = (divId) => {
      return divs.value.some(div => div.parentId === divId);
    };
    const selectedDivIds = ref([]);
    const undoStack = ref([]);
    const redoStack = ref([]);
    const isDragging = ref(false);
    const dragStartX = ref(0);
    const dragStartY = ref(0);
    const draggedDivIds = ref([]);
    const dragStartPositions = ref({});
    const isCtrlPressed = ref(false);
    const dragTarget = ref(null);
    const isNewElementDrag = ref(false);
    const isResizing = ref(false);
    const resizeDivId = ref(null);
    const resizeHandle = ref(null);
    const resizeStartX = ref(0);
    const resizeStartY = ref(0);
    const resizeStartWidth = ref(0);
    const resizeStartHeight = ref(0);
    const isRotating = ref(false);
    const rotateDivId = ref(null);
    const rotateStartAngle = ref(0);
    const selectedDiv = computed(() => {
      if (selectedDivIds.value.length !== 1) return null;
      return divs.value.find(div => div.id === selectedDivIds.value[0]);
    });
    // eslint-disable-next-line no-unused-vars
    const getAncestors = (divId) => {
      const result = [];
      let currentDiv = divs.value.find(div => div.id === divId);

      while (currentDiv && currentDiv.parentId) {
        const parent = divs.value.find(div => div.id === currentDiv.parentId);
        if (parent) {
          result.push(parent);
          currentDiv = parent;
        } else {
          break;
        }
      }

      return result;
    };
    const getDescendants = (divId) => {
      const result = [];
      const directChildren = divs.value.filter(div => div.parentId === divId);

      result.push(...directChildren);

      for (const child of directChildren) {
        result.push(...getDescendants(child.id));
      }

      return result;
    };

    // 辅助函数：递归移动所有子元素
    // 修改移动子元素的方法，确保只根据初始记录的位置计算移动
    const moveChildrenWithParent = (parentId, deltaX, deltaY) => {
      const childDivs = divs.value.filter(div => div.parentId === parentId);

      for (const childDiv of childDivs) {
        // 只使用初始位置加上偏移量，避免累积效应
        if (dragStartPositions.value[childDiv.id]) {
          childDiv.x = dragStartPositions.value[childDiv.id].x + deltaX;
          childDiv.y = dragStartPositions.value[childDiv.id].y + deltaY;
        } else {
          // 替换为：记录当前位置作为起始位置
          dragStartPositions.value[childDiv.id] = { x: childDiv.x, y: childDiv.y };
          childDiv.x = dragStartPositions.value[childDiv.id].x + deltaX;
          childDiv.y = dragStartPositions.value[childDiv.id].y + deltaY;
        }

        // 递归处理子元素
        moveChildrenWithParent(childDiv.id, deltaX, deltaY);
      }
    };

    const saveStateForUndo = () => {
      undoStack.value.push(JSON.parse(JSON.stringify(divs.value)));
      redoStack.value = [];
    };

    const undo = () => {
      if (undoStack.value.length === 0) return;
      redoStack.value.push(JSON.parse(JSON.stringify(divs.value)));
      divs.value = undoStack.value.pop();
    };
    const redo = () => {
      if (redoStack.value.length === 0) return;
      undoStack.value.push(JSON.parse(JSON.stringify(divs.value)));
      divs.value = redoStack.value.pop();
    };
    const startDragNewElement = (event) => {
      event.preventDefault();

      isNewElementDrag.value = true;
      isDragging.value = true;
      const canvasRect = canvasRef.value.getBoundingClientRect();
      const x = event.clientX - canvasRect.left;
      const y = event.clientY - canvasRect.top;

      // 随机生成一个有效的十六进制颜色
      const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
      const newDiv = {
        id: nextId.value++,
        x,
        y,
        width: 100,
        height: 50,
        rotation: 0,
        color: randomColor,
        parentId: null
      };

      saveStateForUndo();
      divs.value.push(newDiv);

      selectedDivIds.value = [newDiv.id];
      draggedDivIds.value = [newDiv.id];

      dragStartX.value = event.clientX;
      dragStartY.value = event.clientY;

      dragStartPositions.value = {
        [newDiv.id]: { x: newDiv.x, y: newDiv.y }
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onCanvasMouseDown = (event) => {
      if (event.button !== 0) return;

      const target = event.target.closest('.canvas-element');

      if (target) {
        if (
          event.target.classList.contains('resize-handle') ||
          event.target.classList.contains('rotation-handle')
        ) {
          // 这些事件在各自的处理函数中处理
          return;
        }

        const divId = parseInt(target.dataset.id);
        dragTarget.value = divId;
        if (event.shiftKey) {
          if (selectedDivIds.value.includes(divId)) {
            selectedDivIds.value = selectedDivIds.value.filter(id => id !== divId);
          } else {
            selectedDivIds.value.push(divId);
          }
        } else if (!selectedDivIds.value.includes(divId)) {
          selectedDivIds.value = [divId];
        }
        isDragging.value = true;
        draggedDivIds.value = [...selectedDivIds.value];
        dragStartX.value = event.clientX;
        dragStartY.value = event.clientY;
        dragStartPositions.value = {};

        for (const id of draggedDivIds.value) {
          const div = divs.value.find(d => d.id === id);
          if (div) {
            dragStartPositions.value[id] = { x: div.x, y: div.y };

            // 同时记录所有子元素的起始位置，以便它们能与父元素同步移动
            const children = getDescendants(id);
            for (const childId of children) {
              const childDiv = divs.value.find(d => d.id === childId.id || d.id === childId);
              if (childDiv) {
                dragStartPositions.value[childDiv.id] = { x: childDiv.x, y: childDiv.y };
              }
            }
          }
        }

        // 设置全局事件监听器
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        event.preventDefault();
      } else {
        selectedDivIds.value = [];
      }
    };
    const onCanvasMouseMove = () => {
    };

    const onCanvasMouseUp = () => {
    };
    const onMouseMove = (event) => {
      if (!isDragging.value && !isResizing.value && !isRotating.value) return;

      if (isDragging.value) {
        const deltaX = event.clientX - dragStartX.value;
        const deltaY = event.clientY - dragStartY.value;
        // 首先处理被直接拖动的元素
        for (const id of draggedDivIds.value) {
          const div = divs.value.find(d => d.id === id);
          if (!div) continue;
          // 在onMouseMove函数中，修改处理子元素在父元素内移动的逻辑
          if (div.parentId !== null && !isCtrlPressed.value) {
            const parent = divs.value.find(d => d.id === div.parentId);
            if (!parent) continue;
            console.log(parent, 'parent');

            // 计算基于初始位置的新相对坐标
            const newX = dragStartPositions.value[id].x + deltaX;
            const newY = dragStartPositions.value[id].y + deltaY;

            // 边界限制 - 考虑父元素的当前状态
            // 由于子元素坐标是相对于父元素的，所以只需要确保：
            // 1. 左上角不小于(0,0)
            // 2. 右下角不超过父元素尺寸(parent.width, parent.height)
            const minX = parent.x;
            const minY = parent.y;
            const maxX = parent.width - div.width + parent.x;
            const maxY = parent.height - div.height + parent.y;

            // 如果父元素有旋转，需要特殊处理边界检查
            if (parent.rotation !== 0) {
              // 将要移动到的坐标转换为"旋转前"的坐标系进行边界检查
              const rad = -parent.rotation * (Math.PI / 180);
              const cos = Math.cos(rad);
              const sin = Math.sin(rad);

              // 转换新坐标到非旋转状态
              const rotatedX = newX * cos - newY * sin;
              const rotatedY = newX * sin + newY * cos;

              // 应用边界限制
              const constrainedX = Math.max(minX, Math.min(maxX, rotatedX));
              const constrainedY = Math.max(minY, Math.min(maxY, rotatedY));

              // 转换回旋转状态
              const finalRad = parent.rotation * (Math.PI / 180);
              const finalCos = Math.cos(finalRad);
              const finalSin = Math.sin(finalRad);

              div.x = constrainedX * finalCos - constrainedY * finalSin;
              div.y = constrainedX * finalSin + constrainedY * finalCos;
            } else {
              // 父元素没有旋转，直接应用边界限制
              div.x = Math.max(minX, Math.min(maxX, newX));
              div.y = Math.max(minY, Math.min(maxY, newY));
            }
          } else {
            div.x = dragStartPositions.value[id].x + deltaX;
            div.y = dragStartPositions.value[id].y + deltaY;

            // 如果是父元素在移动，所有子元素必须跟着移动
            moveChildrenWithParent(id, deltaX, deltaY);
          }
        }
      }

      else if (isResizing.value) {
        const div = divs.value.find(d => d.id === resizeDivId.value);
        if (!div) return;

        const deltaX = event.clientX - resizeStartX.value;
        const deltaY = event.clientY - resizeStartY.value;

        // 计算调整大小时的新宽高
        let newWidth = div.width;
        let newHeight = div.height;
        let newX = div.x;
        let newY = div.y;
        switch (resizeHandle.value) {
          case 'top-left':
            newWidth = Math.max(10, resizeStartWidth.value - deltaX);
            newHeight = Math.max(10, resizeStartHeight.value - deltaY);
            newX = div.x + (div.width - newWidth);
            newY = div.y + (div.height - newHeight);
            break;
          case 'top-right':
            newWidth = Math.max(10, resizeStartWidth.value + deltaX);
            newHeight = Math.max(10, resizeStartHeight.value - deltaY);
            newY = div.y + (div.height - newHeight);
            break;
          case 'bottom-left':
            newWidth = Math.max(10, resizeStartWidth.value - deltaX);
            newHeight = Math.max(10, resizeStartHeight.value + deltaY);
            newX = div.x + (div.width - newWidth);
            break;
          case 'bottom-right':
            newWidth = Math.max(10, resizeStartWidth.value + deltaX);
            newHeight = Math.max(10, resizeStartHeight.value + deltaY);
            break;
        }

        console.log(newWidth, newHeight, newX, newY, 111);

        // 应用新的尺寸和位置
        div.width = newWidth;
        div.height = newHeight;
        div.x = newX;
        div.y = newY;
         // 如果是子元素，确保它不超出父元素边界
  if (div.parentId !== null) {
    const parent = divs.value.find(d => d.id === div.parentId);
    if (parent) {
      // 确保x坐标不小于0
      if (div.x < 0) {
        div.width += div.x; // 减小宽度以适应
        div.x = 0;
      }
      
      // 确保y坐标不小于0
      if (div.y < 0) {
        div.height += div.y; // 减小高度以适应
        div.y = 0;
      }
      
      // 确保不超出父元素右边界
      if (div.x + div.width > parent.width) {
        div.width = parent.width - div.x;
      }
      
      // 确保不超出父元素下边界
      if (div.y + div.height > parent.height) {
        div.height = parent.height - div.y;
      }
      
      // 确保最小尺寸
      div.width = Math.max(10, div.width);
      div.height = Math.max(10, div.height);
    }
  }
}else if (isRotating.value) {
        const div = divs.value.find(d => d.id === rotateDivId.value);
        if (!div) return;
        const divEl = divRefs[div.id];
        if (!divEl) return;

        const rect = divEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI);
        div.rotation = angle + 90;
      }
    };
    const onMouseUp = () => {
      if (isDragging.value) {
        if (draggedDivIds.value.length > 0) {
          // 状态保存，用于撤销功能
          if (!isNewElementDrag.value) {
            saveStateForUndo();
          }

          // 处理拖动结束时的元素嵌套关系
          for (const id of draggedDivIds.value) {
            const div = divs.value.find(d => d.id === id);
            if (!div) continue;

            // 如果按住Ctrl键，则将元素从父元素中分离
            if (isCtrlPressed.value && div.parentId !== null) {
              // 将元素位置从相对坐标转换为绝对坐标
              const divEl = divRefs[div.id];
              if (divEl) {
                const rect = divEl.getBoundingClientRect();
                const canvasRect = canvasRef.value.getBoundingClientRect();
                div.x = rect.left - canvasRect.left;
                div.y = rect.top - canvasRect.top;
                div.parentId = null;
              }
              continue;
            }

            // 如果没有按Ctrl键，并且不在拖出父元素，检查当前元素是否应该放入其他元素中
            if (!isCtrlPressed.value && div.parentId === null) {
              // 查找可能的父元素（不包括自己和其后代）
              const potentialParents = divs.value.filter(potentialParent =>
                potentialParent.id !== id &&
                !getDescendants(id).includes(potentialParent)
              );

              // 检查是否在某个元素内部
              for (const potentialParent of potentialParents) {
                const parentEl = divRefs[potentialParent.id];
                const divEl = divRefs[div.id];

                if (!parentEl || !divEl) continue;

                const parentRect = parentEl.getBoundingClientRect();
                const divRect = divEl.getBoundingClientRect();

                // 使用元素中心点判断是否在父元素内部
                const divCenterX = divRect.left + divRect.width / 2;
                const divCenterY = divRect.top + divRect.height / 2;

                if (
                  divCenterX >= parentRect.left &&
                  divCenterX <= parentRect.right &&
                  divCenterY >= parentRect.top &&
                  divCenterY <= parentRect.bottom
                ) {
                  // 设置父子关系
                  div.parentId = potentialParent.id;

                  // 获取父元素中心在屏幕上的位置
                  const parentCenterX = parentRect.left + parentRect.width / 2;
                  const parentCenterY = parentRect.top + parentRect.height / 2;

                  // 获取子元素相对于父元素中心的偏移量
                  const offsetX = divCenterX - parentCenterX;
                  const offsetY = divCenterY - parentCenterY;
                  console.log(offsetX, offsetY);


                  // 考虑父元素的旋转角度
                  const parentRotation = potentialParent.rotation * (Math.PI / 180);
                  const cos = Math.cos(-parentRotation);
                  const sin = Math.sin(-parentRotation);

                  // 应用旋转变换获取相对坐标
                  // eslint-disable-next-line no-unused-vars
                  const rotatedOffsetX = offsetX * cos - offsetY * sin;
                  // eslint-disable-next-line no-unused-vars
                  const rotatedOffsetY = offsetX * sin + offsetY * cos;

                  const mouseEvent = event; // 保存当前鼠标事件
                  const canvasRect = canvasRef.value.getBoundingClientRect();
                  const mouseCanvasX = mouseEvent.clientX - canvasRect.left;
                  const mouseCanvasY = mouseEvent.clientY - canvasRect.top;
                  // 计算子元素左上角在父元素坐标系中的位置
                  div.x = mouseCanvasX;
                  div.y = mouseCanvasY;

                  break; // 只设置一个父元素
                }
              }
            }
          }
        }
      } else if (isResizing.value || isRotating.value) {
        saveStateForUndo();
      }

      // 重置所有状态变量
      isDragging.value = false;
      isResizing.value = false;
      isRotating.value = false;
      isNewElementDrag.value = false;
      draggedDivIds.value = [];
      dragTarget.value = null;
      resizeDivId.value = null;
      rotateDivId.value = null;

      // 清空起始位置记录
      dragStartX.value = 0;
      dragStartY.value = 0;
      dragStartPositions.value = {};
      resizeStartX.value = 0;
      resizeStartY.value = 0;
      resizeStartWidth.value = 0;
      resizeStartHeight.value = 0;
      rotateStartAngle.value = 0;

      // 移除全局事件监听器
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    const onCtrlKeyDown = () => {
      isCtrlPressed.value = true;
    };

    const onCtrlKeyUp = () => {
      isCtrlPressed.value = false;
    };

    const startResize = (divId, handle, event) => {
      event.preventDefault();
      event.stopPropagation();

      isResizing.value = true;
      resizeDivId.value = divId;
      resizeHandle.value = handle;

      const div = divs.value.find(d => d.id === divId);
      if (!div) return;

      // 保存当前鼠标位置，不仅仅是div位置
      // eslint-disable-next-line no-unused-vars
      const rect = divRefs[div.id].getBoundingClientRect();
      resizeStartX.value = event.clientX;
      resizeStartY.value = event.clientY;
      resizeStartWidth.value = div.width;
      resizeStartHeight.value = div.height;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const startRotation = (divId, event) => {
      event.preventDefault();
      event.stopPropagation();

      isRotating.value = true;
      rotateDivId.value = divId;

      const div = divs.value.find(d => d.id === divId);
      if (!div) return;

      rotateStartAngle.value = div.rotation;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const getDivStyle = (div) => {
      // 计算嵌套层级作为基础z-index
      let baseZIndex = 1;
      if (div.parentId) {
        // 获取元素的嵌套深度
        let currentDiv = div;
        let nestingLevel = 0;
        while (currentDiv.parentId) {
          nestingLevel++;
          currentDiv = divs.value.find(d => d.id === currentDiv.parentId);
          if (!currentDiv) break;
        }
        // 每一层嵌套增加10的z-index
        baseZIndex = nestingLevel * 10 + 1;
      }

      // 如果元素被选中，给更高优先级
      const selectionBonus = selectedDivIds.value.includes(div.id) ? 1000 : 0;

      return {
        position: 'absolute',
        left: `${div.x}px`,
        top: `${div.y}px`,
        width: `${div.width}px`,
        height: `${div.height}px`,
        transform: `rotate(${div.rotation}deg)`,
        backgroundColor: div.color || '#cccccc',
        border: '1px solid #888',
        boxSizing: 'border-box',
        overflow: 'visible',
        zIndex: baseZIndex + selectionBonus
      };
    };

    const updateProperty = () => {
      if (selectedDivIds.value.length !== 1) return;

      const div = divs.value.find(d => d.id === selectedDivIds.value[0]);
      if (!div) return;

      saveStateForUndo();
    };
    const deleteSelectedDivs = () => {
      if (selectedDivIds.value.length === 0) return;

      saveStateForUndo();
      const divsToDelete = new Set();

      for (const id of selectedDivIds.value) {
        divsToDelete.add(id);
        getDescendants(id).forEach(div => divsToDelete.add(div.id));
      }
      divs.value = divs.value.filter(div => !divsToDelete.has(div.id));
      selectedDivIds.value = [];
    };
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
    });
    onBeforeUnmount(() => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    });

    return {
      canvasRef,
      divs,
      selectedDivIds,
      selectedDiv,
      divRefs,
      isDragging,
      isResizing,
      isRotating,
      isCtrlPressed,
      dragTarget,
      hasChildren,
      startDragNewElement,
      onCanvasMouseDown,
      onCanvasMouseMove,
      onCanvasMouseUp,
      onCtrlKeyDown,
      onCtrlKeyUp,
      startResize,
      startRotation,
      getDivStyle,
      updateProperty,
      deleteSelectedDivs,
      undo,
      redo
    };
  }
};
</script>

<style scoped>
.editor-container {
  display: flex;
  height: 100vh;
  width: 100%;
}

.element-area {
  width: 200px;
  padding: 10px;
  border-right: 1px solid #ccc;
  overflow-y: auto;
}

.canvas-area {
  flex: 1;
  position: relative;
  overflow: auto;
  background-color: #f5f5f5;
}

.property-panel {
  width: 250px;
  padding: 10px;
  border-left: 1px solid #ccc;
  overflow-y: auto;
}

.template-element {
  cursor: move;
  margin-bottom: 10px;
  padding: 10px;
  text-align: center;
  border: 1px solid #888;
}

.canvas-element {
  position: absolute;
  cursor: move;
  background-color: rgba(255, 255, 255, 0.8);
}

.canvas-element.selected {
  outline: 2px solid blue;
  z-index: 1000 !important;
}

.canvas-element.parent {
  background-color: rgba(240, 240, 255, 0.9);
}

.resize-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background-color: white;
  border: 1px solid blue;
  z-index: 1001;
}

.top-left {
  top: -5px;
  left: -5px;
  cursor: nwse-resize;
}

.top-right {
  top: -5px;
  right: -5px;
  cursor: nesw-resize;
}

.bottom-left {
  bottom: -5px;
  left: -5px;
  cursor: nesw-resize;
}

.bottom-right {
  bottom: -5px;
  right: -5px;
  cursor: nwse-resize;
}

.rotation-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background-color: green;
  border-radius: 50%;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  cursor: grab;
  z-index: 1001;
}

.property-row {
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
}

button {
  margin-top: 10px;
  padding: 5px 10px;
}
</style>