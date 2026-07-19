// FocusGrid State Object
const state = {
  tasks: [],
  filters: {
    search: '',
    tag: 'all',
    status: 'active' // 'active', 'completed', 'all'
  },
  theme: 'dark',
  sidebarOpen: false,
  lifetimeCompleted: 0
};

// DOM Elements
const elements = {
  themeToggle: document.getElementById('theme-toggle'),
  statsToggle: document.getElementById('stats-panel-toggle'),
  statsSidebar: document.getElementById('stats-sidebar'),
  closeStatsBtn: document.getElementById('close-stats-btn'),
  quickAddTrigger: document.getElementById('quick-add-trigger-btn'),
  quickAddPanel: document.getElementById('quick-add-panel'),
  taskForm: document.getElementById('task-form'),
  cancelAddBtn: document.getElementById('cancel-add-btn'),
  
  // Form Fields
  taskTitle: document.getElementById('task-title'),
  taskQuadrant: document.getElementById('task-quadrant'),
  taskDueDate: document.getElementById('task-due-date'),
  taskTag: document.getElementById('task-tag'),
  taskNotes: document.getElementById('task-notes'),
  
  // Lists
  listQ1: document.getElementById('list-q1'),
  listQ2: document.getElementById('list-q2'),
  listQ3: document.getElementById('list-q3'),
  listQ4: document.getElementById('list-q4'),
  
  // Quadrants (for drag/drop events)
  quadrants: document.querySelectorAll('.quadrant'),
  
  // Filters
  searchInput: document.getElementById('search-input'),
  tagFilter: document.getElementById('tag-filter'),
  statusFilter: document.getElementById('status-filter'),
  
  // Header Stats
  headerTotalTasks: document.getElementById('header-total-tasks'),
  headerCompletionRate: document.getElementById('header-completion-rate'),
  headerFocusScore: document.getElementById('header-focus-score'),
  
  // Sidebar Stats
  gaugeFillCircle: document.getElementById('gauge-fill-circle'),
  gaugeDisplayVal: document.getElementById('gauge-display-val'),
  barQ1: document.getElementById('bar-q1'),
  barQ2: document.getElementById('bar-q2'),
  barQ3: document.getElementById('bar-q3'),
  barQ4: document.getElementById('bar-q4'),
  matrixAdvice: document.getElementById('matrix-advice'),
  statsCompleted: document.getElementById('stats-completed-tasks'),
  statsActive: document.getElementById('stats-active-tasks'),
  statsLifetime: document.getElementById('stats-lifetime-completed'),
  
  // Import/Export
  exportBtn: document.getElementById('export-btn'),
  importBtnTrigger: document.getElementById('import-btn-trigger'),
  importFileInput: document.getElementById('import-file-input'),
  clearAllBtn: document.getElementById('clear-all-btn'),
  
  // Modals
  editModal: document.getElementById('edit-modal'),
  closeModalBtn: document.getElementById('close-modal-btn'),
  editForm: document.getElementById('edit-task-form'),
  editId: document.getElementById('edit-task-id'),
  editTitle: document.getElementById('edit-task-title'),
  editQuadrant: document.getElementById('edit-task-quadrant'),
  editDueDate: document.getElementById('edit-task-due-date'),
  editTag: document.getElementById('edit-task-tag'),
  editNotes: document.getElementById('edit-task-notes'),
  cancelEditBtn: document.getElementById('cancel-edit-btn'),
  deleteEditBtn: document.getElementById('delete-edit-btn')
};

// --- Backend API Sync Logic ---

async function loadFromServer() {
  try {
    // 1. Fetch Tasks
    const tasksRes = await fetch('/api/tasks');
    if (tasksRes.ok) {
      state.tasks = await tasksRes.ok ? await tasksRes.json() : [];
    } else {
      console.error('Failed to load tasks from server');
    }

    // If server list is completely empty, populate with some default samples
    if (state.tasks.length === 0) {
      await injectSampleTasks();
    }

    // 2. Fetch Settings (theme & lifetime completed score)
    const settingsRes = await fetch('/api/settings');
    if (settingsRes.ok) {
      const settings = await settingsRes.json();
      state.theme = settings.theme || 'dark';
      state.lifetimeCompleted = parseInt(settings.lifetimeCompleted, 10) || 0;
    }
  } catch (err) {
    console.error('Error connecting to backend database. Using local memory backup.', err);
  }

  // Set visual theme properties
  document.documentElement.setAttribute('data-theme', state.theme);
}

async function saveSetting(key, value) {
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: String(value) })
    });
  } catch (err) {
    console.error(`Failed to save setting ${key} to server:`, err);
  }
}

async function injectSampleTasks() {
  const samples = [
    {
      id: 'sample-1',
      title: 'Finish Eisenhower SQLite migration plan',
      quadrant: 'q1',
      completed: true,
      dueDate: new Date().toISOString().split('T')[0],
      tag: 'Work',
      notes: 'Review code, test SQL queries, and deploy.',
      createdAt: new Date(Date.now() - 3600000).toISOString() // 1hr ago
    },
    {
      id: 'sample-2',
      title: 'Plan weekly workout schedule',
      quadrant: 'q2',
      completed: false,
      dueDate: '',
      tag: 'Health',
      notes: 'Include 3 gym sessions and 1 run.',
      createdAt: new Date().toISOString()
    },
    {
      id: 'sample-3',
      title: 'Respond to standard administrative emails',
      quadrant: 'q3',
      completed: false,
      dueDate: '',
      tag: 'Work',
      notes: 'Delegate or automate these templates later.',
      createdAt: new Date().toISOString()
    },
    {
      id: 'sample-4',
      title: 'Mindless scrolling on social media feeds',
      quadrant: 'q4',
      completed: false,
      dueDate: '',
      tag: 'Personal',
      notes: 'Limit to 15 mins a day max.',
      createdAt: new Date().toISOString()
    }
  ];

  for (const sample of samples) {
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sample)
      });
    } catch (e) {
      console.error('Failed to inject sample task:', e);
    }
  }

  state.tasks = samples;
  // Initialize lifetimeCompleted if it is brand new database
  state.lifetimeCompleted = samples.filter(t => t.completed).length;
  await saveSetting('lifetimeCompleted', state.lifetimeCompleted);
}

// --- Task Mutations ---

async function addTask(title, quadrant, dueDate, tag, notes) {
  const newTask = {
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    title: title.trim(),
    quadrant,
    completed: false,
    dueDate: dueDate || '',
    tag: tag.trim() || '',
    notes: notes.trim() || '',
    createdAt: new Date().toISOString()
  };

  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask)
    });
    
    if (res.ok) {
      state.tasks.push(newTask);
      updateTagFilterOptions();
      render();
    } else {
      const err = await res.json();
      alert(`Error creating task: ${err.error || 'Server error'}`);
    }
  } catch (err) {
    console.error('Network error creating task:', err);
    alert('Failed to connect to backend server.');
  }
}

async function updateTask(id, updatedFields) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  
  const mergedTask = { ...task, ...updatedFields };

  try {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mergedTask)
    });

    if (res.ok) {
      state.tasks = state.tasks.map(t => t.id === id ? mergedTask : t);
      updateTagFilterOptions();
      render();
    } else {
      const err = await res.json();
      alert(`Error updating task: ${err.error || 'Server error'}`);
    }
  } catch (err) {
    console.error('Network error updating task:', err);
    alert('Failed to connect to backend server.');
  }
}

async function deleteTask(id) {
  try {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      state.tasks = state.tasks.filter(task => task.id !== id);
      updateTagFilterOptions();
      render();
    } else {
      const err = await res.json();
      alert(`Error deleting task: ${err.error || 'Server error'}`);
    }
  } catch (err) {
    console.error('Network error deleting task:', err);
    alert('Failed to connect to backend server.');
  }
}

async function toggleTaskComplete(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  const newStatus = !task.completed;
  const updatedTask = { ...task, completed: newStatus };

  try {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedTask)
    });

    if (res.ok) {
      state.tasks = state.tasks.map(t => t.id === id ? updatedTask : t);
      
      // Update lifetime score settings
      if (newStatus) {
        state.lifetimeCompleted++;
      } else {
        state.lifetimeCompleted = Math.max(0, state.lifetimeCompleted - 1);
      }
      await saveSetting('lifetimeCompleted', state.lifetimeCompleted);
      
      render();
    } else {
      const err = await res.json();
      alert(`Error toggling completeness: ${err.error || 'Server error'}`);
    }
  } catch (err) {
    console.error('Network error toggling completion status:', err);
  }
}

// --- UI Rendering ---

function updateTagFilterOptions() {
  const uniqueTags = new Set();
  state.tasks.forEach(task => {
    if (task.tag) uniqueTags.add(task.tag);
  });
  
  const currentSelection = elements.tagFilter.value;
  
  // Clear options except "All Tags"
  elements.tagFilter.innerHTML = '<option value="all">All Tags</option>';
  
  uniqueTags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    elements.tagFilter.appendChild(option);
  });
  
  // Restore selection if it still exists
  if (uniqueTags.has(currentSelection)) {
    elements.tagFilter.value = currentSelection;
  } else {
    elements.tagFilter.value = 'all';
    state.filters.tag = 'all';
  }
}

function getFilteredTasks() {
  const { search, tag, status } = state.filters;
  
  return state.tasks.filter(task => {
    // Search filter
    const matchesSearch = !search || 
      task.title.toLowerCase().includes(search.toLowerCase()) ||
      task.notes.toLowerCase().includes(search.toLowerCase()) ||
      task.tag.toLowerCase().includes(search.toLowerCase());
      
    // Tag filter
    const matchesTag = tag === 'all' || task.tag === tag;
    
    // Status filter
    let matchesStatus = true;
    if (status === 'active') matchesStatus = !task.completed;
    if (status === 'completed') matchesStatus = task.completed;
    
    return matchesSearch && matchesTag && matchesStatus;
  });
}

function render() {
  const filteredTasks = getFilteredTasks();
  
  // Group tasks by quadrant
  const groups = { q1: [], q2: [], q3: [], q4: [] };
  filteredTasks.forEach(task => {
    if (groups[task.quadrant]) {
      groups[task.quadrant].push(task);
    }
  });

  // Render each list
  Object.keys(groups).forEach(quad => {
    const listElement = document.getElementById(`list-${quad}`);
    const countElement = document.getElementById(`count-${quad}`);
    
    // Update count pill
    countElement.textContent = groups[quad].length;
    
    if (groups[quad].length === 0) {
      listElement.innerHTML = `
        <div class="empty-state">
          <i data-lucide="inbox"></i>
          <span>No tasks here</span>
        </div>
      `;
    } else {
      listElement.innerHTML = '';
      groups[quad].forEach(task => {
        listElement.appendChild(createTaskCard(task));
      });
    }
  });
  
  // Update Analytics
  updateAnalytics();
  
  // Update Lucide Icons
  lucide.createIcons();
}

function createTaskCard(task) {
  const card = document.createElement('div');
  card.className = `task-card ${task.completed ? 'completed' : ''}`;
  card.setAttribute('draggable', 'true');
  card.setAttribute('data-id', task.id);
  
  // Check due date warning
  let dueHtml = '';
  if (task.dueDate) {
    const today = new Date().toISOString().split('T')[0];
    const isOverdue = task.dueDate < today && !task.completed;
    const formattedDate = formatDate(task.dueDate);
    dueHtml = `
      <span class="date-pill ${isOverdue ? 'overdue' : ''}">
        <i data-lucide="calendar"></i>
        ${formattedDate} ${isOverdue ? '(Overdue)' : ''}
      </span>
    `;
  }
  
  // Tag html
  const tagHtml = task.tag ? `<span class="tag-pill">${escapeHTML(task.tag)}</span>` : '';
  
  // Notes html
  const notesHtml = task.notes ? `<p class="task-notes-preview">${escapeHTML(task.notes)}</p>` : '';
  
  card.innerHTML = `
    <label class="task-checkbox-container" title="${task.completed ? 'Mark Active' : 'Mark Complete'}">
      <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
    </label>
    <div class="task-details">
      <h4>${escapeHTML(task.title)}</h4>
      ${notesHtml}
      <div class="task-meta">
        ${tagHtml}
        ${dueHtml}
      </div>
    </div>
    <button class="btn-task-edit" title="Edit Task" aria-label="Edit Task">
      <i data-lucide="edit-3"></i>
    </button>
  `;
  
  // Bind Event Listeners
  const checkbox = card.querySelector('.task-checkbox');
  checkbox.addEventListener('change', (e) => {
    e.stopPropagation();
    toggleTaskComplete(task.id);
  });
  
  const editBtn = card.querySelector('.btn-task-edit');
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openEditModal(task);
  });
  
  // Drag and Drop card-level events
  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  });
  
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });

  // Double-click shortcut to edit
  card.addEventListener('dblclick', () => {
    openEditModal(task);
  });
  
  return card;
}

// --- Analytics Calculations ---

function updateAnalytics() {
  const activeTasks = state.tasks.filter(t => !t.completed);
  const completedTasks = state.tasks.filter(t => t.completed);
  
  const totalCount = state.tasks.length;
  const activeCount = activeTasks.length;
  const completedCount = completedTasks.length;
  
  // 1. Completion Rate
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  
  // 2. Focus Score calculation
  let focusScore = 100;
  if (activeCount > 0) {
    const q1Count = activeTasks.filter(t => t.quadrant === 'q1').length;
    const q2Count = activeTasks.filter(t => t.quadrant === 'q2').length;
    const q3Count = activeTasks.filter(t => t.quadrant === 'q3').length;
    const q4Count = activeTasks.filter(t => t.quadrant === 'q4').length;
    
    focusScore = Math.round(((q2Count * 1.0 + q1Count * 0.4 + q3Count * 0.2) / activeCount) * 100);
  }
  
  // Update header metric pills
  elements.headerTotalTasks.textContent = totalCount;
  elements.headerCompletionRate.textContent = `${completionRate}%`;
  elements.headerFocusScore.textContent = focusScore;
  
  // Update sidebar elements
  elements.statsCompleted.textContent = completedCount;
  elements.statsActive.textContent = activeCount;
  elements.statsLifetime.textContent = state.lifetimeCompleted;
  elements.gaugeDisplayVal.textContent = focusScore;
  
  // Update SVG Gauge DashOffset (radius = 40, circum = 251.2)
  const offset = 251.2 - (focusScore / 100) * 251.2;
  elements.gaugeFillCircle.style.strokeDashoffset = offset;
  
  // Set quadrant colors and percent styles on bars
  const quads = ['q1', 'q2', 'q3', 'q4'];
  const quadCounts = { q1: 0, q2: 0, q3: 0, q4: 0 };
  
  state.tasks.forEach(t => {
    quadCounts[t.quadrant]++;
  });
  
  quads.forEach(q => {
    const percent = totalCount > 0 ? Math.round((quadCounts[q] / totalCount) * 100) : 0;
    const barEl = document.getElementById(`bar-${q}`);
    barEl.style.setProperty('--percent', `${percent}%`);
    barEl.querySelector('.bar-value').textContent = `${percent}%`;
  });
  
  // Update advice recommendation based on dominant active quadrant
  let dominantQuad = '';
  let maxCount = -1;
  const activeQuadCounts = { q1: 0, q2: 0, q3: 0, q4: 0 };
  
  activeTasks.forEach(t => {
    activeQuadCounts[t.quadrant]++;
  });
  
  quads.forEach(q => {
    if (activeQuadCounts[q] > maxCount && activeQuadCounts[q] > 0) {
      maxCount = activeQuadCounts[q];
      dominantQuad = q;
    } else if (activeQuadCounts[q] === maxCount && activeQuadCounts[q] > 0) {
      const priority = { q1: 4, q4: 3, q3: 2, q2: 1 };
      if (priority[q] > priority[dominantQuad]) {
        dominantQuad = q;
      }
    }
  });
  
  let advice = '';
  if (dominantQuad === 'q1') {
    advice = `<strong>🚨 Firefighting Mode:</strong> You have a high ratio of <strong>Urgent & Important (Q1)</strong> tasks. You are in reactive crisis mode. Focus on crushing these today, but invest time in planning ahead (Q2) to reduce stress in the future.`;
  } else if (dominantQuad === 'q2') {
    advice = `<strong>✨ Proactive Focus:</strong> Superb work! Your focus is on <strong>Important, Not Urgent (Q2)</strong> tasks. You are investing in long-term goals, planning, and preventing fires. Keep spending at least 50% of your time here!`;
  } else if (dominantQuad === 'q3') {
    advice = `<strong>👥 Interruption Wave:</strong> You are swamped with <strong>Urgent, Not Important (Q3)</strong> tasks. These are often other people's priorities. Practice setting boundaries, saying 'no', delegating, or automating recurring distractions.`;
  } else if (dominantQuad === 'q4') {
    advice = `<strong>⚠️ Escape Distractions:</strong> Warning! You have a lot of items in <strong>Not Urgent & Not Important (Q4)</strong>. These are productivity leaks. Critically assess if these tasks need to exist, and delete or archive them to free up mental space.`;
  } else {
    advice = `<strong>📝 Build your Matrix:</strong> Add tasks and categorize them. Aim to grow your <strong>Q2 (Schedule)</strong> tasks to maintain a proactive flow!`;
  }
  
  elements.matrixAdvice.innerHTML = advice;
}

// --- Drag and Drop Handlers ---

function initDragAndDrop() {
  elements.quadrants.forEach(quad => {
    quad.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (document.querySelector('.task-card.dragging')) {
        quad.classList.add('drag-over');
      }
    });
    
    quad.addEventListener('dragleave', () => {
      quad.classList.remove('drag-over');
    });
    
    quad.addEventListener('drop', (e) => {
      e.preventDefault();
      quad.classList.remove('drag-over');
      
      const id = e.dataTransfer.getData('text/plain');
      const targetQuadrant = quad.getAttribute('data-quadrant');
      
      if (id && targetQuadrant) {
        const task = state.tasks.find(t => t.id === id);
        if (task && task.quadrant !== targetQuadrant) {
          updateTask(id, { quadrant: targetQuadrant });
        }
      }
    });
  });
}

// --- Modal Edit Functions ---

function openEditModal(task) {
  elements.editId.value = task.id;
  elements.editTitle.value = task.title;
  elements.editQuadrant.value = task.quadrant;
  elements.editDueDate.value = task.dueDate;
  elements.editTag.value = task.tag;
  elements.editNotes.value = task.notes;
  
  elements.editModal.classList.add('open');
  elements.editTitle.focus();
}

function closeEditModal() {
  elements.editModal.classList.remove('open');
  elements.editForm.reset();
}

// --- Import / Export ---

function exportTasks() {
  const dataStr = JSON.stringify(state.tasks, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `focusgrid_tasks_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importTasks(file) {
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (Array.isArray(imported)) {
        // Simple schema validation
        const isValid = imported.every(task => {
          return task.title && typeof task.title === 'string' &&
                 task.quadrant && ['q1', 'q2', 'q3', 'q4'].includes(task.quadrant);
        });
        
        if (isValid) {
          // Normalize
          const normalized = imported.map(t => ({
            ...t,
            id: t.id || 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            completed: !!t.completed,
            dueDate: t.dueDate || '',
            tag: t.tag || '',
            notes: t.notes || '',
            createdAt: t.createdAt || new Date().toISOString()
          }));
          
          let importCount = 0;
          for (const task of normalized) {
            try {
              const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(task)
              });
              if (res.ok) importCount++;
            } catch (err) {
              console.error('Failed to post imported task:', err);
            }
          }
          
          await loadFromServer();
          updateTagFilterOptions();
          render();
          alert(`Successfully imported ${importCount} out of ${normalized.length} tasks!`);
        } else {
          alert("Error: File matches JSON format but contains invalid task properties.");
        }
      } else {
        alert("Error: File format must be a JSON array of tasks.");
      }
    } catch (err) {
      alert("Error: Failed to parse file as valid JSON.");
      console.error(err);
    }
  };
  reader.readAsText(file);
}

// --- Helper Functions ---

function formatDate(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Event Listeners Initialization ---

function initEventListeners() {
  // Theme Toggle
  elements.themeToggle.addEventListener('click', async () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    await saveSetting('theme', state.theme);
  });
  
  // Sidebar Analytics Toggle
  elements.statsToggle.addEventListener('click', () => {
    state.sidebarOpen = !state.sidebarOpen;
    elements.statsSidebar.classList.toggle('collapsed', !state.sidebarOpen);
  });
  
  elements.closeStatsBtn.addEventListener('click', () => {
    state.sidebarOpen = false;
    elements.statsSidebar.classList.add('collapsed');
  });
  
  // Collapse/Expand Add Panel
  elements.quickAddTrigger.addEventListener('click', () => {
    elements.quickAddPanel.classList.toggle('collapsed');
    if (!elements.quickAddPanel.classList.contains('collapsed')) {
      elements.taskTitle.focus();
    }
  });
  
  elements.cancelAddBtn.addEventListener('click', () => {
    elements.quickAddPanel.classList.add('collapsed');
    elements.taskForm.reset();
  });
  
  // Inline add triggers inside Quadrant headers
  document.querySelectorAll('.btn-inline-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const quad = btn.getAttribute('data-target');
      elements.taskQuadrant.value = quad;
      elements.quickAddPanel.classList.remove('collapsed');
      elements.taskTitle.focus();
    });
  });
  
  // Task Creation Form
  elements.taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = elements.taskTitle.value;
    const quadrant = elements.taskQuadrant.value;
    const dueDate = elements.taskDueDate.value;
    const tag = elements.taskTag.value;
    const notes = elements.taskNotes.value;
    
    if (title.trim()) {
      await addTask(title, quadrant, dueDate, tag, notes);
      elements.taskForm.reset();
      elements.taskQuadrant.value = quadrant;
      elements.quickAddPanel.classList.add('collapsed');
    }
  });
  
  // Search & Filter
  elements.searchInput.addEventListener('input', (e) => {
    state.filters.search = e.target.value;
    render();
  });
  
  elements.tagFilter.addEventListener('change', (e) => {
    state.filters.tag = e.target.value;
    render();
  });
  
  elements.statusFilter.addEventListener('change', (e) => {
    state.filters.status = e.target.value;
    render();
  });
  
  // Modal Edit Form Close Actions
  elements.closeModalBtn.addEventListener('click', closeEditModal);
  elements.cancelEditBtn.addEventListener('click', closeEditModal);
  
  // Click backdrop to close modal
  elements.editModal.addEventListener('click', (e) => {
    if (e.target === elements.editModal) {
      closeEditModal();
    }
  });
  
  // Edit Form Submit
  elements.editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = elements.editId.value;
    const updated = {
      title: elements.editTitle.value.trim(),
      quadrant: elements.editQuadrant.value,
      dueDate: elements.editDueDate.value,
      tag: elements.editTag.value.trim(),
      notes: elements.editNotes.value.trim()
    };
    
    if (updated.title) {
      await updateTask(id, updated);
      closeEditModal();
    }
  });
  
  // Delete in Edit Form
  elements.deleteEditBtn.addEventListener('click', async () => {
    const id = elements.editId.value;
    if (id && confirm("Are you sure you want to delete this task?")) {
      await deleteTask(id);
      closeEditModal();
    }
  });
  
  // Import/Export / Clear
  elements.exportBtn.addEventListener('click', exportTasks);
  
  elements.importBtnTrigger.addEventListener('click', () => {
    elements.importFileInput.click();
  });
  
  elements.importFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      importTasks(e.target.files[0]);
    }
  });
  
  elements.clearAllBtn.addEventListener('click', async () => {
    if (confirm("⚠️ WARNING: This will permanently delete ALL tasks in your FocusGrid database. Are you sure?")) {
      try {
        const res = await fetch('/api/tasks', { method: 'DELETE' });
        if (res.ok) {
          state.tasks = [];
          state.lifetimeCompleted = 0;
          await saveSetting('lifetimeCompleted', 0);
          updateTagFilterOptions();
          render();
        } else {
          alert('Failed to clear tasks from server.');
        }
      } catch (err) {
        console.error('Error clearing tasks:', err);
      }
    }
  });
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
  await loadFromServer();
  initEventListeners();
  initDragAndDrop();
  updateTagFilterOptions();
  render();
});
