
// eslint-disable-next-line no-unused-vars
import { nextTick } from 'vue';

export function useVirtualizedRendering(divs, canvasRef) {
  const getVisibleDivs = () => {
    if (!canvasRef.value) return [];
    
    const canvasRect = canvasRef.value.getBoundingClientRect();
    const viewportTop = canvasRef.value.scrollTop;
    const viewportLeft = canvasRef.value.scrollLeft;
    const viewportBottom = viewportTop + canvasRect.height;
    const viewportRight = viewportLeft + canvasRect.width;
    
    const buffer = 200;
    
    return divs.value.filter(div => {
      return (
        div.x + div.width + buffer >= viewportLeft &&
        div.x - buffer <= viewportRight &&
        div.y + div.height + buffer >= viewportTop &&
        div.y - buffer <= viewportBottom
      );
    });
  };
  
  return { getVisibleDivs };
}

export function useBatchedUpdates() {
  let updateScheduled = false;
  let pendingUpdates = [];
  
  const scheduleUpdate = (updateFn) => {
    pendingUpdates.push(updateFn);
    
    if (!updateScheduled) {
      updateScheduled = true;
      
      requestAnimationFrame(() => {
        const updates = [...pendingUpdates];
        pendingUpdates = [];
        
        updates.forEach(update => update());
        updateScheduled = false;
      });
    }
  };
  
  return { scheduleUpdate };
}

export function useWorkerPool() {
  const workers = [];
  const MAX_WORKERS = Math.max(2, navigator.hardwareConcurrency || 4);
  
  for (let i = 0; i < MAX_WORKERS; i++) {
    const workerCode = `
      self.onmessage = function(e) {
        const { type, data, id } = e.data;
        
        switch(type) {
          case 'calculate-collisions':
            // Calculate if divs intersect with others
            const results = calculateCollisions(data.divs, data.targetId);
            self.postMessage({ id, results });
            break;
          case 'filter-descendants':
            // Find all descendants of a set of divs
            const descendants = findAllDescendants(data.divs, data.parentIds);
            self.postMessage({ id, descendants });
            break;
          // Add more operations as needed
        }
      };
      
      function calculateCollisions(divs, targetId) {
        // Implementation of rectangle collision detection
        const target = divs.find(d => d.id === targetId);
        if (!target) return [];
        
        return divs.filter(div => {
          if (div.id === targetId) return false;
          
          // Simple AABB collision check
          return !(
            div.x > target.x + target.width ||
            div.x + div.width < target.x ||
            div.y > target.y + target.height ||
            div.y + div.height < target.y
          );
        }).map(div => div.id);
      }
      
      function findAllDescendants(divs, parentIds) {
        const result = [];
        const queue = [...parentIds];
        
        while (queue.length > 0) {
          const parentId = queue.shift();
          const children = divs.filter(div => div.parentId === parentId);
          
          result.push(...children.map(c => c.id));
          queue.push(...children.map(c => c.id));
        }
        
        return result;
      }
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    
    workers.push({
      worker,
      busy: false
    });
    
    URL.revokeObjectURL(url);
  }
  
  const executeTask = (type, data) => {
    return new Promise((resolve) => {
      const availableWorker = workers.find(w => !w.busy);
      
      if (availableWorker) {
        availableWorker.busy = true;
        
        const taskId = Date.now().toString() + Math.random().toString();
        
        const handleMessage = (e) => {
          if (e.data.id === taskId) {
            availableWorker.worker.removeEventListener('message', handleMessage);
            availableWorker.busy = false;
            resolve(e.data.results || e.data.descendants);
          }
        };
        
        availableWorker.worker.addEventListener('message', handleMessage);
        availableWorker.worker.postMessage({ type, data, id: taskId });
      } else {
        setTimeout(() => {
          if (type === 'calculate-collisions') {
            const target = data.divs.find(d => d.id === data.targetId);
            if (!target) {
              resolve([]);
              return;
            }
            
            const results = data.divs.filter(div => {
              if (div.id === data.targetId) return false;
              
              return !(
                div.x > target.x + target.width ||
                div.x + div.width < target.x ||
                div.y > target.y + target.height ||
                div.y + div.height < target.y
              );
            }).map(div => div.id);
            
            resolve(results);
          } else if (type === 'filter-descendants') {
            const result = [];
            let queue = [...data.parentIds];
            
            while (queue.length > 0) {
              const parentId = queue.shift();
              const children = data.divs.filter(div => div.parentId === parentId);
              
              result.push(...children.map(c => c.id));
              queue.push(...children.map(c => c.id));
            }
            
            resolve(result);
          }
        }, 0);
      }
    });
  };
  
  const terminate = () => {
    workers.forEach(({ worker }) => worker.terminate());
  };
  
  return { executeTask, terminate };
}

export function useSpatialHashGrid(gridSize = 100) {
  const grid = {};
  
  const clearGrid = () => {
    Object.keys(grid).forEach(key => delete grid[key]);
  };
  
  const insertDiv = (div) => {
    const startX = Math.floor(div.x / gridSize);
    const startY = Math.floor(div.y / gridSize);
    const endX = Math.floor((div.x + div.width) / gridSize);
    const endY = Math.floor((div.y + div.height) / gridSize);
    
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const key = `${x},${y}`;
        grid[key] = grid[key] || [];
        grid[key].push(div.id);
      }
    }
  };
  
  const buildGrid = (divs) => {
    clearGrid();
    divs.forEach(insertDiv);
  };
  
  const getPotentialCollisions = (div) => {
    const candidates = new Set();
    
    const startX = Math.floor(div.x / gridSize);
    const startY = Math.floor(div.y / gridSize);
    const endX = Math.floor((div.x + div.width) / gridSize);
    const endY = Math.floor((div.y + div.height) / gridSize);
    
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const key = `${x},${y}`;
        if (grid[key]) {
          grid[key].forEach(id => {
            if (id !== div.id) {
              candidates.add(id);
            }
          });
        }
      }
    }
    
    return [...candidates];
  };
  
  return { buildGrid, getPotentialCollisions, clearGrid };
}

export function useOptimizedHistory() {
  const undoStack = [];
  const redoStack = [];
  
  const saveChange = (oldState, newState) => {
    const diff = calculateStateDiff(oldState, newState);
    
    undoStack.push(diff);
    redoStack.length = 0; 
  };
  
  const applyChange = (state, change, reverse = false) => {
    if (reverse) {
      return applyInverseChange(state, change);
    } else {
      return applyDirectChange(state, change);
    }
  };
  
  const undo = (currentState) => {
    if (undoStack.length === 0) return currentState;
    
    const lastChange = undoStack.pop();
    redoStack.push(lastChange);
    
    return applyChange(currentState, lastChange, true);
  };
  
  const redo = (currentState) => {
    if (redoStack.length === 0) return currentState;
    
    const nextChange = redoStack.pop();
    undoStack.push(nextChange);
    
    return applyChange(currentState, nextChange, false);
  };
  
  const calculateStateDiff = (oldState, newState) => {
    const diff = {
      added: [],
      removed: [],
      modified: []
    };
    
    oldState.forEach(oldDiv => {
      if (!newState.some(newDiv => newDiv.id === oldDiv.id)) {
        diff.removed.push(oldDiv);
      }
    });
    
    newState.forEach(newDiv => {
      const oldDiv = oldState.find(d => d.id === newDiv.id);
      
      if (!oldDiv) {
        diff.added.push(newDiv);
      } else if (JSON.stringify(oldDiv) !== JSON.stringify(newDiv)) {
        diff.modified.push({
          before: oldDiv,
          after: newDiv
        });
      }
    });
    
    return diff;
  };
  
  const applyInverseChange = (state, change) => {
    let newState = [...state];
    
    change.added.forEach(added => {
      newState = newState.filter(div => div.id !== added.id);
    });
    
    change.removed.forEach(removed => {
      newState.push(removed);
    });
    
    change.modified.forEach(mod => {
      const index = newState.findIndex(div => div.id === mod.after.id);
      if (index !== -1) {
        newState[index] = { ...mod.before };
      }
    });
    
    return newState;
  };
  const applyDirectChange = (state, change) => {
    let newState = [...state];
    
    change.removed.forEach(removed => {
      newState = newState.filter(div => div.id !== removed.id);
    });
    
    change.added.forEach(added => {
      newState.push(added);
    });
    
    change.modified.forEach(mod => {
      const index = newState.findIndex(div => div.id === mod.before.id);
      if (index !== -1) {
        newState[index] = { ...mod.after };
      }
    });
    
    return newState;
  };
  
  return { saveChange, undo, redo };
}
export function useSnapping(snapThreshold = 5) {
  const shouldSnap = (value, target) => {
    return Math.abs(value - target) <= snapThreshold;
  };
  
  const findSnapPositions = (draggingDiv, allDivs) => {
    const otherDivs = allDivs.filter(div => 
      div.id !== draggingDiv.id && div.parentId !== draggingDiv.id
    );
    
    const snapPositions = {
      horizontal: [],
      vertical: []
    };
    
    const draggingLeft = draggingDiv.x;
    const draggingRight = draggingDiv.x + draggingDiv.width;
    const draggingTop = draggingDiv.y;
    const draggingBottom = draggingDiv.y + draggingDiv.height;
    const draggingCenterX = draggingLeft + draggingDiv.width / 2;
    const draggingCenterY = draggingTop + draggingDiv.height / 2;
    otherDivs.forEach(div => {
      const left = div.x;
      const right = div.x + div.width;
      const top = div.y;
      const bottom = div.y + div.height;
      const centerX = left + div.width / 2;
      const centerY = top + div.height / 2;
      
      snapPositions.horizontal.push({
        position: left,
        target: draggingLeft,
        offset: left - draggingLeft
      });
      
      snapPositions.horizontal.push({
        position: right,
        target: draggingRight,
        offset: right - draggingRight
      });
      
      snapPositions.horizontal.push({
        position: centerX,
        target: draggingCenterX,
        offset: centerX - draggingCenterX
      });
      
      snapPositions.vertical.push({
        position: top,
        target: draggingTop,
        offset: top - draggingTop
      });
      
      snapPositions.vertical.push({
        position: bottom,
        target: draggingBottom,
        offset: bottom - draggingBottom
      });
      
      snapPositions.vertical.push({
        position: centerY,
        target: draggingCenterY,
        offset: centerY - draggingCenterY
      });
    });
    
    return snapPositions;
  };
  
  const applySnapping = (draggingDiv, allDivs, deltaX, deltaY) => {
    const snapPositions = findSnapPositions(draggingDiv, allDivs);
    let newDeltaX = deltaX;
    let newDeltaY = deltaY;
    
    for (const snap of snapPositions.horizontal) {
      const targetPos = draggingDiv.x + deltaX;
      if (shouldSnap(targetPos, snap.position)) {
        newDeltaX = snap.position - draggingDiv.x;
        break;
      }
    }
    
    for (const snap of snapPositions.vertical) {
      const targetPos = draggingDiv.y + deltaY;
      if (shouldSnap(targetPos, snap.position)) {
        newDeltaY = snap.position - draggingDiv.y;
        break;
      }
    }
    
    return { newDeltaX, newDeltaY };
  };
  
  return { applySnapping };
}

export function useShadowDOM(canvasRef) {
  let shadowRoot = null;
  
  const initShadowDOM = () => {
    if (!canvasRef.value) return;
    
    shadowRoot = canvasRef.value.attachShadow({ mode: 'open' });
    
    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        position: relative;
        width: 100%;
        height: 100%;
        overflow: auto;
      }
      
      .canvas-element {
        position: absolute;
        box-sizing: border-box;
        border: 1px solid #888;
      }
      
      .canvas-element.selected {
        outline: 2px solid blue;
      }
      
      .resize-handle {
        position: absolute;
        width: 10px;
        height: 10px;
        background-color: white;
        border: 1px solid blue;
        z-index: 200;
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
        z-index: 200;
      }
    `;
    
    shadowRoot.appendChild(style);
    
    const container = document.createElement('div');
    container.classList.add('canvas-container');
    shadowRoot.appendChild(container);
  };
  
  const renderDivs = (divs, selectedDivIds) => {
    if (!shadowRoot) return;
    
    const container = shadowRoot.querySelector('.canvas-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    divs.forEach(div => {
      const divElement = document.createElement('div');
      divElement.classList.add('canvas-element');
      divElement.dataset.id = div.id;
      
      if (selectedDivIds.includes(div.id)) {
        divElement.classList.add('selected');
        
        const topLeftHandle = document.createElement('div');
        topLeftHandle.classList.add('resize-handle', 'top-left');
        topLeftHandle.dataset.handle = 'top-left';
        divElement.appendChild(topLeftHandle);
        
        const topRightHandle = document.createElement('div');
        topRightHandle.classList.add('resize-handle', 'top-right');
        topRightHandle.dataset.handle = 'top-right';
        divElement.appendChild(topRightHandle);
        
        const bottomLeftHandle = document.createElement('div');
        bottomLeftHandle.classList.add('resize-handle', 'bottom-left');
        bottomLeftHandle.dataset.handle = 'bottom-left';
        divElement.appendChild(bottomLeftHandle);
        
        const bottomRightHandle = document.createElement('div');
        bottomRightHandle.classList.add('resize-handle', 'bottom-right');
        bottomRightHandle.dataset.handle = 'bottom-right';
        divElement.appendChild(bottomRightHandle);
        
        const rotationHandle = document.createElement('div');
        rotationHandle.classList.add('rotation-handle');
        divElement.appendChild(rotationHandle);
      }
      
      divElement.style.left = `${div.x}px`;
      divElement.style.top = `${div.y}px`;
      divElement.style.width = `${div.width}px`;
      divElement.style.height = `${div.height}px`;
      divElement.style.transform = `rotate(${div.rotation}deg)`;
      divElement.style.backgroundColor = div.color || '#cccccc';
      divElement.style.zIndex = selectedDivIds.includes(div.id) ? '100' : '1';
      
      container.appendChild(divElement);
    });
  };
  
  return { initShadowDOM, renderDivs };
}

export function useMemoization() {
  const cache = new Map();
  
  const memoize = (fn, keyFn) => {
    return (...args) => {
      const key = keyFn ? keyFn(...args) : JSON.stringify(args);
      
      if (cache.has(key)) {
        return cache.get(key);
      }
      
      const result = fn(...args);
      cache.set(key, result);
      
      if (cache.size > 1000) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      
      return result;
    };
  };
  
  const clearCache = () => {
    cache.clear();
  };
  
  return { memoize, clearCache };
}

export function useVirtualDOM() {
  let virtualDOM = [];
  
  const updateVirtualDOM = (divs) => {
    const newVirtualDOM = divs.map(div => ({ ...div }));
    const patches = diffVirtualDOM(virtualDOM, newVirtualDOM);
    virtualDOM = newVirtualDOM;
    return patches;
  };
  
  const diffVirtualDOM = (oldDOM, newDOM) => {
    const patches = {
      added: [],
      removed: [],
      updated: []
    };
    
    oldDOM.forEach(oldDiv => {
      if (!newDOM.some(newDiv => newDiv.id === oldDiv.id)) {
        patches.removed.push(oldDiv.id);
      }
    });
    
    newDOM.forEach(newDiv => {
      const oldDiv = oldDOM.find(div => div.id === newDiv.id);
      
      if (!oldDiv) {
        patches.added.push(newDiv);
      } else if (!areEqual(oldDiv, newDiv)) {
        patches.updated.push(newDiv);
      }
    });
    
    return patches;
  };
  
  const areEqual = (div1, div2) => {
    return (
      div1.x === div2.x &&
      div1.y === div2.y &&
      div1.width === div2.width &&
      div1.height === div2.height &&
      div1.rotation === div2.rotation &&
      div1.color === div2.color &&
      div1.parentId === div2.parentId
    );
  };
  
  const applyPatchesToDOM = (patches, divRefs) => {
    patches.removed.forEach(id => {
      const el = divRefs[id];
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
      delete divRefs[id];
    });
    
    // eslint-disable-next-line no-unused-vars
    patches.added.forEach(div => {
    });
    
    patches.updated.forEach(div => {
      const el = divRefs[div.id];
      if (el) {
        el.style.left = `${div.x}px`;
        el.style.top = `${div.y}px`;
        el.style.width = `${div.width}px`;
        el.style.height = `${div.height}px`;
        el.style.transform = `rotate(${div.rotation}deg)`;
        el.style.backgroundColor = div.color || '#cccccc';
      }
    });
  };
  
  return { updateVirtualDOM, applyPatchesToDOM };
}