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

// ====== Session persistence ======
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
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function generateUniqueCode(attempts = 0) {
  const code = generateRoomCode();
  const snap = await db.ref('rooms/' + code).once('value');
  if (snap.exists() && attempts < 5) return generateUniqueCode(attempts + 1);
  return code;
}

async function handleCreateRoom() {
  const name = el('create-name').value.trim();
  if (!name) return showError('Please enter your name.');
  showError('');
  setButtonsDisabled(true);
  showLoading('Creating your room...');

  try {
    const code = await generateUniqueCode();
    await db.ref('rooms/' + code).set({
      createdAt: Date.now(),
      userA: { name, isRunning: false, startedAt: null }
    });
    state.roomCode = code;
    state.mySlot = 'userA';
    state.friendSlot = 'userB';
    saveSession(code, 'userA');
    el('room-code-display').textContent = code;
    showScreen('code-screen');
  } catch (err) {
    showError('Could not create room: ' + err.message);
  } finally {
    setButtonsDisabled(false);
    hideLoading();
  }
}

async function handleJoinRoom() {
  const code = el('join-code').value.trim().toUpperCase();
  const name = el('join-name').value.trim();
  if (!code || !name) return showError('Please enter a room code and your name.');
  showError('');
  setButtonsDisabled(true);
  showLoading('Joining room...');

  try {
    const roomRef = db.ref('rooms/' + code);
    const snap = await roomRef.once('value');
    if (!snap.exists()) { showError('Room not found. Check the code and try again.'); return; }

    const data = snap.val();
    let slot = null;
    if (!data.userA) slot = 'userA';
    else if (!data.userB) slot = 'userB';
    else { showError('This room already has two people in it.'); return; }

    await roomRef.child(slot).set({ name, isRunning: false, startedAt: null });
    state.roomCode = code;
    state.mySlot = slot;
    state.friendSlot = slot === 'userA' ? 'userB' : 'userA';
    saveSession(code, slot);
    enterDashboard();
  } catch (err) {
    showError('Could not join room: ' + err.message);
  } finally {
    setButtonsDisabled(false);
    hideLoading();
  }
}

function setButtonsDisabled(disabled) {
  el('create-room-btn').disabled = disabled;
  el('join-room-btn').disabled = disabled;
}

function showLoading(text) {
  el('loading-text').textContent = text;
  el('loading-overlay').classList.remove('hidden');
}
function hideLoading() {
  el('loading-overlay').classList.add('hidden');
}

function copyRoomCode() {
  navigator.clipboard.writeText(state.roomCode);
}

// ====== Dashboard ======
let roomLoaded = false;
let logsLoaded = false;

function enterDashboard() {
  showScreen('dashboard-screen');
  el('header-room-code').textContent = state.roomCode;
  roomLoaded = false;
  logsLoaded = false;
  showLoading('Loading your room...');
  attachRoomListener();
  attachLogsListener();
}

function maybeHideDashboardLoading() {
  if (roomLoaded && logsLoaded) hideLoading();
}

function attachRoomListener() {
  db.ref('rooms/' + state.roomCode).on('value', snap => {
    const data = snap.val() || {};
    state.room.userA = data.userA || null;
    state.room.userB = data.userB || null;
    renderTimers();
    roomLoaded = true;
    maybeHideDashboardLoading();
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

function computeElapsedMs(userData) {
  if (!userData) return 0;
  const base = userData.accumulatedMs || 0;
  return (userData.isRunning && userData.startedAt) ? base + (Date.now() - userData.startedAt) : base;
}

function updateTimerDisplay(elementId, userData) {
  const node = el(elementId);
  if (!node) return;
  node.textContent = formatDuration(computeElapsedMs(userData));
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ====== Start / Stop ======
function toggleMyTimer() {
  const mine = state.room[state.mySlot];
  const myRef = db.ref('rooms/' + state.roomCode + '/' + state.mySlot);
  const today = dateKey(Date.now());

  if (!mine || !mine.isRunning) {
    const carryOverMs = (mine && mine.accumulatedDate === today) ? (mine.accumulatedMs || 0) : 0;
    myRef.update({ isRunning: true, startedAt: Date.now(), accumulatedMs: carryOverMs, accumulatedDate: today });
  } else {
    const startedAt = mine.startedAt;
    const endedAt = Date.now();
    const segmentMs = endedAt - startedAt;
    const priorAccumulated = (mine.accumulatedDate === today) ? (mine.accumulatedMs || 0) : 0;
    const newAccumulated = priorAccumulated + segmentMs;

    myRef.update({ isRunning: false, startedAt: null, accumulatedMs: newAccumulated, accumulatedDate: today });

    pendingStop = { startedAt, endedAt };
    openNoteModal(segmentMs);
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
      durationSeconds: entry.durationSeconds,
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
    durationSeconds: Math.round((e - s) / 1000)
  };
}

// ====== Logs, tabs, date filter, totals ======
function attachLogsListener() {
  db.ref('rooms/' + state.roomCode + '/logs').on('value', snap => {
    state.logs = snap.val() || {};
    renderLogs();
    logsLoaded = true;
    maybeHideDashboardLoading();
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
  list.sort((a, b) => a.startTime - b.startTime);
  return list;
}

function renderLogs() {
  const list = getFilteredLogs();
  const container = el('logs-list');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state">No sessions yet — tap Start to begin your first one.</div>';
  } else {
    [...list].reverse().forEach((entry) => {
      const logNumber = list.indexOf(entry) + 1;
      const div = document.createElement('div');
      div.className = 'log-entry';
      const timeRange = formatTime(entry.startTime) + ' \u2013 ' + formatTime(entry.endTime);
      
      // Updated HTML structure to include the read more/less logic
      div.innerHTML = `
        <div class="log-top">
          <span class="log-title">Log ${logNumber}</span>
          <span class="log-date">${entry.date}</span>
          <span class="log-duration">${formatHMS(entry.durationSeconds)}</span>
        </div>
        <div class="log-note-wrapper">
          <div class="log-note">${escapeHtml(entry.note || '(no note)')}</div>
          <button class="link-btn read-more-btn hidden" style="padding: 0; margin-top: 4px; font-size: 13px; min-height: auto;">Read more</button>
        </div>
        <div class="log-meta">${timeRange} \u00b7 ${entry.type === 'break' ? 'Break' : 'Study'}</div>
      `;
      container.appendChild(div);

      // Handle the Read More click logic
      const noteEl = div.querySelector('.log-note');
      const btnEl = div.querySelector('.read-more-btn');

      btnEl.addEventListener('click', () => {
        noteEl.classList.toggle('expanded');
        btnEl.textContent = noteEl.classList.contains('expanded') ? 'Read less' : 'Read more';
      });
    });

    // Check heights AFTER appending to DOM to see if text is overflowing
    setTimeout(() => {
      container.querySelectorAll('.log-entry').forEach(div => {
        const noteEl = div.querySelector('.log-note');
        const btnEl = div.querySelector('.read-more-btn');
        // If the actual scrollable height is taller than the visible clamped height, show the button
        if (noteEl.scrollHeight > noteEl.clientHeight) {
          btnEl.classList.remove('hidden');
        }
      });
    }, 0);
  }

  renderTotal(list);
}

function renderTotal(list) {
  const totalSeconds = list.reduce((sum, l) => sum + (l.durationSeconds || 0), 0);
  el('total-banner').textContent = 'Total: ' + formatHMS(totalSeconds);
}

function formatHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
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