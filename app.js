// ============================================================
// StudyTogether — app logic (plain JS, no framework)
// ============================================================

const SESSION_KEY = 'studyTimerSession';
const el = (id) => document.getElementById(id);

const state = {
  roomCode: null,
  mySlot: null,       // 'userA' or 'userB'
  friendSlot: null,
  room: { userA: null, userB: null },
  logs: {},
  activeTab: 'mine',  // 'mine' | 'friend'
  dateFilter: ''
};

let pendingStop = null; // { startedAt, endedAt } while the note modal is open

// ====== Init ======
document.addEventListener('DOMContentLoaded', () => {
  const saved = loadSession();
  if (saved) {
    state.roomCode = saved.roomCode;
    state.mySlot = saved.slot;
    state.friendSlot = saved.slot === 'userA' ? 'userB' : 'userA';
    enterDashboard();
  } else {
    showScreen('landing-screen');
  }

  el('create-room-btn').addEventListener('click', handleCreateRoom);
  el('join-room-btn').addEventListener('click', handleJoinRoom);
  el('continue-to-dashboard-btn').addEventListener('click', enterDashboard);
  el('copy-code-btn').addEventListener('click', copyRoomCode);
  el('leave-room-btn').addEventListener('click', leaveRoom);
  el('toggle-timer-btn').addEventListener('click', toggleMyTimer);

  el('date-filter').addEventListener('change', (e) => {
    state.dateFilter = e.target.value;
    renderLogs();
  });
  el('clear-filter-btn').addEventListener('click', () => {
    el('date-filter').value = '';
    state.dateFilter = '';
    renderLogs();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });

  el('save-note-btn').addEventListener('click', () => finishStop(false));
  el('skip-note-btn').addEventListener('click', () => finishStop(true));

  setInterval(tickTimers, 1000); // drives the live-counting display
});

// ====== Screens ======
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  el(id).classList.remove('hidden');
}
function showError(msg) { el('landing-error').textContent = msg; }

// ====== Session persistence (this is the "no login" identity system) ======
function saveSession(roomCode, slot) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, slot }));
}
function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function leaveRoom() {
  localStorage.removeItem(SESSION_KEY);
  location.reload();
}

// ====== Create / Join room ======
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O/1/I removed to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function tryGenerateUniqueCode(callback, attempts = 0) {
  const code = generateRoomCode();
  db.ref('rooms/' + code).once('value').then(snap => {
    if (snap.exists() && attempts < 5) {
      tryGenerateUniqueCode(callback, attempts + 1);
    } else {
      callback(code);
    }
  }).catch(err => showError('Could not reach the database: ' + err.message));
}

function handleCreateRoom() {
  const name = el('create-name').value.trim();
  if (!name) return showError('Please enter your name.');
  showError('');

  tryGenerateUniqueCode(code => {
    db.ref('rooms/' + code).set({
      createdAt: Date.now(),
      userA: { name, isRunning: false, startedAt: null }
    }).then(() => {
      state.roomCode = code;
      state.mySlot = 'userA';
      state.friendSlot = 'userB';
      saveSession(code, 'userA');
      el('room-code-display').textContent = code;
      showScreen('code-screen');
    }).catch(err => showError('Could not create room: ' + err.message));
  });
}

function handleJoinRoom() {
  const code = el('join-code').value.trim().toUpperCase();
  const name = el('join-name').value.trim();
  if (!code || !name) return showError('Please enter a room code and your name.');
  showError('');

  const roomRef = db.ref('rooms/' + code);
  roomRef.once('value').then(snap => {
    if (!snap.exists()) return showError('Room not found. Check the code and try again.');
    const data = snap.val();

    let slot = null;
    if (!data.userA) slot = 'userA';
    else if (!data.userB) slot = 'userB';
    else return showError('This room already has two people in it.');

    roomRef.child(slot).set({ name, isRunning: false, startedAt: null }).then(() => {
      state.roomCode = code;
      state.mySlot = slot;
      state.friendSlot = slot === 'userA' ? 'userB' : 'userA';
      saveSession(code, slot);
      enterDashboard();
    }).catch(err => showError('Could not join room: ' + err.message));
  }).catch(err => showError('Could not reach the database: ' + err.message));
}

function copyRoomCode() {
  navigator.clipboard.writeText(state.roomCode);
}

// ====== Dashboard ======
function enterDashboard() {
  showScreen('dashboard-screen');
  el('header-room-code').textContent = state.roomCode;
  attachRoomListener();
  attachLogsListener();
}

function attachRoomListener() {
  db.ref('rooms/' + state.roomCode).on('value', snap => {
    const data = snap.val() || {};
    state.room.userA = data.userA || null;
    state.room.userB = data.userB || null;
    renderTimers();
  });
}

function renderTimers() {
  const mine = state.room[state.mySlot];
  const friend = state.room[state.friendSlot];

  el('my-timer-name').textContent = mine ? `My Timer (${mine.name})` : 'My Timer';
  el('friend-timer-name').textContent = friend ? `Friend Timer (${friend.name})` : 'Friend Timer';

  el('friend-timer-status').textContent = friend
    ? (friend.isRunning ? 'Studying now' : 'Not studying')
    : 'Waiting for friend to join...';
  el('my-timer-status').textContent = (mine && mine.isRunning) ? 'Studying now' : 'Not studying';

  el('toggle-timer-btn').textContent = (mine && mine.isRunning) ? 'Stop Studying' : 'Start Studying';

  tickTimers();
}

function tickTimers() {
  updateTimerDisplay('my-timer-display', state.room[state.mySlot]);
  updateTimerDisplay('friend-timer-display', state.room[state.friendSlot]);
}

function updateTimerDisplay(elementId, userData) {
  const node = el(elementId);
  if (!node) return;
  if (userData && userData.isRunning && userData.startedAt) {
    node.textContent = formatDuration(Date.now() - userData.startedAt);
  } else {
    node.textContent = '00:00:00';
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ====== Start / Stop (only ever controls YOUR OWN timer) ======
function toggleMyTimer() {
  const mine = state.room[state.mySlot];
  const myRef = db.ref('rooms/' + state.roomCode + '/' + state.mySlot);

  if (!mine || !mine.isRunning) {
    myRef.update({ isRunning: true, startedAt: Date.now() });
  } else {
    const startedAt = mine.startedAt;
    const endedAt = Date.now();
    // Stop the clock immediately for both users, then collect the note.
    myRef.update({ isRunning: false, startedAt: null });
    pendingStop = { startedAt, endedAt };
    openNoteModal(endedAt - startedAt);
  }
}

function openNoteModal(durationMs) {
  el('modal-duration-text').textContent = 'Session length: ' + formatDuration(durationMs);
  el('note-input').value = '';
  el('note-modal').classList.remove('hidden');
}

function finishStop(skipped) {
  if (!pendingStop) return;
  const note = skipped ? '' : el('note-input').value.trim();
  const type = document.querySelector('input[name="session-type"]:checked').value;

  const entries = splitByMidnight(pendingStop.startedAt, pendingStop.endedAt);
  const logsRef = db.ref('rooms/' + state.roomCode + '/logs');
  entries.forEach(entry => {
    logsRef.push({
      owner: state.mySlot,
      sessionId: entry.sessionId,
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      durationMinutes: entry.durationMinutes,
      type,
      note,
      createdAt: Date.now()
    });
  });

  pendingStop = null;
  el('note-modal').classList.add('hidden');
}

// ====== Midnight roll-over split ======
function pad(n) { return String(n).padStart(2, '0'); }

function dateKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function splitByMidnight(start, end) {
  const sessionId = 's' + start + Math.random().toString(36).slice(2, 7);
  const entries = [];
  let segStart = start;

  while (true) {
    const d = new Date(segStart);
    const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
    if (nextMidnight >= end) {
      entries.push(makeEntry(segStart, end, sessionId));
      break;
    }
    entries.push(makeEntry(segStart, nextMidnight, sessionId));
    segStart = nextMidnight;
  }
  return entries;
}

function makeEntry(s, e, sessionId) {
  return {
    sessionId,
    date: dateKey(s),
    startTime: s,
    endTime: e,
    durationMinutes: Math.round((e - s) / 60000)
  };
}

// ====== Logs, tabs, date filter, totals ======
function attachLogsListener() {
  db.ref('rooms/' + state.roomCode + '/logs').on('value', snap => {
    state.logs = snap.val() || {};
    renderLogs();
  });
}

function setActiveTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderLogs();
}

function getFilteredLogs() {
  const owner = state.activeTab === 'mine' ? state.mySlot : state.friendSlot;
  let list = Object.values(state.logs).filter(l => l.owner === owner);
  if (state.dateFilter) list = list.filter(l => l.date === state.dateFilter);
  list.sort((a, b) => a.startTime - b.startTime); // ascending, so "Log 1" is always the earliest
  return list;
}

function renderLogs() {
  const list = getFilteredLogs();
  const container = el('logs-list');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state">No sessions yet — tap Start to begin your first one.</div>';
  } else {
    // Show most recent first, but keep numbering based on chronological order.
    [...list].reverse().forEach((entry) => {
      const logNumber = list.indexOf(entry) + 1;
      const div = document.createElement('div');
      div.className = 'log-entry';
      const timeRange = formatTime(entry.startTime) + ' \u2013 ' + formatTime(entry.endTime);
      div.innerHTML = `
        <div class="log-top"><span>Log ${logNumber} \u00b7 ${entry.date}</span><span>${formatMinutes(entry.durationMinutes)}</span></div>
        <div class="log-meta">${escapeHtml(entry.note || '(no note)')}</div>
        <div class="log-meta">${timeRange} \u00b7 ${entry.type === 'break' ? 'Break' : 'Study'}</div>
      `;
      container.appendChild(div);
    });
  }

  renderTotal(list);
}

function renderTotal(list) {
  const totalMinutes = list.reduce((sum, l) => sum + l.durationMinutes, 0);
  el('total-banner').textContent = 'Total: ' + formatMinutes(totalMinutes);
}

function formatMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function formatTime(ms) {
  const d = new Date(ms);
  let h = d.getHours();
  const m = pad(d.getMinutes());
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}