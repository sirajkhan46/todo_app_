/**
 * Opus Task Manager — app.js
 * Fully memory-based: no localStorage, no APIs.
 * All state lives in the `tasks` array; gone on refresh.
 */

'use strict';

/* ============================================================
   STATE
   ============================================================ */

/**
 * In-memory task store.
 * Each task: { id, text, completed, createdAt }
 */
let tasks = [];

/** Active filter: 'all' | 'active' | 'completed' */
let currentFilter = 'all';

/* ============================================================
   DOM REFERENCES
   ============================================================ */
const taskInput          = document.getElementById('task-input');
const addBtn             = document.getElementById('add-btn');
const taskList           = document.getElementById('task-list');
const emptyState         = document.getElementById('empty-state');
const appFooter          = document.getElementById('app-footer');
const clearCompletedBtn  = document.getElementById('clear-completed-btn');

const countTotal         = document.getElementById('count-total');
const countActive        = document.getElementById('count-active');
const countDone          = document.getElementById('count-done');

const filterTabs         = document.querySelectorAll('.filter-tab');

/* ============================================================
   UTILITIES
   ============================================================ */

/**
 * Generate a lightweight unique ID using timestamp + random suffix.
 * @returns {string}
 */
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Escape text to prevent XSS when injecting into innerHTML.
 * @param {string} str
 * @returns {string}
 */
const escapeHtml = (str) =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Animate an element's removal: add exit class, then remove from DOM.
 * @param {HTMLElement} el
 * @param {Function} [callback]
 */
const animateOut = (el, callback) => {
  el.classList.add('task-item--exit');
  el.addEventListener('animationend', () => {
    el.remove();
    if (callback) callback();
  }, { once: true });
};

/* ============================================================
   TASK CRUD
   ============================================================ */

/**
 * Add a new task from the input field value.
 * Trims whitespace; ignores empty input.
 */
const addTask = () => {
  const text = taskInput.value.trim();
  if (!text) {
    shakeInput();
    return;
  }

  const task = {
    id:        uid(),
    text,
    completed: false,
    createdAt: new Date(),
  };

  tasks.unshift(task); // newest first
  taskInput.value = '';
  taskInput.focus();

  renderTask(task, true); // true = prepend
  updateStats();
  updateEmptyState();
  updateFooter();
};

/**
 * Toggle a task's completed state by ID.
 * @param {string} id
 */
const toggleTask = (id) => {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  task.completed = !task.completed;

  const li = taskList.querySelector(`[data-id="${id}"]`);
  if (li) syncItemState(li, task);

  updateStats();
  updateFooter();

  // If current filter hides this task, remove it from view with animation
  if (
    (currentFilter === 'active'    &&  task.completed) ||
    (currentFilter === 'completed' && !task.completed)
  ) {
    const el = taskList.querySelector(`[data-id="${id}"]`);
    if (el) animateOut(el, updateEmptyState);
  }
};

/**
 * Delete a task by ID, with exit animation.
 * @param {string} id
 */
const deleteTask = (id) => {
  tasks = tasks.filter(t => t.id !== id);

  const li = taskList.querySelector(`[data-id="${id}"]`);
  if (li) {
    animateOut(li, () => {
      updateStats();
      updateEmptyState();
      updateFooter();
    });
  } else {
    updateStats();
    updateEmptyState();
    updateFooter();
  }
};

/**
 * Enter edit mode for a task item.
 * Replaces the task text span with an <input>.
 * @param {string} id
 */
const startEdit = (id) => {
  const task = tasks.find(t => t.id === id);
  const li   = taskList.querySelector(`[data-id="${id}"]`);
  if (!task || !li || li.classList.contains('task-item--editing')) return;

  li.classList.add('task-item--editing');

  const textEl   = li.querySelector('.task-text');
  const editBtn  = li.querySelector('.task-action-btn--edit');
  const actionsEl = li.querySelector('.task-actions');

  // Replace text span with input
  const input = document.createElement('input');
  input.type      = 'text';
  input.className = 'task-edit-input';
  input.value     = task.text;
  input.maxLength = 200;
  input.setAttribute('aria-label', 'Edit task');

  textEl.replaceWith(input);
  input.focus();
  input.select();

  // Swap edit button for save button
  if (editBtn) {
    editBtn.textContent = '✓';
    editBtn.title       = 'Save';
    editBtn.classList.remove('task-action-btn--edit');
    editBtn.classList.add('task-action-btn--save');
  }

  // Save on Enter, cancel on Escape
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); saveEdit(id); }
    if (e.key === 'Escape') { cancelEdit(id, task.text); }
  });

  // Save on blur (clicking away)
  input.addEventListener('blur', () => saveEdit(id), { once: true });
};

/**
 * Commit the edited value for a task.
 * @param {string} id
 */
const saveEdit = (id) => {
  const task = tasks.find(t => t.id === id);
  const li   = taskList.querySelector(`[data-id="${id}"]`);
  if (!task || !li) return;

  const input = li.querySelector('.task-edit-input');
  if (!input) return; // already saved (blur + enter can both fire)

  const newText = input.value.trim();
  if (newText) task.text = newText;

  finishEdit(id, task.text, li);
};

/**
 * Discard edit changes and restore original text.
 * @param {string} id
 * @param {string} originalText
 */
const cancelEdit = (id, originalText) => {
  const li = taskList.querySelector(`[data-id="${id}"]`);
  if (!li) return;
  finishEdit(id, originalText, li);
};

/**
 * Shared cleanup: restores task item from edit mode.
 * @param {string} id
 * @param {string} text
 * @param {HTMLElement} li
 */
const finishEdit = (id, text, li) => {
  const input   = li.querySelector('.task-edit-input');
  const saveBtn = li.querySelector('.task-action-btn--save');
  if (!input) return;

  // Restore text span
  const textEl = document.createElement('span');
  textEl.className    = 'task-text';
  textEl.textContent  = text;
  input.replaceWith(textEl);

  // Restore edit button
  if (saveBtn) {
    saveBtn.textContent = '✎';
    saveBtn.title       = 'Edit';
    saveBtn.classList.remove('task-action-btn--save');
    saveBtn.classList.add('task-action-btn--edit');
  }

  li.classList.remove('task-item--editing');
};

/**
 * Delete all tasks marked as completed.
 */
const clearCompleted = () => {
  const completedIds = tasks.filter(t => t.completed).map(t => t.id);
  tasks = tasks.filter(t => !t.completed);

  completedIds.forEach(id => {
    const li = taskList.querySelector(`[data-id="${id}"]`);
    if (li) animateOut(li);
  });

  setTimeout(() => {
    updateStats();
    updateEmptyState();
    updateFooter();
  }, 300);
};

/* ============================================================
   RENDERING
   ============================================================ */

/**
 * Build and inject a single task <li> element.
 * @param {Object} task
 * @param {boolean} prepend — prepend to top vs append
 */
const renderTask = (task, prepend = false) => {
  const li = document.createElement('li');
  li.className  = `task-item${task.completed ? ' task-item--completed' : ''}`;
  li.dataset.id = task.id;
  li.setAttribute('role', 'listitem');

  li.innerHTML = `
    <button
      class="task-checkbox${task.completed ? ' task-checkbox--checked' : ''}"
      aria-label="${task.completed ? 'Mark incomplete' : 'Mark complete'}"
      aria-pressed="${task.completed}"
      data-action="toggle"
    >${task.completed ? '✓' : ''}</button>

    <span class="task-text">${escapeHtml(task.text)}</span>

    <div class="task-actions">
      <button
        class="task-action-btn task-action-btn--edit"
        aria-label="Edit task"
        title="Edit"
        data-action="edit"
      >✎</button>
      <button
        class="task-action-btn task-action-btn--delete"
        aria-label="Delete task"
        title="Delete"
        data-action="delete"
      >✕</button>
    </div>
  `;

  if (prepend) {
    taskList.prepend(li);
  } else {
    taskList.append(li);
  }
};

/**
 * Sync DOM element classes/aria to match current task data.
 * @param {HTMLElement} li
 * @param {Object} task
 */
const syncItemState = (li, task) => {
  li.classList.toggle('task-item--completed', task.completed);

  const checkbox = li.querySelector('.task-checkbox');
  if (checkbox) {
    checkbox.classList.toggle('task-checkbox--checked', task.completed);
    checkbox.setAttribute('aria-pressed', task.completed);
    checkbox.setAttribute('aria-label', task.completed ? 'Mark incomplete' : 'Mark complete');
    checkbox.textContent = task.completed ? '✓' : '';
  }
};

/**
 * Full re-render of the task list based on current filter.
 */
const renderAll = () => {
  taskList.innerHTML = '';
  const visible = getFilteredTasks();
  visible.forEach(task => renderTask(task));
  updateEmptyState();
};

/**
 * Return the filtered subset of tasks.
 * @returns {Array}
 */
const getFilteredTasks = () => {
  switch (currentFilter) {
    case 'active':    return tasks.filter(t => !t.completed);
    case 'completed': return tasks.filter(t =>  t.completed);
    default:          return tasks;
  }
};

/* ============================================================
   UI STATE HELPERS
   ============================================================ */

/**
 * Update the three stats counters.
 */
const updateStats = () => {
  const total  = tasks.length;
  const done   = tasks.filter(t => t.completed).length;
  const active = total - done;

  countTotal.textContent  = total;
  countActive.textContent = active;
  countDone.textContent   = done;
};

/**
 * Show or hide the empty state illustration.
 */
const updateEmptyState = () => {
  const hasVisible = getFilteredTasks().length > 0;
  emptyState.classList.toggle('visible', !hasVisible);
};

/**
 * Show or hide the "Clear completed" footer button.
 */
const updateFooter = () => {
  const hasCompleted = tasks.some(t => t.completed);
  appFooter.classList.toggle('visible', hasCompleted);
};

/**
 * Briefly shake the input to signal that it cannot be empty.
 */
const shakeInput = () => {
  const card = taskInput.closest('.input-card');
  card.style.animation = 'none';
  void card.offsetWidth; // reflow
  card.style.animation = 'shake 0.35s ease';
  card.addEventListener('animationend', () => {
    card.style.animation = '';
  }, { once: true });
};

/* ============================================================
   EVENT DELEGATION & LISTENERS
   ============================================================ */

/**
 * Task list click delegation — handles toggle, edit, delete.
 */
taskList.addEventListener('click', (e) => {
  const action = e.target.dataset.action;
  if (!action) return;

  const li = e.target.closest('.task-item');
  if (!li) return;
  const id = li.dataset.id;

  switch (action) {
    case 'toggle': toggleTask(id);      break;
    case 'edit':   startEdit(id);       break;
    case 'delete': deleteTask(id);      break;
  }
});

/** Add on button click */
addBtn.addEventListener('click', addTask);

/** Add on Enter key */
taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addTask();
  }
});

/** Filter tab switching */
filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    filterTabs.forEach(t => t.classList.remove('filter-tab--active'));
    tab.classList.add('filter-tab--active');
    currentFilter = tab.dataset.filter;
    renderAll();
  });
});

/** Clear completed */
clearCompletedBtn.addEventListener('click', clearCompleted);

/* ============================================================
   KEYFRAME: SHAKE (injected into document)
   ============================================================ */
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%       { transform: translateX(-6px); }
    40%       { transform: translateX(6px); }
    60%       { transform: translateX(-4px); }
    80%       { transform: translateX(4px); }
  }
`;
document.head.appendChild(shakeStyle);

/* ============================================================
   INIT
   ============================================================ */
updateStats();
updateEmptyState();
updateFooter();
taskInput.focus();
