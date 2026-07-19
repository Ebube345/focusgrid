const state = {
  tasks: [],
  filters: {
    search: '',
    tag: 'all',
    status: 'active', // 'active', 'completed', 'all'
    owner: 'all' // 'all', 'me', or other owners
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
  statsOverlay: document.getElementById('stats-overlay'),
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
  deleteEditBtn: document.getElementById('delete-edit-btn'),

  // Task Owner & Privacy Inputs
  usernameInput: document.getElementById('username-input'),
  ownerFilter: document.getElementById('owner-filter'),
  taskOwner: document.getElementById('task-owner'),
  taskPrivate: document.getElementById('task-private'),
  editOwner: document.getElementById('edit-task-owner'),
  editPrivate: document.getElementById('edit-task-private'),

  // Splash Screen Elements
  splashScreen: document.getElementById('splash-screen'),
  splashForm: document.getElementById('splash-form'),
  splashUsernameInput: document.getElementById('splash-username-input'),
  splashError: document.getElementById('splash-error'),

  // Nuggets Elements
  nuggetsToggle: document.getElementById('nuggets-panel-toggle'),
  nuggetsDrawer: document.getElementById('nuggets-drawer'),
  nuggetsOverlay: document.getElementById('nuggets-overlay'),
  closeNuggetsBtn: document.getElementById('close-nuggets-btn'),
  nuggetTickerText: document.getElementById('nugget-ticker-text'),
  nuggetsGrid: document.getElementById('nuggets-grid'),
  nuggetsNextBtn: document.getElementById('nuggets-next-btn'),
  nuggetsCounter: document.getElementById('nuggets-counter'),

  // Logout
  logoutBtn: document.getElementById('logout-btn')
};

// --- Local Private Storage Helpers ---

function loadPrivateTasks() {
  const privateTasksStr = localStorage.getItem('focusgrid_private_tasks');
  if (privateTasksStr) {
    try {
      return JSON.parse(privateTasksStr).map(t => ({ ...t, isPrivate: true }));
    } catch (e) {
      console.error('Error parsing private tasks:', e);
      return [];
    }
  }
  return [];
}

function savePrivateTasks(privateTasks) {
  localStorage.setItem('focusgrid_private_tasks', JSON.stringify(privateTasks));
}

// --- Client Username Validation Helpers ---

function getOrGenerateUserId() {
  let userId = localStorage.getItem('focusgrid_user_id');
  if (!userId) {
    userId = 'fg_usr_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    localStorage.setItem('focusgrid_user_id', userId);
  }
  return userId;
}

async function checkAndRegisterUsername(newName) {
  newName = newName.trim();
  if (!newName) return { success: false, reason: 'empty' };

  const userId = getOrGenerateUserId();

  try {
    // Pass userId so the server can distinguish "I own this name" vs "someone else has it"
    const res = await fetch(`/api/users/check?username=${encodeURIComponent(newName)}&userId=${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error(`Server error ${res.status} checking username`);

    const checkResult = await res.json();
    if (checkResult.exists) {
      if (checkResult.userId === userId) {
        // We already own this name on this device
        return { success: true };
      } else {
        // Another device owns this name
        return { success: false, reason: 'taken' };
      }
    } else {
      // Name is free — register it
      const regRes = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newName, userId })
      });
      if (!regRes.ok) {
        const errData = await regRes.json().catch(() => ({}));
        // A conflict (409 or 500 from unique constraint) means someone else just claimed it
        return { success: false, reason: 'taken' };
      }
      return { success: true };
    }
  } catch (err) {
    // Network offline — block registration rather than silently succeed
    console.error('Error validating username against server:', err);
    return { success: false, reason: 'network_error' };
  }
}

async function loadFromServer() {
  try {
    // 1. Fetch public Tasks from server
    const tasksRes = await fetch('/api/tasks');
    let publicTasks = [];
    if (tasksRes.ok) {
      publicTasks = await tasksRes.json();
    } else {
      console.error('Failed to load tasks from server');
    }

    // 2. Fetch private Tasks from localStorage
    const privateTasks = loadPrivateTasks();

    // Combine them
    state.tasks = [...publicTasks, ...privateTasks];

    // If everything is completely empty, populate with some default samples
    if (state.tasks.length === 0) {
      await injectSampleTasks();
    }

    // 3. Fetch Settings (theme & lifetime completed score)
    const settingsRes = await fetch('/api/settings');
    if (settingsRes.ok) {
      const settings = await settingsRes.json();
      state.theme = settings.theme || 'dark';
      state.lifetimeCompleted = parseInt(settings.lifetimeCompleted, 10) || 0;
    }
  } catch (err) {
    console.error('Error connecting to backend database. Using local memory backup.', err);
    state.tasks = loadPrivateTasks();
  }

  // Set visual theme properties
  document.documentElement.setAttribute('data-theme', state.theme);

  // Load and validate username
  const storedName = localStorage.getItem('focusgrid_username');
  if (!storedName) {
    // First time opening the app - keep splash screen visible
    elements.splashScreen.classList.remove('hidden');
  } else {
    const validation = await checkAndRegisterUsername(storedName);
    if (validation.success) {
      // Username exists and belongs to us, hide the splash screen
      elements.splashScreen.classList.add('hidden');
      elements.usernameInput.value = storedName;
      elements.usernameInput.readOnly = true;
    } else {
      // Username was claimed by another device
      elements.splashScreen.classList.remove('hidden');
      elements.splashUsernameInput.value = storedName;
      elements.splashError.textContent = `⚠️ The username "${storedName}" is claimed by another device. Please choose a new name.`;
      elements.splashError.style.display = 'block';
    }
  }
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
  const username = localStorage.getItem('focusgrid_username') || 'Anonymous';
  const samples = [
    {
      id: 'sample-1',
      title: 'Finish Eisenhower SQLite migration plan',
      quadrant: 'q1',
      completed: true,
      dueDate: new Date().toISOString().split('T')[0],
      tag: 'Work',
      notes: 'Review code, test SQL queries, and deploy.',
      createdAt: new Date(Date.now() - 3600000).toISOString(), // 1hr ago
      owner: username
    },
    {
      id: 'sample-2',
      title: 'Plan weekly workout schedule',
      quadrant: 'q2',
      completed: false,
      dueDate: '',
      tag: 'Health',
      notes: 'Include 3 gym sessions and 1 run.',
      createdAt: new Date().toISOString(),
      owner: username
    },
    {
      id: 'sample-3',
      title: 'Respond to standard administrative emails',
      quadrant: 'q3',
      completed: false,
      dueDate: '',
      tag: 'Work',
      notes: 'Delegate or automate these templates later.',
      createdAt: new Date().toISOString(),
      owner: 'John'
    },
    {
      id: 'sample-4',
      title: 'Mindless scrolling on social media feeds',
      quadrant: 'q4',
      completed: false,
      dueDate: '',
      tag: 'Personal',
      notes: 'Limit to 15 mins a day max.',
      createdAt: new Date().toISOString(),
      owner: 'Mary'
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

async function addTask(title, quadrant, dueDate, tag, notes, owner, isPrivate) {
  const activeUsername = localStorage.getItem('focusgrid_username') || 'Anonymous';
  const newTask = {
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    title: title.trim(),
    quadrant,
    completed: false,
    dueDate: dueDate || '',
    tag: tag.trim() || '',
    notes: notes.trim() || '',
    createdAt: new Date().toISOString(),
    owner: (owner || '').trim() || activeUsername,
    isPrivate: !!isPrivate
  };

  if (isPrivate) {
    // Save to local private storage
    const privateTasks = loadPrivateTasks();
    privateTasks.push(newTask);
    savePrivateTasks(privateTasks);

    state.tasks.push(newTask);
    updateTagFilterOptions();
    updateOwnerFilterOptions();
    render();
  } else {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask)
      });

      if (res.ok) {
        state.tasks.push(newTask);
        updateTagFilterOptions();
        updateOwnerFilterOptions();
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
}

async function updateTask(id, updatedFields) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  const oldPrivate = !!task.isPrivate;
  const newPrivate = updatedFields.isPrivate !== undefined ? !!updatedFields.isPrivate : oldPrivate;
  const mergedTask = { ...task, ...updatedFields, isPrivate: newPrivate };

  if (oldPrivate && newPrivate) {
    // Update locally stored private task
    const privateTasks = loadPrivateTasks();
    const updated = privateTasks.map(t => t.id === id ? mergedTask : t);
    savePrivateTasks(updated);

    state.tasks = state.tasks.map(t => t.id === id ? mergedTask : t);
    updateTagFilterOptions();
    updateOwnerFilterOptions();
    render();
  } else if (!oldPrivate && !newPrivate) {
    // Update public task on server
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mergedTask)
      });

      if (res.ok) {
        state.tasks = state.tasks.map(t => t.id === id ? mergedTask : t);
        updateTagFilterOptions();
        updateOwnerFilterOptions();
        render();
      } else {
        const err = await res.json();
        alert(`Error updating task: ${err.error || 'Server error'}`);
      }
    } catch (err) {
      console.error('Network error updating task:', err);
      alert('Failed to connect to backend server.');
    }
  } else if (oldPrivate && !newPrivate) {
    // Convert Private to Public (POST to server, remove from local)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...mergedTask, isPrivate: false })
      });
      if (res.ok) {
        const privateTasks = loadPrivateTasks();
        const filtered = privateTasks.filter(t => t.id !== id);
        savePrivateTasks(filtered);

        state.tasks = state.tasks.map(t => t.id === id ? { ...mergedTask, isPrivate: false } : t);
        updateTagFilterOptions();
        updateOwnerFilterOptions();
        render();
      } else {
        const err = await res.json();
        alert(`Error converting task to public: ${err.error || 'Server error'}`);
      }
    } catch (err) {
      console.error('Network error converting task:', err);
    }
  } else if (!oldPrivate && newPrivate) {
    // Convert Public to Private (DELETE from server, save to local)
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const privateTasks = loadPrivateTasks();
        privateTasks.push({ ...mergedTask, isPrivate: true });
        savePrivateTasks(privateTasks);

        state.tasks = state.tasks.map(t => t.id === id ? { ...mergedTask, isPrivate: true } : t);
        updateTagFilterOptions();
        updateOwnerFilterOptions();
        render();
      } else {
        const err = await res.json();
        alert(`Error converting task to private: ${err.error || 'Server error'}`);
      }
    } catch (err) {
      console.error('Network error converting task:', err);
    }
  }
}

async function deleteTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  if (task.isPrivate) {
    const privateTasks = loadPrivateTasks();
    const filtered = privateTasks.filter(t => t.id !== id);
    savePrivateTasks(filtered);

    state.tasks = state.tasks.filter(t => t.id !== id);
    updateTagFilterOptions();
    updateOwnerFilterOptions();
    render();
  } else {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        state.tasks = state.tasks.filter(task => task.id !== id);
        updateTagFilterOptions();
        updateOwnerFilterOptions();
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
}

async function toggleTaskComplete(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  const newStatus = !task.completed;

  if (task.isPrivate) {
    const mergedTask = { ...task, completed: newStatus };
    const privateTasks = loadPrivateTasks();
    const updated = privateTasks.map(t => t.id === id ? mergedTask : t);
    savePrivateTasks(updated);

    state.tasks = state.tasks.map(t => t.id === id ? mergedTask : t);
    if (newStatus) {
      state.lifetimeCompleted++;
    } else {
      state.lifetimeCompleted = Math.max(0, state.lifetimeCompleted - 1);
    }
    await saveSetting('lifetimeCompleted', state.lifetimeCompleted);
    render();
  } else {
    const updatedTask = { ...task, completed: newStatus };
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTask)
      });

      if (res.ok) {
        state.tasks = state.tasks.map(t => t.id === id ? updatedTask : t);
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
}

// --- UI Rendering ---

function updateTagFilterOptions() {
  const uniqueTags = new Set();
  state.tasks.forEach(task => {
    if (task.tag) uniqueTags.add(task.tag);
  });

  const currentSelection = elements.tagFilter.value;
  elements.tagFilter.innerHTML = '<option value="all">All Tags</option>';

  uniqueTags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    elements.tagFilter.appendChild(option);
  });

  if (uniqueTags.has(currentSelection)) {
    elements.tagFilter.value = currentSelection;
  } else {
    elements.tagFilter.value = 'all';
    state.filters.tag = 'all';
  }
}

function updateOwnerFilterOptions() {
  const uniqueOwners = new Set();
  state.tasks.forEach(task => {
    if (task.owner) uniqueOwners.add(task.owner);
  });

  const currentSelection = elements.ownerFilter.value;
  const username = localStorage.getItem('focusgrid_username') || 'Anonymous';

  elements.ownerFilter.innerHTML = `
    <option value="all">All Owners</option>
    <option value="me">Me Only (${username})</option>
  `;

  uniqueOwners.forEach(owner => {
    if (owner && owner.toLowerCase() !== username.toLowerCase()) {
      const option = document.createElement('option');
      option.value = owner;
      option.textContent = owner;
      elements.ownerFilter.appendChild(option);
    }
  });

  // Restore selection
  elements.ownerFilter.value = currentSelection;
  if (elements.ownerFilter.value !== currentSelection) {
    elements.ownerFilter.value = 'all';
    state.filters.owner = 'all';
  }
}

function getFilteredTasks() {
  const { search, tag, status, owner } = state.filters;
  const username = (localStorage.getItem('focusgrid_username') || 'Anonymous').toLowerCase();

  return state.tasks.filter(task => {
    // Privacy isolation: if a task is private, it must belong to the current user
    if (task.isPrivate && (task.owner || 'Anonymous').toLowerCase() !== username) {
      return false;
    }

    // Search filter
    const matchesSearch = !search ||
      task.title.toLowerCase().includes(search.toLowerCase()) ||
      task.notes.toLowerCase().includes(search.toLowerCase()) ||
      (task.tag && task.tag.toLowerCase().includes(search.toLowerCase())) ||
      (task.owner && task.owner.toLowerCase().includes(search.toLowerCase()));

    // Tag filter
    const matchesTag = tag === 'all' || task.tag === tag;

    // Status filter
    let matchesStatus = true;
    if (status === 'active') matchesStatus = !task.completed;
    if (status === 'completed') matchesStatus = task.completed;

    // Owner filter
    let matchesOwner = true;
    const taskOwnerLower = (task.owner || 'Anonymous').toLowerCase();
    if (owner === 'me') {
      matchesOwner = taskOwnerLower === username;
    } else if (owner !== 'all') {
      matchesOwner = taskOwnerLower === owner.toLowerCase();
    }

    return matchesSearch && matchesTag && matchesStatus && matchesOwner;
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
  const activeUser = (localStorage.getItem('focusgrid_username') || 'Anonymous').toLowerCase();
  const taskOwner = (task.owner || 'Anonymous').toLowerCase();
  const isOwner = activeUser === taskOwner;

  const card = document.createElement('div');
  card.className = `task-card ${task.completed ? 'completed' : ''} ${isOwner ? '' : 'readonly-card'}`;
  card.setAttribute('draggable', isOwner ? 'true' : 'false');
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

  // Owner html
  const ownerHtml = `<span class="owner-pill"><i data-lucide="user"></i>${escapeHTML(task.owner || 'Anonymous')}</span>`;

  // Private html
  const privateHtml = task.isPrivate ? `<span class="private-pill"><i data-lucide="lock"></i>Private</span>` : '';

  // Notes html
  const notesHtml = task.notes ? `<p class="task-notes-preview">${escapeHTML(task.notes)}</p>` : '';

  card.innerHTML = `
    <label class="task-checkbox-container" title="${!isOwner ? 'Read Only' : task.completed ? 'Mark Active' : 'Mark Complete'}">
      <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} ${isOwner ? '' : 'disabled'}>
    </label>
    <div class="task-details">
      <h4>${escapeHTML(task.title)}</h4>
      ${notesHtml}
      <div class="task-meta">
        ${ownerHtml}
        ${privateHtml}
        ${tagHtml}
        ${dueHtml}
      </div>
    </div>
    ${isOwner ? `
    <button class="btn-task-edit" title="Edit Task" aria-label="Edit Task">
      <i data-lucide="edit-3"></i>
    </button>
    ` : ''}
  `;

  // Bind Event Listeners
  const checkbox = card.querySelector('.task-checkbox');
  if (checkbox && isOwner) {
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleTaskComplete(task.id);
    });
  }

  const editBtn = card.querySelector('.btn-task-edit');
  if (editBtn && isOwner) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(task);
    });
  }

  // Drag and Drop card-level events (only if owner)
  if (isOwner) {
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
  }

  return card;
}

// --- Analytics Calculations ---

function getAnalyticsTasks() {
  const { owner } = state.filters;
  const username = (localStorage.getItem('focusgrid_username') || 'Anonymous').toLowerCase();

  return state.tasks.filter(task => {
    // Privacy isolation: if a task is private, it must belong to the current user
    if (task.isPrivate && (task.owner || 'Anonymous').toLowerCase() !== username) {
      return false;
    }

    // Owner filter
    let matchesOwner = true;
    const taskOwnerLower = (task.owner || 'Anonymous').toLowerCase();
    if (owner === 'me') {
      matchesOwner = taskOwnerLower === username;
    } else if (owner !== 'all') {
      matchesOwner = taskOwnerLower === owner.toLowerCase();
    }

    return matchesOwner;
  });
}

function updateAnalytics() {
  const analyticsTasks = getAnalyticsTasks();
  const activeTasks = analyticsTasks.filter(t => !t.completed);
  const completedTasks = analyticsTasks.filter(t => t.completed);

  const totalCount = analyticsTasks.length;
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
    // We only count tasks that are visible under the current owner filter in the quadrant breakdown
    const matchesOwner = getAnalyticsTasks().some(at => at.id === t.id);
    if (matchesOwner) {
      quadCounts[t.quadrant]++;
    }
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
          const activeUser = (localStorage.getItem('focusgrid_username') || 'Anonymous').toLowerCase();
          const taskOwner = (task.owner || 'Anonymous').toLowerCase();
          if (activeUser !== taskOwner) {
            alert("❌ You cannot move a task that belongs to another user.");
            return;
          }
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
  elements.editOwner.value = task.owner || '';
  elements.editPrivate.checked = !!task.isPrivate;

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
  reader.onload = async function (e) {
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

// --- A-Player Nuggets Data & Functions ---

const NUGGETS_DATA = [
  {
    category: "Morning Planning",
    title: "Morning Planning Ritual",
    content: "Start each day by reviewing and prioritizing your tasks. Identify your top 3 Most Important Tasks (MITs) and complete these tasks during your peak energy hours.",
    tip: "Write down your 3 MITs tonight for tomorrow."
  },
  {
    category: "Time Blocking",
    title: "Time Blocking",
    content: "Allocate specific time slots for different types of tasks. Create focused work periods with minimal interruptions. Try Pomodoro: 25 minutes of focus followed by a 5-minute break.",
    tip: "Block out 2 hours daily on your calendar for deep work."
  },
  {
    category: "Regular Review",
    title: "Weekly Review & Reflect",
    content: "Schedule weekly review sessions of your tasks and priorities. Assess completed tasks, adjust future planning, and reflect on what worked and what didn't.",
    tip: "Dedicate 15 minutes every Friday afternoon to reflect."
  },
  {
    category: "Productivity Tools",
    title: "Recommended Digital Tools",
    content: "Use tools designed to fit your workflow: <strong>Trello</strong> for Kanban-style boards, <strong>Notion</strong> for all-in-one workspaces, <strong>Todoist</strong> for structured task lists, and <strong>RescueTime</strong> for auto-tracking.",
    tip: "Pick one tool, stick to it, and master it."
  },
  {
    category: "Digital Prioritization",
    title: "Digital Tips",
    content: "Use color-coding for task categories, set clear deadlines, map out task dependencies, and integrate your calendar and task manager.",
    tip: "Match your Eisenhower Grid quadrants with color tags."
  },
  {
    category: "Procrastination",
    title: "Overcoming Procrastination",
    content: "Break large tasks into smaller, manageable steps. Use the '2-Minute Rule': If a task takes less than 2 minutes, do it immediately. Create accountability by sharing goals.",
    tip: "If you're stuck, write down just the very next action."
  },
  {
    category: "Interruptions",
    title: "Managing Interruptions",
    content: "Use 'Do Not Disturb' modes, communicate boundaries clearly with colleagues, and design dedicated focus blocks in your daily schedule.",
    tip: "Block distractions at the browser and device level."
  },
  {
    category: "Mindset Shifts",
    title: "Core Mindset Shifts",
    content: "Focus on impact, not just completion. Practice saying 'no' to low-value tasks. Understand the huge difference between being busy and being productive.",
    tip: "An empty task list isn't the goal; doing what matters is."
  },
  {
    category: "Energy Management",
    title: "Energy Management",
    content: "Align tasks with your natural energy cycles. Take regular breaks to maintain mental clarity, and practice mindfulness and stress-reduction techniques.",
    tip: "Do complex creative work when your focus is at its peak."
  },
  {
    category: "Reflection",
    title: "Tracking & Journaling",
    content: "Keep a productivity journal, regularly assess your prioritization methods, and be willing to adapt and experiment with new techniques.",
    tip: "Write down your biggest daily win in a journal."
  }
];

let currentNuggetTickerIndex = 0;

function rotateNuggetTicker() {
  if (NUGGETS_DATA.length === 0) return;
  const nugget = NUGGETS_DATA[currentNuggetTickerIndex];
  elements.nuggetTickerText.innerHTML = `<strong>${nugget.category}:</strong> ${nugget.tip}`;
  currentNuggetTickerIndex = (currentNuggetTickerIndex + 1) % NUGGETS_DATA.length;
}

function renderNuggetsList() {
  if (!elements.nuggetsGrid) return;
  elements.nuggetsGrid.innerHTML = '';
  // Shuffle list for dynamic display
  const shuffled = [...NUGGETS_DATA].sort(() => Math.random() - 0.5);

  shuffled.forEach((nugget) => {
    const card = document.createElement('div');
    card.className = 'nugget-card';
    if (Math.random() > 0.6) card.classList.add('highlight');

    card.innerHTML = `
      <span class="nugget-category">${escapeHTML(nugget.category)}</span>
      <h3 class="nugget-title">${escapeHTML(nugget.title)}</h3>
      <p class="nugget-content">${nugget.content}</p>
      <span class="nugget-footer-tip">💡 ${escapeHTML(nugget.tip)}</span>
    `;
    elements.nuggetsGrid.appendChild(card);
  });

  if (elements.nuggetsCounter) {
    elements.nuggetsCounter.textContent = `${NUGGETS_DATA.length} rules`;
  }
}

function toggleNuggetsDrawer(show) {
  if (show) {
    elements.nuggetsDrawer.classList.add('active');
    elements.nuggetsOverlay.classList.add('active');
    rotateNuggetTicker();
    renderNuggetsList();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } else {
    elements.nuggetsDrawer.classList.remove('active');
    elements.nuggetsOverlay.classList.remove('active');
  }
}

// --- Logout ---

function logout() {
  if (!confirm('Log out and switch to a different username?')) return;

  // Clear session identity from this device
  localStorage.removeItem('focusgrid_username');
  localStorage.removeItem('focusgrid_user_id');

  // Reset username field in header
  elements.usernameInput.value = '';
  elements.usernameInput.readOnly = false;

  // Clear any pre-filled splash input and error
  elements.splashUsernameInput.value = '';
  elements.splashError.style.display = 'none';
  elements.splashError.textContent = '';

  // Re-show the onboarding splash
  elements.splashScreen.classList.remove('hidden');
  elements.splashUsernameInput.focus();
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
    if (elements.statsOverlay) {
      elements.statsOverlay.classList.toggle('active', state.sidebarOpen);
    }
  });

  elements.closeStatsBtn.addEventListener('click', () => {
    state.sidebarOpen = false;
    elements.statsSidebar.classList.add('collapsed');
    if (elements.statsOverlay) {
      elements.statsOverlay.classList.remove('active');
    }
  });

  if (elements.statsOverlay) {
    elements.statsOverlay.addEventListener('click', () => {
      state.sidebarOpen = false;
      elements.statsSidebar.classList.add('collapsed');
      elements.statsOverlay.classList.remove('active');
    });
  }

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
    const owner = elements.taskOwner.value;
    const isPrivate = elements.taskPrivate.checked;

    if (title.trim()) {
      await addTask(title, quadrant, dueDate, tag, notes, owner, isPrivate);
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

  elements.ownerFilter.addEventListener('change', (e) => {
    state.filters.owner = e.target.value;
    render();
  });

  // Username Input change in header
  elements.usernameInput.addEventListener('change', async (e) => {
    const originalName = localStorage.getItem('focusgrid_username') || 'Anonymous';
    const newName = e.target.value.trim();

    if (!newName) {
      e.target.value = originalName;
      return;
    }

    if (newName.toLowerCase() === originalName.toLowerCase()) {
      e.target.value = originalName;
      return;
    }

    e.target.disabled = true;
    const validation = await checkAndRegisterUsername(newName);
    e.target.disabled = false;

    if (validation.success) {
      localStorage.setItem('focusgrid_username', newName);
      e.target.value = newName;
      updateOwnerFilterOptions();
      render();
    } else {
      alert(`❌ The username "${newName}" is already claimed by another device.\nPlease choose a different username.`);
      e.target.value = originalName;
    }
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
      notes: elements.editNotes.value.trim(),
      owner: elements.editOwner.value.trim(),
      isPrivate: elements.editPrivate.checked
    };

    if (updated.title) {
      await updateTask(id, updated);
      closeEditModal();
    }
  });

  // Splash Onboarding Form Submit
  elements.splashForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const chosenName = elements.splashUsernameInput.value.trim();
    if (!chosenName) return;

    elements.splashError.style.display = 'none';
    const submitBtn = elements.splashForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Validating...';

    const validation = await checkAndRegisterUsername(chosenName);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Get Started';

    if (validation.success) {
      localStorage.setItem('focusgrid_username', chosenName);
      elements.usernameInput.value = chosenName;
      elements.usernameInput.readOnly = true;
      elements.splashScreen.classList.add('hidden');
      updateOwnerFilterOptions();
      render();
    } else if (validation.reason === 'network_error') {
      elements.splashError.textContent = `⚠️ Could not connect to the server. Please check your connection and try again.`;
      elements.splashError.style.display = 'block';
    } else {
      elements.splashError.textContent = `❌ The username "${chosenName}" is already taken. Please choose a different name.`;
      elements.splashError.style.display = 'block';
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

  /* Clear All Tasks event listener disabled
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
  */

  // A-Player Nuggets Drawer Event Listeners
  if (elements.nuggetsToggle) {
    elements.nuggetsToggle.addEventListener('click', () => {
      toggleNuggetsDrawer(true);
    });
  }

  if (elements.closeNuggetsBtn) {
    elements.closeNuggetsBtn.addEventListener('click', () => {
      toggleNuggetsDrawer(false);
    });
  }

  if (elements.nuggetsOverlay) {
    elements.nuggetsOverlay.addEventListener('click', () => {
      toggleNuggetsDrawer(false);
    });
  }

  if (elements.nuggetsNextBtn) {
    elements.nuggetsNextBtn.addEventListener('click', () => {
      rotateNuggetTicker();
      renderNuggetsList();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });
  }

  // Logout
  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', logout);
  }
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
  await loadFromServer();
  initEventListeners();
  initDragAndDrop();
  updateTagFilterOptions();
  updateOwnerFilterOptions();
  render();
});
