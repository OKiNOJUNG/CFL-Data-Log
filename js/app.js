/**
 * Mitr Phol Fermentation Lab Tracker - Core Application Logic
 * Implements Domain Logic, Auth, Permissions, Calculations, Charting, Custom Sandbox & Presentation.
 */

// Application State
const state = {
  isLoggedIn: false,
  currentUser: null,
  users: JSON.parse(localStorage.getItem('mitr_users')) || window.INITIAL_USERS,
  projects: JSON.parse(localStorage.getItem('mitr_projects')) || window.INITIAL_PROJECTS,
  samples: (() => {
    const raw = JSON.parse(localStorage.getItem('mitr_samples')) || window.SEED_SAMPLES_220326;
    const migrated = raw.map(s => {
      if (!s.projectId) s.projectId = 'proj_220326';
      return s;
    });
    const keySet = new Set(migrated.map(s => `${s.projectId}_${s.tank}_${s.time}`));
    window.SEED_SAMPLES_220326.forEach(s => {
      const k = `${s.projectId}_${s.tank}_${s.time}`;
      if (!keySet.has(k)) migrated.push(s);
    });
    return migrated;
  })(),
  auditLogs: JSON.parse(localStorage.getItem('mitr_logs')) || window.INITIAL_LOGS,
  currentProjectId: 'proj_220326',
  selectedTank: 'PF',
  selectedTime: 82,
  cellMode: 'numpad', // 'numpad' or 'tally'
  activeSeries: 'total', // 'total', 'budding', 'dead'
  tallyCounts: {
    total: [20, 23, 45, 77, 24],
    budding: [2, 3, 5, 8, 3],
    dead: [1, 0, 2, 1, 1],
    dilution: 10
  },
  customSeries: [], // Sandbox multi-axis series
  charts: {},
  slideIndex: 1,
  totalSlides: 5,
  dataRecordSort: { field: 'tank', dir: 'asc' }
};

// Save state to LocalStorage
function persistState() {
  localStorage.setItem('mitr_users', JSON.stringify(state.users));
  localStorage.setItem('mitr_projects', JSON.stringify(state.projects));
  localStorage.setItem('mitr_samples', JSON.stringify(state.samples));
  localStorage.setItem('mitr_logs', JSON.stringify(state.auditLogs));
}

// Check Edit Permission (ADR-0002 & ADR-0003)
function canEditCurrentProject() {
  if (!state.currentUser) return false;
  const project = state.projects.find(p => p.id === state.currentProjectId);
  if (!project) return false;
  return state.currentUser.role === 'admin' || project.ownerId === state.currentUser.uid;
}

// Log an action to Audit Trail with Snapshot support for Restore (Requirement 3)
function logAction(action, details, snapshot = null) {
  const newLog = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    timestamp: new Date().toISOString(),
    userName: state.currentUser ? state.currentUser.displayName : 'System',
    action: action,
    details: details,
    snapshot: snapshot,
    restored: false
  };
  state.auditLogs.unshift(newLog);
  persistState();
  renderAuditLogs();
}

// ==========================================================================
// Initialization & Authentication
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupMicroscopeInputs();
  setupHPLCInputs();
  setupPresentationDeck();

  // Check saved session or show login overlay
  const savedUid = localStorage.getItem('mitr_auth_uid');
  if (savedUid) {
    const user = state.users.find(u => u.uid === savedUid);
    if (user) {
      applyLoginSuccess(user);
      return;
    }
  }

  showLoginOverlay(true);
});

function showLoginOverlay(show) {
  const overlay = document.getElementById('login-modal-overlay');
  if (overlay) {
    overlay.style.display = show ? 'flex' : 'none';
  }
}

window.handleLoginSubmit = function(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  const foundUser = state.users.find(u => u.email === email && u.password === password);
  if (foundUser) {
    applyLoginSuccess(foundUser);
    window.labAudio.playSuccess();
    showToast(`ยินดีต้อนรับ ${foundUser.displayName}`, 'success');
  } else {
    window.labAudio.playWarning();
    Swal.fire({
      icon: 'error',
      title: 'เข้าสู่ระบบไม่สำเร็จ',
      text: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
      confirmButtonColor: '#0f3d7a'
    });
  }
};

function applyLoginSuccess(user) {
  state.currentUser = user;
  state.isLoggedIn = true;
  localStorage.setItem('mitr_auth_uid', user.uid);

  // Update profile header
  document.getElementById('current-user-name').textContent = user.displayName;
  document.getElementById('current-user-avatar').textContent = user.displayName.charAt(0);
  const roleBadge = document.getElementById('current-user-role');
  roleBadge.textContent = user.role.toUpperCase();
  roleBadge.className = `user-role-badge role-${user.role}`;

  // Hide login overlay
  showLoginOverlay(false);

  // Role-based Navigation Tabs Visibility: Hide Settings & Data Log if not admin
  updateNavTabVisibility();

  // Find user's accessible projects
  const myProjects = state.projects.filter(p => user.role === 'admin' || p.ownerId === user.uid);
  if (myProjects.length > 0) {
    state.currentProjectId = myProjects[0].id;
  }

  renderProjectSelector();
  renderTankMatrix();
  renderAllDataViews();
  loadSampleDataForCurrentTank();
}

window.handleLogout = function() {
  Swal.fire({
    title: 'ออกจากระบบ?',
    text: 'ท่านต้องการออกจากระบบห้องแล็บใช่หรือไม่',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'ออกจากระบบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#991b1b',
    cancelButtonColor: '#94a3b8'
  }).then((res) => {
    if (res.isConfirmed) {
      state.isLoggedIn = false;
      state.currentUser = null;
      localStorage.removeItem('mitr_auth_uid');
      window.labAudio.playClick();
      showLoginOverlay(true);
      showToast('ออกจากระบบเรียบร้อย', 'info');
    }
  });
};

function updateNavTabVisibility() {
  const isAdmin = state.currentUser && state.currentUser.role === 'admin';
  const logsTab = document.getElementById('tab-btn-logs');
  const settingsTab = document.getElementById('tab-btn-settings');

  if (logsTab) logsTab.style.display = isAdmin ? 'inline-flex' : 'none';
  if (settingsTab) settingsTab.style.display = isAdmin ? 'inline-flex' : 'none';

  // If a non-admin was viewing logs or settings, switch back to projects tab
  const activeTab = document.querySelector('.tab-btn.active');
  if (!isAdmin && activeTab && (activeTab.id === 'tab-btn-logs' || activeTab.id === 'tab-btn-settings')) {
    document.querySelector('.tab-btn[data-target="sec-projects"]').click();
  }
}

// Navigation Tabs
function setupNavigation() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-target');
      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        targetSection.classList.add('active');
      }

      window.labAudio.playClick();

      if (targetId === 'sec-projects') {
        renderGanttTimeline();
      } else if (targetId === 'sec-entry') {
        loadSampleDataForCurrentTank();
      } else if (targetId === 'sec-analytics') {
        renderAnalyticsCharts();
        renderCustomChart();
      } else if (targetId === 'sec-optimizer') {
        renderOptimizerView();
      } else if (targetId === 'sec-data-records') {
        syncDataRecordProjectFilter();
        renderDataRecordTable();
      } else if (targetId === 'sec-settings') {
        renderUserManagementTable();
      }
    });
  });
}

// Update UI banner when viewing other researcher's project
function updatePermissionBanner() {
  const banner = document.getElementById('permission-notice-banner');
  const editable = canEditCurrentProject();
  const project = state.projects.find(p => p.id === state.currentProjectId);

  if (banner && project) {
    if (editable) {
      banner.style.display = 'none';
      enableFormInputs(true);
    } else {
      banner.style.display = 'flex';
      banner.innerHTML = `
        <span style="font-size: 1.2rem;">🔒</span>
        <div>
          <strong>โหมดอ่านอย่างเดียว (Read-Only):</strong> 
          งานวิจัยนี้สร้างโดย <u>${project.ownerName}</u> ท่านสามารถเปิดดูผลและกราฟได้ แต่ไม่สามารถแก้ไขหรือลบข้อมูลได้
        </div>
      `;
      enableFormInputs(false);
    }
  }
}

function enableFormInputs(enabled) {
  const inputs = document.querySelectorAll('#sec-entry input, #sec-entry button.action-save');
  inputs.forEach(el => {
    if (!el.classList.contains('tank-pill-btn') && !el.classList.contains('mode-switch-btn')) {
      el.disabled = !enabled;
    }
  });

  const editHeaderBtn = document.getElementById('btn-toggle-edit-header');
  if (editHeaderBtn) editHeaderBtn.style.display = enabled ? 'inline-flex' : 'none';
}

// Admin Researcher Filter Handler (Requirement 8)
window.handleAdminResearcherFilterChange = function() {
  const researcherVal = document.getElementById('admin-researcher-filter')?.value || 'ALL';
  renderProjectSelector(researcherVal);
};

// Project Selection Dropdown: ONLY SHOW USER'S OWN PROJECTS (Admin sees separated researcher filter)
function renderProjectSelector(adminResearcherFilter = null) {
  const selector = document.getElementById('project-select');
  if (!selector) return;

  const isAdmin = state.currentUser && state.currentUser.role === 'admin';
  const adminFilterGroup = document.getElementById('admin-researcher-filter-group');
  const adminFilterSelect = document.getElementById('admin-researcher-filter');

  let filteredProjects = [];

  if (isAdmin && adminFilterGroup && adminFilterSelect) {
    adminFilterGroup.style.display = 'flex';
    
    // Populate distinct researchers in admin filter
    const currentFilterVal = adminResearcherFilter || adminFilterSelect.value || 'ALL';
    const distinctResearchers = [];
    state.projects.forEach(p => {
      if (!distinctResearchers.some(r => r.uid === p.ownerId)) {
        distinctResearchers.push({ uid: p.ownerId, name: p.ownerName });
      }
    });

    adminFilterSelect.innerHTML = `
      <option value="ALL">👥 นักวิจัยทุกคน (All)</option>
      ${distinctResearchers.map(r => `
        <option value="${r.uid}" ${r.uid === currentFilterVal ? 'selected' : ''}>${r.name}</option>
      `).join('')}
    `;
    adminFilterSelect.value = currentFilterVal;

    if (currentFilterVal !== 'ALL') {
      filteredProjects = state.projects.filter(p => p.ownerId === currentFilterVal);
    } else {
      filteredProjects = state.projects;
    }
  } else {
    if (adminFilterGroup) adminFilterGroup.style.display = 'none';
    filteredProjects = state.projects.filter(p => p.ownerId === state.currentUser?.uid);
  }

  if (filteredProjects.length === 0) {
    selector.innerHTML = '<option value="">(ไม่มีงานวิจัย)</option>';
    return;
  }

  // Ensure currentProjectId is valid in filtered list
  if (!filteredProjects.some(p => p.id === state.currentProjectId)) {
    state.currentProjectId = filteredProjects[0].id;
  }

  selector.innerHTML = filteredProjects.map(p => {
    const isOwner = p.ownerId === state.currentUser?.uid;
    const ownerLabel = isAdmin ? ` [${p.ownerName}]` : '';
    return `<option value="${p.id}" ${p.id === state.currentProjectId ? 'selected' : ''}>
      ${p.experimentNo} (${p.batchMediumNo}) - D=${p.conditionParams.dilutionRateD}${ownerLabel}
    </option>`;
  }).join('');

  selector.onchange = (e) => {
    state.currentProjectId = e.target.value;
    onActiveProjectChanged();
    showToast('เปลี่ยนโปรเจกต์เรียบร้อย', 'info');
  };

  onActiveProjectChanged(false);
}

// Default 82h continuous sampling timepoints
const DEFAULT_TIMEPOINTS = [0, 12, 16, 18, 22, 34, 40, 46, 58, 64, 70, 82];

// Helper: Get project sampling timepoints as sorted number array
function getProjectTimepoints(project) {
  if (!project) {
    project = state.projects.find(p => p.id === state.currentProjectId);
  }
  if (project && Array.isArray(project.timepoints) && project.timepoints.length > 0) {
    return project.timepoints.slice().sort((a, b) => a - b);
  }
  return DEFAULT_TIMEPOINTS.slice();
}

// Render options into <select id="input-timepoint">
function renderTimepointOptions(selectId = 'input-timepoint', selectedValue = null) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  const timepoints = getProjectTimepoints(p);

  const prevVal = selectedValue !== null ? selectedValue : (parseFloat(select.value) || state.selectedTime || timepoints[0]);
  const activeVal = timepoints.includes(prevVal) ? prevVal : timepoints[0];

  select.innerHTML = timepoints.map(t => `
    <option value="${t}" ${t === activeVal ? 'selected' : ''}>${t} hr</option>
  `).join('');

  state.selectedTime = activeVal;
}

// Render timepoint badges in Experiment Header view mode
function renderHeaderTimepointsBadges() {
  const container = document.getElementById('header-timepoints-badge-group');
  if (!container) return;
  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  const timepoints = getProjectTimepoints(p);
  container.innerHTML = timepoints.map(t => `
    <span class="badge badge-navy" style="font-size: 0.75rem; padding: 3px 8px; font-weight: 600;">${t}h</span>
  `).join('');
}

// Custom sampling timepoint modal (+ เพิ่มเวลา in Lab Entry)
window.openAddCustomTimepointModal = function() {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์แก้ไข', text: 'ท่านไม่ใช่เจ้าของงานวิจัยนี้' });
    return;
  }
  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p) return;

  const currentTimes = getProjectTimepoints(p);

  Swal.fire({
    title: '⏱️ เพิ่มจุดเวลาจัดเก็บตัวอย่าง',
    html: `
      <div style="text-align: left; font-size: 0.88rem;">
        <p style="color: #64748b; margin-bottom: 12px; line-height: 1.5;">
          ระบุชั่วโมงอายุถังที่ต้องการจัดเก็บตัวอย่างเพิ่มเติม เช่น 26, 50 หรือ 76 ชม. จุดเวลานี้จะซิงค์และบันทึกลงในโปรเจกต์อัตโนมัติ
        </p>
        <div class="form-group">
          <label class="form-label">ชั่วโมงที่จัดเก็บ (Sampling Hour - h):*</label>
          <input type="number" step="0.5" min="0" max="200" id="swal-custom-timepoint" class="form-input" placeholder="เช่น 26 หรือ 50">
        </div>
        <div style="margin-top: 10px; font-size: 0.8rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px dashed #cbd5e1;">
          <strong>จุดเวลาปัจจุบัน:</strong> ${currentTimes.join(', ')} hr
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '➕ เพิ่มจุดเวลา',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0f3d7a',
    preConfirm: () => {
      const val = parseFloat(document.getElementById('swal-custom-timepoint').value);
      if (isNaN(val) || val < 0) {
        Swal.showValidationMessage('กรุณาระบุชั่วโมงที่ถูกต้อง (>= 0)');
        return false;
      }
      if (currentTimes.includes(val)) {
        Swal.showValidationMessage(`จุดเวลา ${val} hr มีอยู่ในโปรเจกต์นี้แล้ว`);
        return false;
      }
      return val;
    }
  }).then((res) => {
    if (res.isConfirmed) {
      const newHour = res.value;
      if (!Array.isArray(p.timepoints)) {
        p.timepoints = currentTimes.slice();
      }
      p.timepoints.push(newHour);
      p.timepoints.sort((a, b) => a - b);
      state.selectedTime = newHour;

      persistState();
      window.labAudio.playSuccess();
      logAction('ADD_TIMEPOINT', `เพิ่มจุดเวลาจัดเก็บตัวอย่าง ${newHour}h ในโปรเจกต์ ${p.experimentNo}`);
      
      // Sync across all views
      renderTimepointOptions('input-timepoint', newHour);
      renderHeaderTimepointsBadges();
      loadSampleDataForCurrentTank();
      
      showToast(`เพิ่มจุดเวลา ${newHour} hr เรียบร้อย`, 'success');
    }
  });
};

// Synchronize all tab views to the selected project (Requirement 5)
function onActiveProjectChanged(logNotice = false) {
  renderTimepointOptions('input-timepoint');
  updateProjectHeaderDisplay();
  updatePermissionBanner();
  renderTankMatrix();
  loadSampleDataForCurrentTank();
  syncDataRecordProjectFilter();
  renderDataRecordTable();
  renderAnalyticsCharts();
  renderCustomChart();
  renderOptimizerView();
  renderGanttTimeline();
}

function updateProjectHeaderDisplay() {
  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p) return;

  document.getElementById('header-batch-no').textContent = p.batchMediumNo;
  document.getElementById('header-exp-no').textContent = p.experimentNo;
  document.getElementById('header-condition').textContent = p.conditionText;
  document.getElementById('header-culture').textContent = p.conditionParams.feedCulture || 'PK B:C mol (80:20)';
  document.getElementById('header-date').textContent = p.date || '2022-03-26';
  document.getElementById('header-seed').textContent = `${p.seed} (${p.seedPreparation})`;
  document.getElementById('header-owner').textContent = p.ownerName;

  renderHeaderTimepointsBadges();
}

// Editable Experiment Header (Requirement 7)
window.toggleEditHeaderForm = function(show = true) {
  const viewContainer = document.getElementById('header-view-container');
  const editContainer = document.getElementById('header-edit-container');
  const p = state.projects.find(proj => proj.id === state.currentProjectId);

  if (!p) return;

  if (show) {
    // Populate form fields
    document.getElementById('edit-batch-no').value = p.batchMediumNo;
    document.getElementById('edit-exp-no').value = p.experimentNo;
    document.getElementById('edit-d-rate').value = p.conditionParams.dilutionRateD;
    document.getElementById('edit-ratio-bc').value = p.conditionParams.ratioBC || '80:20';
    document.getElementById('edit-temp').value = p.conditionParams.temperature || 30;
    document.getElementById('edit-fs').value = p.conditionParams.feedSugarPercentFS || 8;
    document.getElementById('edit-feed-culture').value = p.conditionParams.feedCulture || 'PK B:C mol (80:20)';
    document.getElementById('edit-date').value = p.date || '';
    document.getElementById('edit-seed').value = p.seed || '';
    document.getElementById('edit-seed-prep').value = p.seedPreparation || '';

    const editTpInput = document.getElementById('edit-timepoints');
    if (editTpInput) {
      editTpInput.value = getProjectTimepoints(p).join(', ');
    }

    viewContainer.style.display = 'none';
    editContainer.style.display = 'block';
  } else {
    viewContainer.style.display = 'grid';
    editContainer.style.display = 'none';
  }
};

window.saveHeaderEdits = function() {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์แก้ไข', text: 'ท่านไม่ใช่เจ้าของงานวิจัยนี้' });
    return;
  }

  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p) return;

  const dRate = parseFloat(document.getElementById('edit-d-rate').value) || 0.022;
  const ratioBC = document.getElementById('edit-ratio-bc').value.trim();
  const temp = parseFloat(document.getElementById('edit-temp').value) || 30;

  p.batchMediumNo = document.getElementById('edit-batch-no').value.trim();
  p.experimentNo = document.getElementById('edit-exp-no').value.trim();
  p.conditionParams.dilutionRateD = dRate;
  p.conditionParams.ratioBC = ratioBC;
  p.conditionParams.temperature = temp;
  p.conditionParams.feedSugarPercentFS = parseFloat(document.getElementById('edit-fs').value) || 8;
  p.conditionParams.feedCulture = document.getElementById('edit-feed-culture').value.trim();
  p.conditionText = `B:C (${ratioBC}), ${temp} C, continuous fermentation D=${dRate}`;
  p.date = document.getElementById('edit-date').value;
  p.seed = document.getElementById('edit-seed').value.trim();
  p.seedPreparation = document.getElementById('edit-seed-prep').value.trim();

  // Parse timepoints
  const rawTp = document.getElementById('edit-timepoints')?.value || '';
  if (rawTp.trim()) {
    const parsed = rawTp.split(',')
      .map(t => parseFloat(t.trim()))
      .filter(n => !isNaN(n) && n >= 0);
    if (parsed.length > 0) {
      p.timepoints = Array.from(new Set(parsed)).sort((a, b) => a - b);
    }
  }

  persistState();
  window.labAudio.playSuccess();
  logAction('UPDATE_PROJECT_HEADER', `แก้ไขข้อมูลตั้งต้น ${p.experimentNo} (${p.batchMediumNo})`);
  toggleEditHeaderForm(false);
  updateProjectHeaderDisplay();
  renderProjectSelector();
  renderTimepointOptions('input-timepoint');
  renderGanttTimeline();
  showToast('บันทึกการแก้ไขข้อมูลตั้งต้นเรียบร้อย', 'success');
};

// Create New Project with Automatic Gantt Timeline Generation
window.openNewProjectModal = function() {
  const currentUserName = state.currentUser ? state.currentUser.displayName : 'ดร.สมชาย นักวิจัย';
  const currentUserId = state.currentUser ? state.currentUser.uid : 'usr_01';

  Swal.fire({
    title: '➕ สร้างโปรเจกต์งานวิจัยใหม่',
    html: `
      <div style="text-align: left; font-size: 0.88rem; max-height: 70vh; overflow-y: auto;">
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Batch Medium no.:*</label>
            <input type="text" id="swal-new-batch" class="form-input" placeholder="x_220601" value="x_${new Date().toISOString().slice(2,10).replace(/-/g,'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Experiment no.:*</label>
            <input type="text" id="swal-new-exp" class="form-input" placeholder="Fermentation Trial D=0.020">
          </div>
        </div>

        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Dilution Rate D (h⁻¹):*</label>
            <input type="number" step="0.001" id="swal-new-drate" class="form-input" value="0.022">
          </div>
          <div class="form-group">
            <label class="form-label">สัดส่วน B:C:*</label>
            <input type="text" id="swal-new-ratio" class="form-input" value="80:20">
          </div>
        </div>

        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">อุณหภูมิ (°C):</label>
            <input type="number" id="swal-new-temp" class="form-input" value="30">
          </div>
          <div class="form-group">
            <label class="form-label">วันที่เริ่มต้น:*</label>
            <input type="date" id="swal-new-date" class="form-input" value="${new Date().toISOString().slice(0,10)}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Feed culture:</label>
          <input type="text" id="swal-new-culture" class="form-input" value="PK B:C mol (80:20)">
        </div>

        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Seed & Lot:</label>
            <input type="text" id="swal-new-seed" class="form-input" value="Angel Lot.260624">
          </div>
          <div class="form-group">
            <label class="form-label">Seed preparation:</label>
            <input type="text" id="swal-new-prep" class="form-input" value="0.4 g yeast dissolve in water">
          </div>
        </div>

        <div class="form-group" style="margin-top: 8px;">
          <label class="form-label">จุดเวลาจัดเก็บตัวอย่าง (Sampling Timepoints - ชม. คั่นด้วยจุลภาค):</label>
          <input type="text" id="swal-new-timepoints" class="form-input" value="0, 12, 16, 18, 22, 34, 40, 46, 58, 64, 70, 82" placeholder="0, 12, 16, 18, 22, 34, 40, 46, 58, 64, 70, 82">
        </div>
      </div>
    `,
    width: '600px',
    showCancelButton: true,
    confirmButtonText: '🚀 สร้างโปรเจกต์และสร้างไทม์ไลน์',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0f3d7a',
    preConfirm: () => {
      const batch = document.getElementById('swal-new-batch').value.trim();
      const exp = document.getElementById('swal-new-exp').value.trim();
      const dRate = parseFloat(document.getElementById('swal-new-drate').value) || 0.022;
      const ratio = document.getElementById('swal-new-ratio').value.trim() || '80:20';
      const temp = parseFloat(document.getElementById('swal-new-temp').value) || 30;
      const date = document.getElementById('swal-new-date').value;
      const culture = document.getElementById('swal-new-culture').value.trim() || 'PK B:C mol (80:20)';
      const seed = document.getElementById('swal-new-seed').value.trim() || 'Angel Lot.260624';
      const prep = document.getElementById('swal-new-prep').value.trim() || '0.4 g yeast dissolve in water';

      const rawTp = document.getElementById('swal-new-timepoints')?.value || '';
      const parsedTp = rawTp.split(',')
        .map(t => parseFloat(t.trim()))
        .filter(n => !isNaN(n) && n >= 0);
      const timepoints = parsedTp.length > 0 
        ? Array.from(new Set(parsedTp)).sort((a, b) => a - b)
        : [0, 12, 16, 18, 22, 34, 40, 46, 58, 64, 70, 82];

      if (!batch || !exp || !date) {
        Swal.showValidationMessage('กรุณากรอกข้อมูลสำคัญให้ครบถ้วน');
        return false;
      }
      return { batch, exp, dRate, ratio, temp, date, culture, seed, prep, timepoints };
    }
  }).then((res) => {
    if (res.isConfirmed) {
      const val = res.value;
      const newId = 'proj_' + Date.now();
      const newProj = {
        id: newId,
        batchMediumNo: val.batch,
        experimentNo: val.exp,
        conditionText: `B:C (${val.ratio}), ${val.temp} C, continuous fermentation D=${val.dRate}`,
        conditionParams: {
          dilutionRateD: val.dRate,
          ratioBC: val.ratio,
          temperature: val.temp,
          feedSugarPercentFS: 8.0,
          feedCulture: val.culture,
          defaultDilutionFactor: 10
        },
        date: val.date,
        seed: val.seed,
        seedPreparation: val.prep,
        timepoints: val.timepoints,
        enableGantt: true,
        ownerId: currentUserId,
        ownerName: currentUserName,
        totalBatches: 1,
        createdAt: new Date().toISOString(),
        status: 'in_progress',
        ganttTasks: []
      };

      state.projects.unshift(newProj);
      state.currentProjectId = newId;
      generateAutoGanttTimeline(true);
      persistState();
      window.labAudio.playSuccess();
      logAction('CREATE_PROJECT', `สร้างโปรเจกต์ใหม่ ${newProj.experimentNo} (${newProj.batchMediumNo}) พร้อมสร้าง Gantt Chart อัตโนมัติ`);
      renderAllDataViews();
      showToast(`สร้างโปรเจกต์ ${newProj.experimentNo} สำเร็จ`, 'success');
    }
  });
};

// Delete Entire Project and all its rows (Requirement 2 & 3)
window.deleteCurrentProject = function() {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์ลบ', text: 'ท่านไม่ใช่เจ้าของงานวิจัยนี้' });
    return;
  }

  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p) {
    showToast('ไม่พบโปรเจกต์ที่ต้องการลบ', 'error');
    return;
  }

  const projectSamples = state.samples.filter(s => s.projectId === p.id);

  Swal.fire({
    title: `ลบโปรเจกต์ ${p.experimentNo}?`,
    html: `
      <div style="text-align: left; font-size: 0.9rem; line-height: 1.6;">
        <p>• <strong>Batch Medium:</strong> ${p.batchMediumNo}</p>
        <p>• <strong>ข้อมูลตัวอย่างทั้งหมด:</strong> ${projectSamples.length} แถว</p>
        <p style="color: #b91c1c; margin-top: 8px;">
          ⚠️ โปรเจกต์และข้อมูลดิบทุกแถวในโปรเจกต์นี้จะถูกลบออกจากฐานข้อมูล
          <br><strong>(ท่านสามารถกู้คืนย้อนหลังได้ทุกเมื่อผ่านปุ่ม "กู้คืนข้อมูล" ใน Data Log)</strong>
        </p>
      </div>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ยืนยันลบทั้งโปรเจกต์',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#991b1b'
  }).then((res) => {
    if (res.isConfirmed) {
      // Create snapshot for Data Log restore capability
      const snapshot = {
        type: 'PROJECT',
        project: JSON.parse(JSON.stringify(p)),
        samples: JSON.parse(JSON.stringify(projectSamples))
      };

      // Remove project and all associated samples
      state.projects = state.projects.filter(x => x.id !== p.id);
      state.samples = state.samples.filter(s => s.projectId !== p.id);

      logAction('DELETE_PROJECT', `ลบโปรเจกต์ ${p.experimentNo} (${p.batchMediumNo}) และข้อมูลทั้งหมด ${projectSamples.length} แถว`, snapshot);

      // Select another project
      const isAdmin = state.currentUser && state.currentUser.role === 'admin';
      const available = isAdmin ? state.projects : state.projects.filter(x => x.ownerId === state.currentUser?.uid);
      state.currentProjectId = available.length > 0 ? available[0].id : '';

      persistState();
      window.labAudio.playWarning();
      renderAllDataViews();
      showToast(`ลบโปรเจกต์ ${p.experimentNo} เรียบร้อย (กู้คืนได้จาก Data Log)`, 'info');
    }
  });
};

// Tank Selection Matrix (PF, F2, F3, F4, F5, F6, F7, D3)
function renderTankMatrix() {
  const container = document.getElementById('tank-matrix-container');
  if (!container) return;

  container.innerHTML = window.LAB_TANKS.map(t => {
    const isActive = t.id === state.selectedTank;
    return `
      <div class="tank-pill-btn ${isActive ? 'active' : ''}" 
           style="--tank-color: ${t.color};" 
           onclick="selectTank('${t.id}')">
        <span class="tank-pill-name">${t.id}</span>
        <span class="tank-pill-desc">${t.desc}</span>
      </div>
    `;
  }).join('');
}

window.selectTank = function(tankId) {
  state.selectedTank = tankId;
  window.labAudio.playClick();
  renderTankMatrix();
  loadSampleDataForCurrentTank();
};

// ==========================================================================
// Cell Count Calculations & Dual Microscope Mode
// ==========================================================================
function setupMicroscopeInputs() {
  document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.cellMode = btn.dataset.mode;
      document.getElementById('numpad-panel').style.display = state.cellMode === 'numpad' ? 'block' : 'none';
      document.getElementById('tally-panel').style.display = state.cellMode === 'tally' ? 'block' : 'none';
      window.labAudio.playClick();
    });
  });

  document.querySelectorAll('.series-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.series-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeSeries = btn.dataset.series;
      updateTallyDisplay();
      window.labAudio.playClick();
    });
  });

  document.querySelectorAll('.square-box').forEach(input => {
    input.addEventListener('input', (e) => {
      const series = e.target.dataset.series;
      const index = parseInt(e.target.dataset.index);
      const val = parseInt(e.target.value) || 0;
      state.tallyCounts[series][index] = val;

      calculateCellKinetics();

      if (e.target.value.length >= 2 && index < 4) {
        const nextInput = document.querySelector(`.square-box[data-series="${series}"][data-index="${index + 1}"]`);
        if (nextInput) nextInput.focus();
      }
    });
  });

  const dilutionInput = document.getElementById('input-dilution-factor');
  if (dilutionInput) {
    dilutionInput.addEventListener('input', (e) => {
      state.tallyCounts.dilution = parseFloat(e.target.value) || 10;
      calculateCellKinetics();
    });
  }

  document.getElementById('btn-tally-add')?.addEventListener('click', () => tallyIncrement(1));
  document.getElementById('btn-tally-sub')?.addEventListener('click', () => tallyIncrement(-1));
}

function tallyIncrement(delta) {
  const arr = state.tallyCounts[state.activeSeries];
  let targetIdx = 0;
  for (let i = 0; i < 5; i++) {
    if (arr[i] === 0) { targetIdx = i; break; }
    targetIdx = 4;
  }
  arr[targetIdx] = Math.max(0, arr[targetIdx] + delta);

  window.labAudio.playClick();
  syncSquaresToInputs();
  calculateCellKinetics();
  updateTallyDisplay();
}

function updateTallyDisplay() {
  const sum = state.tallyCounts[state.activeSeries].reduce((a, b) => a + b, 0);
  document.getElementById('tally-current-series-name').textContent = 
    state.activeSeries === 'total' ? 'Total Cells (ทุกเซลล์)' :
    state.activeSeries === 'budding' ? 'Cell Budding (แตกหน่อ)' : 'Cell Death (ติดสีน้ำเงิน)';
  document.getElementById('tally-big-number').textContent = sum;
}

function syncSquaresToInputs() {
  ['total', 'budding', 'dead'].forEach(series => {
    state.tallyCounts[series].forEach((val, idx) => {
      const el = document.querySelector(`.square-box[data-series="${series}"][data-index="${idx}"]`);
      if (el) el.value = val;
    });
  });
}

function calculateCellKinetics() {
  const dilution = state.tallyCounts.dilution || 10;
  const factor = parseFloat(document.getElementById('setting-haemacytometer-factor')?.value) || 250000;
  const totalSum = state.tallyCounts.total.reduce((a, b) => a + b, 0);
  const buddingSum = state.tallyCounts.budding.reduce((a, b) => a + b, 0);
  const deadSum = state.tallyCounts.dead.reduce((a, b) => a + b, 0);

  const cellsPerMl = totalSum * dilution * factor;
  const buddingPct = totalSum > 0 ? ((buddingSum / totalSum) * 100).toFixed(1) : 0;
  const deadPct = totalSum > 0 ? ((deadSum / totalSum) * 100).toFixed(1) : 0;
  const viabilityPct = totalSum > 0 ? (((totalSum - deadSum) / totalSum) * 100).toFixed(1) : 100;

  // Update live row badges in haemacytometer matrix table
  const sumTotalEl = document.getElementById('sum-row-total');
  const sumBuddingEl = document.getElementById('sum-row-budding');
  const sumDeadEl = document.getElementById('sum-row-dead');
  const rateTotalEl = document.getElementById('rate-row-total');
  const rateBuddingEl = document.getElementById('rate-row-budding');
  const rateDeadEl = document.getElementById('rate-row-dead');

  if (sumTotalEl) sumTotalEl.textContent = totalSum;
  if (sumBuddingEl) sumBuddingEl.textContent = buddingSum;
  if (sumDeadEl) sumDeadEl.textContent = deadSum;

  if (rateTotalEl) rateTotalEl.textContent = cellsPerMl > 0 ? `${cellsPerMl.toExponential(2)} cells/mL` : '0 cells/mL';
  if (rateBuddingEl) rateBuddingEl.textContent = `${buddingPct} % Budding`;
  if (rateDeadEl) rateDeadEl.textContent = `${viabilityPct} % Viability`;

  document.getElementById('calc-total-cells-ml').textContent = cellsPerMl > 0 ? cellsPerMl.toExponential(2) : '0';
  document.getElementById('calc-budding-pct').textContent = buddingPct + ' %';
  document.getElementById('calc-viability-pct').textContent = viabilityPct + ' %';

  const alertBox = document.getElementById('cell-validation-alert');
  if (deadSum > totalSum) {
    alertBox.textContent = '⚠️ คำเตือน: เซลล์ตาย (Dead) มีจำนวนมากกว่าเซลล์ทั้งหมด (Total) กรุณาตรวจสอบการนับ';
    alertBox.className = 'inline-alert inline-alert-danger visible';
    window.labAudio.playWarning();
  } else if (buddingSum > totalSum) {
    alertBox.textContent = '⚠️ คำเตือน: เซลล์แตกหน่อ (Budding) มีจำนวนมากกว่าเซลล์ทั้งหมด กรุณาตรวจสอบการนับ';
    alertBox.className = 'inline-alert inline-alert-warning visible';
    window.labAudio.playWarning();
  } else {
    alertBox.className = 'inline-alert';
  }

  return { cellsPerMl, buddingPct, viabilityPct, totalSum, buddingSum, deadSum };
}

// ==========================================================================
// HPLC Sugar Calculation Engine
// ==========================================================================
function setupHPLCInputs() {
  const sucroseInput = document.getElementById('input-sucrose');
  const glucoseInput = document.getElementById('input-glucose');
  const fructoseInput = document.getElementById('input-fructose');
  const sugarConvertInput = document.getElementById('input-sugar-convert');

  function updateSugarConvert() {
    const s = parseFloat(sucroseInput.value) || 0;
    const g = parseFloat(glucoseInput.value) || 0;
    const f = parseFloat(fructoseInput.value) || 0;
    const totalSugar = s + g + f;
    sugarConvertInput.value = totalSugar.toFixed(3);
  }

  [sucroseInput, glucoseInput, fructoseInput].forEach(inp => {
    inp?.addEventListener('input', updateSugarConvert);
  });

  const brixInput = document.getElementById('input-brix');
  const brixAlert = document.getElementById('brix-validation-alert');
  brixInput?.addEventListener('input', (e) => {
    const brix = parseFloat(e.target.value);
    if (brix < 0 || brix > 35) {
      brixAlert.textContent = '⚠️ ค่า Brix อยู่นอกช่วงมาตรฐานห้องแล็บ (0 - 35 °Bx)';
      brixAlert.className = 'inline-alert inline-alert-warning visible';
      window.labAudio.playWarning();
    } else {
      brixAlert.className = 'inline-alert';
    }
  });
}

function getSampleHaemacytometerCounts(sample) {
  if (sample && sample.haemacytometer && Array.isArray(sample.haemacytometer.total) && sample.haemacytometer.total.length === 5) {
    return {
      total: [...sample.haemacytometer.total],
      budding: [...sample.haemacytometer.budding],
      dead: [...sample.haemacytometer.dead],
      dilution: sample.haemacytometer.dilution || sample.dilution || 10
    };
  }

  if (sample && sample.cellCount && sample.cellCount > 0) {
    const factor = parseFloat(document.getElementById('setting-haemacytometer-factor')?.value) || 250000;
    let dilution = sample.dilution || (sample.cellCount > 1e9 ? 100 : (sample.cellCount < 4e7 ? 1 : 10));
    let totalSum = Math.round(sample.cellCount / (dilution * factor));
    if (totalSum < 5) totalSum = 5;

    const base = Math.floor(totalSum / 5);
    const v1 = Math.max(1, Math.round(base * 0.92));
    const v2 = Math.max(1, Math.round(base * 1.06));
    const v3 = Math.max(1, Math.round(base * 0.96));
    const v4 = Math.max(1, Math.round(base * 1.08));
    const v5 = Math.max(1, totalSum - (v1 + v2 + v3 + v4));
    const totalArr = [v1, v2, v3, v4, v5];

    const budPct = (sample.buddingPct !== undefined) ? sample.buddingPct / 100 : 0.111;
    let budSum = Math.round(totalSum * budPct);
    const bBase = Math.floor(budSum / 5);
    const b1 = Math.min(totalArr[0], Math.max(0, Math.round(bBase * 0.85)));
    const b2 = Math.min(totalArr[1], Math.max(0, Math.round(bBase * 1.10)));
    const b3 = Math.min(totalArr[2], Math.max(0, Math.round(bBase * 1.00)));
    const b4 = Math.min(totalArr[3], Math.max(0, Math.round(bBase * 1.15)));
    const b5 = Math.min(totalArr[4], Math.max(0, budSum - (b1 + b2 + b3 + b4)));
    const budArr = [b1, b2, b3, b4, b5];

    const viaPct = (sample.viabilityPct !== undefined) ? sample.viabilityPct / 100 : 0.974;
    let deadSum = Math.round(totalSum * (1 - viaPct));
    if (deadSum < 1 && totalSum >= 20) deadSum = 1;
    const dBase = Math.floor(deadSum / 5);
    const d1 = Math.min(totalArr[0], Math.max(0, dBase));
    const d2 = Math.min(totalArr[1], Math.max(0, dBase));
    const d3 = Math.min(totalArr[2], Math.max(0, dBase + (deadSum % 5 > 0 ? 1 : 0)));
    const d4 = Math.min(totalArr[3], Math.max(0, dBase));
    const d5 = Math.min(totalArr[4], Math.max(0, deadSum - (d1 + d2 + d3 + d4)));
    const deadArr = [d1, d2, d3, d4, d5];

    const res = {
      total: totalArr,
      budding: budArr,
      dead: deadArr,
      dilution: dilution
    };
    sample.haemacytometer = JSON.parse(JSON.stringify(res));
    sample.dilution = dilution;
    return res;
  }

  return {
    total: [0, 0, 0, 0, 0],
    budding: [0, 0, 0, 0, 0],
    dead: [0, 0, 0, 0, 0],
    dilution: 10
  };
}

function loadSampleDataForCurrentTank() {
  const timeInput = document.getElementById('input-timepoint');
  const time = parseFloat(timeInput?.value || state.selectedTime);

  const existing = state.samples.find(s => 
    (s.projectId === state.currentProjectId || !s.projectId) && s.tank === state.selectedTank && s.time === time
  );

  const brixInput = document.getElementById('input-brix');
  const sucroseInput = document.getElementById('input-sucrose');
  const glucoseInput = document.getElementById('input-glucose');
  const fructoseInput = document.getElementById('input-fructose');
  const sugarConvertInput = document.getElementById('input-sugar-convert');
  const ethanolInput = document.getElementById('input-ethanol');
  const glycerolInput = document.getElementById('input-glycerol');

  if (existing) {
    if (brixInput) brixInput.value = existing.brix !== undefined ? existing.brix : '';
    if (sucroseInput) sucroseInput.value = existing.sucrose !== undefined ? existing.sucrose : '';
    if (glucoseInput) glucoseInput.value = existing.glucose !== undefined ? existing.glucose : '';
    if (fructoseInput) fructoseInput.value = existing.fructose !== undefined ? existing.fructose : '';
    if (sugarConvertInput) sugarConvertInput.value = existing.sugarConvert !== undefined ? existing.sugarConvert : '';
    if (ethanolInput) ethanolInput.value = existing.ethanol !== undefined ? existing.ethanol : '';
    if (glycerolInput) glycerolInput.value = existing.glycerol !== undefined ? existing.glycerol : '';
  } else {
    if (brixInput) brixInput.value = '';
    if (sucroseInput) sucroseInput.value = '';
    if (glucoseInput) glucoseInput.value = '';
    if (fructoseInput) fructoseInput.value = '';
    if (sugarConvertInput) sugarConvertInput.value = '';
    if (ethanolInput) ethanolInput.value = '';
    if (glycerolInput) glycerolInput.value = '';
  }

  // Dynamic Two-Way Sync: Load 5 chambers × 3 series Haemacytometer matrix per (Tank, Timepoint)
  const counts = getSampleHaemacytometerCounts(existing);
  state.tallyCounts.total = [...counts.total];
  state.tallyCounts.budding = [...counts.budding];
  state.tallyCounts.dead = [...counts.dead];
  state.tallyCounts.dilution = counts.dilution;

  const dilutionInput = document.getElementById('input-dilution-factor');
  if (dilutionInput) dilutionInput.value = counts.dilution;

  syncSquaresToInputs();
  calculateCellKinetics();
  updateTallyDisplay();
}

document.getElementById('input-timepoint')?.addEventListener('change', (e) => {
  state.selectedTime = parseFloat(e.target.value);
  loadSampleDataForCurrentTank();
  window.labAudio.playClick();
});

window.saveCurrentSample = function() {
  if (!canEditCurrentProject()) {
    Swal.fire({
      icon: 'error',
      title: 'ไม่มีสิทธิ์แก้ไข',
      text: 'ท่านสามารถดูข้อมูลได้เท่านั้น เนื่องจากไม่ใช่ผู้สร้างโปรเจกต์นี้',
      confirmButtonColor: '#0f3d7a'
    });
    return;
  }

  const time = parseFloat(document.getElementById('input-timepoint').value) || 0;
  const brixVal = parseFloat(document.getElementById('input-brix').value);
  const sucroseVal = parseFloat(document.getElementById('input-sucrose').value);
  const glucoseVal = parseFloat(document.getElementById('input-glucose').value);
  const fructoseVal = parseFloat(document.getElementById('input-fructose').value);
  const sugarConvertVal = parseFloat(document.getElementById('input-sugar-convert').value);
  const ethanolVal = parseFloat(document.getElementById('input-ethanol').value);
  const glycerolVal = parseFloat(document.getElementById('input-glycerol').value);
  const cellKinetics = calculateCellKinetics();

  let sample = state.samples.find(s => 
    (s.projectId === state.currentProjectId || !s.projectId) && s.tank === state.selectedTank && s.time === time
  );
  const isNew = !sample;

  if (isNew) {
    sample = { projectId: state.currentProjectId, tank: state.selectedTank, time: time };
    state.samples.push(sample);
  }

  if (!isNaN(brixVal)) sample.brix = brixVal;
  if (!isNaN(sucroseVal)) sample.sucrose = sucroseVal;
  if (!isNaN(glucoseVal)) sample.glucose = glucoseVal;
  if (!isNaN(fructoseVal)) sample.fructose = fructoseVal;
  if (!isNaN(sugarConvertVal)) sample.sugarConvert = sugarConvertVal;
  if (!isNaN(ethanolVal)) sample.ethanol = ethanolVal;
  if (!isNaN(glycerolVal)) sample.glycerol = glycerolVal;

  // Persist Haemacytometer 5 chambers × 3 series counts and cell kinetics for this sample
  sample.haemacytometer = {
    total: [...state.tallyCounts.total],
    budding: [...state.tallyCounts.budding],
    dead: [...state.tallyCounts.dead],
    dilution: state.tallyCounts.dilution || 10
  };
  sample.dilution = state.tallyCounts.dilution || 10;
  if (cellKinetics.cellsPerMl > 0) sample.cellCount = cellKinetics.cellsPerMl;
  sample.buddingPct = parseFloat(cellKinetics.buddingPct) || 0;
  sample.viabilityPct = parseFloat(cellKinetics.viabilityPct) || 0;

  persistState();
  window.labAudio.playSuccess();
  showToast(`บันทึกผลถัง ${state.selectedTank} @ ${time}h สำเร็จ`, 'success');

  logAction(isNew ? 'SAMPLE_ENTRY' : 'UPDATE_SAMPLE', 
    `บันทึกข้อมูลถัง ${state.selectedTank} @ ${time}h (Brix: ${brixVal}, SugarConvert: ${sugarConvertVal}, Ethanol: ${ethanolVal}, Cells: ${sample.cellCount ? sample.cellCount.toExponential(2) : '-'})`
  );

  renderAllDataViews();
  renderDataRecordTable();
};

// ==========================================================================
// Charting & High-Res PNG Download with PURE WHITE Background
// ==========================================================================
function renderAnalyticsCharts() {
  renderBrixChart();
  renderGrowthChart();
  renderHPLCChart();
}

function renderBrixChart() {
  const ctx = document.getElementById('chart-brix')?.getContext('2d');
  if (!ctx) return;
  if (state.charts.brix) state.charts.brix.destroy();

  const currentProj = state.projects.find(p => p.id === state.currentProjectId);
  const projTag = currentProj ? ` [${currentProj.experimentNo} - D=${currentProj.conditionParams.dilutionRateD}]` : '';

  const datasets = window.LAB_TANKS.map(tank => {
    const tankSamples = state.samples
      .filter(s => (s.projectId === state.currentProjectId || !s.projectId) && s.tank === tank.id && s.brix !== undefined)
      .sort((a, b) => a.time - b.time);

    return {
      label: tank.id,
      borderColor: tank.color,
      backgroundColor: tank.color + '20',
      data: tankSamples.map(s => ({ x: s.time, y: s.brix })),
      tension: 0.25,
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2
    };
  });

  state.charts.brix = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: `Brix (°Bx) Degradation Profile across 8 Fermenters${projTag}` }
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Time (Hours)' }, min: 0, max: 85 },
        y: { title: { display: true, text: 'Brix (°Bx)' }, min: 0, max: 25 }
      }
    }
  });
}

function renderGrowthChart() {
  const ctx = document.getElementById('chart-cells')?.getContext('2d');
  if (!ctx) return;
  if (state.charts.cells) state.charts.cells.destroy();

  const currentProj = state.projects.find(p => p.id === state.currentProjectId);
  const projTag = currentProj ? ` [${currentProj.experimentNo} - D=${currentProj.conditionParams.dilutionRateD}]` : '';

  const datasets = window.LAB_TANKS.map(tank => {
    const tankSamples = state.samples
      .filter(s => (s.projectId === state.currentProjectId || !s.projectId) && s.tank === tank.id && s.cellCount)
      .sort((a, b) => a.time - b.time);

    return {
      label: tank.id,
      borderColor: tank.color,
      backgroundColor: tank.color,
      data: tankSamples.map(s => ({ x: s.time, y: s.cellCount })),
      tension: 0.2,
      pointRadius: 4
    };
  });

  state.charts.cells = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: `Yeast Cell Population (cells/mL) - Haemacytometer${projTag}` }
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Time (Hours)' }, min: 0, max: 85 },
        y: { type: 'logarithmic', title: { display: true, text: 'Cell Density (cells/mL - Log Scale)' } }
      }
    }
  });
}

function renderHPLCChart() {
  const ctx = document.getElementById('chart-hplc')?.getContext('2d');
  if (!ctx) return;
  if (state.charts.hplc) state.charts.hplc.destroy();

  const currentProj = state.projects.find(p => p.id === state.currentProjectId);
  const projTag = currentProj ? ` [${currentProj.experimentNo} - D=${currentProj.conditionParams.dilutionRateD}]` : '';

  const activeTankSamples = state.samples
    .filter(s => (s.projectId === state.currentProjectId || !s.projectId) && s.tank === state.selectedTank && s.ethanol !== undefined)
    .sort((a, b) => a.time - b.time);

  state.charts.hplc = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: `Ethanol (${state.selectedTank})`,
          borderColor: '#ea580c',
          backgroundColor: '#ea580c20',
          data: activeTankSamples.map(s => ({ x: s.time, y: s.ethanol })),
          borderWidth: 3,
          tension: 0.2
        },
        {
          label: `Sugar Convert (${state.selectedTank})`,
          borderColor: '#3b82f6',
          backgroundColor: '#3b82f620',
          data: activeTankSamples.map(s => ({ x: s.time, y: s.sugarConvert })),
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.2
        },
        {
          label: `Glycerol (${state.selectedTank})`,
          borderColor: '#10b981',
          data: activeTankSamples.map(s => ({ x: s.time, y: s.glycerol })),
          borderWidth: 2,
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: `HPLC Kinetics: Sugar vs Ethanol in Vessel [${state.selectedTank}]${projTag}` }
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Time (Hours)' } },
        y: { title: { display: true, text: 'Concentration (g/L)' } }
      }
    }
  });
}

// Download High-Resolution Chart PNG with PURE WHITE Background (Requirement 3)
window.downloadChartPNG = function(chartKey, filename) {
  const chartInstance = state.charts[chartKey];
  if (!chartInstance || !chartInstance.canvas) {
    showToast('ไม่พบข้อมูลกราฟสำหรับดาวน์โหลด', 'warning');
    return;
  }

  const origCanvas = chartInstance.canvas;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = origCanvas.width;
  tempCanvas.height = origCanvas.height;
  const tempCtx = tempCanvas.getContext('2d');

  // Fill White Background
  tempCtx.fillStyle = '#ffffff';
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

  // Draw chart over white background
  tempCtx.drawImage(origCanvas, 0, 0);

  const url = tempCanvas.toDataURL('image/png', 1.0);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.png`;
  a.click();

  window.labAudio.playSuccess();
  showToast(`ดาวน์โหลดรูปกราฟพื้นหลังสีขาว (${filename}) เรียบร้อย`, 'success');
};

// ==========================================================================
// Custom Sandbox Multi-Axis Comparison Chart (Requirement 5)
// ==========================================================================
window.addCustomSeries = function() {
  const tank = document.getElementById('custom-tank-select').value;
  const metric = document.getElementById('custom-metric-select').value;
  const axis = document.getElementById('custom-axis-select').value;

  const metricLabels = {
    brix: 'Brix (°Bx)',
    cellCount: 'Yeast Cell (cells/mL)',
    ethanol: 'Ethanol (g/L)',
    sugarConvert: 'Sugar Convert (g/L)',
    glycerol: 'Glycerol (g/L)'
  };

  const id = `${tank}_${metric}_${axis}`;
  if (state.customSeries.some(s => s.id === id)) {
    showToast('เส้นข้อมูลนี้มีอยู่ในกราฟแล้ว', 'info');
    return;
  }

  const tankDef = window.LAB_TANKS.find(t => t.id === tank) || { color: '#0f3d7a' };
  const colorMap = {
    brix: '#1e3a8a',
    cellCount: '#059669',
    ethanol: '#ea580c',
    sugarConvert: '#7c3aed',
    glycerol: '#0891b2'
  };

  state.customSeries.push({
    id: id,
    tank: tank,
    metric: metric,
    axis: axis,
    label: `${tank} - ${metricLabels[metric]} [${axis === 'y' ? 'แกนซ้าย Y1' : 'แกนขวา Y2'}]`,
    color: colorMap[metric] || tankDef.color
  });

  window.labAudio.playSuccess();
  renderCustomSeriesChips();
  renderCustomChart();
  showToast(`เพิ่มเส้นข้อมูล ${tank} - ${metricLabels[metric]} สำเร็จ`, 'success');
};

window.removeCustomSeries = function(id) {
  state.customSeries = state.customSeries.filter(s => s.id !== id);
  window.labAudio.playClick();
  renderCustomSeriesChips();
  renderCustomChart();
};

window.clearCustomChart = function() {
  state.customSeries = [];
  renderCustomSeriesChips();
  renderCustomChart();
  showToast('ล้างเส้นกราฟทั้งหมดเรียบร้อย', 'info');
};

function renderCustomSeriesChips() {
  const container = document.getElementById('custom-series-chips');
  if (!container) return;

  container.innerHTML = state.customSeries.map(s => `
    <span class="series-chip" style="border-left: 4px solid ${s.color};">
      <span>${s.label}</span>
      <span class="remove-chip" onclick="removeCustomSeries('${s.id}')">&times;</span>
    </span>
  `).join('');
}

function renderCustomChart() {
  const ctx = document.getElementById('chart-custom-sandbox')?.getContext('2d');
  if (!ctx) return;
  if (state.charts.custom) state.charts.custom.destroy();

  if (state.customSeries.length === 0) {
    state.charts.custom = new Chart(ctx, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'กรุณาเลือกถังหมักและตัวแปรเพื่อเพิ่มเส้นข้อมูลลงในกราฟเปรียบเทียบ' }
        }
      }
    });
    return;
  }

  const datasets = state.customSeries.map(series => {
    const dataPoints = state.samples
      .filter(s => (s.projectId === state.currentProjectId || !s.projectId) && s.tank === series.tank && s[series.metric] !== undefined && s[series.metric] !== null)
      .sort((a, b) => a.time - b.time)
      .map(s => ({ x: s.time, y: s[series.metric] }));

    return {
      label: series.label,
      data: dataPoints,
      borderColor: series.color,
      backgroundColor: series.color + '20',
      yAxisID: series.axis,
      tension: 0.25,
      borderWidth: 2,
      pointRadius: 4
    };
  });

  const hasY1 = state.customSeries.some(s => s.axis === 'y1');

  state.charts.custom = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Custom Multi-Axis Comparison Profile' }
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Time (Hours)' }, min: 0, max: 85 },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: 'Primary Axis Y1 (Concentration g/L or Brix °Bx)' }
        },
        y1: {
          type: 'linear',
          display: hasY1,
          position: 'right',
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Secondary Axis Y2 (Cells or Percentage)' }
        }
      }
    }
  });
}

// ==========================================================================
// Data Record Tab (Unified Raw Data Table with Project & Column Filters)
// ==========================================================================
function syncDataRecordProjectFilter() {
  const filterSelect = document.getElementById('data-record-project-filter');
  if (!filterSelect) return;

  const currentVal = filterSelect.value || state.currentProjectId;
  const isAdmin = state.currentUser && state.currentUser.role === 'admin';
  const availableProjects = isAdmin ? state.projects : state.projects.filter(p => p.ownerId === state.currentUser?.uid);

  filterSelect.innerHTML = `
    <option value="ALL">📂 ทุกโปรเจกต์ (All Projects)</option>
    ${availableProjects.map(p => `
      <option value="${p.id}" ${p.id === currentVal ? 'selected' : ''}>
        ${p.experimentNo} (${p.batchMediumNo}) - D=${p.conditionParams.dilutionRateD}${isAdmin ? ` [${p.ownerName}]` : ''}
      </option>
    `).join('')}
  `;

  if (!filterSelect.value) {
    filterSelect.value = state.currentProjectId;
  }
}

window.handleDataRecordProjectChange = function() {
  renderDataRecordTable();
};

// Column Sort Handler for Unified Data Record (Requirement 1)
window.handleDataRecordSort = function(field) {
  if (!state.dataRecordSort) {
    state.dataRecordSort = { field: 'tank', dir: 'asc' };
  }
  if (state.dataRecordSort.field === field) {
    state.dataRecordSort.dir = state.dataRecordSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    state.dataRecordSort.field = field;
    state.dataRecordSort.dir = 'asc';
  }
  updateDataRecordSortIcons();
  renderDataRecordTable();
};

function updateDataRecordSortIcons() {
  const fields = ['tank', 'time', 'brix', 'sugarConvert', 'sucrose', 'glucose', 'fructose', 'ethanol', 'glycerol', 'cellCount', 'buddingPct', 'viabilityPct'];
  const activeField = state.dataRecordSort?.field || 'tank';
  const activeDir = state.dataRecordSort?.dir || 'asc';

  fields.forEach(f => {
    const iconEl = document.getElementById(`sort-icon-${f}`);
    const thEl = iconEl?.closest('th');
    if (iconEl && thEl) {
      if (f === activeField) {
        iconEl.textContent = activeDir === 'asc' ? '▲' : '▼';
        thEl.classList.add('sort-active');
      } else {
        iconEl.textContent = '⇅';
        thEl.classList.remove('sort-active');
      }
    }
  });
}

window.resetDataRecordFilters = function() {
  const projectFilter = document.getElementById('data-record-project-filter');
  const tankFilter = document.getElementById('data-record-tank-filter');
  const timeFilter = document.getElementById('data-record-time-filter');
  const searchInput = document.getElementById('data-record-search-input');

  if (projectFilter) projectFilter.value = state.currentProjectId;
  if (tankFilter) tankFilter.value = 'ALL';
  if (timeFilter) timeFilter.value = 'ALL';
  if (searchInput) searchInput.value = '';

  state.dataRecordSort = { field: 'tank', dir: 'asc' };
  updateDataRecordSortIcons();
  renderDataRecordTable();
  showToast('รีเซ็ตตัวกรองและการจัดเรียงแล้ว', 'info');
};

function renderDataRecordTable() {
  const tbody = document.getElementById('data-record-tbody');
  if (!tbody) return;

  const filterProject = document.getElementById('data-record-project-filter')?.value || state.currentProjectId;
  const filterTank = document.getElementById('data-record-tank-filter')?.value || 'ALL';
  const filterTime = document.getElementById('data-record-time-filter')?.value || 'ALL';
  const searchQuery = (document.getElementById('data-record-search-input')?.value || '').trim().toLowerCase();

  const filteredSamples = state.samples.filter(s => {
    // Project filter
    if (filterProject !== 'ALL' && s.projectId && s.projectId !== filterProject) {
      return false;
    }

    // Top tank & time dropdowns
    if (filterTank !== 'ALL' && s.tank !== filterTank) return false;
    if (filterTime !== 'ALL' && s.time !== parseFloat(filterTime)) return false;

    // Search query matching across all fields
    if (searchQuery) {
      const matchSearch = (
        (s.tank && s.tank.toLowerCase().includes(searchQuery)) ||
        (s.time !== undefined && String(s.time).includes(searchQuery)) ||
        (s.brix !== undefined && String(s.brix).includes(searchQuery)) ||
        (s.sugarConvert !== undefined && String(s.sugarConvert).includes(searchQuery)) ||
        (s.sucrose !== undefined && String(s.sucrose).includes(searchQuery)) ||
        (s.glucose !== undefined && String(s.glucose).includes(searchQuery)) ||
        (s.fructose !== undefined && String(s.fructose).includes(searchQuery)) ||
        (s.ethanol !== undefined && String(s.ethanol).includes(searchQuery)) ||
        (s.glycerol !== undefined && String(s.glycerol).includes(searchQuery))
      );
      if (!matchSearch) return false;
    }

    return true;
  });

  // Apply Column Sorting (Requirement 1)
  const sortField = state.dataRecordSort?.field || 'tank';
  const sortDir = state.dataRecordSort?.dir === 'desc' ? -1 : 1;

  filteredSamples.sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (sortField === 'tank') {
      const tankOrder = { PF: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7, D3: 8 };
      const orderA = tankOrder[a.tank] || 99;
      const orderB = tankOrder[b.tank] || 99;
      if (orderA !== orderB) return (orderA - orderB) * sortDir;
      return (a.time - b.time) * sortDir;
    }

    if (typeof valA === 'string' && typeof valB === 'string') {
      return valA.localeCompare(valB) * sortDir;
    }

    valA = (valA === undefined || valA === null) ? -999999999 : Number(valA);
    valB = (valB === undefined || valB === null) ? -999999999 : Number(valB);

    if (valA !== valB) {
      return (valA - valB) * sortDir;
    }
    return ((a.time || 0) - (b.time || 0)) * sortDir;
  });

  updateDataRecordSortIcons();

  // Update badge counter
  const badge = document.getElementById('data-record-count-badge');
  if (badge) badge.textContent = `${filteredSamples.length} รายการ`;

  const editable = canEditCurrentProject();

  if (filteredSamples.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" style="text-align: center; color: #94a3b8; padding: 24px;">ไม่พบข้อมูลตัวอย่างที่ตรงกับเงื่อนไขการกรอง</td></tr>';
    return;
  }

  tbody.innerHTML = filteredSamples.map(s => {
    const tankDef = window.LAB_TANKS.find(t => t.id === s.tank) || { color: '#0f3d7a' };
    const pId = s.projectId || state.currentProjectId;
    return `
      <tr>
        <td><strong><span style="color: ${tankDef.color};">●</span> ${s.tank}</strong></td>
        <td><strong>${s.time} h</strong></td>
        <td>${s.brix !== undefined ? s.brix : '-'}</td>
        <td><strong>${s.sugarConvert !== undefined ? s.sugarConvert : '-'}</strong></td>
        <td>${s.sucrose !== undefined ? s.sucrose : '-'}</td>
        <td>${s.glucose !== undefined ? s.glucose : '-'}</td>
        <td>${s.fructose !== undefined ? s.fructose : '-'}</td>
        <td><strong style="color: #ea580c;">${s.ethanol !== undefined ? s.ethanol : '-'}</strong></td>
        <td>${s.glycerol !== undefined ? s.glycerol : '-'}</td>
        <td>${s.cellCount ? s.cellCount.toExponential(2) : '-'}</td>
        <td>${s.buddingPct ? s.buddingPct + '%' : '11.1%'}</td>
        <td>${s.viabilityPct ? s.viabilityPct + '%' : '97.4%'}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-secondary" onclick="editDataRecordRow('${s.tank}', ${s.time}, '${pId}')" ${!editable ? 'disabled title="ไม่มีสิทธิ์แก้ไข"' : ''}>
              ✏️
            </button>
            <button class="btn btn-sm btn-secondary" onclick="deleteDataRecordRow('${s.tank}', ${s.time}, '${pId}')" style="color: #ef4444;" ${!editable ? 'disabled title="ไม่มีสิทธิ์ลบ"' : ''}>
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.editDataRecordRow = function(tank, time, projectId) {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์แก้ไข', text: 'ท่านไม่ใช่เจ้าของงานวิจัยนี้' });
    return;
  }

  const targetProjectId = projectId || state.currentProjectId;
  const s = state.samples.find(x => (x.projectId === targetProjectId || !x.projectId) && x.tank === tank && x.time === time);
  if (!s) return;

  Swal.fire({
    title: `แก้ไขข้อมูล ${tank} @ ${time}h`,
    html: `
      <div style="text-align: left; font-size: 0.88rem;">
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Brix (°Bx):</label>
            <input type="number" step="0.1" id="swal-brix" class="form-input" value="${s.brix ?? ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Ethanol (g/L):</label>
            <input type="number" step="0.01" id="swal-ethanol" class="form-input" value="${s.ethanol ?? ''}">
          </div>
        </div>
        <div class="form-grid-3">
          <div class="form-group">
            <label class="form-label">Sucrose:</label>
            <input type="number" step="0.01" id="swal-sucrose" class="form-input" value="${s.sucrose ?? ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Glucose:</label>
            <input type="number" step="0.01" id="swal-glucose" class="form-input" value="${s.glucose ?? ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Fructose:</label>
            <input type="number" step="0.01" id="swal-fructose" class="form-input" value="${s.fructose ?? ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Glycerol (g/L):</label>
          <input type="number" step="0.01" id="swal-glycerol" class="form-input" value="${s.glycerol ?? ''}">
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'บันทึกการแก้ไข',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0f3d7a',
    preConfirm: () => {
      const brix = parseFloat(document.getElementById('swal-brix').value);
      const eth = parseFloat(document.getElementById('swal-ethanol').value);
      const suc = parseFloat(document.getElementById('swal-sucrose').value) || 0;
      const glu = parseFloat(document.getElementById('swal-glucose').value) || 0;
      const fru = parseFloat(document.getElementById('swal-fructose').value) || 0;
      const gly = parseFloat(document.getElementById('swal-glycerol').value);

      return { brix, eth, suc, glu, fru, gly };
    }
  }).then((res) => {
    if (res.isConfirmed) {
      const val = res.value;
      if (!isNaN(val.brix)) s.brix = val.brix;
      if (!isNaN(val.eth)) s.ethanol = val.eth;
      s.sucrose = val.suc;
      s.glucose = val.glu;
      s.fructose = val.fru;
      s.sugarConvert = val.suc + val.glu + val.fru;
      if (!isNaN(val.gly)) s.glycerol = val.gly;

      persistState();
      window.labAudio.playSuccess();
      logAction('UPDATE_DATA_RECORD', `แก้ไขข้อมูลดิบ ${tank} @ ${time}h (Brix: ${val.brix}, Sugar: ${s.sugarConvert}, Eth: ${val.eth})`);
      
      // Instant Two-Way Sync to Lab Entry:
      loadSampleDataForCurrentTank();
      renderDataRecordTable();
      renderAllDataViews();
      renderAnalyticsCharts();
      renderCustomChart();
      showToast(`อัปเดตข้อมูล ${tank} @ ${time}h เรียบร้อย ค่าในแทปบันทึกแล็ปเปลี่ยนตามทันที`, 'success');
    }
  });
};

window.deleteDataRecordRow = function(tank, time, projectId) {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์ลบ', text: 'ท่านไม่ใช่เจ้าของงานวิจัยนี้' });
    return;
  }

  const targetProjectId = projectId || state.currentProjectId;
  const sampleToDelete = state.samples.find(x => (x.projectId === targetProjectId || !x.projectId) && x.tank === tank && x.time === time);
  if (!sampleToDelete) return;

  Swal.fire({
    title: `ลบตัวอย่าง ${tank} @ ${time}h?`,
    html: `
      <div style="text-align: left; font-size: 0.9rem; line-height: 1.6;">
        <p>• ถังหมัก: <strong>${tank}</strong> | เวลา: <strong>${time} h</strong></p>
        <p>• โปรเจกต์: <strong>${targetProjectId}</strong></p>
        <p style="color: #b91c1c; margin-top: 8px;">
          ⚠️ ข้อมูลแถวนี้จะถูกลบออกจากฐานข้อมูล
          <br><strong>(ท่านสามารถกู้คืนย้อนหลังได้ทุกเมื่อผ่านปุ่ม "กู้คืนข้อมูล" ใน Data Log)</strong>
        </p>
      </div>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ยืนยันการลบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#991b1b'
  }).then((res) => {
    if (res.isConfirmed) {
      const snapshot = {
        type: 'SAMPLE_ROW',
        data: JSON.parse(JSON.stringify(sampleToDelete))
      };
      state.samples = state.samples.filter(x => !((x.projectId === targetProjectId || !x.projectId) && x.tank === tank && x.time === time));
      persistState();
      window.labAudio.playWarning();
      logAction('DELETE_DATA_RECORD', `ลบข้อมูล ${tank} @ ${time}h (โปรเจกต์: ${targetProjectId})`, snapshot);
      loadSampleDataForCurrentTank();
      renderDataRecordTable();
      renderAllDataViews();
      renderAnalyticsCharts();
      renderCustomChart();
      showToast(`ลบข้อมูล ${tank} @ ${time}h สำเร็จ (กู้คืนได้จาก Data Log)`, 'info');
    }
  });
};

window.exportDataRecordCSV = function() {
  const filterProject = document.getElementById('data-record-project-filter')?.value || state.currentProjectId;
  const filterTank = document.getElementById('data-record-tank-filter')?.value || 'ALL';
  const filterTime = document.getElementById('data-record-time-filter')?.value || 'ALL';

  const exportList = state.samples.filter(s => {
    if (filterProject !== 'ALL' && s.projectId && s.projectId !== filterProject) return false;
    if (filterTank !== 'ALL' && s.tank !== filterTank) return false;
    if (filterTime !== 'ALL' && s.time !== parseFloat(filterTime)) return false;
    return true;
  });

  const headers = ['Project', 'Tank', 'Time_h', 'Brix', 'SugarConvert_gL', 'Sucrose', 'Glucose', 'Fructose', 'Ethanol_gL', 'Glycerol_gL', 'TotalCells_cellsML'];
  const rows = exportList.map(s => [
    s.projectId || state.currentProjectId,
    s.tank,
    s.time,
    s.brix ?? '',
    s.sugarConvert ?? '',
    s.sucrose ?? '',
    s.glucose ?? '',
    s.fructose ?? '',
    s.ethanol ?? '',
    s.glycerol ?? '',
    s.cellCount ?? ''
  ]);

  let csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `MitrPhol_DataRecords_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.labAudio.playSuccess();
  showToast(`ส่งออกข้อมูล CSV (${exportList.length} แถว) เรียบร้อย`, 'success');
};

// ==========================================================================
// User Management CRUD (Admin Only - Requirement 4)
// ==========================================================================
function renderUserManagementTable() {
  const tbody = document.getElementById('user-management-tbody');
  if (!tbody) return;

  tbody.innerHTML = state.users.map(u => `
    <tr>
      <td><strong>${u.displayName}</strong></td>
      <td>${u.email}</td>
      <td><span class="user-role-badge role-${u.role}">${u.role.toUpperCase()}</span></td>
      <td><code>••••••••</code></td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-sm btn-secondary" onclick="editUserModal('${u.uid}')">แก้ไข</button>
          <button class="btn btn-sm btn-secondary" onclick="deleteUser('${u.uid}')" style="color: #ef4444;" ${u.uid === state.currentUser?.uid ? 'disabled title="ไม่สามารถลบบัญชีของตนเองได้"' : ''}>
            ลบ
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

window.openAddUserModal = function() {
  Swal.fire({
    title: 'เพิ่มผู้ใช้งานใหม่',
    html: `
      <div style="text-align: left; font-size: 0.88rem;">
        <div class="form-group">
          <label class="form-label">ชื่อ-นามสกุล:</label>
          <input type="text" id="swal-user-name" class="form-input" placeholder="ดร.สุชาติ นักวิจัย">
        </div>
        <div class="form-group">
          <label class="form-label">อีเมล (Email):</label>
          <input type="email" id="swal-user-email" class="form-input" placeholder="suchart.s@mitrphol.com">
        </div>
        <div class="form-group">
          <label class="form-label">รหัสผ่าน (Password):</label>
          <input type="password" id="swal-user-password" class="form-input" placeholder="••••••••">
        </div>
        <div class="form-group">
          <label class="form-label">บทบาท (Role):</label>
          <select id="swal-user-role" class="form-select">
            <option value="researcher">Researcher (นักวิจัย)</option>
            <option value="admin">Admin (ผู้ดูแลระบบ)</option>
          </select>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'สร้างผู้ใช้งาน',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0f3d7a',
    preConfirm: () => {
      const name = document.getElementById('swal-user-name').value.trim();
      const email = document.getElementById('swal-user-email').value.trim();
      const password = document.getElementById('swal-user-password').value;
      const role = document.getElementById('swal-user-role').value;

      if (!name || !email || !password) {
        Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบทุกช่อง');
        return false;
      }
      return { name, email, password, role };
    }
  }).then((res) => {
    if (res.isConfirmed) {
      const u = res.value;
      const newUser = {
        uid: 'usr_' + Date.now(),
        displayName: u.name,
        email: u.email,
        password: u.password,
        role: u.role
      };
      state.users.push(newUser);
      persistState();
      window.labAudio.playSuccess();
      logAction('ADD_USER', `สร้างผู้ใช้งานใหม่ ${u.name} (${u.role})`);
      renderUserManagementTable();
      showToast(`สร้างผู้ใช้ ${u.name} เรียบร้อย`, 'success');
    }
  });
};

window.editUserModal = function(uid) {
  const u = state.users.find(x => x.uid === uid);
  if (!u) return;

  Swal.fire({
    title: `แก้ไขผู้ใช้งาน: ${u.displayName}`,
    html: `
      <div style="text-align: left; font-size: 0.88rem;">
        <div class="form-group">
          <label class="form-label">ชื่อ-นามสกุล:</label>
          <input type="text" id="swal-edit-name" class="form-input" value="${u.displayName}">
        </div>
        <div class="form-group">
          <label class="form-label">รหัสผ่านใหม่ (ว่างไว้หากไม่เปลี่ยน):</label>
          <input type="password" id="swal-edit-password" class="form-input" placeholder="••••••••">
        </div>
        <div class="form-group">
          <label class="form-label">บทบาท (Role):</label>
          <select id="swal-edit-role" class="form-select">
            <option value="researcher" ${u.role === 'researcher' ? 'selected' : ''}>Researcher (นักวิจัย)</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin (ผู้ดูแลระบบ)</option>
          </select>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'บันทึกการแก้ไข',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0f3d7a',
    preConfirm: () => {
      const name = document.getElementById('swal-edit-name').value.trim();
      const newPwd = document.getElementById('swal-edit-password').value;
      const role = document.getElementById('swal-edit-role').value;
      return { name, newPwd, role };
    }
  }).then((res) => {
    if (res.isConfirmed) {
      u.displayName = res.value.name;
      u.role = res.value.role;
      if (res.value.newPwd) u.password = res.value.newPwd;

      persistState();
      window.labAudio.playSuccess();
      logAction('UPDATE_USER', `อัปเดตข้อมูลผู้ใช้ ${u.displayName}`);
      renderUserManagementTable();
      showToast(`อัปเดตข้อมูล ${u.displayName} เรียบร้อย`, 'success');
    }
  });
};

window.deleteUser = function(uid) {
  const u = state.users.find(x => x.uid === uid);
  if (!u) return;

  if (u.uid === state.currentUser?.uid) {
    Swal.fire({ icon: 'error', title: 'ไม่สามารถลบได้', text: 'ไม่สามารถลบบัญชีที่กำลังล็อกอินอยู่ได้' });
    return;
  }

  Swal.fire({
    title: `ลบผู้ใช้งาน ${u.displayName}?`,
    text: 'ผู้ใช้นี้จะไม่สามารถเข้าสู่ระบบได้อีกต่อไป',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ยืนยันการลบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#991b1b'
  }).then((res) => {
    if (res.isConfirmed) {
      state.users = state.users.filter(x => x.uid !== uid);
      persistState();
      window.labAudio.playWarning();
      logAction('DELETE_USER', `ลบผู้ใช้งาน ${u.displayName}`);
      renderUserManagementTable();
      showToast(`ลบผู้ใช้ ${u.displayName} เรียบร้อย`, 'info');
    }
  });
};

// ==========================================================================
// Condition Optimizer & Best Condition
// ==========================================================================
function renderOptimizerView() {
  const container = document.getElementById('optimizer-ranking-tbody');
  if (!container) return;

  const currentUserId = state.currentUser ? state.currentUser.uid : 'usr_01';
  const isAdmin = state.currentUser && state.currentUser.role === 'admin';

  // Requirement: Show ONLY the logged-in researcher's own conditions
  let userConditions = window.CROSS_CONDITIONS_SUMMARY.filter(c => c.ownerId === currentUserId);
  if (userConditions.length === 0 && isAdmin) {
    const curProj = state.projects.find(p => p.id === state.currentProjectId);
    const targetOwner = curProj ? curProj.ownerId : 'usr_01';
    userConditions = window.CROSS_CONDITIONS_SUMMARY.filter(c => c.ownerId === targetOwner);
  }

  // Update scope badge
  const scopeBadge = document.getElementById('optimizer-researcher-scope-badge');
  if (scopeBadge) {
    scopeBadge.textContent = `เฉพาะงานวิจัยของ: ${state.currentUser ? state.currentUser.displayName : 'ดร.สมชาย นักวิจัย'}`;
  }

  if (userConditions.length === 0) {
    container.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 24px;">ไม่มีสภาวะการทดลองของนักวิจัยท่านนี้</td></tr>';
    return;
  }

  // Determine best condition for this researcher
  let bestCond = userConditions.find(c => c.isBest);
  if (!bestCond) {
    bestCond = [...userConditions].sort((a, b) => (b.yieldYps || 0) - (a.yieldYps || 0))[0];
  }

  // Update Dynamic Banner
  const winnerTitle = document.getElementById('optimizer-winner-title');
  const winnerDesc = document.getElementById('optimizer-winner-desc');
  const winnerBtn = document.getElementById('btn-optimizer-winner-details');

  if (winnerTitle && bestCond) {
    winnerTitle.textContent = `${bestCond.conditionKey} (D = ${bestCond.dilutionRateD} h⁻¹, ${bestCond.ratioBC || '80:20'}, ${bestCond.temp || 30} °C)`;
  }
  if (winnerDesc && bestCond) {
    winnerDesc.innerHTML = `
      ให้ผลได้เอทานอลสูงสุด <strong>${bestCond.maxEthanolGPerL} g/L</strong>, 
      ผลได้ต่อน้ำตาล <strong>Yield (Yp/s) = ${bestCond.yieldYps} g/g</strong> 
      และอัตราผลิต <strong>Productivity = ${bestCond.productivityQp} g/L·h</strong>
    `;
  }
  if (winnerBtn && bestCond) {
    winnerBtn.setAttribute('onclick', `viewConditionDetails('${bestCond.conditionKey}')`);
  }

  container.innerHTML = userConditions.map((cond, idx) => {
    const isWinner = cond.conditionKey === bestCond.conditionKey;
    return `
      <tr style="${isWinner ? 'background: #fffbeb; font-weight: 600;' : ''}">
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>${idx + 1}</span>
            ${isWinner ? '<span class="badge badge-best-condition">🏆 Best Condition</span>' : ''}
            <span>${cond.conditionKey}</span>
          </div>
        </td>
        <td><strong>${cond.dilutionRateD}</strong></td>
        <td>${cond.maxEthanolGPerL} g/L</td>
        <td><span class="badge ${isWinner ? 'badge-gold' : 'badge-navy'}">${cond.yieldYps} g/g</span></td>
        <td><strong>${cond.productivityQp}</strong> g/L·h</td>
        <td>${cond.sugarConversionPct} %</td>
        <td>${cond.cellViabilityPct} %</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="viewConditionDetails('${cond.conditionKey}')">
            ดูรายละเอียด
          </button>
        </td>
      </tr>
    `;
  }).join('');

  renderOptimizerRadarChart(userConditions, bestCond);
}

function renderOptimizerRadarChart(conditions = [], bestCond = null) {
  const ctx = document.getElementById('chart-radar-optimizer')?.getContext('2d');
  if (!ctx) return;
  if (state.charts.radar) state.charts.radar.destroy();

  const labels = ['Max Ethanol (g/L)', 'Yield Yp/s (×200)', 'Productivity Qp (×40)', 'Sugar Conversion %', 'Viability %'];

  const colorPalette = [
    { border: '#d97706', bg: 'rgba(217, 119, 6, 0.2)' },
    { border: '#1d4ed8', bg: 'rgba(29, 78, 216, 0.1)' },
    { border: '#059669', bg: 'rgba(5, 150, 105, 0.1)' },
    { border: '#7c3aed', bg: 'rgba(124, 58, 237, 0.1)' }
  ];

  const datasets = conditions.map((cond, idx) => {
    const isWinner = bestCond && cond.conditionKey === bestCond.conditionKey;
    const color = isWinner ? colorPalette[0] : (colorPalette[(idx + 1) % colorPalette.length]);
    return {
      label: `${cond.conditionKey}${isWinner ? ' (Winner)' : ''}`,
      data: [
        cond.maxEthanolGPerL || 0,
        (cond.yieldYps || 0) * 200,
        (cond.productivityQp || 0) * 40,
        cond.sugarConversionPct || 0,
        cond.cellViabilityPct || 0
      ],
      borderColor: color.border,
      backgroundColor: color.bg,
      borderWidth: isWinner ? 3 : 2
    };
  });

  state.charts.radar = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { 
          display: true, 
          text: `Multi-Parameter Performance Radar - Condition Benchmark (${state.currentUser?.displayName || 'Researcher'})` 
        }
      }
    }
  });
}

window.viewConditionDetails = function(condKey) {
  const item = window.CROSS_CONDITIONS_SUMMARY.find(c => c.conditionKey === condKey);
  if (!item) return;

  Swal.fire({
    title: `วิเคราะห์สภาวะ ${item.conditionKey}`,
    html: `
      <div style="text-align: left; font-size: 0.9rem; line-height: 1.8;">
        <p>• <strong>Dilution Rate (D):</strong> ${item.dilutionRateD} h⁻¹</p>
        <p>• <strong>Max Ethanol Produced:</strong> ${item.maxEthanolGPerL} g/L</p>
        <p>• <strong>Ethanol Yield (Yp/s):</strong> ${item.yieldYps} g/g (ทฤษฎี Gay-Lussac สูงสุด 0.511)</p>
        <p>• <strong>Productivity (Qp):</strong> ${item.productivityQp} g/L·h</p>
        <p>• <strong>Sugar Conversion:</strong> ${item.sugarConversionPct}%</p>
        <p>• <strong>สรุปผล:</strong> ${item.isBest ? '<strong>สภาวะที่ดีที่สุดสำหรับกระบวนการหมักต่อเนื่องของมิตรผล</strong> เนื่องจากให้อัตราผลได้เอทานอลสูงสุด และความอยู่รอดของเซลล์ยีสต์สม่ำเสมอ' : 'มีประสิทธิภาพรองลงมา'}</p>
      </div>
    `,
    confirmButtonColor: '#0f3d7a',
    confirmButtonText: 'ปิด'
  });
};

// ==========================================================================
// Presentation Suite
// ==========================================================================
function setupPresentationDeck() {
  document.getElementById('btn-open-presentation')?.addEventListener('click', openPresentationModal);
  document.getElementById('btn-close-presentation')?.addEventListener('click', closePresentationModal);
  document.getElementById('btn-prev-slide')?.addEventListener('click', () => navigateSlide(-1));
  document.getElementById('btn-next-slide')?.addEventListener('click', () => navigateSlide(1));
  document.getElementById('btn-export-pdf')?.addEventListener('click', () => window.print());
}

function openPresentationModal() {
  state.slideIndex = 1;
  updateSlideContent();
  document.getElementById('presentation-modal').classList.add('open');
  window.labAudio.playSuccess();
}

function closePresentationModal() {
  document.getElementById('presentation-modal').classList.remove('open');
  window.labAudio.playClick();
}

function navigateSlide(direction) {
  state.slideIndex = Math.max(1, Math.min(state.totalSlides, state.slideIndex + direction));
  window.labAudio.playClick();
  updateSlideContent();
}

function updateSlideContent() {
  document.getElementById('slide-counter-badge').textContent = `Slide ${state.slideIndex} of ${state.totalSlides}`;
  const container = document.getElementById('slide-inner-content');
  const project = state.projects.find(p => p.id === state.currentProjectId);

  if (state.slideIndex === 1) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px;">
        <span class="badge badge-gold" style="font-size: 0.9rem; padding: 6px 16px; margin-bottom: 16px;">
          Mitr Phol Biotech Research & Development
        </span>
        <h1 style="font-size: 2rem; color: #0a2540; margin: 16px 0;">รายงานสรุปผลการทดลองการหมักชีวภาพต่อเนื่อง</h1>
        <h3 style="color: #475569; font-weight: 500;">Batch: ${project.batchMediumNo} | Experiment: ${project.experimentNo}</h3>
        
        <div style="max-width: 650px; margin: 30px auto; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; text-align: left;">
          <p><strong>• สภาวะการทดลอง (Condition):</strong> ${project.conditionText}</p>
          <p>• <strong>สัดส่วน Feed Culture:</strong> ${project.conditionParams.feedCulture}</p>
          <p>• <strong>สายพันธุ์ยีสต์ (Seed):</strong> ${project.seed}</p>
          <p>• <strong>นักวิจัยผู้รับผิดชอบ:</strong> ${project.ownerName}</p>
          <p>• <strong>วันที่เริ่มการทดลอง:</strong> ${project.date}</p>
        </div>
      </div>
    `;
  } else if (state.slideIndex === 2) {
    container.innerHTML = `
      <div>
        <h2 style="color: #0a2540; margin-bottom: 8px;">ตารางวิเคราะห์ Kinetic รวมของถังหมักทั้ง 8 ใบ (PF → D3)</h2>
        <p style="color: #64748b; margin-bottom: 20px;">สรุปค่าความเข้มข้นสารสุดท้าย (Final Harvesting Values @ 82h)</p>
        
        <div class="lab-data-table-wrapper">
          <table class="lab-table">
            <thead>
              <tr>
                <th>ถังหมัก</th>
                <th>คำอธิบาย</th>
                <th>Brix สุดท้าย (°Bx)</th>
                <th>Sugar Convert (g/L)</th>
                <th>Ethanol (g/L)</th>
                <th>Glycerol (g/L)</th>
                <th>Cell Count (cells/mL)</th>
              </tr>
            </thead>
            <tbody>
              ${window.LAB_TANKS.map(t => {
                const s = state.samples.filter(x => x.tank === t.id).sort((a,b) => b.time - a.time)[0] || {};
                return `
                  <tr>
                    <td><strong><span style="color: ${t.color}">●</span> ${t.id}</strong></td>
                    <td>${t.desc}</td>
                    <td>${s.brix !== undefined ? s.brix : '-'}</td>
                    <td>${s.sugarConvert !== undefined ? s.sugarConvert : '-'}</td>
                    <td><strong>${s.ethanol !== undefined ? s.ethanol : '-'}</strong></td>
                    <td>${s.glycerol !== undefined ? s.glycerol : '-'}</td>
                    <td>${s.cellCount ? s.cellCount.toExponential(2) : '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (state.slideIndex === 3) {
    container.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;">
          <div>
            <h2 style="color: #0a2540; margin-bottom: 4px; font-size: 1.4rem;">Kinetics Profile: การใช้น้ำตาล vs การผลิตเอทานอล</h2>
            <p style="color: #64748b; font-size: 0.9rem;">เปรียบเทียบการลดลงของน้ำตาลรวม (Sugar Consumption) คู่ขนานกับการเพิ่มขึ้นของเอทานอล (Ethanol Production) แบบ 2 แกน Y</p>
          </div>
          <!-- View Switcher Tabs -->
          <div style="display: inline-flex; background: #f1f5f9; padding: 4px; border-radius: 8px; gap: 4px;">
            <button class="btn btn-sm slide-kinetics-tab-btn active" id="btn-slide-mode-cascade" onclick="changeSlide3KineticsView('cascade')">
              🌊 Cascade Flow (PF → D3)
            </button>
            <button class="btn btn-sm slide-kinetics-tab-btn" id="btn-slide-mode-steady" onclick="changeSlide3KineticsView('steady')">
              ⚖️ Steady-State @ 82h
            </button>
            <button class="btn btn-sm slide-kinetics-tab-btn" id="btn-slide-mode-pf" onclick="changeSlide3KineticsView('pf')">
              🌱 Pre-fermenter PF (0-82h)
            </button>
          </div>
        </div>

        <!-- 4 KPI Summary Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px;">
          <div class="kpi-stat-card" style="padding: 12px 14px;">
            <span class="kpi-label">น้ำตาลตั้งต้น (Initial Sugar)</span>
            <div class="kpi-value" style="color: #0f3d7a; font-size: 1.3rem;">125.2 g/L</div>
            <span class="kpi-desc">ถังเตรียมเชื้อ PF @ 0h (Brix 18.0)</span>
          </div>
          <div class="kpi-stat-card" style="padding: 12px 14px;">
            <span class="kpi-label">ประสิทธิภาพใช้น้ำตาล (% Consumed)</span>
            <div class="kpi-value" style="color: #059669; font-size: 1.3rem;">99.9 %</div>
            <span class="kpi-desc">น้ำตาลเหลือใน D3 เพียง 0.096 g/L</span>
          </div>
          <div class="kpi-stat-card" style="padding: 12px 14px;">
            <span class="kpi-label">ผลผลิตเอทานอลสูงสุด (Peak Ethanol)</span>
            <div class="kpi-value" style="color: #ea580c; font-size: 1.3rem;">99.53 g/L</div>
            <span class="kpi-desc">ถังเก็บเกี่ยวสุดท้าย D3 @ 82h (12.6% v/v)</span>
          </div>
          <div class="kpi-stat-card" style="padding: 12px 14px;">
            <span class="kpi-label">Ethanol Yield (Yp/s)</span>
            <div class="kpi-value" style="color: #b45309; font-size: 1.3rem;">0.491 g/g</div>
            <span class="kpi-desc">96.3% ของขีดจำกัดทางทฤษฎี (0.51 g/g)</span>
          </div>
        </div>

        <!-- Chart Container with Dual Y-Axes -->
        <div style="height: 330px; position: relative; background: #ffffff; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
          <canvas id="slide-chart-kinetics"></canvas>
        </div>

        <!-- Biochemical Kinetics Callout -->
        <div style="margin-top: 12px; padding: 12px 16px; background: #f8fafc; border-left: 4px solid #ea580c; border-radius: 8px; font-size: 0.85rem; color: #334155;">
          <strong>💡 ข้อสังเกตจลนพลศาสตร์ชีวเคมี (Biochemical Kinetic Insights):</strong>
          <div id="slide3-kinetic-insight-text" style="margin-top: 4px; line-height: 1.5;">
            • <strong>จุดตัดทางชีวเคมี (Cross-Over Phase @ F2 → F3):</strong> น้ำตาลลดลงฮวบจาก 100.3 g/L เหลือ 19.6 g/L พร้อมการพุ่งขึ้นของเอทานอลจาก 49.9 g/L สู่ 78.4 g/L<br>
            • <strong>สภาวะการหมักสมบูรณ์ (Finishing Phase @ F4 → D3):</strong> น้ำตาลถูกใช้เกือบหมด (&lt; 2 g/L ใน F4 และ &lt; 0.1 g/L ใน F5–D3) เอทานอลแตะจุดสูงสุด 99.53 g/L ปราศจากปัญหา Stuck Fermentation
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      window.renderSlide3KineticsChart('cascade');
    }, 50);
  } else if (state.slideIndex === 4) {
    container.innerHTML = `
      <div>
        <h2 style="color: #0a2540; margin-bottom: 8px;">พฤติกรรมและการเจริญเติบโตของเซลล์ยีสต์</h2>
        <p style="color: #64748b; margin-bottom: 16px;">สัดส่วนเซลล์มีชีวิต (% Viability) และการแตกหน่อ (Budding Index) ส่องด้วยกล้องจุลทรรศน์</p>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
          <div class="kpi-stat-card">
            <span class="kpi-label">Average Viability</span>
            <div class="kpi-value" style="color: #059669;">97.4 %</div>
            <span class="kpi-desc">ความสมบูรณ์สูง สีย้อม Methylene Blue ไม่ติดสี</span>
          </div>
          <div class="kpi-stat-card">
            <span class="kpi-label">Average Budding Index</span>
            <div class="kpi-value" style="color: #d97706;">11.1 %</div>
            <span class="kpi-desc">อัตราการแตกหน่อคงที่ตลอด Cascade</span>
          </div>
          <div class="kpi-stat-card">
            <span class="kpi-label">Peak Cell Density</span>
            <div class="kpi-value" style="color: #1e3a8a;">9.15 × 10⁸</div>
            <span class="kpi-desc">cells/mL ณ ถัง PF @ 46h</span>
          </div>
        </div>
      </div>
    `;
  } else if (state.slideIndex === 5) {
    container.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <span class="badge badge-best-condition" style="font-size: 1rem; padding: 8px 20px; margin-bottom: 16px;">
          🏆 ข้อสรุปสภาวะการหมักที่ดีที่สุด (Best Condition Determination)
        </span>
        <h1 style="color: #0a2540; margin: 16px 0;">สภาวะ D = 0.022 h⁻¹ (B:C 80:20, 30°C)</h1>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; max-width: 850px; margin: 24px auto;">
          <div class="kpi-stat-card" style="text-align: left;">
            <span class="kpi-label">Ethanol Yield</span>
            <div class="kpi-value" style="color: #d97706;">0.491 g/g</div>
            <span class="kpi-desc">96.1% ของขีดจำกัดทฤษฎีชีวเคมี</span>
          </div>
          <div class="kpi-stat-card" style="text-align: left;">
            <span class="kpi-label">Productivity (Qp)</span>
            <div class="kpi-value" style="color: #059669;">2.18 g/L·h</div>
            <span class="kpi-desc">อัตราการผลิตต่อชั่วโมงสูงสุด</span>
          </div>
          <div class="kpi-stat-card" style="text-align: left;">
            <span class="kpi-label">Sugar Conversion</span>
            <div class="kpi-value" style="color: #1e3a8a;">99.3 %</div>
            <span class="kpi-desc">ใช้น้ำตาลหมดอย่างมีประสิทธิภาพ</span>
          </div>
        </div>

        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 18px; max-width: 850px; margin: 0 auto; text-align: left;">
          <strong style="color: #166534;">💡 ข้อเสนอแนะเชิงกลยุทธ์สำหรับโรงงาน:</strong>
          <p style="color: #15803d; font-size: 0.9rem; margin-top: 4px;">
            แนะนำให้ใช้สภาวะ Dilution Rate D = 0.022 เป็นเกณฑ์มาตรฐานหลักสำหรับการขยายขนาด (Scale-up) เนื่องจากรักษาสมดุลระหว่างอัตราการเจือจางและความเข้มข้นเอทานอลได้เสถียรที่สุดตลอด Cascade 8 ถัง
          </p>
        </div>
      </div>
    `;
  }
}

window.changeSlide3KineticsView = function(mode) {
  document.querySelectorAll('.slide-kinetics-tab-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-slide-mode-${mode}`);
  if (activeBtn) activeBtn.classList.add('active');
  window.renderSlide3KineticsChart(mode);
};

window.renderSlide3KineticsChart = function(mode = 'cascade') {
  const ctx = document.getElementById('slide-chart-kinetics')?.getContext('2d');
  if (!ctx) return;

  if (state.charts.slideKinetics) {
    state.charts.slideKinetics.destroy();
    state.charts.slideKinetics = null;
  }

  const projSamples = state.samples.filter(s => s.projectId === state.currentProjectId || !s.projectId);
  let labels = [];
  let sugarData = [];
  let ethanolData = [];
  let insightText = '';

  if (mode === 'cascade') {
    const stages = [
      { tank: 'PF', time: 0, label: 'PF (0h - Inoculum)' },
      { tank: 'PF', time: 22, label: 'PF (22h - Seed Ready)' },
      { tank: 'F2', time: 34, label: 'F2 (34h - Fresh Feed)' },
      { tank: 'F3', time: 40, label: 'F3 (40h - Active)' },
      { tank: 'F4', time: 46, label: 'F4 (46h - Maturing)' },
      { tank: 'F5', time: 58, label: 'F5 (58h - Finishing)' },
      { tank: 'F6', time: 70, label: 'F6 (70h - Polishing)' },
      { tank: 'D3', time: 82, label: 'D3 (82h - Final Harvest)' }
    ];

    labels = stages.map(s => s.label);
    stages.forEach(st => {
      const match = projSamples.find(s => s.tank === st.tank && s.time === st.time) ||
                    window.SEED_SAMPLES_220326.find(s => s.tank === st.tank && s.time === st.time) || {};
      sugarData.push(match.sugarConvert !== undefined ? match.sugarConvert : 0);
      ethanolData.push(match.ethanol !== undefined ? match.ethanol : 0);
    });

    insightText = `• <strong>จุดตัดทางชีวเคมี (Cross-Over Phase @ F2 → F3):</strong> น้ำตาลลดลงฮวบจาก 100.3 g/L เหลือ 19.6 g/L พร้อมการพุ่งขึ้นของเอทานอลจาก 49.9 g/L สู่ 78.4 g/L<br>
• <strong>สภาวะการหมักสมบูรณ์ (Finishing Phase @ F4 → D3):</strong> น้ำตาลถูกใช้เกือบหมด (&lt; 2 g/L ใน F4 และ &lt; 0.1 g/L ใน F5–D3) เอทานอลแตะจุดสูงสุด 99.53 g/L ปราศจากปัญหา Stuck Fermentation`;
  } else if (mode === 'steady') {
    const tanks = ['PF', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'D3'];
    labels = tanks.map(t => `${t} (82h)`);
    tanks.forEach(t => {
      const match = projSamples.find(s => s.tank === t && s.time === 82) ||
                    window.SEED_SAMPLES_220326.find(s => s.tank === t && s.time === 82) || {};
      sugarData.push(match.sugarConvert !== undefined ? match.sugarConvert : 0);
      ethanolData.push(match.ethanol !== undefined ? match.ethanol : 0);
    });

    insightText = `• <strong>สภาวะคงที่ตลอด Cascade (Steady-State @ 82h):</strong> ในถัง F2 มีน้ำตาลคงค้าง 69.2 g/L จากการป้อนน้ำตาลต่อเนื่อง และถูกย่อยสลายอย่างรวดเร็วต่อเนื่องผ่านถัง F3 (19.6 g/L) และ F4 (1.18 g/L)<br>
• <strong>ถังขัดเกลาและเก็บเกี่ยว (F5–D3):</strong> รักษาระดับเอทานอลสม่ำเสมอ 94.9–99.5 g/L ควบคู่กับการควบคุมสาร Byproduct (Glycerol &lt; 10.8 g/L)`;
  } else if (mode === 'pf') {
    const pfSamples = projSamples.filter(s => s.tank === 'PF').sort((a,b) => a.time - b.time);
    labels = pfSamples.map(s => `${s.time}h`);
    sugarData = pfSamples.map(s => s.sugarConvert ?? 0);
    ethanolData = pfSamples.map(s => s.ethanol ?? 0);

    insightText = `• <strong>พลวัตในถังเตรียมเชื้อ (Pre-fermenter PF):</strong> น้ำตาลเริ่มต้น 125.2 g/L ถูกใช้อย่างรวดเร็วจนเหลือเพียง 4.04 g/L ภายใน 12 ชม.แรก (Exponential Growth Phase)<br>
• <strong>การสะสมเอทานอลใน PF:</strong> เอทานอลคงที่ที่ระดับ ~45–50 g/L ในช่วง 22–82 ชม. พร้อมความหนาแน่นเซลล์สูงสุด 9.15 × 10⁸ cells/mL แสดงถึงสุขภาพเซลล์ที่พร้อมส่งต่อเข้าสู่ Cascade F2`;
  }

  const insightEl = document.getElementById('slide3-kinetic-insight-text');
  if (insightEl) insightEl.innerHTML = insightText;

  state.charts.slideKinetics = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'น้ำตาลรวมคงเหลือ Total Sugar (g/L)',
          data: sugarData,
          borderColor: '#0f3d7a',
          backgroundColor: 'rgba(15, 61, 122, 0.12)',
          fill: true,
          tension: 0.3,
          borderWidth: 3,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: '#0f3d7a',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          yAxisID: 'y'
        },
        {
          label: 'เอทานอลที่ผลิตได้ Ethanol Produced (g/L)',
          data: ethanolData,
          borderColor: '#ea580c',
          backgroundColor: 'rgba(234, 88, 12, 0.08)',
          fill: false,
          tension: 0.3,
          borderWidth: 3.5,
          borderDash: [6, 4],
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: '#ea580c',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 16,
            usePointStyle: true,
            font: { weight: 'bold', size: 12 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(10, 37, 64, 0.95)',
          padding: 12,
          titleFont: { size: 13, weight: 'bold' },
          bodyFont: { size: 12 },
          callbacks: {
            label: function(context) {
              const unit = 'g/L';
              return ` ${context.dataset.label}: ${Number(context.raw).toFixed(2)} ${unit}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { weight: '600' } }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'น้ำตาลรวม Total Sugar (g/L)',
            color: '#0f3d7a',
            font: { weight: 'bold', size: 12 }
          },
          grid: { color: 'rgba(226, 232, 240, 0.8)' },
          min: 0,
          suggestedMax: 140
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'เอทานอล Ethanol Produced (g/L)',
            color: '#ea580c',
            font: { weight: 'bold', size: 12 }
          },
          grid: { drawOnChartArea: false },
          min: 0,
          suggestedMax: 120
        }
      }
    }
  });
};

// ==========================================================================
// Audit Trail & Data Log Table with Filtering & Restore (Requirements 3 & 8)
// ==========================================================================
function syncAuditLogUserFilter() {
  const userSelect = document.getElementById('audit-filter-user');
  if (!userSelect) return;

  const currentVal = userSelect.value || 'ALL';
  const userSet = new Set();
  state.users.forEach(u => userSet.add(u.displayName));
  state.auditLogs.forEach(l => { if (l.userName) userSet.add(l.userName); });

  userSelect.innerHTML = `
    <option value="ALL">ทุกคน (All Researchers)</option>
    ${Array.from(userSet).map(name => `
      <option value="${name}" ${name === currentVal ? 'selected' : ''}>${name}</option>
    `).join('')}
  `;
}

window.resetAuditLogFilters = function() {
  const u = document.getElementById('audit-filter-user');
  const d = document.getElementById('audit-filter-date');
  const m = document.getElementById('audit-filter-month');
  const y = document.getElementById('audit-filter-year');
  const q = document.getElementById('audit-filter-quarter');
  const a = document.getElementById('audit-filter-action');

  if (u) u.value = 'ALL';
  if (d) d.value = '';
  if (m) m.value = 'ALL';
  if (y) y.value = 'ALL';
  if (q) q.value = 'ALL';
  if (a) a.value = 'ALL';

  renderAuditLogs();
  showToast('รีเซ็ตตัวกรองประวัติการทำงานแล้ว', 'info');
};

function renderAuditLogs() {
  const container = document.getElementById('audit-log-tbody');
  if (!container) return;

  syncAuditLogUserFilter();

  const filterUser = document.getElementById('audit-filter-user')?.value || 'ALL';
  const filterDate = document.getElementById('audit-filter-date')?.value || '';
  const filterMonth = document.getElementById('audit-filter-month')?.value || 'ALL';
  const filterYear = document.getElementById('audit-filter-year')?.value || 'ALL';
  const filterQuarter = document.getElementById('audit-filter-quarter')?.value || 'ALL';
  const filterAction = document.getElementById('audit-filter-action')?.value || 'ALL';

  const filteredLogs = state.auditLogs.filter(log => {
    const logDate = new Date(log.timestamp);
    const dateStr = log.timestamp ? log.timestamp.slice(0, 10) : '';
    const year = logDate.getFullYear();
    const month = logDate.getMonth() + 1; // 1-12

    // User filter
    if (filterUser !== 'ALL' && log.userName !== filterUser) return false;

    // Specific Date filter (YYYY-MM-DD)
    if (filterDate && dateStr !== filterDate) return false;

    // Year filter
    if (filterYear !== 'ALL' && year !== parseInt(filterYear)) return false;

    // Month filter
    if (filterMonth !== 'ALL' && month !== parseInt(filterMonth)) return false;

    // Quarter filter
    if (filterQuarter !== 'ALL') {
      let q = 'Q1';
      if (month >= 4 && month <= 6) q = 'Q2';
      else if (month >= 7 && month <= 9) q = 'Q3';
      else if (month >= 10 && month <= 12) q = 'Q4';
      if (q !== filterQuarter) return false;
    }

    // Action filter
    if (filterAction !== 'ALL' && log.action !== filterAction) return false;

    return true;
  });

  const countBadge = document.getElementById('audit-count-badge');
  if (countBadge) countBadge.textContent = `${filteredLogs.length} รายการ`;

  if (filteredLogs.length === 0) {
    container.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 24px;">ไม่พบประวัติการทำงานที่ตรงกับเงื่อนไขการค้นหา</td></tr>';
    return;
  }

  container.innerHTML = filteredLogs.map(log => {
    let restoreBtnHtml = '<span style="color: #cbd5e1; font-size: 0.8rem;">-</span>';
    if (log.snapshot && !log.restored) {
      restoreBtnHtml = `
        <button class="btn btn-sm btn-accent" onclick="restoreFromLog('${log.id}')" style="padding: 4px 10px; font-size: 0.76rem; white-space: nowrap;" title="กู้คืนข้อมูลนี้กลับสู่ระบบ">
          ♻️ กู้คืนข้อมูล
        </button>
      `;
    } else if (log.snapshot && log.restored) {
      restoreBtnHtml = `
        <span class="badge" style="background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; font-size: 0.74rem; padding: 3px 8px;">
          ✓ กู้คืนแล้ว
        </span>
      `;
    }

    return `
      <tr>
        <td style="color: #64748b; font-size: 0.82rem;">${new Date(log.timestamp).toLocaleString('th-TH')}</td>
        <td><strong>${log.userName}</strong></td>
        <td><span class="badge badge-navy">${log.action}</span></td>
        <td>${log.details}</td>
        <td style="text-align: center;">${restoreBtnHtml}</td>
      </tr>
    `;
  }).join('');
}

// Restore Function from Audit Trail (Requirement 3)
window.restoreFromLog = function(logId) {
  const log = state.auditLogs.find(l => l.id === logId);
  if (!log || !log.snapshot) return;

  const isProject = log.snapshot.type === 'PROJECT';

  Swal.fire({
    title: 'กู้คืนข้อมูลย้อนหลัง?',
    html: `
      <div style="text-align: left; font-size: 0.88rem; line-height: 1.65;">
        <p>• <strong>การกระทำเดิม:</strong> ${log.details}</p>
        <p>• <strong>ประเภทข้อมูล:</strong> ${isProject ? 'โปรเจกต์งานวิจัยและข้อมูลทุกแถว' : 'ข้อมูลตัวอย่างแถวเดี่ยว'}</p>
        <p style="color: #059669; margin-top: 10px; font-weight: 600;">
          🛡️ ระบบจะนำข้อมูลนี้กลับคืนสู่ฐานข้อมูลทันที ป้องกันข้อมูลสูญหาย
        </p>
      </div>
    `,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'ยืนยันกู้คืนข้อมูล',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0f3d7a'
  }).then((res) => {
    if (res.isConfirmed) {
      if (log.snapshot.type === 'SAMPLE_ROW') {
        const row = log.snapshot.data;
        // Remove existing duplicate if any, then insert restored row
        state.samples = state.samples.filter(x => !((x.projectId === row.projectId || !x.projectId) && x.tank === row.tank && x.time === row.time));
        state.samples.push(row);
        logAction('RESTORE_DATA', `กู้คืนข้อมูล ${row.tank} @ ${row.time}h (โปรเจกต์: ${row.projectId || state.currentProjectId})`);
      } else if (log.snapshot.type === 'PROJECT') {
        const proj = log.snapshot.project;
        const samples = log.snapshot.samples || [];

        // Re-add project if missing
        if (!state.projects.some(p => p.id === proj.id)) {
          state.projects.unshift(proj);
        }
        state.currentProjectId = proj.id;

        // Re-add samples without duplicates
        samples.forEach(s => {
          const exists = state.samples.some(x => (x.projectId === s.projectId || (!x.projectId && s.projectId === proj.id)) && x.tank === s.tank && x.time === s.time);
          if (!exists) state.samples.push(s);
        });

        logAction('RESTORE_DATA', `กู้คืนโปรเจกต์ ${proj.experimentNo} (${proj.batchMediumNo}) พร้อมข้อมูล ${samples.length} แถว`);
      }

      log.restored = true;
      persistState();
      window.labAudio.playSuccess();
      renderAllDataViews();
      Swal.fire({
        icon: 'success',
        title: 'กู้คืนข้อมูลสำเร็จ',
        text: 'ข้อมูลถูกนำกลับเข้าสู่ระบบเรียบร้อยแล้ว'
      });
    }
  });
};

// ==========================================================================
// Chart Information & Research Insights Modal (Requirement 6)
// ==========================================================================
window.openChartInfoModal = function(chartKey) {
  const guideData = {
    brix: {
      title: 'Brix (°Bx) Degradation Profile',
      icon: '📉',
      axisDesc: 'แกน X: เวลาการหมัก (h) | แกน Y: ค่าความหวาน Brix (°Bx) ครอบคลุม 8 ถังหมัก (PF ถึง D3)',
      howToRead: [
        'เส้นกราฟติดตามการสลายตัวของสารละลายน้ำตาล (Brix) ในแต่ละถังหมักตลอด 82 ชั่วโมง',
        'การหมักที่สมบูรณ์จะต้องเห็นเส้นกราฟลาดเอียงลดลงอย่างต่อเนื่องแบบขั้นบันได (Stepwise Decay) จากถังแรกไปยังถังสุดท้าย',
        'ถัง F2 ถึง F5 เป็นช่วงที่มีอัตราการลดลงของ Brix ชันที่สุด (Max Consumption Rate) สอดคล้องกับการเปลี่ยนน้ำตาลเป็นเอทานอล',
        'หากเส้นกราฟของถังใดแบนราบ (Plateau) ที่ระดับความหวานสูง จะเป็นสัญญาณเตือนการเกิดภาวะหมักชะงัก (Stuck Fermentation)'
      ],
      researchSummary: [
        'สภาวะ D = 0.022 h⁻¹ แสดงอัตราการใช้น้ำตาลมีประสิทธิภาพสูงสุด โดยค่า Brix ถังสุดท้าย (D3) ลดลงเหลือ 3.2–3.5 °Bx (จากตั้งต้น 18.0 °Bx)',
        'คิดเป็นอัตราการบริโภคน้ำตาลสูงกว่า 80.5% ก่อนเข้าสู่กระบวนการกลั่นแยกเอทานอล',
        'ถัง PF (เพาะเชื้อ) มีความหวานลดลงช้าใน 16 ชั่วโมงแรกเนื่องจากเซลล์อยู่ในช่วง Lag/Early Log Phase'
      ]
    },
    cells: {
      title: 'Yeast Population & Viability Dynamics',
      icon: '🔬',
      axisDesc: 'แกน X: เวลาการหมัก (h) | แกน Y1 (ซ้าย): Total Cells (cells/mL) | แกน Y2 (ขวา): % Viability & % Budding',
      howToRead: [
        'เส้นสีน้ำเงินแสดงจำนวนเซลล์ยีสต์ทั้งหมด (Total Cells) ที่ตรวจนับด้วยฮีมาไซโตมิเตอร์',
        'เส้นประสีเขียวแสดงเปอร์เซ็นต์เซลล์มีชีวิต (% Viability) จากการย้อมสี Methylene Blue (เซลล์ตายจะติดสีน้ำเงิน เซลล์เป็นไม่ติดสี)',
        'เส้นประสีส้มแสดงดัชนีการแตกหน่อ (% Budding) บ่งชี้ความสามารถในการแบ่งเซลล์เจริญเติบโต',
        'สภาวะหมักต่อเนื่องในอุดมคติ เซลล์ต้องรักษาระดับ Viability สูงกว่า 90% ตลอดกระบวนการ'
      ],
      researchSummary: [
        'ยีสต์สายพันธุ์ Angel Lot.260624 มีความทนทานต่อสภาวะเครียดเอทานอลสูงมาก โดยมีความหนาแน่นเซลล์สูงสุด 9.15 × 10⁸ cells/mL ที่ถัง PF @ 46h',
        'เปอร์เซ็นต์เซลล์มีชีวิต (% Viability) เฉลี่ยสูงถึง 97.4% ตลอดทั้ง 8 ถังหมัก',
        'แม้ในถัง D3 ที่มีเอทานอลสะสมสูงเกือบ 100 g/L เซลล์ยังคงมี Viability สูงถึง 94.8% โดยไม่เกิดภาวะ Ethanol Toxicity ช็อกตาย'
      ]
    },
    hplc: {
      title: 'HPLC Sugar Consumption vs Ethanol Production',
      icon: '🧪',
      axisDesc: 'แกน X: เวลาการหมัก (h) | แกน Y: ความเข้มข้นสารเมแทบอไลต์ (g/L)',
      howToRead: [
        'ติดตามสารเมแทบอไลต์ 5 ชนิดจากโครมาโทกราฟีของเหลวสมรรถนะสูง (HPLC): Sucrose, Glucose, Fructose, Ethanol และ Glycerol',
        'สังเกตการลดลงอย่างรวดเร็วของน้ำตาลโมเลกุลเดี่ยว (Glucose/Fructose) เทียบกับการพุ่งสูงขึ้นของเอทานอล',
        'Glycerol เป็นผลพลอยได้ (Byproduct) จาก Osmotic Stress และ Redox Balance ของยีสต์ กราฟควรมีระดับต่ำและคงที่'
      ],
      researchSummary: [
        'เอนไซม์ Invertase ของยีสต์ไฮโดรไลซ์ Sucrose เป็น Glucose และ Fructose จนเกือบหมดภายในถัง F2–F3',
        'ยีสต์ใช้น้ำตาล Glucose เร็วกว่า Fructose อย่างมีนัยสำคัญ (Glucose Repression Mechanism)',
        'ผลผลิตเอทานอลสะสมสูงสุดในถัง D3 แตะระดับ 99.53 g/L โดยมี Glycerol ควบคุมไว้ไม่เกิน 10.78 g/L แสดงถึงสัดส่วน Ethanol Yield ต่อ Byproduct ที่ยอดเยี่ยม'
      ]
    },
    custom: {
      title: 'Custom Multi-Axis Comparison Sandbox',
      icon: '📊',
      axisDesc: 'แกน X: เวลาการหมัก (h) | แกน Y1 (ซ้าย) & แกน Y2 (ขวา): ตัวแปรที่ผู้ใช้เลือกพล็อตแบบกำหนดเอง',
      howToRead: [
        'เครื่องมือวิเคราะห์สหสัมพันธ์อิสระ รองรับการจับคู่เปรียบเทียบตัวแปรต่างสเกลพร้อมกัน 2 แกน Y',
        'ใช้ตรวจสอบสมมติฐานทางชีวเคมี เช่น ความสัมพันธ์ระหว่างการลดลงของ Brix กับการเพิ่มขึ้นของ Ethanol หรือผลกระทบของ Cell Viability ต่ออัตราการสร้างเอทานอล',
        'ช่วยวิเคราะห์หาช่วงเวลาหน่วง (Time Lag) ระหว่างการใช้น้ำตาลกับการสร้างผลผลิตในแต่ละถัง'
      ],
      researchSummary: [
        'การวิเคราะห์สหสัมพันธ์คู่ขนานระหว่าง Brix กับ HPLC Ethanol พบค่าสัมประสิทธิ์สหสัมพันธ์เชิงลบสูงมาก (r = -0.982)',
        'ยืนยันข้อสรุปงานวิจัยว่า การวัดค่า Brix หน้าถังสามารถใช้เป็นตัวชี้วัดเสมือน (Real-time Soft Sensor) สำหรับประมาณการผลผลิตเอทานอลได้อย่างแม่นยำสูง',
        'ช่วยลดความถี่และภาระงานในการฉีดวิเคราะห์ HPLC ในกระบวนการเดินระบบจริง'
      ]
    },
    radar: {
      title: 'Multi-Parameter Performance Radar (Best Condition)',
      icon: '🏆',
      axisDesc: 'เรดาร์ 5 มิติ: Max Ethanol, Yield (Yp/s), Productivity (Qp), Sugar Conversion (%), Cell Viability (%)',
      howToRead: [
        'เปรียบเทียบประสิทธิภาพรอบด้านของสภาวะการหมัก (Dilution Rates & Conditions) ข้ามการทดลอง',
        'รูปหลายเหลี่ยมของแต่ละสภาวะ ยิ่งมีพื้นที่ครอบคลุมกว้างและสมดุลทุกแกน ยิ่งบ่งบอกถึงสภาวะที่เหมาะสมสูงสุด (Pareto Optimal)',
        'ช่วยให้นักวิจัยมองเห็น Trade-off ระหว่าง Productivity (อัตราการผลิตต่อชั่วโมง) กับ Yield (ผลผลิตต่อหน่วยน้ำตาล)'
      ],
      researchSummary: [
        'สภาวะ Dilution Rate D = 0.022 h⁻¹ (B:C 80:20, 30°C) ได้รับการสรุปเป็น "Best Condition" ของโรงงานมิตรผล',
        'ให้อัตราผลได้เอทานอล (Yield Yp/s) สูงถึง 0.491 g/g คิดเป็น 96.1% ของขีดจำกัดทฤษฎี Gay-Lussac (0.511 g/g)',
        'ร่วมกับอัตราการผลิต Productivity (Qp) สูงถึง 2.18 g/L·h และ Sugar Conversion 99.3% เป็นจุดดำเนินงานที่ให้ผลตอบแทนทางเศรษฐศาสตร์สูงสุด'
      ]
    }
  };

  const g = guideData[chartKey];
  if (!g) return;

  Swal.fire({
    title: `${g.icon} ${g.title}`,
    html: `
      <div style="text-align: left; font-size: 0.88rem; line-height: 1.65; max-height: 70vh; overflow-y: auto;">
        <div style="background: var(--bg-surface-subtle); padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; border: 1px solid var(--border-subtle);">
          <strong style="color: var(--mitr-navy-900);">📐 แกนข้อมูล:</strong>
          <span style="color: #475569; font-size: 0.82rem;">${g.axisDesc}</span>
        </div>

        <div style="margin-bottom: 16px;">
          <h4 style="color: var(--mitr-navy-800); display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
            <span>📖</span> วิธีการดูกราฟตัวนี้ (How to Read & Interpret)
          </h4>
          <ul style="padding-left: 20px; color: #334155; margin: 0;">
            ${g.howToRead.map(item => `<li style="margin-bottom: 6px;">${item}</li>`).join('')}
          </ul>
        </div>

        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px;">
          <h4 style="color: #166534; display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
            <span>🔬</span> ผลสรุปข้อมูลจากงานวิจัย (Research Findings & Insights)
          </h4>
          <ul style="padding-left: 20px; color: #15803d; margin: 0;">
            ${g.researchSummary.map(item => `<li style="margin-bottom: 6px;">${item}</li>`).join('')}
          </ul>
        </div>
      </div>
    `,
    width: '680px',
    confirmButtonText: 'รับทราบ (Close)',
    confirmButtonColor: '#0f3d7a'
  });
};

// ==========================================================================
// Admin Backup, Restore & Clear Data (Requirements 4 & 7)
// ==========================================================================
window.exportFullSystemBackup = function(silent = false) {
  const factorEl = document.getElementById('setting-haemacytometer-factor');
  const backupData = {
    system: "Mitr Phol Fermentation Lab Tracker",
    version: "2.1.0",
    exportedAt: new Date().toISOString(),
    exportedBy: state.currentUser ? state.currentUser.displayName : 'Admin',
    users: state.users,
    projects: state.projects,
    samples: state.samples,
    auditLogs: state.auditLogs,
    settings: {
      haemacytometerFactor: factorEl ? parseFloat(factorEl.value) || 250000 : 250000
    }
  };

  const jsonStr = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url;
  a.download = `MitrPhol_FullBackup_${timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (!silent) {
    window.labAudio.playSuccess();
    logAction('BACKUP_EXPORT', `ส่งออกไฟล์สำรองข้อมูลระบบทั้งหมด (${state.projects.length} โปรเจกต์, ${state.samples.length} ข้อมูลตัวอย่าง, ${state.auditLogs.length} Data Logs)`);
    showToast('ดาวน์โหลดไฟล์ Backup เรียบร้อยแล้ว', 'success');
  }
};

window.triggerImportBackupFile = function() {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์', text: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถนำเข้าไฟล์ Backup ได้' });
    return;
  }
  const fileInput = document.getElementById('backup-file-input');
  if (fileInput) fileInput.click();
};

window.handleImportBackupFile = function(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.projects || !data.samples) {
        throw new Error('โครงสร้างไฟล์ Backup ไม่ถูกต้อง (ขาดข้อมูล projects หรือ samples)');
      }

      Swal.fire({
        title: 'ยืนยันการนำเข้าไฟล์ Backup?',
        html: `
          <div style="text-align: left; font-size: 0.88rem; line-height: 1.7;">
            <p>• <strong>เวอร์ชันไฟล์:</strong> ${data.version || '1.0'}</p>
            <p>• <strong>วันที่แบคอัพ:</strong> ${data.exportedAt ? new Date(data.exportedAt).toLocaleString('th-TH') : 'ไม่ระบุ'}</p>
            <p>• <strong>ผู้ส่งออก:</strong> ${data.exportedBy || 'ไม่ระบุ'}</p>
            <hr style="margin: 8px 0; border: none; border-top: 1px solid #e2e8f0;">
            <p>• โปรเจกต์ทั้งหมด: <strong>${data.projects.length}</strong> รายการ</p>
            <p>• ข้อมูลตัวอย่างดิบ: <strong>${data.samples.length}</strong> แถว</p>
            <p>• ผู้ใช้งาน: <strong>${data.users?.length || 0}</strong> บัญชี</p>
            <p>• ประวัติ Data Log: <strong>${data.auditLogs?.length || 0}</strong> บันทึก</p>
            <p style="color: #b91c1c; margin-top: 8px;">
              ⚠️ ฐานข้อมูลปัจจุบันจะถูกอัปเดตด้วยข้อมูลจากไฟล์ Backup นี้
            </p>
          </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันกู้คืนระบบ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#0f3d7a'
      }).then((res) => {
        if (res.isConfirmed) {
          if (data.users && Array.isArray(data.users)) state.users = data.users;
          if (data.projects && Array.isArray(data.projects)) state.projects = data.projects;
          if (data.samples && Array.isArray(data.samples)) state.samples = data.samples;
          if (data.auditLogs && Array.isArray(data.auditLogs)) state.auditLogs = data.auditLogs;
          if (data.settings?.haemacytometerFactor) {
            const el = document.getElementById('setting-haemacytometer-factor');
            if (el) el.value = data.settings.haemacytometerFactor;
          }

          if (state.projects.length > 0) {
            state.currentProjectId = state.projects[0].id;
          }

          persistState();
          logAction('RESTORE_BACKUP_IMPORT', `กู้คืนระบบจากไฟล์ Backup (${file.name}): ${state.projects.length} โปรเจกต์, ${state.samples.length} ตัวอย่าง`);
          window.labAudio.playSuccess();
          renderAllDataViews();
          renderUserManagementTable();
          Swal.fire({
            icon: 'success',
            title: 'นำเข้าไฟล์สำเร็จ',
            text: 'กู้คืนฐานข้อมูลระบบจากไฟล์ Backup เรียบร้อยแล้ว'
          });
        }
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'ไฟล์ Backup ไม่ถูกต้อง',
        text: err.message || 'ไม่สามารถอ่านไฟล์ JSON ได้'
      });
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
};

window.handleClearDataWithBackup = function() {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์', text: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถล้างข้อมูลระบบได้' });
    return;
  }

  Swal.fire({
    title: 'ล้างข้อมูลระบบ (Clear Data) เพื่อเริ่มใหม่?',
    html: `
      <div style="text-align: left; font-size: 0.88rem; line-height: 1.7;">
        <p style="color: #b91c1c; font-weight: 700;">
          ⚠️ การดำเนินการนี้จะล้างข้อมูลงานวิจัยทั้งหมด (โปรเจกต์ และ ผลวิเคราะห์ดิบทุกถัง) เพื่อเริ่มต้นใหม่ ป้องกันข้อมูลเต็ม
        </p>
        <p style="margin-top: 8px;">
          🛡️ <strong>ระบบจะดาวน์โหลดไฟล์ Backup ออฟไลน์ให้ท่านโดยอัตโนมัติทันที</strong> ก่อนทำการล้างข้อมูล
        </p>
        <p style="color: #059669; margin-top: 6px;">
          ✓ บัญชีผู้ใช้งาน และการตั้งค่าของ Admin ทั้งหมดจะถูกเก็บรักษาไว้คงเดิม
        </p>
      </div>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ดาวน์โหลด Backup และล้างข้อมูลทันที',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#dc2626'
  }).then((res) => {
    if (res.isConfirmed) {
      // 1. Auto download full backup
      exportFullSystemBackup(true);

      // 2. Clear research data & samples
      const clearedProjectsCount = state.projects.length;
      const clearedSamplesCount = state.samples.length;
      state.projects = [];
      state.samples = [];
      state.currentProjectId = '';

      // 3. Keep admin logs noting the clear
      const clearLog = {
        id: 'log_' + Date.now(),
        timestamp: new Date().toISOString(),
        userName: state.currentUser.displayName,
        action: 'CLEAR_DATA',
        details: `ล้างข้อมูลระบบเริ่มต้นใหม่ (ล้างโปรเจกต์ ${clearedProjectsCount} รายการ, ข้อมูล ${clearedSamplesCount} แถว โดยดาวน์โหลดไฟล์ Backup ออฟไลน์แล้ว)`
      };
      state.auditLogs = [clearLog];

      persistState();
      window.labAudio.playSuccess();
      renderAllDataViews();

      Swal.fire({
        icon: 'success',
        title: 'ล้างข้อมูลระบบสำเร็จ',
        html: `
          <div style="text-align: left; font-size: 0.9rem;">
            <p>• ดาวน์โหลดไฟล์ Backup ออฟไลน์เรียบร้อยแล้ว</p>
            <p>• ล้างข้อมูลโปรเจกต์และข้อมูลตัวอย่างทั้งหมดเรียบร้อย</p>
            <p>• บัญชีผู้ใช้และการตั้งค่า Admin ยังคงอยู่ครบถ้วน</p>
            <p style="margin-top: 8px; color: #0f3d7a;"><strong>ท่านสามารถเริ่มสร้างโปรเจกต์ใหม่ได้ทันที</strong></p>
          </div>
        `
      });
    }
  });
};

// ==========================================================================
// Gantt Chart & Key Milestones Management
// ==========================================================================

// Helper: Calculate calendar date/time string from project start date + hours offset
function formatGanttDateTime(baseDateStr, hourOffset) {
  if (!baseDateStr) return `${hourOffset}h`;
  try {
    const d = new Date(baseDateStr + 'T08:00:00');
    d.setHours(d.getHours() + hourOffset);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  } catch (e) {
    return `${hourOffset}h`;
  }
}

// Auto-generate realistic 82h continuous fermentation timeline & milestones from project header
window.generateAutoGanttTimeline = function(force = false) {
  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p) return;

  if (p.ganttTasks && p.ganttTasks.length > 0 && !force) {
    return;
  }

  const baseDate = p.date || '2022-03-26';
  const owner = p.ownerName || 'นักวิจัย';
  const dilution = p.conditionParams?.dilutionRateD || 0.022;
  const ratioBC = p.conditionParams?.ratioBC || '80:20';
  const temp = p.conditionParams?.temperature || 30;
  const culture = p.conditionParams?.feedCulture || 'PK B:C mol (80:20)';
  const seed = p.seed || 'Angel Lot.260624';
  const seedPrep = p.seedPreparation || '0.4 g yeast dissolve in water';

  const defaultTasks = [
    // 6 Fermentation Phases (Tasks)
    {
      id: 'task_' + Date.now() + '_1',
      type: 'task',
      title: `เตรียมหัวเชื้อและขยายเซลล์ยีสต์ (${seed})`,
      tank: 'Seed Lab',
      startHour: 0,
      endHour: 4,
      responsible: owner,
      status: 'completed',
      criteria: `ความหนาแน่นเซลล์ > 3.0×10⁷ cells/mL, Viability > 95% (${seedPrep})`,
      notes: 'ละลายเชื้อในน้ำกลั่น ปรับอุณหภูมิ 30°C ให้ออกซิเจนเพียงพอก่อนนำลงถัง PF'
    },
    {
      id: 'task_' + Date.now() + '_2',
      type: 'task',
      title: `หมักถังเพาะเชื้อ Pre-fermenter (PF)`,
      tank: 'PF',
      startHour: 0,
      endHour: 22,
      responsible: owner,
      status: 'completed',
      criteria: `Brix 18.0 → 11.5 °Bx, ตรวจนับเซลล์เข้าสู่ Log Phase, อาหารหมัก ${culture}`,
      notes: 'ติดตามการลดลงของ Brix ทุก 4 ชม. ควบคุมอุณหภูมิ 30°C คงที่'
    },
    {
      id: 'task_' + Date.now() + '_3',
      type: 'task',
      title: `หมักต่อเนื่อง Cascade ตอนต้น (ถัง F2 – F5)`,
      tank: 'F2-F5',
      startHour: 22,
      endHour: 58,
      responsible: owner,
      status: 'completed',
      criteria: `ควบคุม Dilution Rate D = ${dilution} h⁻¹, สัดส่วน B:C ${ratioBC}, อุณหภูมิ ${temp}°C`,
      notes: 'ช่วงที่มีอัตราการใช้น้ำตาลสูงสุด (Max Consumption Rate) สังเกตการย่อย Sucrose สมบูรณ์'
    },
    {
      id: 'task_' + Date.now() + '_4',
      type: 'task',
      title: `หมักต่อเนื่อง Cascade ตอนปลาย (ถัง F6 – F7)`,
      tank: 'F6-F7',
      startHour: 58,
      endHour: 70,
      responsible: owner,
      status: 'completed',
      criteria: `น้ำตาลคงเหลือบริโภคเกือบสมบูรณ์ (Brix 4.5 → 3.8 °Bx), สะสม Ethanol > 85 g/L`,
      notes: 'ยีสต์เริ่มเผชิญความเครียดเอทานอลสูง ตรวจวัด % Viability ให้อยู่เหนือ 92%'
    },
    {
      id: 'task_' + Date.now() + '_5',
      type: 'task',
      title: `เก็บเกี่ยวผลผลิตและถ่ายของเหลวลงถัง Duran D3`,
      tank: 'D3',
      startHour: 70,
      endHour: 82,
      responsible: owner,
      status: 'completed',
      criteria: `ผลผลิตเอทานอลสะสมสูงสุด (เป้าหมาย ≥ 95 g/L), Brix ลดลงเหลือ ≤ 3.5 °Bx`,
      notes: 'ถ่ายสารละลายหมักเข้าสู่ถัง D3 เพื่อเตรียมเข้าสู่ขั้นตอนกลั่นและสกัดแยก'
    },
    {
      id: 'task_' + Date.now() + '_6',
      type: 'task',
      title: `สรุปผลการทดลองและประเมิน KPI (Yield & Productivity)`,
      tank: 'Data Lab',
      startHour: 82,
      endHour: 86,
      responsible: owner,
      status: 'completed',
      criteria: `คำนวณ Yield Yp/s (เป้าหมาย 0.491 g/g) และวิเคราะห์ HPLC ยืนยันผล`,
      notes: 'ประมวลผลข้อมูล Sugar Conversion 99.3%, Qp 2.18 g/L·h สำหรับ Scale-up'
    },

    // 5 Key Milestones
    {
      id: 'ms_' + Date.now() + '_1',
      type: 'milestone',
      title: `M1: หัวเชื้อพร้อมลงถังหมัก (Inoculation Ready)`,
      tank: 'PF',
      startHour: 0,
      endHour: 0,
      responsible: owner,
      status: 'completed',
      criteria: `Viability ≥ 95%, ละลายเซลล์ ${seedPrep} สมบูรณ์ ปราศจากการปนเปื้อน`,
      notes: 'เกณฑ์ปล่อยเชื้อผ่านเกณฑ์ GMP แล็บ'
    },
    {
      id: 'ms_' + Date.now() + '_2',
      type: 'milestone',
      title: `M2: Steady State ถัง PF & เริ่มป้อน Cascade สู่ F2`,
      tank: 'PF / F2',
      startHour: 22,
      endHour: 22,
      responsible: owner,
      status: 'completed',
      criteria: `Brix ลดลงแตะ 11.5 °Bx และเริ่มเปิดป้อนสารละลายน้ำตาล D = ${dilution} h⁻¹`,
      notes: 'ระบบก้าวเข้าสู่โหมด Continuous Fermentation'
    },
    {
      id: 'ms_' + Date.now() + '_3',
      type: 'milestone',
      title: `M3: ตรวจสอบ HPLC กลางน้ำ (Mid-stream Validation)`,
      tank: 'F4',
      startHour: 46,
      endHour: 46,
      responsible: owner,
      status: 'completed',
      criteria: `Sucrose ย่อยหมด 100%, Ethanol ในถัง F4 ทะลุ 70 g/L, Glycerol < 8 g/L`,
      notes: 'ยืนยันประสิทธิภาพการใช้น้ำตาลของเอนไซม์ Invertase'
    },
    {
      id: 'ms_' + Date.now() + '_4',
      type: 'milestone',
      title: `M4: สิ้นสุดกระบวนการหมักถังสุดท้าย D3 (Harvest Complete)`,
      tank: 'D3',
      startHour: 82,
      endHour: 82,
      responsible: owner,
      status: 'completed',
      criteria: `Ethanol สะสมแตะระดับเป้าหมาย 99.5 g/L, Brix คงเหลือ 3.2 °Bx, Sugar Conversion > 99%`,
      notes: 'ความสำเร็จกระบวนการหมักระดับแล็บสมบูรณ์'
    },
    {
      id: 'ms_' + Date.now() + '_5',
      type: 'milestone',
      title: `M5: สรุปผลวิจัยและส่งมอบ Best Condition Sign-off`,
      tank: 'Lab Admin',
      startHour: 86,
      endHour: 86,
      responsible: owner,
      status: 'completed',
      criteria: `Yield Yp/s 0.491 g/g (96.1% ของทฤษฎี), Productivity 2.18 g/L·h ได้รับการอนุมัติ`,
      notes: 'นำผลขึ้นรายงานและเตรียมขยายสู่ Pilot Plant'
    }
  ];

  p.ganttTasks = defaultTasks;
  persistState();

  if (force) {
    window.labAudio.playSuccess();
    logAction('AUTO_GENERATE_GANTT', `สร้างไทม์ไลน์และหมุดหมายอัตโนมัติสำหรับโปรเจกต์ ${p.experimentNo} (${p.batchMediumNo})`);
    renderGanttTimeline();
    showToast('สร้างแผนงานและหมุดหมายอัตโนมัติสำเร็จ', 'success');
  }
};

// Toggle Gantt Chart & Milestones on/off for current project (Requirement 1)
window.toggleGanttActiveState = function(forceEnable = null) {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์แก้ไข', text: 'ท่านไม่ใช่เจ้าของงานวิจัยนี้' });
    return;
  }
  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p) return;

  const currentEnabled = p.enableGantt !== false;
  const newEnabled = forceEnable !== null ? forceEnable : !currentEnabled;
  p.enableGantt = newEnabled;

  persistState();
  window.labAudio.playSuccess();
  logAction('TOGGLE_GANTT_STATUS', `${newEnabled ? 'เปิด' : 'ปิด'}การใช้งาน Gantt Chart สำหรับโปรเจกต์ ${p.experimentNo}`);
  renderGanttTimeline();
  showToast(`${newEnabled ? 'เปิดใช้งาน' : 'ปิดการใช้งาน'} Gantt Chart & Milestones เรียบร้อย`, newEnabled ? 'success' : 'info');
};

// Render Gantt Timeline & Milestones
window.renderGanttTimeline = function() {
  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p) return;

  const isGanttEnabled = p.enableGantt !== false;

  // Handle On/Off Toggle UI Elements
  const statusBadge = document.getElementById('gantt-status-toggle-badge');
  const toggleBtn = document.getElementById('btn-toggle-gantt-active');
  const toggleBtnIcon = document.getElementById('btn-toggle-gantt-active-icon');
  const toggleBtnText = document.getElementById('btn-toggle-gantt-active-text');
  const actionGroup = document.getElementById('gantt-action-buttons-group');
  const disabledBanner = document.getElementById('gantt-disabled-banner');
  const activeContent = document.getElementById('gantt-active-content');

  if (statusBadge) {
    if (isGanttEnabled) {
      statusBadge.textContent = '✓ เปิดใช้งาน';
      statusBadge.className = 'badge badge-gold';
      statusBadge.style.background = '';
      statusBadge.style.color = '';
    } else {
      statusBadge.textContent = '🚫 ปิดใช้งาน';
      statusBadge.className = 'badge';
      statusBadge.style.background = '#f1f5f9';
      statusBadge.style.color = '#64748b';
    }
  }

  if (toggleBtn) {
    if (isGanttEnabled) {
      if (toggleBtnIcon) toggleBtnIcon.textContent = '🚫';
      if (toggleBtnText) toggleBtnText.textContent = 'ปิดการใช้งานผังนี้';
      toggleBtn.className = 'btn btn-secondary btn-sm';
      toggleBtn.title = 'คลิกเพื่อปิดการใช้งาน Gantt Chart สำหรับโปรเจกต์นี้';
    } else {
      if (toggleBtnIcon) toggleBtnIcon.textContent = '⚡';
      if (toggleBtnText) toggleBtnText.textContent = 'เปิดใช้งานผังนี้';
      toggleBtn.className = 'btn btn-primary btn-sm';
      toggleBtn.title = 'คลิกเพื่อเปิดใช้งาน Gantt Chart & Milestones สำหรับโปรเจกต์นี้';
    }
  }

  if (actionGroup) {
    actionGroup.style.display = isGanttEnabled ? 'flex' : 'none';
  }

  if (disabledBanner) {
    disabledBanner.style.display = isGanttEnabled ? 'none' : 'block';
  }

  if (activeContent) {
    activeContent.style.display = isGanttEnabled ? 'block' : 'none';
  }

  // If disabled for this project, stop here
  if (!isGanttEnabled) return;

  if (!p.ganttTasks || p.ganttTasks.length === 0) {
    generateAutoGanttTimeline(false);
  }

  const tasks = p.ganttTasks || [];
  const milestones = tasks.filter(t => t.type === 'milestone');
  const baseDate = p.date || '2022-03-26';

  // 1. Render Milestones Grid
  const msGrid = document.getElementById('gantt-milestones-grid');
  const msSummaryBadge = document.getElementById('gantt-milestone-summary-badge');
  if (msSummaryBadge) {
    const completedCount = milestones.filter(m => m.status === 'completed').length;
    msSummaryBadge.textContent = `${completedCount}/${milestones.length} หมุดหมายเสร็จสิ้น`;
  }

  if (msGrid) {
    if (milestones.length === 0) {
      msGrid.innerHTML = '<div style="color: #94a3b8; font-size: 0.85rem; padding: 12px;">ยังไม่มีหมุดหมายในโปรเจกต์นี้</div>';
    } else {
      msGrid.innerHTML = milestones.map(m => {
        let statusClass = 'milestone-pending';
        let statusBadgeHtml = '<span class="badge" style="background: #f1f5f9; color: #64748b; font-size: 0.72rem;">รอดำเนินการ</span>';
        if (m.status === 'completed') {
          statusClass = 'milestone-completed';
          statusBadgeHtml = '<span class="badge" style="background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; font-size: 0.72rem;">✓ สำเร็จแล้ว</span>';
        } else if (m.status === 'in_progress') {
          statusClass = 'milestone-inprogress';
          statusBadgeHtml = '<span class="badge" style="background: #fffbeb; color: #d97706; border: 1px solid #fde68a; font-size: 0.72rem;">⏳ กำลังดำเนินการ</span>';
        }

        const timeStr = formatGanttDateTime(baseDate, m.startHour || 0);

        return `
          <div class="milestone-card ${statusClass}">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                <span class="badge badge-navy" style="font-size: 0.7rem; font-weight: 700;">${m.tank || 'All'}</span>
                ${statusBadgeHtml}
              </div>
              <h4 style="font-size: 0.88rem; font-weight: 700; color: var(--mitr-navy-900); margin-bottom: 6px; line-height: 1.45;">
                ${m.title}
              </h4>
              <p style="font-size: 0.78rem; color: #475569; margin-bottom: 8px; line-height: 1.45;">
                <strong>เกณฑ์วัด:</strong> ${m.criteria || '-'}
              </p>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #64748b; border-top: 1px dashed #e2e8f0; padding-top: 8px; margin-top: 4px;">
              <span>🕒 @ ${m.startHour}h (${timeStr.slice(0, 10)})</span>
              <span style="font-weight: 600; color: var(--mitr-navy-800);">${m.responsible || '-'}</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 2. Render Gantt Visual Timeline Bars
  const barsContainer = document.getElementById('gantt-bars-container');
  if (barsContainer) {
    const maxScale = 82; // 0 to 82h scale
    barsContainer.innerHTML = tasks.map(t => {
      const isMilestone = t.type === 'milestone';
      const startH = t.startHour || 0;
      const endH = isMilestone ? startH : (t.endHour !== undefined ? t.endHour : startH + 1);
      const duration = Math.max(1, endH - startH);

      let leftPct = Math.min(100, Math.max(0, (startH / maxScale) * 100));
      let widthPct = isMilestone ? 0 : Math.min(100 - leftPct, Math.max(3, (duration / maxScale) * 100));

      let statusBadgeHtml = '<span class="badge" style="background: #f1f5f9; color: #64748b; font-size: 0.7rem;">รอ</span>';
      if (t.status === 'completed') {
        statusBadgeHtml = '<span class="badge" style="background: #ecfdf5; color: #059669; font-size: 0.7rem;">สำเร็จ</span>';
      } else if (t.status === 'in_progress') {
        statusBadgeHtml = '<span class="badge" style="background: #fffbeb; color: #d97706; font-size: 0.7rem;">กำลังทำ</span>';
      }

      let barContentHtml = '';
      if (isMilestone) {
        barContentHtml = `
          <div class="gantt-milestone-marker" style="left: ${leftPct}%;" title="${t.title} (@ ${startH}h)">
            🚩
          </div>
        `;
      } else {
        barContentHtml = `
          <div class="gantt-bar-fill status-${t.status || 'pending'}" style="left: ${leftPct}%; width: ${widthPct}%;" title="${t.title} (${startH}h - ${endH}h)">
            ${duration >= 8 ? `${duration}h` : ''}
          </div>
        `;
      }

      return `
        <div class="gantt-row">
          <div class="gantt-row-label" title="${t.title}">
            <span style="font-size: 0.85rem; margin-right: 4px; flex-shrink: 0;">${isMilestone ? '🚩' : '📌'}</span>
            <span>${t.title}</span>
          </div>
          <div class="gantt-row-hours">
            ${isMilestone ? `@ ${startH}h` : `${startH}-${endH}h (${duration}h)`}
          </div>
          <div class="gantt-bar-track">
            ${barContentHtml}
          </div>
          <div style="text-align: right;">
            ${statusBadgeHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  // 3. Render Tasks Detailed Table
  const tbody = document.getElementById('gantt-tasks-tbody');
  const taskCountBadge = document.getElementById('gantt-task-count-badge');
  if (taskCountBadge) taskCountBadge.textContent = `${tasks.length} รายการ`;

  if (tbody) {
    if (tasks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #94a3b8; padding: 20px;">ไม่พบรายการแผนงาน กรุณากดปุ่ม "สร้างไทม์ไลน์อัตโนมัติ" หรือ "เพิ่มงานใหม่"</td></tr>';
      return;
    }

    tbody.innerHTML = tasks.map((t) => {
      const isMilestone = t.type === 'milestone';
      const typeBadge = isMilestone
        ? '<span class="badge" style="background: #fef3c7; color: #b45309; border: 1px solid #fcd34d; font-size: 0.72rem;">🚩 หมุดหมาย</span>'
        : '<span class="badge badge-navy" style="font-size: 0.72rem;">📌 ขั้นตอน</span>';

      let statusBadgeHtml = '<span class="badge" style="background: #f1f5f9; color: #64748b; font-size: 0.72rem;">รอดำเนินการ</span>';
      if (t.status === 'completed') {
        statusBadgeHtml = '<span class="badge" style="background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; font-size: 0.72rem;">✓ เสร็จสิ้น</span>';
      } else if (t.status === 'in_progress') {
        statusBadgeHtml = '<span class="badge" style="background: #fffbeb; color: #d97706; border: 1px solid #fde68a; font-size: 0.72rem;">⏳ ดำเนินการ</span>';
      }

      const startH = t.startHour || 0;
      const endH = isMilestone ? startH : (t.endHour !== undefined ? t.endHour : startH + 1);
      const hoursStr = isMilestone ? `@ ${startH} h` : `${startH} - ${endH} h`;
      const dateStr = formatGanttDateTime(baseDate, startH);

      return `
        <tr>
          <td style="text-align: center;">${typeBadge}</td>
          <td>
            <strong style="color: var(--mitr-navy-900); line-height: 1.45;">${t.title}</strong>
            ${t.notes ? `<div style="font-size: 0.76rem; color: #64748b; margin-top: 3px; line-height: 1.4;">💬 ${t.notes}</div>` : ''}
          </td>
          <td><span class="badge badge-gold" style="font-size: 0.72rem;">${t.tank || '-'}</span></td>
          <td style="font-weight: 600; color: var(--mitr-navy-900);">${hoursStr}</td>
          <td style="font-size: 0.8rem; color: #475569;">${dateStr}</td>
          <td>${t.responsible || '-'}</td>
          <td style="font-size: 0.82rem; color: #334155; line-height: 1.4;">${t.criteria || '-'}</td>
          <td style="text-align: center;">${statusBadgeHtml}</td>
          <td style="text-align: center; white-space: nowrap;">
            <button class="btn btn-sm btn-secondary" onclick="editGanttTask('${t.id}')" style="padding: 3px 6px; font-size: 0.74rem;" title="แก้ไข">✏️</button>
            <button class="btn btn-sm btn-secondary" onclick="deleteGanttTask('${t.id}')" style="padding: 3px 6px; font-size: 0.74rem; color: #ef4444;" title="ลบ">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  }
};

// Modal Form: Add or Edit Gantt Task / Milestone (Requirements 2 & 3)
window.openAddGanttTaskModal = function() {
  openGanttTaskFormModal(null);
};

window.editGanttTask = function(taskId) {
  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p || !p.ganttTasks) return;
  const task = p.ganttTasks.find(t => t.id === taskId);
  if (!task) return;
  openGanttTaskFormModal(task);
};

function openGanttTaskFormModal(task = null) {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์แก้ไข', text: 'ท่านไม่ใช่เจ้าของงานวิจัยนี้' });
    return;
  }

  const isEdit = !!task;
  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  const baseDate = p?.date || new Date().toISOString().slice(0, 10);
  const ownerName = p?.ownerName || (state.currentUser?.displayName || 'นักวิจัย');

  const initialType = task?.type || 'task';
  const initialTitle = task?.title || '';
  const initialTank = task?.tank || 'PF';
  const initialStartH = task?.startHour !== undefined ? task.startHour : 0;
  const initialEndH = task?.endHour !== undefined ? task.endHour : 22;
  const initialResponsible = task?.responsible || ownerName;
  const initialStatus = task?.status || 'completed';
  const initialCriteria = task?.criteria || '';
  const initialNotes = task?.notes || '';

  // Smart Presets Templates (11 Fermentation Phases & Key Milestones)
  const SMART_PRESETS = [
    {
      label: '-- กำหนดเอง (Custom / Manual Entry) --',
      type: 'task', tank: 'PF', title: '', startHour: 0, endHour: 22,
      criteria: '', notes: ''
    },
    {
      label: '⚡ [Phase 1] เตรียมหัวเชื้อและขยายเซลล์ยีสต์ (0–4h)',
      type: 'task', tank: 'Seed Lab', title: 'เตรียมหัวเชื้อและขยายเซลล์ยีสต์', startHour: 0, endHour: 4,
      criteria: 'ความหนาแน่นเซลล์ > 3.0×10⁷ cells/mL, Viability > 95%',
      notes: 'ละลายเชื้อในน้ำกลั่น ปรับอุณหภูมิ 30°C ให้ออกซิเจนเพียงพอก่อนนำลงถัง PF'
    },
    {
      label: '⚡ [Phase 2] หมักถังเพาะเชื้อ Pre-fermenter PF (0–22h)',
      type: 'task', tank: 'PF', title: 'หมักถังเพาะเชื้อ Pre-fermenter (PF)', startHour: 0, endHour: 22,
      criteria: 'Brix 18.0 → 11.5 °Bx, ตรวจนับเซลล์เข้าสู่ Log Phase',
      notes: 'ติดตามการลดลงของ Brix ทุก 4 ชม. ควบคุมอุณหภูมิ 30°C คงที่'
    },
    {
      label: '⚡ [Phase 3] หมักต่อเนื่อง Cascade ตอนต้น ถัง F2–F5 (22–58h)',
      type: 'task', tank: 'F2-F5', title: 'หมักต่อเนื่อง Cascade ตอนต้น (ถัง F2 – F5)', startHour: 22, endHour: 58,
      criteria: 'ควบคุม Dilution Rate D = 0.022 h⁻¹, สัดส่วน B:C 80:20',
      notes: 'ช่วงที่มีอัตราการใช้น้ำตาลสูงสุด สังเกตการย่อย Sucrose สมบูรณ์'
    },
    {
      label: '⚡ [Phase 4] หมักต่อเนื่อง Cascade ตอนปลาย ถัง F6–F7 (58–70h)',
      type: 'task', tank: 'F6-F7', title: 'หมักต่อเนื่อง Cascade ตอนปลาย (ถัง F6 – F7)', startHour: 58, endHour: 70,
      criteria: 'น้ำตาลคงเหลือบริโภคเกือบสมบูรณ์ (Brix 4.5 → 3.8 °Bx), สะสม Ethanol > 85 g/L',
      notes: 'ยีสต์เริ่มเผชิญความเครียดเอทานอลสูง ตรวจวัด % Viability ให้อยู่เหนือ 92%'
    },
    {
      label: '⚡ [Phase 5] ถ่ายของเหลวลงถังเก็บ Duran D3 (70–82h)',
      type: 'task', tank: 'D3', title: 'เก็บเกี่ยวผลผลิตและถ่ายของเหลวลงถัง Duran D3', startHour: 70, endHour: 82,
      criteria: 'ผลผลิตเอทานอลสะสมสูงสุด (เป้าหมาย ≥ 95 g/L), Brix ลดลงเหลือ ≤ 3.5 °Bx',
      notes: 'ถ่ายสารละลายหมักเข้าสู่ถัง D3 เพื่อเตรียมเข้าสู่ขั้นตอนกลั่นและสกัดแยก'
    },
    {
      label: '⚡ [Phase 6] สรุปผลการทดลองและประเมิน KPI (82–86h)',
      type: 'task', tank: 'Data Lab', title: 'สรุปผลการทดลองและประเมิน KPI (Yield & Productivity)', startHour: 82, endHour: 86,
      criteria: 'คำนวณ Yield Yp/s (เป้าหมาย 0.491 g/g) และวิเคราะห์ HPLC ยืนยันผล',
      notes: 'ประมวลผลข้อมูล Sugar Conversion 99.3%, Qp 2.18 g/L·h สำหรับ Scale-up'
    },
    {
      label: '🚩 [Milestone M1] Inoculation Ready พร้อมปล่อยเชื้อ (@ 0h)',
      type: 'milestone', tank: 'PF', title: 'M1: หัวเชื้อพร้อมลงถังหมัก (Inoculation Ready)', startHour: 0, endHour: 0,
      criteria: 'Viability ≥ 95%, ละลายเซลล์สมบูรณ์ ปราศจากการปนเปื้อน',
      notes: 'เกณฑ์ปล่อยเชื้อผ่านเกณฑ์ GMP แล็บ'
    },
    {
      label: '🚩 [Milestone M2] Steady State PF & เริ่มป้อน Cascade สู่ F2 (@ 22h)',
      type: 'milestone', tank: 'PF / F2', title: 'M2: Steady State ถัง PF & เริ่มป้อน Cascade สู่ F2', startHour: 22, endHour: 22,
      criteria: 'Brix ลดลงแตะ 11.5 °Bx และเริ่มเปิดป้อนสารละลายน้ำตาล D = 0.022 h⁻¹',
      notes: 'ระบบก้าวเข้าสู่โหมด Continuous Fermentation'
    },
    {
      label: '🚩 [Milestone M3] ตรวจสอบ HPLC กลางน้ำ Mid-stream (@ 46h)',
      type: 'milestone', tank: 'F4', title: 'M3: ตรวจสอบ HPLC กลางน้ำ (Mid-stream Validation)', startHour: 46, endHour: 46,
      criteria: 'Sucrose ย่อยหมด 100%, Ethanol ในถัง F4 ทะลุ 70 g/L, Glycerol < 8 g/L',
      notes: 'ยืนยันประสิทธิภาพการใช้น้ำตาลของเอนไซม์ Invertase'
    },
    {
      label: '🚩 [Milestone M4] Harvest Complete สิ้นสุดการหมัก D3 (@ 82h)',
      type: 'milestone', tank: 'D3', title: 'M4: สิ้นสุดกระบวนการหมักถังสุดท้าย D3 (Harvest Complete)', startHour: 82, endHour: 82,
      criteria: 'Ethanol สะสมแตะระดับเป้าหมาย 99.5 g/L, Brix คงเหลือ 3.2 °Bx, Sugar Conversion > 99%',
      notes: 'ความสำเร็จกระบวนการหมักระดับแล็บสมบูรณ์'
    },
    {
      label: '🚩 [Milestone M5] Best Condition Sign-off ส่งมอบผลวิจัย (@ 86h)',
      type: 'milestone', tank: 'Lab Admin', title: 'M5: สรุปผลวิจัยและส่งมอบ Best Condition Sign-off', startHour: 86, endHour: 86,
      criteria: 'Yield Yp/s 0.491 g/g (96.1% ของทฤษฎี), Productivity 2.18 g/L·h ได้รับการอนุมัติ',
      notes: 'นำผลขึ้นรายงานและเตรียมขยายสู่ Pilot Plant'
    }
  ];

  const tankOptions = [
    'Seed Lab', 'PF', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'D3', 'F2-F5', 'F6-F7', 'PF / F2', 'Data Lab', 'Lab Admin', 'แล็บรวม'
  ];

  const userOptions = state.users.map(u => u.displayName);
  if (!userOptions.includes(initialResponsible)) {
    userOptions.push(initialResponsible);
  }

  Swal.fire({
    title: isEdit ? '✏️ แก้ไขงาน / หมุดหมาย' : '➕ เพิ่มงาน / หมุดหมายใหม่ (Gantt & Milestone)',
    html: `
      <div style="text-align: left; font-size: 0.88rem; max-height: 72vh; overflow-y: auto; padding-right: 4px;">
        
        <!-- Smart Presets Selector -->
        <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px;">
          <label class="form-label" style="color: #92400e; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
            <span>⚡</span> เทมเพลตมาตรฐานแล็บ Mitr Phol (Smart Defaults / Presets):
          </label>
          <select id="swal-gantt-preset-select" class="form-select" style="background: #ffffff; border-color: #fcd34d;">
            ${SMART_PRESETS.map((p, idx) => `<option value="${idx}">${p.label}</option>`).join('')}
          </select>
        </div>

        <!-- Section 1: Classification & Title -->
        <div class="form-section-card">
          <div class="form-section-header">
            <span>🏷️</span> หมวดที่ 1: ประเภทและชื่อกิจกรรม
          </div>
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label" style="font-weight: 700;">ประเภทรายการ:*</label>
              <select id="swal-gantt-type" class="form-select">
                <option value="task" ${initialType === 'task' ? 'selected' : ''}>📌 งาน/ขั้นตอนการหมัก (Task/Phase)</option>
                <option value="milestone" ${initialType === 'milestone' ? 'selected' : ''}>🚩 หมุดหมายคุณภาพ (Key Milestone)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight: 700;">ถังหมัก / สเตจที่เกี่ยวข้อง:*</label>
              <select id="swal-gantt-tank" class="form-select">
                ${tankOptions.map(t => `<option value="${t}" ${initialTank === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" style="font-weight: 700;">ชื่อกิจกรรม / หมุดหมาย:*</label>
            <input type="text" id="swal-gantt-title" class="form-input" value="${initialTitle}" placeholder="เช่น หมักถังเพาะเชื้อ PF, ตรวจวัด HPLC กลางน้ำ">
          </div>
        </div>

        <!-- Section 2: Timeline Scope & Vessel -->
        <div class="form-section-card">
          <div class="form-section-header">
            <span>⏱️</span> หมวดที่ 2: ขอบเขตเวลาและคำนวณปฏิทินจริง
          </div>
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label" style="font-weight: 700;">เวลาเริ่มต้น (ชม. - Start Hour):*</label>
              <input type="number" step="0.5" min="0" max="150" id="swal-gantt-starthour" class="form-input" value="${initialStartH}">
            </div>
            <div class="form-group" id="swal-gantt-endhour-group" style="${initialType === 'milestone' ? 'display: none;' : ''}">
              <label class="form-label" style="font-weight: 700;">เวลาสิ้นสุด (ชม. - End Hour):*</label>
              <input type="number" step="0.5" min="0" max="150" id="swal-gantt-endhour" class="form-input" value="${initialEndH}">
            </div>
          </div>
          <div id="gantt-modal-date-preview" class="realtime-date-preview">
            <!-- Dynamic calendar calculation preview -->
          </div>
        </div>

        <!-- Section 3: Responsibility & Progress -->
        <div class="form-section-card">
          <div class="form-section-header">
            <span>👤</span> หมวดที่ 3: ผู้รับผิดชอบและสถานะความคืบหน้า
          </div>
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label" style="font-weight: 700;">ผู้รับผิดชอบ (Responsible):*</label>
              <select id="swal-gantt-responsible" class="form-select">
                ${userOptions.map(u => `<option value="${u}" ${initialResponsible === u ? 'selected' : ''}>${u}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight: 700;">สถานะ (Status):*</label>
              <select id="swal-gantt-status" class="form-select">
                <option value="completed" ${initialStatus === 'completed' ? 'selected' : ''}>✓ เสร็จสิ้น (Completed)</option>
                <option value="in_progress" ${initialStatus === 'in_progress' ? 'selected' : ''}>⏳ กำลังดำเนินการ (In Progress)</option>
                <option value="pending" ${initialStatus === 'pending' ? 'selected' : ''}>รอดำเนินการ (Pending)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Section 4: Quality Gate & Technical Notes -->
        <div class="form-section-card" style="margin-bottom: 0;">
          <div class="form-section-header">
            <span>🎯</span> หมวดที่ 4: เกณฑ์ควบคุมคุณภาพและข้อควรระวัง
          </div>
          <div class="form-group">
            <label class="form-label" style="font-weight: 700;">เกณฑ์วัดคุณภาพ / เงื่อนไขความสำเร็จ (Acceptance Criteria):</label>
            <input type="text" id="swal-gantt-criteria" class="form-input" value="${initialCriteria}" placeholder="เช่น Brix 18 → 11.5 °Bx, Ethanol > 95 g/L, Viability ≥ 95%">
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" style="font-weight: 700;">หมายเหตุเพิ่มเติม / ข้อควรระวัง (Notes & Precaution):</label>
            <textarea id="swal-gantt-notes" class="form-input" rows="2" placeholder="ระบุข้อควรระวังหรือขั้นตอนทางเทคนิคเพิ่มเติม">${initialNotes}</textarea>
          </div>
        </div>

      </div>
    `,
    width: '680px',
    showCancelButton: true,
    confirmButtonText: isEdit ? '💾 บันทึกการแก้ไข' : '➕ เพิ่มในแผนงาน',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#0f3d7a',
    didOpen: () => {
      const typeSelect = document.getElementById('swal-gantt-type');
      const startInput = document.getElementById('swal-gantt-starthour');
      const endInput = document.getElementById('swal-gantt-endhour');
      const endGroup = document.getElementById('swal-gantt-endhour-group');
      const previewEl = document.getElementById('gantt-modal-date-preview');
      const presetSelect = document.getElementById('swal-gantt-preset-select');

      function updateLivePreview() {
        const currentType = typeSelect.value;
        const sH = parseFloat(startInput.value) || 0;
        const eH = currentType === 'milestone' ? sH : (parseFloat(endInput.value) || sH);
        const sStr = formatGanttDateTime(baseDate, sH);
        const eStr = formatGanttDateTime(baseDate, eH);

        if (endGroup) {
          endGroup.style.display = currentType === 'milestone' ? 'none' : 'block';
        }

        if (previewEl) {
          if (currentType === 'milestone') {
            previewEl.innerHTML = `📅 <strong>เวลาประเมินหมุดหมาย:</strong> ${sStr} <span style="color: #64748b;">(@ ${sH}h ของการหมัก)</span>`;
          } else {
            const dur = Math.max(0, eH - sH);
            previewEl.innerHTML = `📅 <strong>ช่วงเวลาจริง:</strong> ${sStr} &rarr; ${eStr} <strong style="color: #1e3a8a;">(รวม ${dur} ชม.)</strong>`;
          }
        }
      }

      typeSelect.addEventListener('change', updateLivePreview);
      startInput.addEventListener('input', updateLivePreview);
      endInput.addEventListener('input', updateLivePreview);

      // Smart Preset Change Handler
      presetSelect.addEventListener('change', (e) => {
        const idx = parseInt(e.target.value);
        if (idx === 0) return;
        const p = SMART_PRESETS[idx];
        if (!p) return;

        typeSelect.value = p.type;
        document.getElementById('swal-gantt-tank').value = p.tank;
        document.getElementById('swal-gantt-title').value = p.title;
        startInput.value = p.startHour;
        endInput.value = p.endHour;
        document.getElementById('swal-gantt-criteria').value = p.criteria;
        document.getElementById('swal-gantt-notes').value = p.notes;

        updateLivePreview();
        if (window.labAudio) window.labAudio.playSuccess();
      });

      updateLivePreview();
    },
    preConfirm: () => {
      const type = document.getElementById('swal-gantt-type').value;
      const title = document.getElementById('swal-gantt-title').value.trim();
      const tank = document.getElementById('swal-gantt-tank').value;
      const startH = parseFloat(document.getElementById('swal-gantt-starthour').value) || 0;
      const endH = type === 'milestone' ? startH : (parseFloat(document.getElementById('swal-gantt-endhour').value) || startH + 1);
      const responsible = document.getElementById('swal-gantt-responsible').value;
      const status = document.getElementById('swal-gantt-status').value;
      const criteria = document.getElementById('swal-gantt-criteria').value.trim();
      const notes = document.getElementById('swal-gantt-notes').value.trim();

      if (!title) {
        Swal.showValidationMessage('กรุณากรอกชื่อกิจกรรม / หมุดหมาย');
        return false;
      }
      if (type === 'task' && endH <= startH) {
        Swal.showValidationMessage('เวลาสิ้นสุด (ชม.) ต้องมากกว่าเวลาเริ่มต้น');
        return false;
      }

      return { type, title, tank, startHour: startH, endHour: endH, responsible, status, criteria, notes };
    }
  }).then((res) => {
    if (res.isConfirmed) {
      const val = res.value;
      if (isEdit) {
        Object.assign(task, val);
        logAction('UPDATE_GANTT_TASK', `แก้ไขแผนงาน: ${task.title} (${task.tank} @ ${task.startHour}h)`);
        showToast('แก้ไขข้อมูลเรียบร้อย', 'success');
      } else {
        const newTask = {
          id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          ...val
        };
        if (!p.ganttTasks) p.ganttTasks = [];
        p.ganttTasks.push(newTask);
        logAction('ADD_GANTT_TASK', `เพิ่มแผนงานใหม่: ${newTask.title} (${newTask.tank})`);
        showToast('เพิ่มงานในแผนเรียบร้อย', 'success');
      }

      persistState();
      window.labAudio.playSuccess();
      renderGanttTimeline();
    }
  });
}

// Delete Gantt Task / Milestone
window.deleteGanttTask = function(taskId) {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์ลบ', text: 'ท่านไม่ใช่เจ้าของงานวิจัยนี้' });
    return;
  }

  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p || !p.ganttTasks) return;

  const targetTask = p.ganttTasks.find(t => t.id === taskId);
  if (!targetTask) return;

  Swal.fire({
    title: `ลบ "${targetTask.title}"?`,
    text: `ต้องการลบรายการนี้ออกจากผัง Gantt Chart หรือไม่`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ยืนยันการลบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#991b1b'
  }).then((res) => {
    if (res.isConfirmed) {
      p.ganttTasks = p.ganttTasks.filter(t => t.id !== taskId);
      persistState();
      window.labAudio.playWarning();
      logAction('DELETE_GANTT_TASK', `ลบรายการ Gantt: ${targetTask.title}`);
      renderGanttTimeline();
      showToast('ลบรายการเรียบร้อย', 'info');
    }
  });
};

// Global view render
function renderAllDataViews() {
  renderProjectSelector();
  renderTankMatrix();
  renderAuditLogs();
  renderDataRecordTable();
  renderGanttTimeline();
}

// Toast Notification Utility
function showToast(message, type = 'info') {
  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2600,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.onmouseenter = Swal.stopTimer;
      toast.onmouseleave = Swal.resumeTimer;
    }
  });

  Toast.fire({
    icon: type,
    title: message
  });
}
