const $ = (selector, root = document) => root.querySelector(selector);
const STORAGE_KEY = 'assignment-notifier-v1';
const today = new Date();
today.setHours(0, 0, 0, 0);
const at = (days, hour = 23, minute = 59) => {
  const date = new Date(today);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};
const seedTasks = [
  { id: crypto.randomUUID(), course: '경영정보시스템', title: '디지털 전환 사례 분석 보고서', due: at(0, 23, 59), format: 'LMS 제출', done: false, created: Date.now() - 90000 },
  { id: crypto.randomUUID(), course: '마케팅원론', title: 'STP 전략 팀 프로젝트 초안', due: at(1, 18, 0), format: '파일 제출', done: false, created: Date.now() - 60000 },
  { id: crypto.randomUUID(), course: '미시경제학', title: '수요와 공급 연습문제', due: at(3, 23, 59), format: '온라인 제출', done: false, created: Date.now() - 30000 },
  { id: crypto.randomUUID(), course: '대학글쓰기', title: '나의 관점 에세이', due: at(6, 23, 59), format: 'LMS 제출', done: true, created: Date.now() - 10000 },
];
let tasks;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  tasks = Array.isArray(saved) ? saved : seedTasks;
} catch { tasks = seedTasks; }
let activeTab = 'home';
let activeFilter = 'all';
let selectedCourse = '';
let selectedDeadline = 'tomorrow';
let notice = '';
let notificationEnabled = localStorage.getItem('assignment-notifications') === 'true';
let modalOpen = false;
let reminderTimers = [];

function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
function dateDiff(due) {
  const target = new Date(due);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(target); end.setHours(0, 0, 0, 0);
  return Math.round((end - start) / 86400000);
}
function dday(due) {
  const n = dateDiff(due);
  if (n < 0) return { label: `D+${Math.abs(n)}`, cls: 'overdue' };
  if (n === 0) return { label: 'D-DAY', cls: 'critical' };
  if (n === 1) return { label: 'D-1', cls: 'critical' };
  if (n <= 3) return { label: `D-${n}`, cls: 'warning' };
  return { label: `D-${n}`, cls: 'calm' };
}
function timeLeft(due) {
  const ms = new Date(due) - Date.now();
  if (ms <= 0) return '마감 지남';
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes}분 남음`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours}시간 남음`;
  return `${Math.floor(hours / 24)}일 ${hours % 24}시간 남음`;
}
function formatDue(due) {
  const date = new Date(due);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]}) ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function icon(name, size = 20) {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2z" transform="translate(-1 -1)"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrow: '<path d="m9 18 6-6-6-6"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 7h7"/>',
    spark: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2z"/><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}

function taskCard(task) {
  const state = dday(task.due);
  const dueDate = new Date(task.due);
  const withinThreeHours = dueDate - Date.now() > 0 && dueDate - Date.now() <= 3 * 3600000;
  return `<article class="task-card ${task.done ? 'is-done' : ''} ${!task.done && (state.cls === 'critical' || withinThreeHours) ? 'is-urgent' : ''}" data-id="${task.id}">
    <button class="check-button ${task.done ? 'checked' : ''}" data-action="toggle" aria-label="${task.done ? '완료 취소' : '과제 완료 처리'}">${task.done ? icon('check', 17) : ''}</button>
    <div class="task-content"><div class="task-topline"><span class="course-name">${escapeHtml(task.course)}</span><span class="task-type">${escapeHtml(task.format || '과제')}</span></div>
      <h3 class="task-title">${escapeHtml(task.title || '과제')}</h3>
      <div class="task-meta"><span>${icon('calendar', 14)} ${formatDue(task.due)}</span>${!task.done ? `<span>${icon('bell', 13)} 알림 설정됨</span>` : '<span class="done-label">완료했어요</span>'}</div>
    </div><div class="task-aside"><span class="dday ${state.cls}">${state.label}</span>${!task.done && state.cls === 'critical' ? `<span class="remaining">${timeLeft(task.due)}</span>` : ''}<button class="delete-button" data-action="delete" aria-label="과제 삭제">${icon('trash', 15)}</button></div>
  </article>`;
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function header() {
  const date = new Date();
  const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  return `<header class="topbar"><a class="brand" href="#home" data-tab="home"><span class="brand-mark">${icon('book', 19)}</span><span>과제알림</span></a><div class="topbar-right"><span class="semester">${date.getMonth() + 1 <= 6 ? '2026-2' : '2026-2'}학기</span><button class="avatar" data-tab="settings" aria-label="설정">민</button></div></header>
    <main class="main-content"><div class="date-line">${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 · ${weekdays[date.getDay()]}</div>`;
}
function homeView() {
  const pending = tasks.filter(t => !t.done).sort((a, b) => new Date(a.due) - new Date(b.due) || b.created - a.created);
  const completed = tasks.filter(t => t.done).sort((a, b) => b.created - a.created);
  const filtered = activeFilter === 'all' ? pending : pending.filter(t => activeFilter === 'week' ? dateDiff(t.due) <= 7 : dateDiff(t.due) === 0);
  const dueToday = pending.filter(t => dateDiff(t.due) === 0).length;
  const next = pending[0];
  let banner = '';
  if (dueToday) banner = `<section class="today-banner"><div class="banner-icon">${icon('bell', 19)}</div><div class="banner-copy"><strong>오늘 마감 과제가 ${dueToday}개 있어요</strong><span>${next ? `${escapeHtml(next.course)} · ${escapeHtml(next.title)}` : '마감 전에 확인해 주세요'}</span></div><span class="banner-count">${next ? timeLeft(next.due) : ''}</span></section>`;
  else if (next) banner = `<section class="focus-banner"><div class="focus-top"><span class="focus-kicker">다음 마감까지</span><span class="focus-dot"></span></div><div class="focus-row"><div><strong>${escapeHtml(next.title)}</strong><span>${escapeHtml(next.course)} · ${formatDue(next.due)}</span></div><b>${dday(next.due).label}</b></div></section>`;
  else banner = `<section class="focus-banner empty-focus"><span class="focus-kicker">이번 주도 차근차근</span><strong>새 과제를 등록해 보세요</strong><span>마감일을 한곳에서 편하게 관리할 수 있어요.</span></section>`;
  return `${banner}<section class="stats-row"><div class="stat-card"><span>남은 과제</span><strong>${pending.length}<small>개</small></strong><span class="stat-note">완료를 향해 한 걸음씩</span></div><div class="stat-card stat-done"><span>완료한 과제</span><strong>${completed.length}<small>개</small></strong><span class="stat-note">수고했어요! ✨</span></div></section>
    <section class="list-section"><div class="section-heading"><div><span class="eyebrow">YOUR ASSIGNMENTS</span><h1>과제 마감</h1></div><button class="text-button" data-tab="notifications">알림 보기 ${icon('arrow', 16)}</button></div>
      <div class="filter-row"><button class="filter-pill ${activeFilter === 'all' ? 'selected' : ''}" data-filter="all">전체 <span>${pending.length}</span></button><button class="filter-pill ${activeFilter === 'today' ? 'selected' : ''}" data-filter="today">오늘 마감</button><button class="filter-pill ${activeFilter === 'week' ? 'selected' : ''}" data-filter="week">이번 주</button></div>
      ${filtered.length ? `<div class="task-list">${filtered.map(taskCard).join('')}</div>` : `<div class="empty-state"><div class="empty-illustration">${icon('spark', 31)}</div><h2>${pending.length ? '이 필터에 해당하는 과제가 없어요' : '등록된 과제가 없습니다'}</h2><p>${pending.length ? '다른 마감 범위를 확인해 보세요.' : '공강 시간과 마감 기한을 여유롭게 관리해보세요.'}</p><button class="primary-button compact" data-action="open-add">${icon('plus', 17)} 과제 등록하기</button></div>`}
      ${completed.length ? `<div class="completed-section"><button class="completed-heading" data-action="toggle-completed"><span class="completed-check">${icon('check', 14)}</span><span>완료한 과제</span><span class="completed-count">${completed.length}</span><span class="completed-chevron">⌄</span></button><div class="completed-list">${completed.map(taskCard).join('')}</div></div>` : ''}
    </section>`;
}
function notificationsView() {
  const pending = tasks.filter(t => !t.done).sort((a, b) => new Date(a.due) - new Date(b.due));
  return `<section class="page-intro"><span class="eyebrow">NOTIFICATIONS</span><h1>알림함</h1><p>마감 전에 중요한 순간을 챙겨드릴게요.</p></section><section class="notification-summary"><div class="notification-icon">${icon('bell', 20)}</div><div><strong>마감 알림</strong><p>D-3 · D-1 · 3시간 전 단계별 알림</p></div><span class="setting-status ${notificationEnabled ? 'enabled' : ''}">${notificationEnabled ? '켜짐' : '앱 알림'}</span></section><h2 class="subsection-title">예정된 마감 알림</h2>${pending.length ? `<div class="reminder-list">${pending.map(t => { const d = new Date(t.due); const three = new Date(d - 3 * 3600000); const oneDay = new Date(d - 86400000); const threeDays = new Date(d - 3 * 86400000); return `<div class="reminder-item"><div class="reminder-date"><b>${String(d.getDate()).padStart(2, '0')}</b><span>${d.getMonth() + 1}월</span></div><div class="reminder-body"><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.course)} · ${formatDue(t.due)}</span><div class="reminder-chips">${[[threeDays, 'D-3'], [oneDay, 'D-1'], [three, '3시간 전']].filter(([date]) => date > Date.now()).map(([date, label]) => `<span>${label} · ${new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)}</span>`).join('') || '<span>예정된 알림 없음</span>'}</div></div></div>`; }).join('')}</div>` : `<div class="empty-state small-empty"><div class="empty-illustration">${icon('bell', 27)}</div><h2>예정된 알림이 없어요</h2><p>과제를 등록하면 마감 알림을 확인할 수 있어요.</p></div>`}<p class="notice-caption">이 기초 버전에서는 알림 일정을 화면에 표시합니다. 기기를 닫은 상태에서 푸시를 보내려면 서버 연동이 필요해요.</p>`;
}
function settingsView() {
  const courses = [...new Set(tasks.map(t => t.course))];
  return `<section class="page-intro"><span class="eyebrow">PREFERENCES</span><h1>설정</h1><p>과제알림을 나에게 맞게 설정해요.</p></section><section class="settings-group"><h2>알림</h2><div class="settings-row"><div class="settings-icon blue-icon">${icon('bell', 19)}</div><div class="settings-copy"><strong>브라우저 알림</strong><span>과제알림을 사용할 때 알림을 표시해요</span></div><button class="switch ${notificationEnabled ? 'on' : ''}" role="switch" aria-checked="${notificationEnabled}" data-action="notifications-toggle"><span></span></button></div><div class="settings-row nested-row"><div class="settings-copy"><strong>마감 전 단계별 알림</strong><span>D-3 · D-1 · 마감 3시간 전</span></div><span class="check-mark">${icon('check', 17)}</span></div></section><section class="settings-group"><h2>과목</h2><div class="course-cloud">${courses.length ? courses.map(c => `<span class="course-token">${escapeHtml(c)}</span>`).join('') : '<span class="muted-text">과제를 등록하면 과목이 여기에 보여요.</span>'}</div></section><section class="settings-group"><h2>데이터</h2><button class="settings-row full-row" data-action="export"><div class="settings-icon">↗</div><div class="settings-copy"><strong>과제 데이터 내보내기</strong><span>JSON 파일로 저장합니다</span></div>${icon('arrow', 17)}</button><button class="settings-row full-row danger-row" data-action="clear"><div class="settings-icon red-icon">${icon('trash', 17)}</div><div class="settings-copy"><strong>모든 과제 삭제</strong><span>등록된 과제를 모두 지웁니다</span></div>${icon('arrow', 17)}</button></section><div class="version-note">과제알림 · 공강맞춤 <span>버전 0.1.0</span></div>`;
}
function addModal() {
  const courses = [...new Set(tasks.map(t => t.course))].slice(0, 6);
  const minDate = new Date(); minDate.setMinutes(minDate.getMinutes() - minDate.getTimezoneOffset());
  const localInput = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const future = new Date(Date.now() + 86400000); future.setHours(23, 59, 0, 0);
  return `<div class="modal-backdrop" data-action="close-modal"><section class="add-sheet" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="sheet-handle"></div><div class="sheet-header"><div><span class="eyebrow">QUICK ADD</span><h2 id="modal-title">과제 등록</h2></div><button class="close-button" data-action="close-modal" aria-label="닫기">×</button></div><form id="task-form"><label class="field-label">과목명 <span>*</span></label><div class="course-chips">${courses.map(c => `<button type="button" class="course-chip ${selectedCourse === c ? 'selected' : ''}" data-course="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}</div><input id="course-input" class="text-input" maxlength="20" placeholder="과목명을 입력해 주세요" value="${escapeHtml(selectedCourse)}" autocomplete="off" required />
    <label class="field-label title-label" for="title-input">과제 제목 <small>선택 · 미입력 시 ‘과제’</small></label><input id="title-input" class="text-input title-input" maxlength="50" placeholder="어떤 과제인가요?" autocomplete="off" />
    <label class="field-label deadline-label">마감 일시 <span>*</span></label><div class="deadline-presets"><button type="button" class="preset ${selectedDeadline === 'today' ? 'selected' : ''}" data-deadline="today">오늘 <small>23:59</small></button><button type="button" class="preset ${selectedDeadline === 'tomorrow' ? 'selected' : ''}" data-deadline="tomorrow">내일 <small>23:59</small></button><button type="button" class="preset ${selectedDeadline === 'custom' ? 'selected' : ''}" data-deadline="custom">직접 선택</button></div><input id="due-input" class="text-input date-input ${selectedDeadline === 'custom' ? '' : 'visually-hidden'}" type="datetime-local" value="${selectedDeadline === 'today' ? new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,10) + 'T23:59' : selectedDeadline === 'tomorrow' ? `${future.getFullYear()}-${String(future.getMonth()+1).padStart(2,'0')}-${String(future.getDate()).padStart(2,'0')}T23:59` : localInput}" min="${minDate.toISOString().slice(0,16)}" required />
    <div class="reminder-info">${icon('bell', 16)} <span>마감 <b>D-3 · D-1 · 3시간 전</b> 알림을 설정해요</span></div><button class="primary-button save-button" type="submit" disabled>${icon('plus', 19)} 과제 저장하기</button></form></section></div>`;
}
function render() {
  const view = activeTab === 'home' ? homeView() : activeTab === 'notifications' ? notificationsView() : settingsView();
  $('#app').innerHTML = `${header()}${view}</main><nav class="bottom-nav" aria-label="주 메뉴"><button class="nav-item ${activeTab === 'home' ? 'active' : ''}" data-tab="home">${icon('home', 21)}<span>홈</span></button><button class="nav-add" data-action="open-add" aria-label="과제 등록">${icon('plus', 24)}</button><button class="nav-item ${activeTab === 'notifications' ? 'active' : ''}" data-tab="notifications">${icon('bell', 21)}<span>알림함</span></button><button class="nav-item ${activeTab === 'settings' ? 'active' : ''}" data-tab="settings">${icon('settings', 21)}<span>설정</span></button></nav>${notice ? `<div class="toast">${notice}</div>` : ''}${modalOpen ? addModal() : ''}`;
  if ($('#course-input')) validateForm();
  scheduleReminders();
}
function validateForm() {
  const button = $('.save-button');
  if (!button) return;
  const course = $('#course-input').value.trim();
  const due = new Date($('#due-input').value);
  button.disabled = !course || !$('#due-input').value || Number.isNaN(+due) || due <= new Date();
}
function openModal() { selectedCourse = ''; selectedDeadline = 'tomorrow'; modalOpen = true; render(); setTimeout(() => $('#course-input')?.focus(), 30); }
function toast(message) { notice = message; render(); setTimeout(() => { notice = ''; render(); }, 2400); }
function refresh() { persist(); render(); }
function scheduleReminders() {
  reminderTimers.forEach(clearTimeout);
  reminderTimers = [];
  if (!notificationEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  const maxDelay = 2147480000;
  for (const task of tasks.filter(item => !item.done)) {
    const due = new Date(task.due).getTime();
    for (const [offset, label] of [[3 * 86400000, '3일'], [86400000, '하루'], [3 * 3600000, '3시간']]) {
      const fireAt = due - offset;
      if (fireAt <= Date.now() || fireAt - Date.now() > maxDelay) continue;
      const timer = setTimeout(() => {
        if (!tasks.some(item => item.id === task.id && !item.done)) return;
        const hours = Math.max(1, Math.ceil((due - Date.now()) / 3600000));
        const remaining = hours >= 24 ? `${Math.ceil(hours / 24)}일` : `${hours}시간`;
        const notification = new Notification(`${task.course} 마감 알림`, { body: `${task.title} 마감까지 ${remaining} 남았습니다.`, tag: `${task.id}-${label}`, icon: '/favicon.ico' });
        notification.onclick = () => { window.focus(); notification.close(); };
      }, fireAt - Date.now());
      reminderTimers.push(timer);
    }
  }
}
function setDeadline(type) {
  selectedDeadline = type;
  const input = $('#due-input');
  if (type === 'today') { const d = new Date(); input.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T23:59`; }
  else if (type === 'tomorrow') { const d = new Date(); d.setDate(d.getDate()+1); input.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T23:59`; }
  input.classList.toggle('visually-hidden', type !== 'custom');
  document.querySelectorAll('.preset').forEach(el => el.classList.toggle('selected', el.dataset.deadline === type));
  validateForm();
}

document.addEventListener('click', async event => {
  const target = event.target.closest('button, [data-action="close-modal"]');
  if (!target) return;
  if (target.dataset.action === 'open-add') { openModal(); return; }
  if (target.dataset.action === 'close-modal') { if (target.classList.contains('modal-backdrop') && event.target.closest('.add-sheet')) return; modalOpen = false; render(); return; }
  if (target.dataset.tab) { activeTab = target.dataset.tab; render(); return; }
  if (target.dataset.filter) { activeFilter = target.dataset.filter; render(); return; }
  if (target.dataset.course) { selectedCourse = target.dataset.course; $('#course-input').value = selectedCourse; document.querySelectorAll('.course-chip').forEach(el => el.classList.toggle('selected', el.dataset.course === selectedCourse)); validateForm(); return; }
  if (target.dataset.deadline) { setDeadline(target.dataset.deadline); return; }
  if (target.dataset.action === 'toggle' || target.dataset.action === 'delete') {
    const card = target.closest('.task-card'); const task = tasks.find(t => t.id === card?.dataset.id); if (!task) return;
    if (target.dataset.action === 'toggle') task.done = !task.done; else tasks = tasks.filter(t => t.id !== task.id);
    refresh(); return;
  }
  if (target.dataset.action === 'toggle-completed') { $('.completed-list')?.classList.toggle('collapsed'); target.classList.toggle('collapsed'); return; }
  if (target.dataset.action === 'notifications-toggle') {
    if (!notificationEnabled && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { toast('브라우저 알림 권한을 허용해 주세요'); return; }
    }
    notificationEnabled = !notificationEnabled; localStorage.setItem('assignment-notifications', String(notificationEnabled)); render(); return;
  }
  if (target.dataset.action === 'export') {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '과제알림-과제목록.json'; a.click(); URL.revokeObjectURL(a.href); toast('과제 데이터를 저장했어요'); return;
  }
  if (target.dataset.action === 'clear') { if (confirm('등록된 과제를 모두 삭제할까요?')) { tasks = []; refresh(); toast('모든 과제를 삭제했어요'); } }
});
document.addEventListener('input', event => { if (event.target.id === 'course-input') { selectedCourse = event.target.value; document.querySelectorAll('.course-chip').forEach(el => el.classList.toggle('selected', el.dataset.course === selectedCourse)); validateForm(); } if (event.target.id === 'due-input') { selectedDeadline = 'custom'; document.querySelectorAll('.preset').forEach(el => el.classList.toggle('selected', el.dataset.deadline === 'custom')); validateForm(); } });
document.addEventListener('submit', event => {
  if (event.target.id !== 'task-form') return;
  event.preventDefault();
  const course = $('#course-input').value.trim(); const due = new Date($('#due-input').value);
  if (!course || Number.isNaN(+due) || due <= new Date()) return;
  tasks.push({ id: crypto.randomUUID(), course, title: $('#title-input').value.trim() || '과제', due: due.toISOString(), format: 'LMS 제출', done: false, created: Date.now() });
  modalOpen = false; persist(); activeTab = 'home'; activeFilter = 'all'; render(); toast('과제를 등록했어요. 마감 전까지 챙겨드릴게요!');
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && modalOpen) { modalOpen = false; render(); } });
render();
