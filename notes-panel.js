'use strict';

// Original todo list and note detail UI; storage format and rendering remain unchanged.
async function getTodos() {
  const stored = await chrome.storage.local.get(TODOS_KEY);
  return drawerNormalizeTodos(stored[TODOS_KEY]);
}

async function saveTodos(todos) {
  const normalized = drawerNormalizeTodos(todos);
  await chrome.storage.local.set({ [TODOS_KEY]: normalized });
  return normalized;
}

async function createTodoItem(payload) {
  const todos = await getTodos();
  return saveTodos(drawerCreateTodo(todos, payload));
}

async function completeTodoItem(id) {
  const todos = await getTodos();
  return saveTodos(drawerCompleteTodo(todos, id));
}

async function deleteTodoItem(id) {
  const todos = await getTodos();
  return saveTodos(drawerDeleteTodo(todos, id));
}

async function clearTodoArchiveItems() {
  const todos = await getTodos();
  return saveTodos(drawerClearArchivedTodos(todos));
}

function renderTodoArchiveItem(todo) {
  const ago = todo.completedAt ? timeAgo(todo.completedAt) : timeAgo(todo.createdAt);
  return `
    <div class="archive-item">
      <div class="archive-item-main">
        <div class="archive-item-title">${todo.title}</div>
        <span class="archive-item-date">${ago}</span>
      </div>
      <button class="archive-item-delete" type="button" data-action="delete-todo-archive" data-todo-id="${todo.id}" aria-label="Delete archived todo" title="Delete archived todo">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </div>`;
}

function renderTodoListItem(todo, { dragEnabled = true } = {}) {
  const ago = timeAgo(todo.createdAt);
  const dragHandle = dragEnabled
    ? `<button class="drawer-reorder-handle" type="button" data-drag-handle="todo" aria-label="Drag to reorder todo">
        ${ICONS.move}
      </button>`
    : '';
  return `
    <div class="todo-item" data-todo-id="${todo.id}" data-drawer-sort-id="${todo.id}" data-drawer-sort-kind="todo">
      <input type="checkbox" class="todo-checkbox" data-action="complete-todo" data-todo-id="${todo.id}">
      <button class="todo-main" type="button" data-action="open-todo-detail" data-todo-id="${todo.id}">
        <span class="todo-title">${todo.title}</span>
        <span class="todo-meta">${ago}</span>
      </button>
      <div class="todo-actions">
        ${dragHandle}
      </div>
    </div>`;
}

function renderTodoDetail(todo) {
  return `
    <div class="todo-detail">
      <button class="todo-back-btn" type="button" data-action="close-todo-detail">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
        Back to list
      </button>
      <div class="todo-detail-card">
        <h3>${todo.title}</h3>
        <p>${todo.description || 'Add a note when this task needs more context.'}</p>
        <div class="todo-detail-meta">Created ${timeAgo(todo.createdAt)}</div>
      </div>
    </div>`;
}

async function renderTodoPanel() {
  const panel = document.getElementById('todoPanel');
  const countEl = document.getElementById('todoCount');
  const list = document.getElementById('todoList');
  const empty = document.getElementById('todoEmpty');
  const archive = document.getElementById('todoArchive');
  const archiveCount = document.getElementById('todoArchiveCount');
  const archiveList = document.getElementById('todoArchiveList');
  const clearArchiveBtn = document.getElementById('clearTodoArchiveBtn');
  const detail = document.getElementById('todoDetailView');
  const searchWrap = document.getElementById('todoSearchWrap');
  const searchInput = document.getElementById('todoSearchInput');
  const todoSearchToggle = document.getElementById('todoSearchToggle');
  const todoArchiveToggle = document.getElementById('todoArchiveToggle');
  const todoArchiveBody = document.getElementById('todoArchiveBody');

  if (!panel) return;

  const todos = await getTodos();
  const { active, archived } = drawerSplitTodos(todos);
  const filtered = drawerSearchTodos(active, todoSearchQuery);
  const todoDragEnabled = !todoSearchQuery.trim() && !todoDetailId;

  countEl.textContent = `${active.length}`;
  if (todoSearchToggle) {
    todoSearchToggle.setAttribute('aria-expanded', String(todoSearchOpen));
  }
  searchWrap.style.display = todoSearchOpen ? 'block' : 'none';
  searchWrap.hidden = !todoSearchOpen;
  if (searchInput && searchInput.value !== todoSearchQuery) searchInput.value = todoSearchQuery;
  if (todoArchiveToggle && todoArchiveBody) {
    const archiveExpanded = todoArchiveBody.style.display !== 'none' && !todoArchiveBody.hidden;
    todoArchiveToggle.setAttribute('aria-expanded', String(archiveExpanded));
  }

  if (todoDetailId) {
    const todo = active.find(item => item.id === todoDetailId);
    if (todo) {
      detail.innerHTML = renderTodoDetail(todo);
      detail.style.display = 'block';
      list.style.display = 'none';
      empty.style.display = 'none';
    } else {
      todoDetailId = '';
      detail.style.display = 'none';
    }
  } else {
    detail.style.display = 'none';
  }

  if (!todoDetailId) {
    if (filtered.length > 0) {
      list.innerHTML = filtered.map(todo => renderTodoListItem(todo, { dragEnabled: todoDragEnabled })).join('');
      list.style.display = 'block';
      empty.style.display = 'none';
    } else {
      list.style.display = 'none';
      empty.style.display = 'block';
    }
  }

  if (archived.length > 0) {
    archiveCount.textContent = `(${archived.length})`;
    archiveList.innerHTML = archived.map(todo => renderTodoArchiveItem(todo)).join('');
    archive.style.display = 'block';
    if (clearArchiveBtn) clearArchiveBtn.style.display = 'inline-flex';
  } else {
    archive.style.display = 'none';
    if (clearArchiveBtn) clearArchiveBtn.style.display = 'none';
  }
}


globalThis.AstabNotes = { render: renderTodoPanel };
