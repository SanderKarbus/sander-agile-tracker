const API_URL = '/api/stories';

// Rakenduse globaalne olek lokaalselt
let allStories = [];
let currentActiveStory = null;

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  fetchStories();
  setupEventListeners();
  setupDragAndDrop();
}

// ─── API PÄRINGUD ────────────────────────────────────────────────

async function fetchStories() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('Viga andmete laadimisel');
    allStories = await res.json();
    renderBoard();
  } catch (err) {
    showErrorNotification(err.message);
  }
}

async function saveStory(e) {
  e.preventDefault();
  
  const id = document.getElementById('story-id').value;
  const title = document.getElementById('title').value.trim();
  const description = document.getElementById('description').value.trim();
  const points = parseInt(document.getElementById('points').value);
  const status = document.getElementById('status').value;
  const criteria = document.getElementById('criteria').value.trim();
  const mockupUrl = document.getElementById('mockupUrl').value.trim(); // LISATUD: Mockup pildi URL

  // Punktide range kontroll vastavalt juhendile
  if (isNaN(points) || points < 0) {
    alert("Viga: Punktid peavad olema mitunegatiivne täisarv ja väli ei tohi olla tühi!");
    return;
  }

  const storyData = {
    title,
    description,
    points,
    status,
    mockupUrl, // LISATUD: pildi andmed päringusse
    acceptanceCriteria: [criteria]
  };

  try {
    let res;
    if (id) {
      // PUT muutmiseks
      res = await fetch(`${API_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storyData)
      });
    } else {
      // POST uue lisamiseks
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storyData)
      });
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Salvestamine ebaõnnestus');

    closeModal('story-modal');
    fetchStories();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteStory(id) {
  if (!confirm('Kas oled kindel, et soovid selle story kustutada?')) return;
  
  try {
    const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Kustutamine ebaõnnestus');
    fetchStories();
  } catch (err) {
    showErrorNotification(err.message);
  }
}

async function updateStoryStatus(id, newStatus) {
  try {
    const res = await fetch(`${API_URL}/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('Staatuse uuendamine ebaõnnestus');
    
    // Uuendame lokaalset massiivi, et hoida UI kiirena
    const story = allStories.find(s => s.id === id);
    if (story) story.status = newStatus;
    updateColumnCounts();
  } catch (err) {
    showErrorNotification(err.message);
    fetchStories(); // Vea korral laeme uuesti õige seisu
  }
}

async function sendReorderToBackend(orderedIds) {
  try {
    const res = await fetch(`${API_URL}/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: orderedIds })
    });
    if (!res.ok) throw new Error('Järjestuse salvestamine ebaõnnestus');
  } catch (err) {
    showErrorNotification(err.message);
  }
}

async function addComment(e) {
  e.preventDefault();
  if (!currentActiveStory) return;

  const commentInput = document.getElementById('comment-text');
  const text = commentInput.value.trim();
  if (!text) return;

  try {
    const res = await fetch(`${API_URL}/${currentActiveStory.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Kommentaari lisamine ebaõnnestus');

    commentInput.value = '';
    
    if (!currentActiveStory.comments) currentActiveStory.comments = [];
    currentActiveStory.comments.push(data);
    
    openDetailModal(currentActiveStory.id);
  } catch (err) {
    alert(err.message);
  }
}

// ─── KOMMENTAARIDE MUUTMINE JA KUSTUTAMINE (BOONUS) ────────────────

async function deleteComment(storyId, commentId) {
  if (!confirm('Kas soovid selle kommentaari kustutada?')) return;

  try {
    const res = await fetch(`/api/stories/${storyId}/comments/${commentId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Kommentaari kustutamine ebaõnnestus');

    if (currentActiveStory && currentActiveStory.comments) {
      currentActiveStory.comments = currentActiveStory.comments.filter(c => c.id !== commentId);
    }
    const original = allStories.find(s => s.id === storyId);
    if (original && original.comments) {
      original.comments = original.comments.filter(c => c.id !== commentId);
    }

    openDetailModal(storyId);
  } catch (err) {
    alert(err.message);
  }
}

function startEditComment(storyId, commentId, oldText) {
  const textEl = document.getElementById(`comment-text-${commentId}`);
  if (!textEl) return;

  textEl.innerHTML = `
    <div class="comment-edit-inline" style="display: flex; gap: 0.5rem; margin-top: 0.4rem;">
      <input type="text" id="edit-comment-input-${commentId}" value="${escapeHtml(oldText)}" style="padding: 0.4rem;">
      <button class="btn-small" id="save-comment-btn-${commentId}">Salvesta</button>
      <button class="btn-secondary" id="cancel-comment-btn-${commentId}" style="padding: 0.4rem 0.8rem; font-size: 0.85rem; border-radius: 8px;">X</button>
    </div>
  `;

  document.getElementById(`cancel-comment-btn-${commentId}`).addEventListener('click', () => {
    textEl.innerHTML = escapeHtml(oldText);
  });

  document.getElementById(`save-comment-btn-${commentId}`).addEventListener('click', async () => {
    const newText = document.getElementById(`edit-comment-input-${commentId}`).value.trim();
    if (!newText) return;

    try {
      const res = await fetch(`/api/stories/${storyId}/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText })
      });
      if (!res.ok) throw new Error('Muutmine ebaõnnestus');
      const data = await res.json();

      const localComment = currentActiveStory.comments.find(c => c.id === commentId);
      if (localComment) localComment.text = data.text;

      openDetailModal(storyId);
    } catch (err) {
      alert(err.message);
    }
  });
}

// ─── UI RENDERING ────────────────────────────────────────────────

function renderBoard() {
  const lists = {
    todo: document.getElementById('list-todo'),
    doing: document.getElementById('list-doing'),
    done: document.getElementById('list-done')
  };

  Object.values(lists).forEach(list => list.innerHTML = '');

  allStories.forEach(story => {
    const column = lists[story.status];
    if (!column) return;

    const card = document.createElement('div');
    card.className = 'story-card';
    card.id = `story-${story.id}`;
    card.dataset.id = story.id;
    card.draggable = true;

    card.innerHTML = `
      <h3>${escapeHtml(story.title)}</h3>
      <div class="story-footer">
        <span class="badge">${story.points} SP</span>
        <div class="card-actions">
          <button class="action-btn edit-btn" title="Muuda">✏️</button>
          <button class="action-btn delete-btn" title="Kustuta">🗑️</button>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.action-btn')) return;
      openDetailModal(story.id);
    });

    card.querySelector('.edit-btn').addEventListener('click', () => openEditModal(story.id));
    card.querySelector('.delete-btn').addEventListener('click', () => deleteStory(story.id));

    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend', () => card.classList.remove('dragging'));

    column.appendChild(card);
  });

  updateColumnCounts();
}

function updateColumnCounts() {
  const statuses = ['todo', 'doing', 'done'];
  statuses.forEach(status => {
    const count = allStories.filter(s => s.status === status).length;
    document.getElementById(`count-${status}`).innerText = count;
  });
}

// ─── LOHISTAMISE LOOGIKA (DRAG AND DROP) ───────────────────────

function setupDragAndDrop() {
  const columns = document.querySelectorAll('.column-content');

  columns.forEach(column => {
    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      const draggingCard = document.querySelector('.story-card.dragging');
      const afterElement = getDragAfterElement(column, e.clientY);
      
      if (afterElement == null) {
        column.appendChild(draggingCard);
      } else {
        column.insertBefore(draggingCard, afterElement);
      }
    });

    column.addEventListener('drop', async () => {
      const draggingCard = document.querySelector('.story-card.dragging');
      if (!draggingCard) return;

      const storyId = parseInt(draggingCard.dataset.id);
      const parentColumn = column.closest('.kanban-column');
      const newStatus = parentColumn.dataset.status;

      await updateStoryStatus(storyId, newStatus);

      if (newStatus === 'todo') {
        const todoCards = Array.from(document.querySelectorAll('#list-todo .story-card'));
        const orderedIds = todoCards.map(card => parseInt(card.dataset.id));
        
        allStories.forEach(s => {
          const idx = orderedIds.indexOf(s.id);
          if (idx !== -1) s.priority = idx + 1;
        });

        await sendReorderToBackend(orderedIds);
      }
    });
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.story-card:not(.dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ─── MODAALAKENDE HALDUS ─────────────────────────────────────────

function setupEventListeners() {
  document.getElementById('open-modal-btn').addEventListener('click', () => openAddModal());
  document.getElementById('close-modal-btn').addEventListener('click', () => closeModal('story-modal'));
  document.getElementById('cancel-modal-btn').addEventListener('click', () => closeModal('story-modal'));
  document.getElementById('story-form').addEventListener('submit', saveStory);

  document.getElementById('close-detail-btn').addEventListener('click', () => closeModal('detail-modal'));
  document.getElementById('comment-form').addEventListener('submit', addComment);
}

function openAddModal() {
  document.getElementById('story-form').reset();
  document.getElementById('story-id').value = '';
  document.getElementById('mockupUrl').value = ''; // Tühjenda mockupURL väli
  document.getElementById('modal-title').innerText = 'Lisa uus Story';
  document.getElementById('status').disabled = false;
  document.getElementById('story-modal').classList.remove('hidden');
}

function openEditModal(id) {
  const story = allStories.find(s => s.id === id);
  if (!story) return;

  document.getElementById('story-id').value = story.id;
  document.getElementById('title').value = story.title;
  document.getElementById('description').value = story.description;
  document.getElementById('points').value = story.points;
  document.getElementById('status').value = story.status;
  document.getElementById('criteria').value = story.acceptanceCriteria ? story.acceptanceCriteria : '';
  document.getElementById('mockupUrl').value = story.mockupUrl || ''; // Täida mockupURL väli muutmisel
  
  document.getElementById('modal-title').innerText = 'Muuda Storyt';
  document.getElementById('story-modal').classList.remove('hidden');
}

function openDetailModal(id) {
  const story = allStories.find(s => s.id === id);
  if (!story) return;

  currentActiveStory = story;

  document.getElementById('detail-title').innerText = story.title;
  document.getElementById('detail-points').innerText = `${story.points} SP`;
  document.getElementById('detail-status').innerText = story.status.toUpperCase();
  document.getElementById('detail-desc').innerText = story.description || 'Kirjeldus puudub.';

  // TÄIENDATUD: Mockup pildi kuvamise loogika detailvaates
  const mockupSection = document.getElementById('detail-mockup-section');
  const mockupImg = document.getElementById('detail-mockup-img');
  if (mockupSection && mockupImg) {
    if (story.mockupUrl && story.mockupUrl.trim() !== "") {
      mockupImg.src = story.mockupUrl;
      mockupSection.classList.remove('hidden');
    } else {
      mockupSection.classList.add('hidden');
      mockupImg.src = "";
    }
  }

  // Vastuvõtutingimused
  const criteriaList = document.getElementById('detail-criteria-list');
  criteriaList.innerHTML = '';
  if (story.acceptanceCriteria) {
    story.acceptanceCriteria.forEach(c => {
      const li = document.createElement('li');
      li.innerText = c;
      criteriaList.appendChild(li);
    });
  }

  // Kommentaarid
  document.getElementById('comment-count').innerText = story.comments ? story.comments.length : 0;
  const commentsContainer = document.getElementById('comments-list');
  commentsContainer.innerHTML = '';
  
  if (story.comments && story.comments.length > 0) {
    story.comments.forEach(c => {
      const div = document.createElement('div');
      div.className = 'comment-item';
      div.id = `comment-${c.id}`;
      div.innerHTML = `
        <div class="comment-header">
          <span>Kasutaja</span>
          <div class="comment-actions">
            <span class="comment-time">${c.createdAt}</span>
            <button class="action-btn edit-comment-btn" data-id="${c.id}" title="Muuda kommentaari">✏️</button>
            <button class="action-btn delete-comment-btn" data-id="${c.id}" title="Kustuta kommentaar">🗑️</button>
          </div>
        </div>
        <div class="comment-text" id="comment-text-${c.id}">${escapeHtml(c.text)}</div>
      `;

      div.querySelector('.delete-comment-btn').addEventListener('click', () => deleteComment(story.id, c.id));
      div.querySelector('.edit-comment-btn').addEventListener('click', () => startEditComment(story.id, c.id, c.text));

      commentsContainer.appendChild(div);
    });
    commentsContainer.scrollTop = commentsContainer.scrollHeight;
  } else {
    commentsContainer.innerHTML = `<p class="subtitle" style="text-align:center; padding: 1rem;">Kommentaare veel pole.</p>`;
  }

  document.getElementById('detail-modal').classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
  if (modalId === 'detail-modal') currentActiveStory = null;
}

// ─── ABIFUNKTSIOONID ───────────────────────────────────────────

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showErrorNotification(msg) {
  console.error(msg);
}
