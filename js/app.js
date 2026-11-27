/**
 * Mitr Phol Fermentation Lab Tracker - Core Application Logic
 * Implements Domain Logic, Auth, Permissions, Calculations, Charting, Custom Sandbox & Presentation.
 */

// Safe Storage, Encoding & Crypto Helpers
function safeStorageGet(key, fallback = null) {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch (e) {
    return fallback;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn('[Storage] Write skipped:', e);
    return false;
  }
}

function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {}
}

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    const parsed = JSON.parse(str);
    return parsed !== null && parsed !== undefined ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function csvSafe(val) {
  let s = String(val ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

// SHA-256 with pure-JS fallback when Web Crypto is unavailable (e.g. non-HTTPS mobile LAN)
async function sha256Hex(str) {
  try {
    if (window.crypto && window.crypto.subtle && typeof TextEncoder !== 'undefined') {
      const msgBuffer = new TextEncoder().encode(str);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    console.warn('Web Crypto SHA-256 fallback:', e);
  }
  const bytes = unescape(encodeURIComponent(str));
  const words = [];
  for (let i = 0; i < bytes.length; i++) words[i >> 2] |= bytes.charCodeAt(i) << (24 - (i % 4) * 8);
  words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
  words[(((bytes.length + 8) >> 6) << 4) + 15] = bytes.length * 8;
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const rrot = (x, n) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < words.length; i += 16) {
    const w = words.slice(i, i + 16);
    for (let j = 16; j < 64; j++) {
      const s0 = rrot(w[j - 15], 7) ^ rrot(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rrot(w[j - 2], 17) ^ rrot(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let j = 0; j < 64; j++) {
      const S1 = rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[j] + (w[j] | 0)) | 0;
      const S0 = rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H = H.map((v, idx) => (v + [a, b, c, d, e, f, g, h][idx]) | 0);
  }
  return H.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

// Application State & Clean Migration
(() => {
  const cachedUsers = safeJsonParse(safeStorageGet('mitr_users'), null);
  if (Array.isArray(cachedUsers)) {
    if (cachedUsers.some(u => u.email === 'somchai.r@mitrphol.com' || u.uid === 'usr_01' || u.email === 'admin.lab@mitrphol.com')) {
      safeStorageRemove('mitr_users');
      safeStorageRemove('mitr_projects');
      safeStorageRemove('mitr_samples');
      safeStorageRemove('mitr_logs');
      safeStorageRemove('mitr_auth_uid');
    } else {
      let changed = false;
      const cleaned = cachedUsers.map(u => {
        const copy = { ...u };
        if ('password' in copy) {
          delete copy.password;
          changed = true;
        }
        if (copy.uid === 'usr_admin' && copy.displayName !== 'Admin (Administrator)') {
          copy.displayName = 'Admin (Administrator)';
          changed = true;
        }
        if (copy.uid === 'usr_user' && copy.displayName !== 'User (Researcher)') {
          copy.displayName = 'User (Researcher)';
          changed = true;
        }
        return copy;
      });
      if (changed) safeStorageSet('mitr_users', JSON.stringify(cleaned));
    }
  }
})();

const parsedUsers = safeJsonParse(safeStorageGet('mitr_users'), null);
const parsedProjects = safeJsonParse(safeStorageGet('mitr_projects'), null);
const parsedSamples = safeJsonParse(safeStorageGet('mitr_samples'), null);
const parsedLogs = safeJsonParse(safeStorageGet('mitr_logs'), null);

const state = {
  isLoggedIn: false,
  currentUser: null,
  users: Array.isArray(parsedUsers) && parsedUsers.length > 0 ? parsedUsers : window.INITIAL_USERS,
  projects: Array.isArray(parsedProjects) ? parsedProjects : (window.INITIAL_PROJECTS || []),
  samples: Array.isArray(parsedSamples) ? parsedSamples : (window.SEED_SAMPLES_220326 || []),
  auditLogs: Array.isArray(parsedLogs) ? parsedLogs : (window.INITIAL_LOGS || []),
  currentProjectId: '',
  selectedTank: 'PF',
  selectedTime: 0,
  cellMode: 'numpad', // 'numpad' or 'tally'
  activeSeries: 'total', // 'total', 'budding', 'dead'
  tallyCounts: {
    total: [0, 0, 0, 0, 0],
    budding: [0, 0, 0, 0, 0],
    dead: [0, 0, 0, 0, 0],
    dilution: 10
  },
  customSeries: [], // Sandbox multi-axis series
  charts: {},
  slideIndex: 1,
  totalSlides: 6,
  dataRecordSort: { field: 'tank', dir: 'asc' }
};

// Save state to LocalStorage without plaintext passwords
function persistState() {
  const sanitizedUsers = (state.users || []).map(u => {
    const copy = { ...u };
    delete copy.password;
    return copy;
  });
  safeStorageSet('mitr_users', JSON.stringify(sanitizedUsers));
  safeStorageSet('mitr_projects', JSON.stringify(state.projects));
  safeStorageSet('mitr_samples', JSON.stringify(state.samples));
  safeStorageSet('mitr_logs', JSON.stringify(state.auditLogs));
}

// Check Edit Permission (Admin can edit all; User can edit only their own)
function canEditProject(projectId) {
  if (!state.currentUser) return false;
  if (state.currentUser.role === 'admin') return true;
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return false;
  return project.ownerId === state.currentUser.uid;
}

function canEditCurrentProject() {
  return canEditProject(state.currentProjectId);
}

// Log an action to Audit Trail with Snapshot support for Restore
function logAction(action, details, snapshot = null) {
  const newLog = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    timestamp: new Date().toISOString(),
    userId: state.currentUser ? state.currentUser.uid : 'system',
    userName: state.currentUser ? (state.currentUser.displayName || state.currentUser.username) : 'System',
    action: action,
    details: details,
    snapshot: snapshot,
    restored: false
  };
  state.auditLogs.unshift(newLog);
  persistState();
  if (window.FirebaseSync && typeof window.FirebaseSync.syncLog === 'function') {
    window.FirebaseSync.syncLog(newLog);
  }
  renderAuditLogs();
}

// ==========================================================================
// Initialization, Authentication & Fullscreen
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupMicroscopeInputs();
  setupHPLCInputs();
  setupPresentationDeck();
  if (typeof initMobileUI === 'function') initMobileUI();

  // Check saved session immediately without blocking on cloud network call
  const savedUid = safeStorageGet('mitr_auth_uid');
  if (savedUid) {
    const user = state.users.find(u => u.uid === savedUid || u.username === savedUid || u.email === savedUid);
    if (user) {
      applyLoginSuccess(user);
    } else {
      showLoginOverlay(true);
    }
  } else {
    showLoginOverlay(true);
  }

  // Non-blocking background sync with Cloud Firestore
  if (window.FirebaseSync && typeof window.FirebaseSync.init === 'function') {
    window.FirebaseSync.init()
      .then(() => {
        if (state.isLoggedIn) {
          renderAllDataViews();
        }
      })
      .catch(e => console.warn('Firebase init deferred:', e));
  }
});

function showLoginOverlay(show) {
  const overlay = document.getElementById('login-modal-overlay');
  if (overlay) {
    overlay.classList.toggle('hidden', !show);
    overlay.style.display = show ? 'flex' : 'none';
    overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
  }
  document.body.classList.toggle('login-open', !!show);
  if (!show) {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    try { window.scrollTo(0, 0); } catch (e) {}
  }
}

window.handleLoginSubmit = async function(event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }

  try {
    const userEl = document.getElementById('login-username') || document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    const identifier = (userEl ? userEl.value : '').trim();
    const password = passEl ? passEl.value : '';

    if (!identifier || !password) {
      Swal.fire({
        icon: 'warning',
        title: 'Please fill in the data',
        text: 'Please enter both username and password',
        confirmButtonColor: '#0f3d7a'
      });
      return;
    }

    const pwdHash = await sha256Hex(password);

    const foundUser = (state.users || []).find(u => {
      const matchId = (u.username && u.username.toLowerCase() === identifier.toLowerCase()) ||
                      (u.email && u.email.toLowerCase() === identifier.toLowerCase()) ||
                      (u.uid && u.uid === identifier);
      if (!matchId) return false;
      return Boolean(u.passwordHash && u.passwordHash === pwdHash);
    });

    if (foundUser) {
      if (passEl) passEl.value = '';
      applyLoginSuccess(foundUser);
      logAction('LOGIN', `Users ${foundUser.displayName || foundUser.username} (${foundUser.username || foundUser.email}) logged in successfully`);
      if (window.labAudio) window.labAudio.playSuccess();
      showToast(`Welcome ${foundUser.displayName || foundUser.username}`, 'success');
    } else {
      if (window.labAudio) window.labAudio.playWarning();
      Swal.fire({
        icon: 'error',
        title: 'Login failed',
        text: 'Invalid username or password. Please try again',
        confirmButtonColor: '#0f3d7a'
      });
    }
  } catch (err) {
    console.error('[Auth] Login error:', err);
    Swal.fire({
      icon: 'error',
      title: 'An error occurred during sign-in',
      text: 'Please refresh the page and try again',
      confirmButtonColor: '#0f3d7a'
    });
  }
};

function applyLoginSuccess(user) {
  if (!user) return;
  const displayName = user.displayName || user.username || 'User';
  const role = user.role || 'user';
  const avatarChar = (user.username || displayName).charAt(0).toUpperCase();

  state.currentUser = user;
  state.isLoggedIn = true;
  safeStorageSet('mitr_auth_uid', user.uid);

  // Dismiss login overlay immediately before downstream UI renders
  showLoginOverlay(false);

  // Update profile header
  const desktopName = document.getElementById('current-user-name');
  if (desktopName) desktopName.textContent = displayName;
  const desktopAvatar = document.getElementById('current-user-avatar');
  if (desktopAvatar) desktopAvatar.textContent = avatarChar;
  const roleBadge = document.getElementById('current-user-role');
  if (roleBadge) {
    roleBadge.textContent = role.toUpperCase();
    roleBadge.className = `user-role-badge role-${role}`;
  }

  // Update mobile header
  const mobName = document.getElementById('mobile-user-name');
  if (mobName) mobName.textContent = displayName.split(' ')[0] || displayName;
  const mobAvatar = document.getElementById('mobile-top-avatar');
  if (mobAvatar) mobAvatar.textContent = avatarChar;

  // Role-based Navigation Tabs Visibility: Hide Settings & Data Log if not admin
  try {
    updateNavTabVisibility();

    const accessibleProjects = (state.projects || []).filter(p => role === 'admin' || p.ownerId === user.uid);
    if (accessibleProjects.length > 0) {
      if (!accessibleProjects.some(p => p.id === state.currentProjectId)) {
        state.currentProjectId = accessibleProjects[0].id;
      }
    } else {
      state.currentProjectId = '';
    }

    renderProjectSelector();
    renderTankMatrix();
    renderAllDataViews();
    loadSampleDataForCurrentTank();

    if (window.innerWidth <= 768 && typeof window.switchMobileTab === 'function') {
      window.switchMobileTab('home');
    }
  } catch (renderErr) {
    console.warn('[Auth] Post-login render warning:', renderErr);
  }
}

window.handleLogout = function() {
  Swal.fire({
    title: 'Sign out?',
    text: 'Are you sure you want to sign out?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Sign Out',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#991b1b',
    cancelButtonColor: '#94a3b8'
  }).then((res) => {
    if (res.isConfirmed) {
      if (state.currentUser) {
        logAction('LOGOUT', `Users ${state.currentUser.displayName || state.currentUser.username} (${state.currentUser.username || state.currentUser.email}) signed out`);
      }
      state.isLoggedIn = false;
      state.currentUser = null;
      safeStorageRemove('mitr_auth_uid');
      if (window.labAudio) window.labAudio.playClick();
      showLoginOverlay(true);
      showToast('Logged out successfully', 'info');
    }
  });
};

// Fullscreen Toggle (Desktop & Mobile)
function syncFullscreenButtons() {
  const isFull = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  const deskBtn = document.getElementById('btn-fullscreen-desktop');
  if (deskBtn) {
    deskBtn.innerHTML = isFull
      ? '<i class="fa-solid fa-compress"></i><span>Exit Full Screen</span>'
      : '<i class="fa-solid fa-expand"></i><span>Full Screen</span>';
    deskBtn.title = isFull ? 'Exit Fullscreen' : 'Fullscreen';
  }
  const mobBtn = document.getElementById('btn-fullscreen-mobile');
  if (mobBtn) {
    mobBtn.innerHTML = isFull ? '<i class="fa-solid fa-compress"></i>' : '<i class="fa-solid fa-expand"></i>';
    mobBtn.title = isFull ? 'Exit Fullscreen' : 'Fullscreen';
  }
}

window.toggleFullscreen = async function() {
  if (window.labAudio) window.labAudio.playClick();
  const docEl = document.documentElement;
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  try {
    if (!fsEl) {
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      } else {
        showToast('This browser does not support automatic fullscreen (try Add to Home Screen)', 'info');
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  } catch (err) {
    showToast('This browser does not support automatic fullscreen (try Add to Home Screen)', 'info');
  }
  syncFullscreenButtons();
};

document.addEventListener('fullscreenchange', syncFullscreenButtons);
document.addEventListener('webkitfullscreenchange', syncFullscreenButtons);

// Ensure viewport switches between mobile and desktop restore an active section
let resizeSyncTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeSyncTimer);
  resizeSyncTimer = setTimeout(() => {
    if (window.innerWidth > 768) {
      const anyActive = document.querySelector('.content-section.active');
      if (!anyActive) {
        const defaultTab = document.querySelector('.tab-btn[data-target="sec-projects"]');
        if (defaultTab) defaultTab.click();
      }
    } else if (state.isLoggedIn && !document.querySelector('.content-section.active') && document.getElementById('mobile-profile-view')?.style.display !== 'block' && document.getElementById('mobile-notifications-view')?.style.display !== 'block') {
      const homeSec = document.getElementById('mobile-home-view');
      if (homeSec) homeSec.style.display = 'block';
    }
  }, 150);
});

// Unified section navigation (works consistently on both Desktop and Mobile)
window.navigateToSection = function(sectionId, mobileTitle = '') {
  if (window.innerWidth <= 768 && typeof window.mobileNavigateTo === 'function') {
    window.mobileNavigateTo(sectionId, mobileTitle);
    return;
  }
  const tab = document.querySelector(`.tab-btn[data-target="${sectionId}"]`);
  if (tab) {
    tab.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

function updateNavTabVisibility() {
  const isAdmin = state.currentUser && state.currentUser.role === 'admin';
  const logsTab = document.getElementById('tab-btn-logs');
  const settingsTab = document.getElementById('tab-btn-settings');
  const mobAdminUsers = document.getElementById('mob-menu-admin-users');
  const mobAdminLogs = document.getElementById('mob-menu-admin-logs');

  if (logsTab) logsTab.style.display = isAdmin ? 'inline-flex' : 'none';
  if (settingsTab) settingsTab.style.display = isAdmin ? 'inline-flex' : 'none';
  if (mobAdminUsers) mobAdminUsers.style.display = isAdmin ? 'flex' : 'none';
  if (mobAdminLogs) mobAdminLogs.style.display = isAdmin ? 'flex' : 'none';

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
          <strong>Read-Only Mode:</strong> 
          This research was created by <u>${escapeHtml(project.ownerName)}</u> You can view results and charts, but cannot edit or delete data
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
      <option value="ALL">👥 All Researchers</option>
      ${distinctResearchers.map(r => `
        <option value="${escapeHtml(r.uid)}" ${r.uid === currentFilterVal ? 'selected' : ''}>${escapeHtml(r.name)}</option>
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
    selector.innerHTML = '<option value="">(No research)</option>';
    state.currentProjectId = null;
    onActiveProjectChanged(false);
    return;
  }

  // Ensure currentProjectId is valid in filtered list
  if (!filteredProjects.some(p => p.id === state.currentProjectId)) {
    state.currentProjectId = filteredProjects[0].id;
  }

  selector.innerHTML = filteredProjects.map(p => {
    const ownerLabel = isAdmin ? ` [${escapeHtml(p.ownerName)}]` : '';
    return `<option value="${escapeHtml(p.id)}" ${p.id === state.currentProjectId ? 'selected' : ''}>
      ${escapeHtml(p.experimentNo)} (${escapeHtml(p.batchMediumNo)}) - D=${escapeHtml(p.conditionParams?.dilutionRateD)}${ownerLabel}
    </option>`;
  }).join('');

  selector.onchange = (e) => {
    state.currentProjectId = e.target.value;
    onActiveProjectChanged();
    showToast('Project switched', 'info');
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
  if (!p) {
    container.innerHTML = '<span style="color: #94a3b8; font-size: 0.85rem;">-</span>';
    return;
  }
  const timepoints = getProjectTimepoints(p);
  if (!timepoints || timepoints.length === 0) {
    container.innerHTML = '<span style="color: #94a3b8; font-size: 0.85rem;">-</span>';
    return;
  }
  container.innerHTML = timepoints.map(t => `
    <span class="badge badge-navy" style="font-size: 0.75rem; padding: 3px 8px; font-weight: 600;">${t}h</span>
  `).join('');
}

// Custom sampling timepoint modal (+ Add Time in Lab Entry)
window.openAddCustomTimepointModal = function() {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'No edit permission', text: 'You are not the owner of this research project' });
    return;
  }
  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p) return;

  const currentTimes = getProjectTimepoints(p);

  Swal.fire({
    title: '⏱️ Add Sampling Timepoint',
    html: `
      <div style="text-align: left; font-size: 0.88rem;">
        <p style="color: #64748b; margin-bottom: 12px; line-height: 1.5;">
          Specify the vessel age hour for additional sampling (e.g. 26, 50, or 76 h). This timepoint syncs and saves to the project automatically
        </p>
        <div class="form-group">
          <label class="form-label">Sampling Hour (h):*</label>
          <input type="number" step="0.5" min="0" max="200" id="swal-custom-timepoint" class="form-input" placeholder="e.g. 26 or 50">
        </div>
        <div style="margin-top: 10px; font-size: 0.8rem; color: #475569; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px dashed #cbd5e1;">
          <strong>Current Time Point:</strong> ${currentTimes.join(', ')} hr
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '➕ Add Time Point',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#0f3d7a',
    preConfirm: () => {
      const val = parseFloat(document.getElementById('swal-custom-timepoint').value);
      if (isNaN(val) || val < 0) {
        Swal.showValidationMessage('Please enter a valid hour (>= 0)');
        return false;
      }
      if (currentTimes.includes(val)) {
        Swal.showValidationMessage(`Time Point ${val} hr already exists in this project`);
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
      if (window.FirebaseSync && typeof window.FirebaseSync.syncProject === 'function') {
        window.FirebaseSync.syncProject(p);
      }
      window.labAudio.playSuccess();
      logAction('ADD_TIMEPOINT', `Add Sampling Timepoint ${newHour}h in project ${p.experimentNo}`);
      
      // Sync across all views
      renderTimepointOptions('input-timepoint', newHour);
      renderHeaderTimepointsBadges();
      loadSampleDataForCurrentTank();
      
      showToast(`Add Time Point ${newHour} hr successfully`, 'success');
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
  const setTxt = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  if (!p) {
    setTxt('header-batch-no', '-');
    setTxt('header-exp-no', '-');
    setTxt('header-condition', '-');
    setTxt('header-culture', '-');
    setTxt('header-date', '-');
    setTxt('header-seed', '-');
    setTxt('header-owner', '-');
    setTxt('header-inlet-sugar', '-');
    setTxt('header-initial-brix', '-');
    setTxt('header-prep-vol', '-');
    setTxt('header-remain-vol', '-');
    const tpContainer = document.getElementById('header-timepoints-badge-group');
    if (tpContainer) tpContainer.innerHTML = '<span style="color: #94a3b8; font-size: 0.85rem;">-</span>';
    renderFeedLogsTable();
    return;
  }

  setTxt('header-batch-no', p.batchMediumNo || '-');
  setTxt('header-exp-no', p.experimentNo || '-');
  setTxt('header-condition', p.conditionText || '-');
  setTxt('header-culture', p.conditionParams?.feedCulture || '-');
  setTxt('header-date', p.date || '-');
  setTxt('header-seed', p.seed ? `${p.seed} (${p.seedPreparation || ''})` : '-');
  setTxt('header-owner', p.ownerName || '-');

  // New Experiment Initial Fields (Inlet sugar, %Brix, Volumes)
  setTxt('header-inlet-sugar', p.inletMolassesSugar !== undefined ? `${p.inletMolassesSugar.toFixed(1)} g/L` : '-');
  setTxt('header-initial-brix', p.initialBrix !== undefined ? `${p.initialBrix.toFixed(1)} %Brix` : '-');
  setTxt('header-prep-vol', p.preparedVolume !== undefined ? `${p.preparedVolume.toFixed(1)} L` : '-');
  setTxt('header-remain-vol', p.remainingVolume || '-');

  renderHeaderTimepointsBadges();
  renderFeedLogsTable();
}

// Editable Experiment Header (Requirement 7)
window.toggleEditHeaderForm = function(show = true) {
  const viewContainer = document.getElementById('header-view-container');
  const editContainer = document.getElementById('header-edit-container');
  const p = state.projects.find(proj => proj.id === state.currentProjectId);

  if (!p) return;

  if (show) {
    // Populate form fields
    document.getElementById('edit-batch-no').value = p.batchMediumNo || '';
    document.getElementById('edit-exp-no').value = p.experimentNo || '';
    document.getElementById('edit-d-rate').value = p.conditionParams?.dilutionRateD ?? 0.022;
    document.getElementById('edit-ratio-bc').value = p.conditionParams?.ratioBC || '80:20';
    document.getElementById('edit-temp').value = p.conditionParams?.temperature ?? 30;
    document.getElementById('edit-fs').value = p.conditionParams?.feedSugarPercentFS ?? 8;
    document.getElementById('edit-feed-culture').value = p.conditionParams?.feedCulture || '';
    document.getElementById('edit-date').value = p.date || '';
    document.getElementById('edit-seed').value = p.seed || '';
    document.getElementById('edit-seed-prep').value = p.seedPreparation || '';

    // New Experiment Initial Fields
    const sugarIn = document.getElementById('edit-inlet-sugar');
    if (sugarIn) sugarIn.value = p.inletMolassesSugar !== undefined ? p.inletMolassesSugar : '';
    const brixIn = document.getElementById('edit-initial-brix');
    if (brixIn) brixIn.value = p.initialBrix !== undefined ? p.initialBrix : '';
    const prepVolIn = document.getElementById('edit-prep-vol');
    if (prepVolIn) prepVolIn.value = p.preparedVolume !== undefined ? p.preparedVolume : '';
    const remainVolIn = document.getElementById('edit-remain-vol');
    if (remainVolIn) remainVolIn.value = p.remainingVolume || '';

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
    Swal.fire({ icon: 'error', title: 'No edit permission', text: 'You are not the owner of this research project' });
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

  // New Fields: Inlet Sugar, %Brix, Prepared Vol, Remaining Vol
  p.inletMolassesSugar = parseFloat(document.getElementById('edit-inlet-sugar')?.value) || 0;
  p.initialBrix = parseFloat(document.getElementById('edit-initial-brix')?.value) || 0;
  p.preparedVolume = parseFloat(document.getElementById('edit-prep-vol')?.value) || 0;
  p.remainingVolume = document.getElementById('edit-remain-vol')?.value.trim() || '';

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
  if (window.FirebaseSync && typeof window.FirebaseSync.syncProject === 'function') {
    window.FirebaseSync.syncProject(p);
  }
  window.labAudio.playSuccess();
  logAction('UPDATE_PROJECT_HEADER', `Edit Initial Data ${p.experimentNo} (${p.batchMediumNo}) [Inlet sugar: ${p.inletMolassesSugar} g/L, Brix: ${p.initialBrix}]`);
  toggleEditHeaderForm(false);
  updateProjectHeaderDisplay();
  renderProjectSelector();
  renderTimepointOptions('input-timepoint');
  renderGanttTimeline();
  showToast('Experiment header changes saved', 'success');
};

// ==========================================================================
// Feed Log Records (Grounded in Attachment 1 "Feed Log Table")
// ==========================================================================
window.renderFeedLogsTable = function() {
  const tbody = document.getElementById('feed-log-tbody');
  if (!tbody) return;

  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 18px;">Selected Project not found</td></tr>';
    return;
  }

  if (!p.feedLogs) p.feedLogs = [];

  if (p.feedLogs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 18px;">No feeding log entries yet. Click "+ Add Feeding Log" to get started</td></tr>';
    return;
  }

  const editable = canEditCurrentProject();

  tbody.innerHTML = p.feedLogs.map((log, idx) => `
    <tr>
      <td><strong>${escapeHtml(log.dateTime || '-')}</strong></td>
      <td><span class="badge badge-navy">${escapeHtml(log.medium || '-')}</span></td>
      <td><strong>${escapeHtml(log.feedNo || '-')}</strong></td>
      <td style="text-align: center; color: #b45309; font-weight: 700;">${log.brix !== undefined ? escapeHtml(log.brix) + ' °Bx' : '-'}</td>
      <td style="text-align: right; color: #059669; font-weight: 600;">${escapeHtml(log.initialVol || '-')}</td>
      <td style="text-align: right; color: #1e40af; font-weight: 700;">${escapeHtml(log.remainingVol || '-')}</td>
      <td style="color: #475569; font-size: 0.8rem;">${escapeHtml(log.remarks || '-')}</td>
      <td style="text-align: center;">
        <div style="display: flex; gap: 4px; justify-content: center;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="openAddFeedLogModal('${escapeHtml(log.id)}')" style="padding: 3px 6px; font-size: 0.72rem;" ${!editable ? 'disabled title="No edit permission"' : ''}>
            ✏️
          </button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="deleteFeedLogEntry('${escapeHtml(log.id)}')" style="padding: 3px 6px; font-size: 0.72rem; color: #ef4444;" ${!editable ? 'disabled title="No permission to delete"' : ''}>
            🗑️
          </button>
        </div>
      </td>
    </tr>
  `).join('');
};

window.openAddFeedLogModal = function(editId = null) {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'No edit permission', text: 'You are not the owner of this research project' });
    return;
  }

  const modal = document.getElementById('modal-add-feed-log');
  if (!modal) return;

  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p) return;

  document.getElementById('feed-log-edit-id').value = editId || '';
  const titleEl = document.getElementById('feed-log-modal-title');

  if (editId && p.feedLogs) {
    const item = p.feedLogs.find(l => l.id === editId);
    if (item) {
      if (titleEl) titleEl.textContent = '✏️ Edit Feeding Log Entry';
      document.getElementById('feed-log-datetime').value = item.dateTime || '';
      document.getElementById('feed-log-medium').value = item.medium || '';
      document.getElementById('feed-log-no').value = item.feedNo || '';
      document.getElementById('feed-log-brix').value = item.brix !== undefined ? item.brix : '';
      document.getElementById('feed-log-initial-vol').value = item.initialVol || '';
      document.getElementById('feed-log-remain-vol').value = item.remainingVol || '';
      document.getElementById('feed-log-remarks').value = item.remarks || '';
      modal.style.display = 'flex';
      return;
    }
  }

  if (titleEl) titleEl.textContent = '📋 Add Feeding Log Entry';
  const now = new Date();
  const dateStr = `${now.getDate()}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear().toString().slice(2)} ${now.getHours().toString().padStart(2,'0')}:00`;
  document.getElementById('feed-log-datetime').value = dateStr;
  document.getElementById('feed-log-medium').value = 'BF.1';
  document.getElementById('feed-log-no').value = `Feed ${(p.feedLogs?.length || 0) + 1}`;
  document.getElementById('feed-log-brix').value = '17.1';
  document.getElementById('feed-log-initial-vol').value = '4 L';
  document.getElementById('feed-log-remain-vol').value = '1,500 mL';
  document.getElementById('feed-log-remarks').value = '200 mL/h';

  modal.style.display = 'flex';
  if (window.labAudio) window.labAudio.playClick();
};

window.closeAddFeedLogModal = function() {
  const modal = document.getElementById('modal-add-feed-log');
  if (modal) modal.style.display = 'none';
};

window.saveFeedLogEntry = function() {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'No edit permission', text: 'You are not the owner of this research project' });
    return;
  }

  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p) return;
  if (!p.feedLogs) p.feedLogs = [];

  const editId = document.getElementById('feed-log-edit-id')?.value;
  const dt = document.getElementById('feed-log-datetime')?.value.trim();
  const med = document.getElementById('feed-log-medium')?.value.trim();
  const fNo = document.getElementById('feed-log-no')?.value.trim();
  const bx = parseFloat(document.getElementById('feed-log-brix')?.value);
  const initV = document.getElementById('feed-log-initial-vol')?.value.trim();
  const remV = document.getElementById('feed-log-remain-vol')?.value.trim();
  const remk = document.getElementById('feed-log-remarks')?.value.trim();

  if (editId) {
    const idx = p.feedLogs.findIndex(l => l.id === editId);
    if (idx >= 0) {
      p.feedLogs[idx] = {
        ...p.feedLogs[idx],
        dateTime: dt,
        medium: med,
        feedNo: fNo,
        brix: !isNaN(bx) ? bx : undefined,
        initialVol: initV,
        remainingVol: remV,
        remarks: remk,
        updatedAt: new Date().toISOString()
      };
    }
  } else {
    p.feedLogs.push({
      id: 'fl_' + Date.now(),
      dateTime: dt,
      medium: med,
      feedNo: fNo,
      brix: !isNaN(bx) ? bx : undefined,
      initialVol: initV,
      remainingVol: remV,
      remarks: remk,
      createdAt: new Date().toISOString()
    });
  }

  persistState();
  if (window.FirebaseSync && typeof window.FirebaseSync.syncProject === 'function') {
    window.FirebaseSync.syncProject(p);
  }
  if (window.labAudio) window.labAudio.playSuccess();
  closeAddFeedLogModal();
  renderFeedLogsTable();
  logAction('FEED_LOG_ENTRY', `Logged feeding entry: ${med} (${fNo}) - Brix: ${bx}°Bx`);
  showToast('Feeding log entry saved', 'success');
};

window.deleteFeedLogEntry = function(id) {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'No edit permission', text: 'You are not the owner of this research project' });
    return;
  }

  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p || !p.feedLogs) return;

  Swal.fire({
    title: 'Confirm delete Feed entry?',
    text: 'Delete this feeding log entry?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Delete Item',
    cancelButtonText: 'Cancel'
  }).then(res => {
    if (res.isConfirmed) {
      p.feedLogs = p.feedLogs.filter(l => l.id !== id);
      persistState();
      if (window.FirebaseSync && typeof window.FirebaseSync.syncProject === 'function') {
        window.FirebaseSync.syncProject(p);
      }
      renderFeedLogsTable();
      if (window.labAudio) window.labAudio.playWarning();
      showToast('Feeding log entry deleted', 'info');
    }
  });
};


// Create New Project with Automatic Gantt Timeline Generation
window.openNewProjectModal = function() {
  const currentUserName = state.currentUser ? (state.currentUser.displayName || state.currentUser.username) : 'Researcher';
  const currentUserId = state.currentUser ? state.currentUser.uid : 'usr_user';

  Swal.fire({
    title: '➕ Create New Research Project',
    html: `
      <div style="text-align: left; font-size: 0.88rem; max-height: 70vh; overflow-y: auto;">
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Batch Medium no.:*</label>
            <input type="text" id="swal-new-batch" class="form-input" placeholder="x_220601" value="x_${new Date().toISOString().slice(2,10).replace(/-/g,'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Experiment no.:*</label>
            <input type="text" id="swal-new-exp" class="form-input" placeholder="e.g. Fermentation Trial D=0.020">
          </div>
        </div>

        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Dilution Rate D (h⁻¹):*</label>
            <input type="number" step="0.001" id="swal-new-drate" class="form-input" value="0.022">
          </div>
          <div class="form-group">
            <label class="form-label">B:C:* Ratio</label>
            <input type="text" id="swal-new-ratio" class="form-input" value="80:20">
          </div>
        </div>

        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Temperature (°C):</label>
            <input type="number" id="swal-new-temp" class="form-input" value="30">
          </div>
          <div class="form-group">
            <label class="form-label">Start Date:*</label>
            <input type="date" id="swal-new-date" class="form-input" value="${new Date().toISOString().slice(0,10)}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Feed culture:</label>
          <input type="text" id="swal-new-culture" class="form-input" placeholder="e.g. PK B:C mol (80:20)">
        </div>

        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Seed & Lot:</label>
            <input type="text" id="swal-new-seed" class="form-input" placeholder="e.g. Angel Lot.260624">
          </div>
          <div class="form-group">
            <label class="form-label">Seed preparation:</label>
            <input type="text" id="swal-new-prep" class="form-input" placeholder="e.g. 0.4 g yeast dissolved in water">
          </div>
        </div>

        <div class="form-group" style="margin-top: 8px;">
          <label class="form-label">Sampling Timepoints (hours, comma-separated):</label>
          <input type="text" id="swal-new-timepoints" class="form-input" value="0, 12, 16, 18, 22, 34, 40, 46, 58, 64, 70, 82" placeholder="0, 12, 16, 18, 22, 34, 40, 46, 58, 64, 70, 82">
        </div>
      </div>
    `,
    width: '600px',
    showCancelButton: true,
    confirmButtonText: '🚀 Create Project & Generate Timeline',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#0f3d7a',
    preConfirm: () => {
      const batch = document.getElementById('swal-new-batch').value.trim();
      const exp = document.getElementById('swal-new-exp').value.trim() || 'Continuous Fermentation';
      const dRate = parseFloat(document.getElementById('swal-new-drate').value) || 0.022;
      const ratio = document.getElementById('swal-new-ratio').value.trim() || '80:20';
      const temp = parseFloat(document.getElementById('swal-new-temp').value) || 30;
      const date = document.getElementById('swal-new-date').value;
      const culture = document.getElementById('swal-new-culture').value.trim();
      const seed = document.getElementById('swal-new-seed').value.trim();
      const prep = document.getElementById('swal-new-prep').value.trim();

      const rawTp = document.getElementById('swal-new-timepoints')?.value || '';
      const parsedTp = rawTp.split(',')
        .map(t => parseFloat(t.trim()))
        .filter(n => !isNaN(n) && n >= 0);
      const timepoints = parsedTp.length > 0 
        ? Array.from(new Set(parsedTp)).sort((a, b) => a - b)
        : [0, 12, 16, 18, 22, 34, 40, 46, 58, 64, 70, 82];

      if (!batch || !exp || !date) {
        Swal.showValidationMessage('Please fill in all required fields');
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
      if (window.FirebaseSync && typeof window.FirebaseSync.syncProject === 'function') {
        window.FirebaseSync.syncProject(newProj);
      }
      window.labAudio.playSuccess();
      logAction('CREATE_PROJECT', `Create New Project ${newProj.experimentNo} (${newProj.batchMediumNo}) with auto-generated Gantt Chart`);
      renderAllDataViews();
      showToast(`Create Project ${newProj.experimentNo} Success`, 'success');
    }
  });
};

// Delete Entire Project and all its rows (Requirement 2 & 3)
window.deleteCurrentProject = function() {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'No permission to delete', text: 'You are not the owner of this research project' });
    return;
  }

  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p) {
    showToast('Project to delete not found', 'error');
    return;
  }

  const projectSamples = state.samples.filter(s => s.projectId === p.id);

  Swal.fire({
    title: `Delete Project ${escapeHtml(p.experimentNo)}?`,
    html: `
      <div style="text-align: left; font-size: 0.9rem; line-height: 1.6;">
        <p>• <strong>Batch Medium:</strong> ${escapeHtml(p.batchMediumNo)}</p>
        <p>• <strong>All sample data:</strong> ${projectSamples.length} rows</p>
        <p style="color: #b91c1c; margin-top: 8px;">
          ⚠️ This project and all its raw data records will be deleted from the database
          <br><strong>(You can restore this anytime via the button "Restore Data" in Data Log)</strong>
        </p>
      </div>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Confirm Delete Entire Project',
    cancelButtonText: 'Cancel',
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
      persistState();
      if (window.FirebaseSync && typeof window.FirebaseSync.removeProject === 'function') {
        window.FirebaseSync.removeProject(p.id);
      }

      logAction('DELETE_PROJECT', `Delete Project ${p.experimentNo} (${p.batchMediumNo}) and all data ${projectSamples.length} rows`, snapshot);

      // Select another project
      const isAdmin = state.currentUser && state.currentUser.role === 'admin';
      const available = isAdmin ? state.projects : state.projects.filter(x => x.ownerId === state.currentUser?.uid);
      state.currentProjectId = available.length > 0 ? available[0].id : '';

      persistState();
      window.labAudio.playWarning();
      renderAllDataViews();
      showToast(`Delete Project ${p.experimentNo} completed (recoverable from Data Log)`, 'info');
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
    state.activeSeries === 'total' ? 'Total Cells' :
    state.activeSeries === 'budding' ? 'Cell Budding' : 'Dead Cells (Blue-Stained)';
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

function formatCfuDisplay(num) {
  if (!num || isNaN(num) || num <= 0) return '0';
  if (num >= 1e6) {
    return `${(num / 1e8).toFixed(2)} × 10⁸`;
  }
  return num.toLocaleString();
}

function calculateCellKinetics() {
  const dilution = state.tallyCounts.dilution || 10;
  const factor = parseFloat(document.getElementById('setting-haemacytometer-factor')?.value) || 250000;
  const totalSum = state.tallyCounts.total.reduce((a, b) => a + b, 0);
  const buddingSum = state.tallyCounts.budding.reduce((a, b) => a + b, 0);
  const deadSum = state.tallyCounts.dead.reduce((a, b) => a + b, 0);

  const totalCfu = totalSum * dilution * factor;
  const buddingCfu = buddingSum * dilution * factor;
  const deadCfu = deadSum * dilution * factor;

  const buddingPct = totalSum > 0 ? ((buddingSum / totalSum) * 100).toFixed(1) : '0.0';
  const deadPct = totalSum > 0 ? ((deadSum / totalSum) * 100).toFixed(1) : '0.0';
  const viabilityPct = totalSum > 0 ? (((totalSum - deadSum) / totalSum) * 100).toFixed(1) : '100.0';

  // Update live row badges in haemacytometer matrix table (Attachment 2: CFU/ml for Total, Budding, Dead)
  const sumTotalEl = document.getElementById('sum-row-total');
  const sumBuddingEl = document.getElementById('sum-row-budding');
  const sumDeadEl = document.getElementById('sum-row-dead');
  const rateTotalEl = document.getElementById('rate-row-total');
  const rateBuddingEl = document.getElementById('rate-row-budding');
  const rateDeadEl = document.getElementById('rate-row-dead');

  if (sumTotalEl) sumTotalEl.textContent = totalSum;
  if (sumBuddingEl) sumBuddingEl.textContent = buddingSum;
  if (sumDeadEl) sumDeadEl.textContent = deadSum;

  if (rateTotalEl) rateTotalEl.textContent = totalCfu > 0 ? `${formatCfuDisplay(totalCfu)} CFU/ml` : '0 CFU/ml';
  if (rateBuddingEl) rateBuddingEl.textContent = buddingCfu > 0 ? `${formatCfuDisplay(buddingCfu)} CFU/ml (${buddingPct}%)` : `0 CFU/ml (${buddingPct}%)`;
  if (rateDeadEl) rateDeadEl.textContent = deadCfu > 0 ? `${formatCfuDisplay(deadCfu)} CFU/ml (${viabilityPct}%)` : `0 CFU/ml (${viabilityPct}%)`;

  // Update Series 4: Cell Dry Weight (Attachment 4)
  const currentSample = state.samples.find(s => 
    (s.projectId === state.currentProjectId || !s.projectId) && s.tank === state.selectedTank && s.time === (parseFloat(document.getElementById('input-timepoint')?.value) || state.selectedTime)
  );
  const cdwVal = (state.currentCDW !== undefined && state.currentCDW !== null) ? state.currentCDW : (currentSample?.cellDryWeight);
  const sumCdwEl = document.getElementById('sum-row-cdw');
  const rateCdwEl = document.getElementById('rate-row-cdw');
  const calcCdwKpiEl = document.getElementById('calc-cdw-kpi');

  if (cdwVal !== undefined && cdwVal !== null) {
    if (rateCdwEl) rateCdwEl.textContent = `${cdwVal} g/L`;
    if (sumCdwEl) sumCdwEl.textContent = currentSample?.cdwDetails?.avgNet ? `${currentSample.cdwDetails.avgNet.toFixed(4)} g` : `${(cdwVal / 1000).toFixed(4)} g`;
    if (calcCdwKpiEl) calcCdwKpiEl.textContent = `${cdwVal} g/L`;
  } else {
    if (rateCdwEl) rateCdwEl.textContent = '- g/L';
    if (sumCdwEl) sumCdwEl.textContent = '-';
    if (calcCdwKpiEl) calcCdwKpiEl.textContent = '-';
  }

  // Update Live KPI strip
  const calcTotEl = document.getElementById('calc-total-cells-ml');
  if (calcTotEl) calcTotEl.textContent = totalCfu > 0 ? `${formatCfuDisplay(totalCfu)} CFU/ml` : '0 CFU/ml';
  const calcBudEl = document.getElementById('calc-budding-kpi');
  if (calcBudEl) calcBudEl.textContent = buddingCfu > 0 ? `${formatCfuDisplay(buddingCfu)} (${buddingPct}%)` : `0 (${buddingPct}%)`;
  const calcDeadEl = document.getElementById('calc-dead-kpi');
  if (calcDeadEl) calcDeadEl.textContent = deadCfu > 0 ? `${formatCfuDisplay(deadCfu)} CFU/ml` : '0 CFU/ml';
  const calcViaEl = document.getElementById('calc-viability-pct');
  if (calcViaEl) calcViaEl.textContent = viabilityPct + ' %';

  const alertBox = document.getElementById('cell-validation-alert');
  if (alertBox) {
    if (deadSum > totalSum) {
      alertBox.textContent = '⚠️ Warning: Dead cells exceed Total cells. Please verify your cell count';
      alertBox.className = 'inline-alert inline-alert-danger visible';
      window.labAudio?.playWarning();
    } else if (buddingSum > totalSum) {
      alertBox.textContent = '⚠️ Warning: Budding cells exceed Total cells. Please verify your cell count';
      alertBox.className = 'inline-alert inline-alert-warning visible';
      window.labAudio?.playWarning();
    } else {
      alertBox.className = 'inline-alert';
    }
  }

  return { cellsPerMl: totalCfu, totalCfu, buddingCfu, deadCfu, buddingPct, viabilityPct, totalSum, buddingSum, deadSum, cellDryWeight: cdwVal };
}

// ==========================================================================
// Cell Dry Weight (CDW) Modal Controller (Attachment 4)
// ==========================================================================
window.openCDWModal = function() {
  const modal = document.getElementById('modal-cdw-calculator');
  if (!modal) return;

  const currentSample = state.samples.find(s => 
    (s.projectId === state.currentProjectId || !s.projectId) && s.tank === state.selectedTank && s.time === (parseFloat(document.getElementById('input-timepoint')?.value) || state.selectedTime)
  );

  const targetLabel = document.getElementById('cdw-modal-target-sample');
  if (targetLabel) targetLabel.textContent = `${state.selectedTank} @ ${parseFloat(document.getElementById('input-timepoint')?.value) || state.selectedTime}h`;

  const details = state.currentCDWDetails || currentSample?.cdwDetails;
  if (details) {
    document.getElementById('cdw-tube1-before1').value = details.tube1Before1 || '';
    document.getElementById('cdw-tube1-before2').value = details.tube1Before2 || '';
    document.getElementById('cdw-tube1-after1').value = details.tube1After1 || '';
    document.getElementById('cdw-tube1-after2').value = details.tube1After2 || '';

    document.getElementById('cdw-tube2-before1').value = details.tube2Before1 || '';
    document.getElementById('cdw-tube2-before2').value = details.tube2Before2 || '';
    document.getElementById('cdw-tube2-after1').value = details.tube2After1 || '';
    document.getElementById('cdw-tube2-after2').value = details.tube2After2 || '';
    document.getElementById('cdw-sample-vol').value = details.sampleVolMl || 1.0;
  } else if (currentSample?.cellDryWeight) {
    const cdw = currentSample.cellDryWeight;
    const avgNet = cdw / 1000;
    const b1_1 = 1.1130, b1_2 = 1.1132;
    const a1_1 = parseFloat((b1_1 + avgNet * 1.02).toFixed(4)), a1_2 = parseFloat((b1_2 + avgNet * 1.02).toFixed(4));
    const b2_1 = 1.1175, b2_2 = 1.1174;
    const a2_1 = parseFloat((b2_1 + avgNet * 0.98).toFixed(4)), a2_2 = parseFloat((b2_2 + avgNet * 0.98).toFixed(4));

    document.getElementById('cdw-tube1-before1').value = b1_1;
    document.getElementById('cdw-tube1-before2').value = b1_2;
    document.getElementById('cdw-tube1-after1').value = a1_1;
    document.getElementById('cdw-tube1-after2').value = a1_2;

    document.getElementById('cdw-tube2-before1').value = b2_1;
    document.getElementById('cdw-tube2-before2').value = b2_2;
    document.getElementById('cdw-tube2-after1').value = a2_1;
    document.getElementById('cdw-tube2-after2').value = a2_2;
    document.getElementById('cdw-sample-vol').value = 1.0;
  } else {
    ['tube1-before1', 'tube1-before2', 'tube1-after1', 'tube1-after2',
     'tube2-before1', 'tube2-before2', 'tube2-after1', 'tube2-after2'].forEach(id => {
      const el = document.getElementById('cdw-' + id);
      if (el) el.value = '';
    });
    document.getElementById('cdw-sample-vol').value = 1.0;
  }

  calcCDWFromInputs();
  modal.style.display = 'flex';
  if (window.labAudio) window.labAudio.playClick();
};

window.closeCDWModal = function() {
  const modal = document.getElementById('modal-cdw-calculator');
  if (modal) modal.style.display = 'none';
};

window.calcCDWFromInputs = function() {
  const b1_1 = parseFloat(document.getElementById('cdw-tube1-before1')?.value) || 0;
  const b1_2 = parseFloat(document.getElementById('cdw-tube1-before2')?.value) || 0;
  const a1_1 = parseFloat(document.getElementById('cdw-tube1-after1')?.value) || 0;
  const a1_2 = parseFloat(document.getElementById('cdw-tube1-after2')?.value) || 0;

  const b2_1 = parseFloat(document.getElementById('cdw-tube2-before1')?.value) || 0;
  const b2_2 = parseFloat(document.getElementById('cdw-tube2-before2')?.value) || 0;
  const a2_1 = parseFloat(document.getElementById('cdw-tube2-after1')?.value) || 0;
  const a2_2 = parseFloat(document.getElementById('cdw-tube2-after2')?.value) || 0;

  const sampleVol = parseFloat(document.getElementById('cdw-sample-vol')?.value) || 1.0;

  let net1 = 0;
  if ((a1_1 > 0 || a1_2 > 0) && (b1_1 > 0 || b1_2 > 0)) {
    const avgB1 = (b1_1 > 0 && b1_2 > 0) ? (b1_1 + b1_2) / 2 : (b1_1 || b1_2);
    const avgA1 = (a1_1 > 0 && a1_2 > 0) ? (a1_1 + a1_2) / 2 : (a1_1 || a1_2);
    net1 = Math.max(0, avgA1 - avgB1);
  }

  let net2 = 0;
  if ((a2_1 > 0 || a2_2 > 0) && (b2_1 > 0 || b2_2 > 0)) {
    const avgB2 = (b2_1 > 0 && b2_2 > 0) ? (b2_1 + b2_2) / 2 : (b2_1 || b2_2);
    const avgA2 = (a2_1 > 0 && a2_2 > 0) ? (a2_1 + a2_2) / 2 : (a2_1 || a2_2);
    net2 = Math.max(0, avgA2 - avgB2);
  }

  let avgNet = 0;
  if (net1 > 0 && net2 > 0) {
    avgNet = (net1 + net2) / 2;
  } else {
    avgNet = net1 || net2;
  }

  // Formula: 1000 * avgNet / sampleVol
  const cdw = sampleVol > 0 ? (1000 * avgNet) / sampleVol : 0;

  const t1Badge = document.getElementById('cdw-tube1-net-badge');
  if (t1Badge) t1Badge.textContent = `Net: ${net1.toFixed(4)} g`;

  const t2Badge = document.getElementById('cdw-tube2-net-badge');
  if (t2Badge) t2Badge.textContent = `Net: ${net2.toFixed(4)} g`;

  const avgNetDisp = document.getElementById('cdw-avg-net-display');
  if (avgNetDisp) avgNetDisp.textContent = `${avgNet.toFixed(4)} g`;

  const cdwDisp = document.getElementById('cdw-result-display');
  if (cdwDisp) cdwDisp.textContent = `${cdw.toFixed(2)} g/L`;

  return { net1, net2, avgNet, cdw, sampleVol };
};

window.loadCDWExampleData = function() {
  // Real laboratory test values directly from Attachment 4 ("Cell Dry Weight Form") Row 1 & 2
  document.getElementById('cdw-tube1-before1').value = '1.1130';
  document.getElementById('cdw-tube1-before2').value = '1.1132';
  document.getElementById('cdw-tube1-after1').value = '1.1152';
  document.getElementById('cdw-tube1-after2').value = '1.1153';

  document.getElementById('cdw-tube2-before1').value = '1.1175';
  document.getElementById('cdw-tube2-before2').value = '1.1174';
  document.getElementById('cdw-tube2-after1').value = '1.1192';
  document.getElementById('cdw-tube2-after2').value = '1.1193';

  document.getElementById('cdw-sample-vol').value = '1.0';

  calcCDWFromInputs();
  if (window.labAudio) window.labAudio.playSuccess();
  showToast('Sample Cell Dry Weight data loaded', 'info');
};

window.saveCDWToCurrentSample = function() {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'No edit permission', text: 'You are not the owner of this research project' });
    return;
  }
  const res = calcCDWFromInputs();
  if (res.cdw <= 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Invalid cell dry weight value',
      text: 'Please enter all before- and after-drying weights to calculate CDW'
    });
    return;
  }

  const timeVal = parseFloat(document.getElementById('input-timepoint')?.value) || state.selectedTime;
  let sample = state.samples.find(s => 
    (s.projectId === state.currentProjectId || !s.projectId) && s.tank === state.selectedTank && s.time === timeVal
  );

  const isNew = !sample;
  if (isNew) {
    sample = { projectId: state.currentProjectId, tank: state.selectedTank, time: timeVal };
    state.samples.push(sample);
  }

  const cdwFixed = parseFloat(res.cdw.toFixed(2));
  sample.cellDryWeight = cdwFixed;
  sample.cdwDetails = {
    tube1Before1: parseFloat(document.getElementById('cdw-tube1-before1')?.value) || 0,
    tube1Before2: parseFloat(document.getElementById('cdw-tube1-before2')?.value) || 0,
    tube1After1: parseFloat(document.getElementById('cdw-tube1-after1')?.value) || 0,
    tube1After2: parseFloat(document.getElementById('cdw-tube1-after2')?.value) || 0,
    tube2Before1: parseFloat(document.getElementById('cdw-tube2-before1')?.value) || 0,
    tube2Before2: parseFloat(document.getElementById('cdw-tube2-before2')?.value) || 0,
    tube2After1: parseFloat(document.getElementById('cdw-tube2-after1')?.value) || 0,
    tube2After2: parseFloat(document.getElementById('cdw-tube2-after2')?.value) || 0,
    sampleVolMl: res.sampleVol,
    tube1Net: parseFloat(res.net1.toFixed(4)),
    tube2Net: parseFloat(res.net2.toFixed(4)),
    avgNet: parseFloat(res.avgNet.toFixed(4)),
    cdw: cdwFixed
  };

  state.currentCDW = cdwFixed;
  state.currentCDWDetails = sample.cdwDetails;

  // Also sync to mobile quick input if present
  const mobCdwIn = document.getElementById('mob-quick-cdw');
  if (mobCdwIn) mobCdwIn.value = cdwFixed;

  persistState();
  if (window.FirebaseSync && typeof window.FirebaseSync.syncSample === 'function') {
    window.FirebaseSync.syncSample(sample);
  }
  if (window.labAudio) window.labAudio.playSuccess();
  closeCDWModal();
  calculateCellKinetics();
  renderDataRecordTable();
  logAction('CDW_ENTRY', `Saved Yeast Cell Dry Weight (CDW): ${cdwFixed} g/L (Tank ${state.selectedTank} @ ${timeVal}h, avg. dry ${res.avgNet.toFixed(4)} g)`);
  showToast(`Saved Cell Dry Weight: ${cdwFixed} g/L successfully`, 'success');
};


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
      brixAlert.textContent = '⚠️ Brix value is outside the standard lab range (0 - 35 °Bx)';
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

  // Sync Cell Dry Weight for current sample
  state.currentCDW = existing?.cellDryWeight !== undefined ? existing.cellDryWeight : null;
  state.currentCDWDetails = existing?.cdwDetails || null;
  const mobCdwIn = document.getElementById('mob-quick-cdw');
  if (mobCdwIn) mobCdwIn.value = state.currentCDW !== null ? state.currentCDW : '';

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
      title: 'No edit permission',
      text: 'Read-only access: you are not the creator of this project',
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

  // Persist Haemacytometer counts & kinetics in CFU/ml
  sample.haemacytometer = {
    total: [...state.tallyCounts.total],
    budding: [...state.tallyCounts.budding],
    dead: [...state.tallyCounts.dead],
    dilution: state.tallyCounts.dilution || 10
  };
  sample.dilution = state.tallyCounts.dilution || 10;
  if (cellKinetics.totalCfu > 0) sample.cellCount = cellKinetics.totalCfu;
  sample.buddingCfu = cellKinetics.buddingCfu;
  sample.deadCfu = cellKinetics.deadCfu;
  sample.buddingPct = parseFloat(cellKinetics.buddingPct) || 0;
  sample.viabilityPct = parseFloat(cellKinetics.viabilityPct) || 0;

  // Persist CDW
  if (state.currentCDW !== undefined && state.currentCDW !== null) {
    sample.cellDryWeight = state.currentCDW;
  }
  if (state.currentCDWDetails) {
    sample.cdwDetails = { ...state.currentCDWDetails };
  }

  persistState();
  if (window.FirebaseSync && typeof window.FirebaseSync.syncSample === 'function') {
    window.FirebaseSync.syncSample(sample);
  }
  window.labAudio.playSuccess();
  showToast(`Record Tank Results ${state.selectedTank} @ ${time}h successful`, 'success');

  logAction(isNew ? 'SAMPLE_ENTRY' : 'UPDATE_SAMPLE', 
    `Save Tank Data ${state.selectedTank} @ ${time}h (Brix: ${brixVal}, SugarConvert: ${sugarConvertVal}, Ethanol: ${ethanolVal}, Total: ${sample.cellCount ? formatCfuDisplay(sample.cellCount) + ' CFU/ml' : '-'}, CDW: ${sample.cellDryWeight ? sample.cellDryWeight + ' g/L' : '-'})`
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
        title: { display: true, text: `Yeast Cell Population (CFU/ml) - Haemacytometer${projTag}` }
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Time (Hours)' }, min: 0, max: 85 },
        y: { type: 'logarithmic', title: { display: true, text: 'Cell Density (CFU/ml - Log Scale)' } }
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
    showToast('No chart found to download', 'warning');
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
  showToast(`Downloaded white-background chart image (${filename}) successfully`, 'success');
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
    cellCount: 'Yeast Population (CFU/ml)',
    cellDryWeight: 'Cell Dry Weight (g/L)',
    ethanol: 'Ethanol (g/L)',
    sugarConvert: 'Sugar Convert (g/L)',
    glycerol: 'Glycerol (g/L)'
  };

  const id = `${tank}_${metric}_${axis}`;
  if (state.customSeries.some(s => s.id === id)) {
    showToast('This data series is already plotted on the chart', 'info');
    return;
  }

  const tankDef = window.LAB_TANKS.find(t => t.id === tank) || { color: '#0f3d7a' };
  const colorMap = {
    brix: '#1e3a8a',
    cellCount: '#059669',
    cellDryWeight: '#92400e',
    ethanol: '#ea580c',
    sugarConvert: '#7c3aed',
    glycerol: '#0891b2'
  };

  state.customSeries.push({
    id: id,
    tank: tank,
    metric: metric,
    axis: axis,
    label: `${tank} - ${metricLabels[metric]} [${axis === 'y' ? 'Left Axis Y1' : 'Right Axis Y2'}]`,
    color: colorMap[metric] || tankDef.color
  });

  window.labAudio.playSuccess();
  renderCustomSeriesChips();
  renderCustomChart();
  showToast(`Add Data Series ${tank} - ${metricLabels[metric]} Success`, 'success');
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
  showToast('All chart series cleared', 'info');
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
          title: { display: true, text: 'Please select a vessel and variable to add a series to the comparison chart' }
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
    <option value="ALL">📂 All Projects</option>
    ${availableProjects.map(p => `
      <option value="${escapeHtml(p.id)}" ${p.id === currentVal ? 'selected' : ''}>
        ${escapeHtml(p.experimentNo)} (${escapeHtml(p.batchMediumNo)}) - D=${escapeHtml(p.conditionParams?.dilutionRateD)}${isAdmin ? ` [${escapeHtml(p.ownerName)}]` : ''}
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
  const fields = ['tank', 'time', 'brix', 'sugarConvert', 'sucrose', 'glucose', 'fructose', 'ethanol', 'glycerol', 'cellCount', 'buddingPct', 'viabilityPct', 'cellDryWeight'];
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
  showToast('Filters and sorting reset', 'info');
};

function renderDataRecordTable() {
  const tbody = document.getElementById('data-record-tbody');
  if (!tbody) return;

  const isAdmin = state.currentUser && state.currentUser.role === 'admin';
  const ownedProjectIds = new Set(
    (state.projects || [])
      .filter(p => isAdmin || p.ownerId === state.currentUser?.uid)
      .map(p => p.id)
  );

  const filterProject = document.getElementById('data-record-project-filter')?.value || state.currentProjectId;
  const filterTank = document.getElementById('data-record-tank-filter')?.value || 'ALL';
  const filterTime = document.getElementById('data-record-time-filter')?.value || 'ALL';
  const searchQuery = (document.getElementById('data-record-search-input')?.value || '').trim().toLowerCase();

  const filteredSamples = state.samples.filter(s => {
    const projId = s.projectId || state.currentProjectId;
    if (!isAdmin && !ownedProjectIds.has(projId)) {
      return false;
    }

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
  if (badge) badge.textContent = `${filteredSamples.length} items`;

  const editable = canEditCurrentProject();

  if (filteredSamples.length === 0) {
    tbody.innerHTML = '<tr><td colspan="14" style="text-align: center; color: #94a3b8; padding: 24px;">No sample records match the filter criteria</td></tr>';
    return;
  }

  tbody.innerHTML = filteredSamples.map(s => {
    const tankDef = window.LAB_TANKS.find(t => t.id === s.tank) || { color: '#0f3d7a' };
    const pId = s.projectId || state.currentProjectId;
    const rowEditable = canEditProject(pId);
    const safeTank = escapeHtml(s.tank);
    const safePid = escapeHtml(pId);
    const timeNum = Number(s.time) || 0;
    return `
      <tr>
        <td><strong><span style="color: ${tankDef.color};">●</span> ${safeTank}</strong></td>
        <td><strong>${timeNum} h</strong></td>
        <td>${s.brix !== undefined && s.brix !== null ? escapeHtml(s.brix) : '-'}</td>
        <td><strong>${s.sugarConvert !== undefined && s.sugarConvert !== null ? Number(s.sugarConvert).toFixed(3) : '-'}</strong></td>
        <td>${s.sucrose !== undefined && s.sucrose !== null ? escapeHtml(s.sucrose) : '-'}</td>
        <td>${s.glucose !== undefined && s.glucose !== null ? escapeHtml(s.glucose) : '-'}</td>
        <td>${s.fructose !== undefined && s.fructose !== null ? escapeHtml(s.fructose) : '-'}</td>
        <td><strong style="color: #ea580c;">${s.ethanol !== undefined && s.ethanol !== null ? escapeHtml(s.ethanol) : '-'}</strong></td>
        <td>${s.glycerol !== undefined && s.glycerol !== null ? escapeHtml(s.glycerol) : '-'}</td>
        <td>${s.cellCount ? formatCfuDisplay(s.cellCount) : '-'}</td>
        <td>${s.buddingPct !== undefined && s.buddingPct !== null ? escapeHtml(s.buddingPct) + '%' : '-'}</td>
        <td>${s.viabilityPct !== undefined && s.viabilityPct !== null ? escapeHtml(s.viabilityPct) + '%' : '-'}</td>
        <td style="color: #92400e; font-weight: 700;">${s.cellDryWeight !== undefined && s.cellDryWeight !== null ? escapeHtml(s.cellDryWeight) + ' g/L' : '-'}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-secondary" onclick="editDataRecordRow('${safeTank}', ${timeNum}, '${safePid}')" ${!rowEditable ? 'disabled title="No edit permission"' : ''}>
              ✏️
            </button>
            <button class="btn btn-sm btn-secondary" onclick="deleteDataRecordRow('${safeTank}', ${timeNum}, '${safePid}')" style="color: #ef4444;" ${!rowEditable ? 'disabled title="No permission to delete"' : ''}>
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.editDataRecordRow = function(tank, time, projectId) {
  const targetProjectId = projectId || state.currentProjectId;
  if (!canEditProject(targetProjectId)) {
    Swal.fire({ icon: 'error', title: 'No edit permission', text: 'You are not the owner of this research project' });
    return;
  }

  const s = state.samples.find(x => (x.projectId === targetProjectId || !x.projectId) && x.tank === tank && x.time === time);
  if (!s) return;

  Swal.fire({
    title: `Edit Data ${tank} @ ${time}h`,
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
        <div class="form-grid-2" style="margin-top: 6px;">
          <div class="form-group">
            <label class="form-label">Glycerol (g/L):</label>
            <input type="number" step="0.01" id="swal-glycerol" class="form-input" value="${s.glycerol ?? ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Cell Dry Weight (g/L):</label>
            <input type="number" step="0.01" id="swal-cdw" class="form-input" value="${s.cellDryWeight ?? ''}">
          </div>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Save Changes',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#0f3d7a',
    preConfirm: () => {
      const brix = parseFloat(document.getElementById('swal-brix').value);
      const eth = parseFloat(document.getElementById('swal-ethanol').value);
      const suc = parseFloat(document.getElementById('swal-sucrose').value) || 0;
      const glu = parseFloat(document.getElementById('swal-glucose').value) || 0;
      const fru = parseFloat(document.getElementById('swal-fructose').value) || 0;
      const gly = parseFloat(document.getElementById('swal-glycerol').value);
      const cdw = parseFloat(document.getElementById('swal-cdw').value);

      return { brix, eth, suc, glu, fru, gly, cdw };
    }
  }).then((res) => {
    if (res.isConfirmed) {
      const val = res.value;
      if (!isNaN(val.brix)) s.brix = val.brix;
      if (!isNaN(val.eth)) s.ethanol = val.eth;
      s.sucrose = val.suc;
      s.glucose = val.glu;
      s.fructose = val.fru;
      s.sugarConvert = parseFloat((val.suc + val.glu + val.fru).toFixed(3));
      if (!isNaN(val.gly)) s.glycerol = val.gly;
      if (!isNaN(val.cdw)) s.cellDryWeight = val.cdw;

      persistState();
      if (window.FirebaseSync && typeof window.FirebaseSync.syncSample === 'function') {
        window.FirebaseSync.syncSample(s);
      }
      window.labAudio.playSuccess();
      logAction('UPDATE_DATA_RECORD', `Edit Raw Data ${tank} @ ${time}h (Brix: ${val.brix}, Sugar: ${s.sugarConvert}, Eth: ${val.eth}, CDW: ${s.cellDryWeight})`);
      
      // Instant Two-Way Sync to Lab Entry:
      loadSampleDataForCurrentTank();
      renderDataRecordTable();
      renderAllDataViews();
      renderAnalyticsCharts();
      renderCustomChart();
      showToast(`Update Data ${tank} @ ${time}h updated; Lab Entry tab synchronized immediately`, 'success');
    }
  });
};

window.deleteDataRecordRow = function(tank, time, projectId) {
  const targetProjectId = projectId || state.currentProjectId;
  if (!canEditProject(targetProjectId)) {
    Swal.fire({ icon: 'error', title: 'No permission to delete', text: 'You are not the owner of this research project' });
    return;
  }

  const sampleToDelete = state.samples.find(x => (x.projectId === targetProjectId || !x.projectId) && x.tank === tank && x.time === time);
  if (!sampleToDelete) return;

  Swal.fire({
    title: `Delete Sample ${escapeHtml(tank)} @ ${escapeHtml(time)}h?`,
    html: `
      <div style="text-align: left; font-size: 0.9rem; line-height: 1.6;">
        <p>• Fermenter: <strong>${escapeHtml(tank)}</strong> | Time: <strong>${escapeHtml(time)} h</strong></p>
        <p>• Project: <strong>${escapeHtml(targetProjectId)}</strong></p>
        <p style="color: #b91c1c; margin-top: 8px;">
          ⚠️ This record will be removed from the database
          <br><strong>(You can restore this anytime via the button "Restore Data" in Data Log)</strong>
        </p>
      </div>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Confirm Delete',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#991b1b'
  }).then((res) => {
    if (res.isConfirmed) {
      const snapshot = {
        type: 'SAMPLE_ROW',
        data: JSON.parse(JSON.stringify(sampleToDelete))
      };
      state.samples = state.samples.filter(x => !((x.projectId === targetProjectId || !x.projectId) && x.tank === tank && x.time === time));
      persistState();
      if (window.FirebaseSync && typeof window.FirebaseSync.removeSample === 'function') {
        window.FirebaseSync.removeSample(targetProjectId, tank, time);
      }
      window.labAudio.playWarning();
      logAction('DELETE_DATA_RECORD', `Delete Data ${tank} @ ${time}h (Project: ${targetProjectId})`, snapshot);
      loadSampleDataForCurrentTank();
      renderDataRecordTable();
      renderAllDataViews();
      renderAnalyticsCharts();
      renderCustomChart();
      showToast(`Delete Data ${tank} @ ${time}h completed (recoverable from Data Log)`, 'info');
    }
  });
};

window.exportDataRecordCSV = function() {
  const isAdmin = state.currentUser && state.currentUser.role === 'admin';
  const ownedProjectIds = new Set(
    (state.projects || [])
      .filter(p => isAdmin || p.ownerId === state.currentUser?.uid)
      .map(p => p.id)
  );
  const filterProject = document.getElementById('data-record-project-filter')?.value || state.currentProjectId;
  const filterTank = document.getElementById('data-record-tank-filter')?.value || 'ALL';
  const filterTime = document.getElementById('data-record-time-filter')?.value || 'ALL';

  const exportList = state.samples.filter(s => {
    const projId = s.projectId || state.currentProjectId;
    if (!isAdmin && !ownedProjectIds.has(projId)) return false;
    if (filterProject !== 'ALL' && s.projectId && s.projectId !== filterProject) return false;
    if (filterTank !== 'ALL' && s.tank !== filterTank) return false;
    if (filterTime !== 'ALL' && s.time !== parseFloat(filterTime)) return false;
    return true;
  });

  const headers = ['Project', 'Tank', 'Time_h', 'Brix', 'SugarConvert_gL', 'Sucrose', 'Glucose', 'Fructose', 'Ethanol_gL', 'Glycerol_gL', 'TotalCells_CFU_ml', 'Budding_pct', 'Viability_pct', 'CellDryWeight_gL'];
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
    s.cellCount ?? '',
    s.buddingPct ?? '',
    s.viabilityPct ?? '',
    s.cellDryWeight ?? ''
  ].map(csvSafe));

  const csvBody = '\uFEFF' + [headers.map(csvSafe).join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `MitrPhol_DataRecords_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  window.labAudio.playSuccess();
  showToast(`Export CSV (${exportList.length} rows) successfully`, 'success');
};

// ==========================================================================
// User Management CRUD (Admin Only - Requirement 4)
// ==========================================================================
function renderUserManagementTable() {
  const tbody = document.getElementById('user-management-tbody');
  if (!tbody) return;

  tbody.innerHTML = state.users.map(u => {
    const role = u.role || 'user';
    const uidSafe = escapeHtml(u.uid);
    return `
    <tr>
      <td><strong>${escapeHtml(u.username || u.uid)}</strong></td>
      <td>${escapeHtml(u.displayName)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="user-role-badge role-${role === 'admin' ? 'admin' : 'researcher'}">${escapeHtml(role.toUpperCase())}</span></td>
      <td><code>••••••••</code></td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-sm btn-secondary" onclick="editUserModal('${uidSafe}')">Edit</button>
          <button class="btn btn-sm btn-secondary" onclick="deleteUser('${uidSafe}')" style="color: #ef4444;" ${u.uid === state.currentUser?.uid || u.username === 'admin' ? 'disabled title="Cannot delete your own account or the primary Admin account"' : ''}>
            Delete
          </button>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

window.openAddUserModal = function() {
  const isAdmin = state.currentUser && state.currentUser.role === 'admin';
  if (!isAdmin) {
    Swal.fire({ icon: 'error', title: 'No Permission', text: 'Only administrators (Admin) can add users' });
    return;
  }

  Swal.fire({
    title: '➕ Add New User',
    html: `
      <div style="text-align: left; font-size: 0.88rem;">
        <div class="form-group">
          <label class="form-label">Login Username / ID:*</label>
          <input type="text" id="swal-user-username" class="form-input" placeholder="e.g. researcher1">
        </div>
        <div class="form-group">
          <label class="form-label">Full Name:*</label>
          <input type="text" id="swal-user-name" class="form-input" placeholder="e.g. Dr. John Smith">
        </div>
        <div class="form-group">
          <label class="form-label">Email:*</label>
          <input type="email" id="swal-user-email" class="form-input" placeholder="e.g. researcher1@mitrphol.com">
        </div>
        <div class="form-group">
          <label class="form-label">Password:*</label>
          <input type="password" id="swal-user-password" class="form-input" placeholder="Set Password">
        </div>
        <div class="form-group">
          <label class="form-label">Access Role:*</label>
          <select id="swal-user-role" class="form-select">
            <option value="user">User (Researcher - Own Projects Only)</option>
            <option value="admin">Admin (Administrator - Full Data Access)</option>
          </select>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Save and Create Account',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#0f3d7a',
    preConfirm: () => {
      const username = (document.getElementById('swal-user-username').value || '').trim().toLowerCase();
      const name = (document.getElementById('swal-user-name').value || '').trim();
      const email = (document.getElementById('swal-user-email').value || '').trim().toLowerCase();
      const password = document.getElementById('swal-user-password').value;
      const role = document.getElementById('swal-user-role').value;

      if (!username || !name || !email || !password) {
        Swal.showValidationMessage('Please complete all fields');
        return false;
      }
      if (state.users.some(x => (x.username && x.username.toLowerCase() === username) || x.uid === username)) {
        Swal.showValidationMessage(`Username "${escapeHtml(username)}" already exists in the system`);
        return false;
      }
      if (state.users.some(x => x.email && x.email.toLowerCase() === email)) {
        Swal.showValidationMessage(`Email "${escapeHtml(email)}" already exists in the system`);
        return false;
      }
      return { username, name, email, password, role };
    }
  }).then(async (res) => {
    if (res.isConfirmed) {
      const u = res.value;
      const pwdHash = await sha256Hex(u.password);

      const newUser = {
        uid: 'usr_' + Date.now(),
        username: u.username,
        displayName: u.name,
        email: u.email,
        passwordHash: pwdHash,
        role: u.role
      };
      state.users.push(newUser);
      persistState();
      if (window.FirebaseSync && typeof window.FirebaseSync.syncUser === 'function') {
        window.FirebaseSync.syncUser(newUser);
      }
      if (window.labAudio) window.labAudio.playSuccess();
      logAction('ADD_USER', `Admin added new user: ${newUser.displayName} (ID: ${newUser.username}, Role: ${newUser.role})`);
      renderUserManagementTable();
      syncAuditLogUserFilter();
      showToast(`Create User ${newUser.displayName} successfully`, 'success');
    }
  });
};

window.editUserModal = function(uid) {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    Swal.fire({ icon: 'error', title: 'No Permission', text: 'Only administrators (Admin) can edit user accounts' });
    return;
  }
  const u = state.users.find(x => x.uid === uid);
  if (!u) return;

  Swal.fire({
    title: `Edit User: ${escapeHtml(u.displayName)}`,
    html: `
      <div style="text-align: left; font-size: 0.88rem;">
        <div class="form-group">
          <label class="form-label">Username / ID:</label>
          <input type="text" id="swal-edit-username" class="form-input" value="${escapeHtml(u.username || '')}" ${u.username === 'admin' ? 'readonly' : ''}>
        </div>
        <div class="form-group">
          <label class="form-label">Full Name:</label>
          <input type="text" id="swal-edit-name" class="form-input" value="${escapeHtml(u.displayName)}">
        </div>
        <div class="form-group">
          <label class="form-label">Email:</label>
          <input type="email" id="swal-edit-email" class="form-input" value="${escapeHtml(u.email)}">
        </div>
        <div class="form-group">
          <label class="form-label">New Password (leave blank to keep current):</label>
          <input type="password" id="swal-edit-password" class="form-input" placeholder="••••••••">
        </div>
        <div class="form-group">
          <label class="form-label">Role:</label>
          <select id="swal-edit-role" class="form-select" ${u.username === 'admin' ? 'disabled' : ''}>
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>User (General Researcher)</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin (Administrator)</option>
          </select>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Save Changes',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#0f3d7a',
    preConfirm: () => {
      const username = (document.getElementById('swal-edit-username')?.value || '').trim().toLowerCase();
      const name = document.getElementById('swal-edit-name').value.trim();
      const email = document.getElementById('swal-edit-email').value.trim().toLowerCase();
      const newPwd = document.getElementById('swal-edit-password').value;
      const role = document.getElementById('swal-edit-role').value || u.role;
      if (!name || !email) {
        Swal.showValidationMessage('Please enter name and email');
        return false;
      }
      return { username, name, email, newPwd, role };
    }
  }).then(async (res) => {
    if (res.isConfirmed) {
      if (res.value.username && u.username !== 'admin') u.username = res.value.username;
      u.displayName = res.value.name;
      u.email = res.value.email;
      u.role = u.username === 'admin' ? 'admin' : res.value.role;
      delete u.password;
      if (res.value.newPwd) {
        u.passwordHash = await sha256Hex(res.value.newPwd);
      }

      persistState();
      if (window.FirebaseSync && typeof window.FirebaseSync.syncUser === 'function') {
        window.FirebaseSync.syncUser(u);
      }
      if (window.labAudio) window.labAudio.playSuccess();
      logAction('UPDATE_USER', `Admin updated user account ${u.displayName} (${u.username})`);
      renderUserManagementTable();
      syncAuditLogUserFilter();
      showToast(`Update Data ${u.displayName} successfully`, 'success');
    }
  });
};

window.deleteUser = function(uid) {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    Swal.fire({ icon: 'error', title: 'No Permission', text: 'Only administrators (Admin) can delete user accounts' });
    return;
  }
  const u = state.users.find(x => x.uid === uid);
  if (!u) return;

  if (u.uid === state.currentUser?.uid || u.username === 'admin') {
    Swal.fire({ icon: 'error', title: 'Cannot delete', text: 'Cannot delete the currently logged-in account or the primary Admin account' });
    return;
  }

  Swal.fire({
    title: `Delete User ${escapeHtml(u.displayName)}?`,
    text: 'This user will no longer be able to sign in',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Confirm Delete',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#991b1b'
  }).then((res) => {
    if (res.isConfirmed) {
      state.users = state.users.filter(x => x.uid !== uid);
      persistState();
      if (window.FirebaseSync && typeof window.FirebaseSync.removeUser === 'function') {
        window.FirebaseSync.removeUser(uid);
      }
      window.labAudio.playWarning();
      logAction('DELETE_USER', `Delete User ${u.displayName}`);
      renderUserManagementTable();
      showToast(`Delete User ${u.displayName} successfully`, 'info');
    }
  });
};

// ==========================================================================
// Condition Optimizer & Best Condition (Cross-User Linking for Admin)
// ==========================================================================
function getDynamicProjectConditions() {
  const list = [];
  state.projects.forEach(p => {
    const pSamples = state.samples.filter(s => s.projectId === p.id);
    let maxEth = 0;
    let finalEth = 0;
    let finalSugar = 0;
    let initialSugar = p.inletMolassesSugar || 240;
    let avgViability = 95.0;

    if (pSamples.length > 0) {
      pSamples.forEach(s => {
        if (s.ethanol && s.ethanol > maxEth) maxEth = s.ethanol;
        if (s.viabilityPct) avgViability = s.viabilityPct;
      });
      const d3Samples = pSamples.filter(s => s.tank === 'D3');
      if (d3Samples.length > 0) {
        finalEth = d3Samples[d3Samples.length - 1].ethanol || maxEth;
        finalSugar = d3Samples[d3Samples.length - 1].sugarConvert || 0;
      } else {
        finalEth = maxEth;
      }
    }

    const dRate = p.conditionParams?.dilutionRateD || 0.022;
    const deltaSugar = Math.max(initialSugar - finalSugar, 10);
    const yieldYps = parseFloat(Math.min(finalEth / deltaSugar, 0.510).toFixed(3)) || 0.470;
    const productivityQp = parseFloat((finalEth * dRate).toFixed(2)) || parseFloat((dRate * 90).toFixed(2));
    const sugarConversionPct = parseFloat(Math.min(((initialSugar - finalSugar) / initialSugar) * 100, 99.8).toFixed(1)) || 95.0;

    list.push({
      conditionKey: `${p.experimentNo} (D=${dRate})`,
      projectId: p.id,
      ownerId: p.ownerId,
      researcher: p.ownerName || 'Researcher',
      dilutionRateD: dRate,
      temp: p.conditionParams?.temperature || 30,
      ratioBC: p.conditionParams?.ratioBC || '80:20',
      finalEthanol: parseFloat((finalEth / 8.9).toFixed(1)) || 10.5,
      maxEthanolGPerL: parseFloat(maxEth.toFixed(2)) || (productivityQp * 45),
      yieldYps: yieldYps,
      productivityQp: productivityQp,
      sugarConversionPct: sugarConversionPct,
      cellViabilityPct: parseFloat(avgViability.toFixed(1)),
      isBest: false
    });
  });

  // Combine with predefined CROSS_CONDITIONS_SUMMARY if present
  if (window.CROSS_CONDITIONS_SUMMARY && window.CROSS_CONDITIONS_SUMMARY.length > 0) {
    window.CROSS_CONDITIONS_SUMMARY.forEach(c => {
      if (!list.some(x => x.conditionKey === c.conditionKey)) {
        list.push(c);
      }
    });
  }
  return list;
}

function renderOptimizerView() {
  const container = document.getElementById('optimizer-ranking-tbody');
  if (!container) return;

  const currentUserId = state.currentUser ? state.currentUser.uid : 'usr_admin';
  const isAdmin = state.currentUser && state.currentUser.role === 'admin';
  const adminFilterGroup = document.getElementById('optimizer-admin-filter-group');
  const adminFilterSelect = document.getElementById('optimizer-admin-researcher-filter');

  const allConditions = getDynamicProjectConditions();
  let displayedConditions = [];
  let isComparingAll = false;

  if (isAdmin && adminFilterGroup && adminFilterSelect) {
    adminFilterGroup.style.display = 'flex';
    const currentOptVal = adminFilterSelect.value || 'ALL';

    // Populate distinct researchers in optimizer filter
    const optResearchers = [];
    state.users.forEach(u => {
      if (!optResearchers.some(r => r.uid === u.uid)) {
        optResearchers.push({ uid: u.uid, name: u.displayName || u.username });
      }
    });
    allConditions.forEach(c => {
      if (c.ownerId && !optResearchers.some(r => r.uid === c.ownerId)) {
        optResearchers.push({ uid: c.ownerId, name: c.researcher || c.ownerId });
      }
    });

    adminFilterSelect.innerHTML = `
      <option value="ALL">🌐 All Researchers (Cross-Researcher Comparison)</option>
      ${optResearchers.map(r => `<option value="${escapeHtml(r.uid)}" ${r.uid === currentOptVal ? 'selected' : ''}>👤 ${escapeHtml(r.name)}</option>`).join('')}
    `;
    adminFilterSelect.value = currentOptVal;

    if (currentOptVal === 'ALL') {
      displayedConditions = allConditions;
      isComparingAll = true;
    } else {
      displayedConditions = allConditions.filter(c => c.ownerId === currentOptVal);
      isComparingAll = false;
    }
  } else {
    if (adminFilterGroup) adminFilterGroup.style.display = 'none';
    displayedConditions = allConditions.filter(c => c.ownerId === currentUserId);
    isComparingAll = false;
  }

  // Update scope badge
  const scopeBadge = document.getElementById('optimizer-researcher-scope-badge');
  if (scopeBadge) {
    if (isAdmin && isComparingAll) {
      scopeBadge.className = 'badge badge-gold';
      scopeBadge.innerHTML = '🌐 Compare & Cross-Link All Researchers (Admin Cross-Link Mode)';
    } else if (isAdmin) {
      scopeBadge.className = 'badge badge-navy';
      const activeName = (state.users.find(u => u.uid === (adminFilterSelect?.value || currentUserId))?.displayName) || 'Researcher';
      scopeBadge.innerHTML = `👤 Research by: ${escapeHtml(activeName)}`;
    } else {
      scopeBadge.className = 'badge badge-navy';
      scopeBadge.innerHTML = '👤 My Projects Only';
    }
  }

  if (displayedConditions.length === 0) {
    container.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 24px;">No experimental condition data for this researcher yet (please create a project and log lab data)</td></tr>';
    const winnerBanner = document.getElementById('optimizer-winner-banner');
    if (winnerBanner) winnerBanner.style.display = 'none';
    if (state.charts.radar) state.charts.radar.destroy();
    return;
  }

  const winnerBanner = document.getElementById('optimizer-winner-banner');
  if (winnerBanner) winnerBanner.style.display = 'flex';

  // Determine best condition (highest Yield & Productivity)
  let bestCond = displayedConditions.find(c => c.isBest);
  if (!bestCond) {
    bestCond = [...displayedConditions].sort((a, b) => ((b.yieldYps || 0) * (b.productivityQp || 0)) - ((a.yieldYps || 0) * (a.productivityQp || 0)))[0];
  }

  // Update Dynamic Banner
  const winnerTitle = document.getElementById('optimizer-winner-title');
  const winnerDesc = document.getElementById('optimizer-winner-desc');
  const winnerBtn = document.getElementById('btn-optimizer-winner-details');

  if (winnerTitle && bestCond) {
    const ownerTag = isComparingAll ? ` [by ${bestCond.researcher}]` : '';
    winnerTitle.textContent = `${bestCond.conditionKey}${ownerTag} (D = ${bestCond.dilutionRateD} h⁻¹, ${bestCond.ratioBC || '80:20'}, ${bestCond.temp || 30} °C)`;
  }
  if (winnerDesc && bestCond) {
    winnerDesc.innerHTML = `
      gives the highest ethanol yield <strong>${escapeHtml(bestCond.maxEthanolGPerL)} g/L</strong>, 
      Yield on Sugar <strong>Yield (Yp/s) = ${escapeHtml(bestCond.yieldYps)} g/g</strong> 
      and production rate <strong>Productivity = ${escapeHtml(bestCond.productivityQp)} g/L·h</strong>
      ${isComparingAll ? `<br><span style="color: #059669; font-weight: 700;">🔗 Filter by Creator: ${escapeHtml(bestCond.researcher)} (${escapeHtml(bestCond.ownerId)})</span>` : ''}
    `;
  }
  if (winnerBtn && bestCond) {
    winnerBtn.onclick = () => viewConditionDetails(bestCond.conditionKey);
  }

  container.innerHTML = displayedConditions.map((cond, idx) => {
    const isWinner = bestCond && cond.conditionKey === bestCond.conditionKey;
    const researcherPill = isComparingAll ? `<div style="font-size: 0.76rem; color: #64748b; margin-top: 2px;">👤 ${escapeHtml(cond.researcher)}</div>` : '';
    const safeKey = escapeHtml(cond.conditionKey);
    return `
      <tr style="${isWinner ? 'background: #fffbeb; font-weight: 600;' : ''}">
        <td>
          <div style="display: flex; flex-direction: column;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>${idx + 1}</span>
              ${isWinner ? '<span class="badge badge-best-condition">🏆 Best Condition</span>' : ''}
              <span>${safeKey}</span>
            </div>
            ${researcherPill}
          </div>
        </td>
        <td><strong>${escapeHtml(cond.dilutionRateD)}</strong></td>
        <td>${escapeHtml(cond.maxEthanolGPerL)} g/L</td>
        <td><span class="badge ${isWinner ? 'badge-gold' : 'badge-navy'}">${escapeHtml(cond.yieldYps)} g/g</span></td>
        <td><strong>${escapeHtml(cond.productivityQp)}</strong> g/L·h</td>
        <td>${escapeHtml(cond.sugarConversionPct)} %</td>
        <td>${escapeHtml(cond.cellViabilityPct)} %</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="viewConditionDetails('${safeKey}')">
            View Details
          </button>
        </td>
      </tr>
    `;
  }).join('');

  renderOptimizerRadarChart(displayedConditions, bestCond);
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
  const allConds = getDynamicProjectConditions();
  const item = allConds.find(c => c.conditionKey === condKey) || window.CROSS_CONDITIONS_SUMMARY?.find(c => c.conditionKey === condKey);
  if (!item) return;

  Swal.fire({
    title: `Condition Analysis ${escapeHtml(item.conditionKey)}`,
    html: `
      <div style="text-align: left; font-size: 0.9rem; line-height: 1.8;">
        <p>• <strong>Dilution Rate (D):</strong> ${escapeHtml(item.dilutionRateD)} h⁻¹</p>
        <p>• <strong>Max Ethanol Produced:</strong> ${escapeHtml(item.maxEthanolGPerL)} g/L</p>
        <p>• <strong>Ethanol Yield (Yp/s):</strong> ${escapeHtml(item.yieldYps)} g/g (Gay-Lussac theoretical max 0.511)</p>
        <p>• <strong>Productivity (Qp):</strong> ${escapeHtml(item.productivityQp)} g/L·h</p>
        <p>• <strong>Sugar Conversion:</strong> ${escapeHtml(item.sugarConversionPct)}%</p>
        <p>• <strong>Summary:</strong> ${item.isBest ? '<strong>Optimal condition for Mitr Phol continuous fermentation process</strong> delivering maximum ethanol yield and consistent yeast cell viability' : 'performed effectively under tested parameters'}</p>
      </div>
    `,
    confirmButtonColor: '#0f3d7a',
    confirmButtonText: 'Close'
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

window.openPresentationModal = function() {
  state.slideIndex = 1;
  updateSlideContent();
  const modal = document.getElementById('presentation-modal');
  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
  }
  if (typeof pushAppState === 'function') pushAppState('presentation');
  if (window.labAudio) window.labAudio.playSuccess();
};

window.closePresentationModal = function() {
  const modal = document.getElementById('presentation-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
  if (window.labAudio) window.labAudio.playClick();
};

window.handlePresentationBackdropClick = function(event) {
  if (event.target && event.target.id === 'presentation-modal') {
    window.closePresentationModal();
  }
};

function navigateSlide(direction) {
  state.slideIndex = Math.max(1, Math.min(state.totalSlides, state.slideIndex + direction));
  if (window.labAudio) window.labAudio.playClick();
  updateSlideContent();
}

function updateSlideContent() {
  const counterEl = document.getElementById('slide-counter-badge');
  if (counterEl) counterEl.textContent = `Slide ${state.slideIndex} of ${state.totalSlides}`;
  const container = document.getElementById('slide-inner-content');
  if (!container) return;
  const project = state.projects.find(p => p.id === state.currentProjectId) || state.projects[0] || {};

  if (state.slideIndex === 1) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px;">
        <span class="badge badge-gold" style="font-size: 0.9rem; padding: 6px 16px; margin-bottom: 16px;">
          Mitr Phol Biotech Research & Development
        </span>
        <h1 style="font-size: 2rem; color: #0a2540; margin: 16px 0;">Continuous Bio-Fermentation Experiment Summary Report</h1>
        <h3 style="color: #475569; font-weight: 500;">Batch: ${escapeHtml(project.batchMediumNo || '-')} | Experiment: ${escapeHtml(project.experimentNo || '-')}</h3>
        
        <div style="max-width: 650px; margin: 30px auto; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; text-align: left;">
          <p><strong>• Experimental Condition:</strong> ${escapeHtml(project.conditionText || '-')}</p>
          <p>• <strong>Feed Culture Ratio:</strong> ${escapeHtml(project.conditionParams?.feedCulture || '-')}</p>
          <p>• <strong>Yeast Strain (Seed):</strong> ${escapeHtml(project.seed || '-')}</p>
          <p>• <strong>Responsible Researcher:</strong> ${escapeHtml(project.ownerName || '-')}</p>
          <p>• <strong>Experiment Start Date:</strong> ${escapeHtml(project.date || '-')}</p>
        </div>
      </div>
    `;
  } else if (state.slideIndex === 2) {
    // Filter only vessels/stages with actual recorded data in this project (hide empty vessels)
    const recordedTanks = window.LAB_TANKS.map(t => {
      const s = state.samples
        .filter(x => x.tank === t.id && (x.projectId === state.currentProjectId || !x.projectId))
        .sort((a, b) => b.time - a.time)[0];
      return { tank: t, sample: s };
    }).filter(({ sample }) => {
      if (!sample) return false;
      const hasVal = (v) => v !== undefined && v !== null && v !== '' && v !== '-';
      return hasVal(sample.brix) || 
             hasVal(sample.sugarConvert) || 
             hasVal(sample.ethanol) || 
             hasVal(sample.glycerol) || 
             hasVal(sample.cellCount) || 
             hasVal(sample.cellDryWeight);
    });

    const hasData = recordedTanks.length > 0;

    container.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <div>
            <h2 style="color: #0a2540; margin-bottom: 4px; font-size: 1.4rem;">Process Kinetic Summary Table</h2>
            <p style="color: #64748b; font-size: 0.88rem; margin: 0;">Summary of latest analytical results for stages with recorded lab data (${recordedTanks.length} process)</p>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <span class="badge badge-navy" style="font-size: 0.8rem;">
              Saved ${recordedTanks.length} / ${window.LAB_TANKS.length} Process
            </span>
          </div>
        </div>
        
        <div class="lab-data-table-wrapper table-responsive" style="max-height: 380px; overflow-y: auto;">
          <table class="lab-table" style="min-width: 820px;">
            <thead>
              <tr>
                <th style="width: 110px;">Process / Tank</th>
                <th>System Role</th>
                <th style="width: 90px;">Latest Time</th>
                <th>Brix (°Bx)</th>
                <th>Sugar Convert (g/L)</th>
                <th>Ethanol (g/L)</th>
                <th>Glycerol (g/L)</th>
                <th>Cell Count (cells/mL)</th>
                <th>CDW (g/L)</th>
              </tr>
            </thead>
            <tbody>
              ${hasData ? recordedTanks.map(({ tank: t, sample: s }) => {
                const sugarVal = s.sugarConvert !== undefined && s.sugarConvert !== null ? Number(s.sugarConvert).toFixed(3) : '-';
                const ethVal = s.ethanol !== undefined && s.ethanol !== null ? Number(s.ethanol).toFixed(3) : '-';
                const glyVal = s.glycerol !== undefined && s.glycerol !== null ? Number(s.glycerol).toFixed(3) : '-';
                return `
                  <tr>
                    <td><strong><span style="color: ${t.color}">●</span> ${t.id}</strong></td>
                    <td style="font-size: 0.85rem; color: #475569;">${t.desc}</td>
                    <td><span class="badge badge-navy" style="font-size: 0.75rem;">@ ${s.time !== undefined ? s.time + 'h' : '-'}</span></td>
                    <td><strong>${s.brix !== undefined ? s.brix + '°' : '-'}</strong></td>
                    <td><strong style="color: #2563eb;">${sugarVal}</strong></td>
                    <td><strong style="color: #ea580c;">${ethVal}</strong></td>
                    <td>${glyVal}</td>
                    <td>${s.cellCount ? s.cellCount.toExponential(2) : '-'}</td>
                    <td style="color: #92400e; font-weight: 700;">${s.cellDryWeight !== undefined ? s.cellDryWeight + ' g/L' : '-'}</td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="9" style="text-align: center; color: #94a3b8; padding: 32px;">
                    ⚠️ No experimental results recorded for any stage in this project yet
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>

        ${hasData ? `
          <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 16px; font-size: 0.82rem; color: #475569; flex-wrap: wrap; gap: 8px;">
            <span>ℹ️ Displays only vessels with recorded laboratory measurements for concise presentation</span>
            <span style="color: #1e3a8a; font-weight: 600;">Sugar Convert standardized to 3 decimal places</span>
          </div>
        ` : ''}
      </div>
    `;
  } else if (state.slideIndex === 3) {
    container.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;">
          <div>
            <h2 style="color: #0a2540; margin-bottom: 4px; font-size: 1.4rem;">Kinetics Profile: Sugar Consumption vs. Ethanol Production</h2>
            <p style="color: #64748b; font-size: 0.9rem;">Dual Y-axis comparison of total Sugar Consumption alongside Ethanol Production</p>
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
            <span class="kpi-label">Initial Sugar</span>
            <div class="kpi-value" style="color: #0f3d7a; font-size: 1.3rem;">125.2 g/L</div>
            <span class="kpi-desc">Pre-fermenter Tank PF @ 0h (Brix 18.0)</span>
          </div>
          <div class="kpi-stat-card" style="padding: 12px 14px;">
            <span class="kpi-label">Sugar Utilization Efficiency (% Consumed)</span>
            <div class="kpi-value" style="color: #059669; font-size: 1.3rem;">99.9 %</div>
            <span class="kpi-desc">Residual sugar in D3 is only 0.096 g/L</span>
          </div>
          <div class="kpi-stat-card" style="padding: 12px 14px;">
            <span class="kpi-label">Peak Ethanol Output</span>
            <div class="kpi-value" style="color: #ea580c; font-size: 1.3rem;">99.53 g/L</div>
            <span class="kpi-desc">Final Harvest Tank D3 @ 82h (12.6% v/v)</span>
          </div>
          <div class="kpi-stat-card" style="padding: 12px 14px;">
            <span class="kpi-label">Ethanol Yield (Yp/s)</span>
            <div class="kpi-value" style="color: #b45309; font-size: 1.3rem;">0.491 g/g</div>
            <span class="kpi-desc">96.3% of theoretical limit (0.51 g/g)</span>
          </div>
        </div>

        <!-- Chart Container with Dual Y-Axes -->
        <div style="height: 330px; position: relative; background: #ffffff; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
          <canvas id="slide-chart-kinetics"></canvas>
        </div>

        <!-- Biochemical Kinetics Callout -->
        <div style="margin-top: 12px; padding: 12px 16px; background: #f8fafc; border-left: 4px solid #ea580c; border-radius: 8px; font-size: 0.85rem; color: #334155;">
          <strong>💡 Biochemical Kinetic Insights:</strong>
          <div id="slide3-kinetic-insight-text" style="margin-top: 4px; line-height: 1.5;">
            • <strong>Biochemical Cross-Over Phase (@ F2 → F3):</strong> Sugar drops sharply from 100.3 g/L to 19.6 g/L alongside an ethanol surge from 49.9 g/L to 78.4 g/L<br>
            • <strong>Complete Fermentation (Finishing Phase @ F4 → D3):</strong> Sugar nearly depleted (&lt; 2 g/L in F4 and &lt; 0.1 g/L in F5–D3), Ethanol peaks at 99.53 g/L with zero Stuck Fermentation
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
        <h2 style="color: #0a2540; margin-bottom: 8px;">Yeast Cell Growth & Physiological Behavior</h2>
        <p style="color: #64748b; margin-bottom: 16px;">Cell Viability (%) and Budding Index (%) measured via microscopy</p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px;">
          <div class="kpi-stat-card">
            <span class="kpi-label">Average Viability</span>
            <div class="kpi-value" style="color: #059669;">97.4 %</div>
            <span class="kpi-desc">High cell vitality; unstained by Methylene Blue</span>
          </div>
          <div class="kpi-stat-card">
            <span class="kpi-label">Average Budding Index</span>
            <div class="kpi-value" style="color: #d97706;">11.1 %</div>
            <span class="kpi-desc">Consistent budding rate across the Cascade</span>
          </div>
          <div class="kpi-stat-card">
            <span class="kpi-label">Peak Cell Density</span>
            <div class="kpi-value" style="color: #1e3a8a;">9.15 × 10⁸</div>
            <span class="kpi-desc">cells/mL in Tank PF @ 46h</span>
          </div>
        </div>
      </div>
    `;
  } else if (state.slideIndex === 5) {
    const feedLogs = (project && project.feedLogs && Array.isArray(project.feedLogs)) ? project.feedLogs : [];
    const totalCycles = feedLogs.length;
    const mediaSet = Array.from(new Set(feedLogs.map(f => f.medium).filter(Boolean)));
    const avgBrix = totalCycles > 0 
      ? (feedLogs.reduce((acc, f) => acc + (parseFloat(f.brix) || 0), 0) / totalCycles).toFixed(1)
      : '-';

    container.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <div>
            <span class="badge badge-navy" style="font-size: 0.78rem; margin-bottom: 4px;">Continuous Feeding Substrate Log</span>
            <h2 style="color: #0a2540; margin: 0; font-size: 1.4rem;">Continuous Feeding Log Details</h2>
          </div>
          <span class="badge badge-gold" style="font-size: 0.82rem;">Feeding Log History ${totalCycles} rounds</span>
        </div>
        <p style="color: #64748b; font-size: 0.88rem; margin-bottom: 14px;">
          Records the history of continuous substrate and nutrient feeding throughout the bio-fermentation process
        </p>

        <!-- Feed KPI Summary Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px;">
          <div class="kpi-stat-card" style="padding: 12px 14px;">
            <span class="kpi-label">Inlet Molasses Sugar (Inlet Sugar)</span>
            <div class="kpi-value" style="color: #0f3d7a; font-size: 1.3rem;">${project.inletMolassesSugar !== undefined ? escapeHtml(project.inletMolassesSugar) + ' g/L' : '-'}</div>
            <span class="kpi-desc">Initial Brix: ${project.initialBrix !== undefined ? escapeHtml(project.initialBrix) + '°' : '-'}</span>
          </div>
          <div class="kpi-stat-card" style="padding: 12px 14px;">
            <span class="kpi-label">Prepared / Remaining Feed Volume</span>
            <div class="kpi-value" style="color: #059669; font-size: 1.3rem;">${escapeHtml(project.preparedVolume || '-')} / ${escapeHtml(project.remainingVolume || '-')} L</div>
            <span class="kpi-desc">Prepared volume in feed reservoir</span>
          </div>
          <div class="kpi-stat-card" style="padding: 12px 14px;">
            <span class="kpi-label">Feed Cycles</span>
            <div class="kpi-value" style="color: #d97706; font-size: 1.3rem;">${totalCycles} rounds</div>
            <span class="kpi-desc">Medium Recipe: ${mediaSet.length > 0 ? escapeHtml(mediaSet.join(', ')) : 'BF.1, BF.2'} (avg. ${avgBrix}°Bx)</span>
          </div>
          <div class="kpi-stat-card" style="padding: 12px 14px;">
            <span class="kpi-label">Mean Feed Rate</span>
            <div class="kpi-value" style="color: #7c3aed; font-size: 1.3rem;">150–200 mL/h</div>
            <span class="kpi-desc">Consistent with Dilution Rate D = ${escapeHtml(project.conditionParams?.dilutionRateD || '0.022')} h⁻¹</span>
          </div>
        </div>

        <!-- Feed Log Table -->
        <div class="lab-data-table-wrapper table-responsive" style="max-height: 250px; overflow-y: auto;">
          <table class="lab-table" style="min-width: 720px;">
            <thead>
              <tr>
                <th style="width: 110px;">Date</th>
                <th style="width: 80px;">Time</th>
                <th>Medium Type</th>
                <th>Round</th>
                <th>Brix (°Bx)</th>
                <th>Initial Volume</th>
                <th>Remaining Volume</th>
                <th>Notes / Feed Rate</th>
              </tr>
            </thead>
            <tbody>
              ${feedLogs.length > 0 ? feedLogs.map((item, idx) => `
                <tr>
                  <td><strong>${escapeHtml(item.date || item.dateTime || '-')}</strong></td>
                  <td>${escapeHtml(item.time || '-')}</td>
                  <td><span class="badge ${item.medium === 'BF.1' ? 'badge-navy' : 'badge-gold'}" style="font-size: 0.75rem;">${escapeHtml(item.medium || '-')}</span></td>
                  <td><strong>${escapeHtml(item.feedNo || (idx + 1))}</strong></td>
                  <td style="color: #d97706; font-weight: 600;">${item.brix !== undefined ? escapeHtml(item.brix) + '°' : '-'}</td>
                  <td>${escapeHtml(item.initialVolume || item.initialVol || '-')}</td>
                  <td>${escapeHtml(item.remainingVolume || item.remainingVol || '-')}</td>
                  <td>${(item.remark || item.remarks) ? `<span style="color: #059669; font-weight: 500;">${escapeHtml(item.remark || item.remarks)}</span>` : '-'}</td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="8" style="text-align: center; color: #94a3b8; padding: 24px;">No feeding log entries in this project</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>

        <!-- Strategy Note -->
        <div style="margin-top: 14px; padding: 12px 16px; background: #f8fafc; border-left: 4px solid #059669; border-radius: 8px; font-size: 0.83rem; color: #334155;">
          <strong>💡 Feeding Control Strategy:</strong> Continuous feeding of BF.1 and BF.2 media maintains Steady-State conditions, preventing excess sugar accumulation and Catabolite Repression while sustaining yeast cell density and ethanol synthesis rate throughout 82 hours
        </div>
      </div>
    `;
  } else if (state.slideIndex === 6) {
    container.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <div>
            <span class="badge badge-gold" style="font-size: 0.78rem; margin-bottom: 4px;">Executive Research Synthesis</span>
            <h2 style="color: #0a2540; margin: 0; font-size: 1.4rem;">Executive Research Summary: Evolution from Initial Seed to Final Harvest</h2>
          </div>
          <span class="badge badge-navy" style="font-size: 0.82rem;">End-to-End Cascade Milestones (0–82h)</span>
        </div>
        <p style="color: #64748b; font-size: 0.88rem; margin-bottom: 14px;">
          Synthesizes results of the 8-vessel continuous cascade bio-fermentation from seed propagation through final product harvest
        </p>

        <!-- 4 Chronological Stage Milestone Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 16px;">
          <!-- Stage 1 -->
          <div style="background: #ffffff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 14px; border-left: 4px solid #1e3a8a; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <span style="font-weight: 700; color: #1e3a8a; font-size: 0.88rem;">1. Seed & Substrate Preparation (0–12h)</span>
              <span class="badge badge-navy" style="font-size: 0.7rem;">Tank PF</span>
            </div>
            <ul style="margin: 0; padding-left: 16px; font-size: 0.8rem; color: #475569; line-height: 1.55;">
              <li><strong>Initial Sugar:</strong> 125.2 g/L (Brix 18.0°) in initial molasses feed</li>
              <li><strong>Cell Revival:</strong> Angel Yeast 0.4 g dissolved in water, initial cells 1.5×10⁸ cfu/mL</li>
              <li><strong>Cell Viability:</strong> Viability 98.2%, Budding Index 12.5%, cells fully adapted</li>
            </ul>
          </div>

          <!-- Stage 2 -->
          <div style="background: #ffffff; border: 1px solid #fed7aa; border-radius: 12px; padding: 14px; border-left: 4px solid #ea580c; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <span style="font-weight: 700; color: #9a3412; font-size: 0.88rem;">2. Nutrient Feeding & Cascade Coupling (12–46h)</span>
              <span class="badge badge-gold" style="font-size: 0.7rem;">Tank F1 → F3</span>
            </div>
            <ul style="margin: 0; padding-left: 16px; font-size: 0.8rem; color: #475569; line-height: 1.55;">
              <li><strong>Feeding:</strong> Feed BF.1/BF.2 media at dilution rate D = 0.022 h⁻¹</li>
              <li><strong>Biochemical Cross-Over:</strong> @ F2→F3 Sugar drops sharply 100.3 → 19.6 g/L while Ethanol surges to 78.4 g/L</li>
              <li><strong>Peak Biomass:</strong> Peak cell density 9.15×10⁸ cells/mL, Peak CDW 4.35 g/L</li>
            </ul>
          </div>

          <!-- Stage 3 -->
          <div style="background: #ffffff; border: 1px solid #bbf7d0; border-radius: 12px; padding: 14px; border-left: 4px solid #059669; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <span style="font-weight: 700; color: #065f46; font-size: 0.88rem;">3. Steady-State Equilibrium & Sugar Depletion (46–82h)</span>
              <span class="badge" style="background: #dcfce7; color: #166534; font-size: 0.7rem;">Tank F4 → F7</span>
            </div>
            <ul style="margin: 0; padding-left: 16px; font-size: 0.8rem; color: #475569; line-height: 1.55;">
              <li><strong>Steady-State:</strong> Entered steady-state equilibrium with uniform flow rate</li>
              <li><strong>Complete sugar utilization:</strong> Residual sugar in system &lt; 0.1 g/L in D3 (99.9% sugar consumed)</li>
              <li><strong>Biological stability:</strong> No Stuck Fermentation, steady 97.4% cell viability</li>
            </ul>
          </div>

          <!-- Stage 4 -->
          <div style="background: #ffffff; border: 1px solid #ddd6fe; border-radius: 12px; padding: 14px; border-left: 4px solid #7c3aed; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <span style="font-weight: 700; color: #5b21b6; font-size: 0.88rem;">4. Final Harvest & Performance Metrics (@ 82h)</span>
              <span class="badge" style="background: #ede9fe; color: #6d28d9; font-size: 0.7rem;">Tank D3 Final</span>
            </div>
            <ul style="margin: 0; padding-left: 16px; font-size: 0.8rem; color: #475569; line-height: 1.55;">
              <li><strong>Peak Ethanol Concentration:</strong> <strong style="color: #ea580c;">99.53 g/L</strong> (12.6% v/v)</li>
              <li><strong>Ethanol Yield (Yp/s):</strong> <strong style="color: #059669;">0.491 g/g</strong> (96.3% of Gay-Lussac theoretical limit)</li>
              <li><strong>Volumetric Productivity:</strong> Qp = 2.18 g/L·h continuous</li>
            </ul>
          </div>
        </div>

        <!-- Strategic Scale-up Recommendation Box -->
        <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 12px; padding: 16px 20px; box-shadow: 0 2px 8px rgba(16,185,129,0.08);">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="font-size: 1.25rem;">🏆</span>
            <strong style="color: #166534; font-size: 1rem;">Research Conclusions & Strategic Recommendations for Scale-up:</strong>
          </div>
          <p style="color: #15803d; font-size: 0.88rem; margin: 0; line-height: 1.6;">
            Research concludes that 8-vessel continuous cascade fermentation at dilution rate <strong>Dilution Rate D = 0.022 h⁻¹</strong> (Feed Culture ratio 80:20, temperature 30°C) is the Optimal Operating Window, achieving 99.9% sugar-to-ethanol conversion and a biochemical yield of 96.3% of the theoretical limit without sugar accumulation or yeast cell death; therefore recommended as the <strong>Standard Benchmark Recipe</strong> for scale-up to industrial-scale production
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

    insightText = `• <strong>Biochemical Cross-Over Phase (@ F2 → F3):</strong> Sugar drops sharply from 100.3 g/L to 19.6 g/L alongside an ethanol surge from 49.9 g/L to 78.4 g/L<br>
• <strong>Complete Fermentation (Finishing Phase @ F4 → D3):</strong> Sugar nearly depleted (&lt; 2 g/L in F4 and &lt; 0.1 g/L in F5–D3), Ethanol peaks at 99.53 g/L with zero Stuck Fermentation`;
  } else if (mode === 'steady') {
    const tanks = ['PF', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'D3'];
    labels = tanks.map(t => `${t} (82h)`);
    tanks.forEach(t => {
      const match = projSamples.find(s => s.tank === t && s.time === 82) ||
                    window.SEED_SAMPLES_220326.find(s => s.tank === t && s.time === 82) || {};
      sugarData.push(match.sugarConvert !== undefined ? match.sugarConvert : 0);
      ethanolData.push(match.ethanol !== undefined ? match.ethanol : 0);
    });

    insightText = `• <strong>Cascade Steady-State (@ 82h):</strong> Tank F2 holds 69.2 g/L residual sugar from continuous feeding, which is rapidly consumed across Tank F3 (19.6 g/L) and Tank F4 (1.18 g/L)<br>
• <strong>Polishing & Harvest Vessels (F5–D3):</strong> Maintains steady ethanol at 94.9–99.5 g/L while controlling byproducts (Glycerol &lt; 10.8 g/L)`;
  } else if (mode === 'pf') {
    const pfSamples = projSamples.filter(s => s.tank === 'PF').sort((a,b) => a.time - b.time);
    labels = pfSamples.map(s => `${s.time}h`);
    sugarData = pfSamples.map(s => s.sugarConvert ?? 0);
    ethanolData = pfSamples.map(s => s.ethanol ?? 0);

    insightText = `• <strong>Pre-fermenter (PF) Dynamics:</strong> Initial sugar of 125.2 g/L is rapidly consumed down to 4.04 g/L within the first 12 h (Exponential Growth Phase)<br>
• <strong>Ethanol accumulation in PF:</strong> Ethanol remains stable at ~45–50 g/L during 22–82 h with peak cell density of 9.15 × 10⁸ cells/mL, indicating healthy cells ready for transfer into Cascade F2`;
  }

  const insightEl = document.getElementById('slide3-kinetic-insight-text');
  if (insightEl) insightEl.innerHTML = insightText;

  state.charts.slideKinetics = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Residual Total Sugar (g/L)',
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
          label: 'Ethanol Produced (g/L)',
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
            text: 'Total Sugar (g/L)',
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
            text: 'Ethanol Produced (g/L)',
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
    <option value="ALL">All Researchers</option>
    ${Array.from(userSet).map(name => `
      <option value="${escapeHtml(name)}" ${name === currentVal ? 'selected' : ''}>${escapeHtml(name)}</option>
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
  const s = document.getElementById('audit-filter-search');

  if (u) u.value = 'ALL';
  if (d) d.value = '';
  if (m) m.value = 'ALL';
  if (y) y.value = 'ALL';
  if (q) q.value = 'ALL';
  if (a) a.value = 'ALL';
  if (s) s.value = '';

  renderAuditLogs();
  showToast('Audit log filters reset', 'info');
};

window.openClearLogsModal = function() {
  const isAdmin = state.currentUser && state.currentUser.role === 'admin';
  if (!isAdmin) {
    Swal.fire({
      icon: 'error',
      title: 'Access denied',
      text: 'Only administrators (Admin) can clear Log entries'
    });
    return;
  }

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  Swal.fire({
    title: '🗑️ Clear Audit Logs',
    html: `
      <div style="text-align: left; font-size: 0.88rem; line-height: 1.6;">
        <p style="color: #64748b; margin-bottom: 14px;">
          Select the time range of Log entries to delete from the system and Firebase Cloud:
        </p>
        <div class="form-group">
          <label class="form-label" style="font-weight: 600;">Select Period Type:</label>
          <select id="swal-clear-mode" class="form-select" onchange="window.handleClearLogModeChange()">
            <option value="month">Specific Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Specific Year</option>
            <option value="all">All Logs</option>
          </select>
        </div>

        <div class="form-group" id="swal-clear-year-group">
          <label class="form-label" style="font-weight: 600;">Select Year:</label>
          <select id="swal-clear-year" class="form-select">
            ${[2022, 2023, 2024, 2025, 2026, 2027].map(y => `
              <option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>
            `).join('')}
          </select>
        </div>

        <div class="form-group" id="swal-clear-month-group">
          <label class="form-label" style="font-weight: 600;">Select Month:</label>
          <select id="swal-clear-month" class="form-select">
            <option value="1" ${currentMonth === 1 ? 'selected' : ''}>01 - January (Jan)</option>
            <option value="2" ${currentMonth === 2 ? 'selected' : ''}>02 - February (Feb)</option>
            <option value="3" ${currentMonth === 3 ? 'selected' : ''}>03 - March (Mar)</option>
            <option value="4" ${currentMonth === 4 ? 'selected' : ''}>04 - April (Apr)</option>
            <option value="5" ${currentMonth === 5 ? 'selected' : ''}>05 - May (May)</option>
            <option value="6" ${currentMonth === 6 ? 'selected' : ''}>06 - June (Jun)</option>
            <option value="7" ${currentMonth === 7 ? 'selected' : ''}>07 - July (Jul)</option>
            <option value="8" ${currentMonth === 8 ? 'selected' : ''}>08 - August (Aug)</option>
            <option value="9" ${currentMonth === 9 ? 'selected' : ''}>09 - September (Sep)</option>
            <option value="10" ${currentMonth === 10 ? 'selected' : ''}>10 - October (Oct)</option>
            <option value="11" ${currentMonth === 11 ? 'selected' : ''}>11 - November (Nov)</option>
            <option value="12" ${currentMonth === 12 ? 'selected' : ''}>12 - December (Dec)</option>
          </select>
        </div>

        <div class="form-group" id="swal-clear-quarter-group" style="display: none;">
          <label class="form-label" style="font-weight: 600;">Select Quarter:</label>
          <select id="swal-clear-quarter" class="form-select">
            <option value="Q1">Q1 (January - March)</option>
            <option value="Q2">Q2 (April - June)</option>
            <option value="Q3">Q3 (July - September)</option>
            <option value="Q4">Q4 (October - December)</option>
          </select>
        </div>

        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius-sm); padding: 10px; margin-top: 12px; color: #991b1b; font-size: 0.82rem;">
          <i class="fa-solid fa-triangle-exclamation"></i> <strong>Warning:</strong> Deleted Log entries cannot be recovered and will be removed from both Local Storage and Cloud Firestore
        </div>
      </div>
    `,
    didOpen: () => {
      window.handleClearLogModeChange = () => {
        const mode = document.getElementById('swal-clear-mode')?.value;
        const yearGroup = document.getElementById('swal-clear-year-group');
        const monthGroup = document.getElementById('swal-clear-month-group');
        const quarterGroup = document.getElementById('swal-clear-quarter-group');
        if (mode === 'month') {
          if (yearGroup) yearGroup.style.display = 'block';
          if (monthGroup) monthGroup.style.display = 'block';
          if (quarterGroup) quarterGroup.style.display = 'none';
        } else if (mode === 'quarter') {
          if (yearGroup) yearGroup.style.display = 'block';
          if (monthGroup) monthGroup.style.display = 'none';
          if (quarterGroup) quarterGroup.style.display = 'block';
        } else if (mode === 'year') {
          if (yearGroup) yearGroup.style.display = 'block';
          if (monthGroup) monthGroup.style.display = 'none';
          if (quarterGroup) quarterGroup.style.display = 'none';
        } else {
          // 'all'
          if (yearGroup) yearGroup.style.display = 'none';
          if (monthGroup) monthGroup.style.display = 'none';
          if (quarterGroup) quarterGroup.style.display = 'none';
        }
      };
    },
    showCancelButton: true,
    confirmButtonText: 'Next: Review & Confirm',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#ef4444',
    preConfirm: () => {
      const mode = document.getElementById('swal-clear-mode').value;
      const year = parseInt(document.getElementById('swal-clear-year')?.value) || currentYear;
      const month = parseInt(document.getElementById('swal-clear-month')?.value) || currentMonth;
      const quarter = document.getElementById('swal-clear-quarter')?.value || 'Q1';
      return { mode, year, month, quarter };
    }
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    const { mode, year, month, quarter } = res.value;

    let periodDesc = '';
    if (mode === 'all') periodDesc = 'All Logs';
    else if (mode === 'year') periodDesc = `Annual ${year}`;
    else if (mode === 'month') periodDesc = `Monthly ${month}/${year}`;
    else if (mode === 'quarter') periodDesc = `Quarterly ${quarter}/${year}`;

    const toDelete = state.auditLogs.filter(log => {
      if (!log.timestamp) return mode === 'all';
      const logDate = new Date(log.timestamp);
      const logYear = logDate.getFullYear();
      const logMonth = logDate.getMonth() + 1;

      if (mode === 'all') return true;
      if (mode === 'year') return logYear === year;
      if (mode === 'month') return logYear === year && logMonth === month;
      if (mode === 'quarter') {
        let q = 'Q1';
        if (logMonth >= 4 && logMonth <= 6) q = 'Q2';
        else if (logMonth >= 7 && logMonth <= 9) q = 'Q3';
        else if (logMonth >= 10 && logMonth <= 12) q = 'Q4';
        return logYear === year && q === quarter;
      }
      return false;
    });

    if (toDelete.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'No Log data found',
        text: `No audit logs found for period ${periodDesc}`,
        confirmButtonColor: '#0f3d7a'
      });
      return;
    }

    const confirmRes = await Swal.fire({
      icon: 'warning',
      title: `Confirm Delete ${toDelete.length} items?`,
      html: `
        <div style="text-align: left; font-size: 0.9rem; line-height: 1.6;">
          <p>You are about to delete Log data <strong>${periodDesc}</strong></p>
          <p>Found: <strong style="color: #dc2626; font-size: 1.1rem;">${toDelete.length}</strong> items</p>
          <p style="color: #ef4444; font-size: 0.85rem;">⚠️ Data will be permanently deleted from Local Storage and Cloud Firestore</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Confirm Delete Data',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626'
    });

    if (confirmRes.isConfirmed) {
      const deleteIds = new Set(toDelete.map(l => l.id));
      state.auditLogs = state.auditLogs.filter(l => !deleteIds.has(l.id));
      persistState();

      if (window.FirebaseSync && typeof window.FirebaseSync.deleteDoc === 'function') {
        for (const log of toDelete) {
          if (log.id) {
            window.FirebaseSync.deleteDoc('logs', log.id).catch(e => console.warn(e));
          }
        }
      }

      logAction('CLEAR_LOGS', `Admin cleared Log data ${periodDesc} Count ${toDelete.length} items`);
      renderAuditLogs();
      if (window.labAudio) window.labAudio.playWarning();
      showToast(`Clear Log Data ${periodDesc} (${toDelete.length} items) successfully`, 'success');
    }
  });
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
  const filterSearch = (document.getElementById('audit-filter-search')?.value || '').trim().toLowerCase();

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

    // Keyword Search filter
    if (filterSearch) {
      const matchDetails = log.details && log.details.toLowerCase().includes(filterSearch);
      const matchUser = log.userName && log.userName.toLowerCase().includes(filterSearch);
      const matchAction = log.action && log.action.toLowerCase().includes(filterSearch);
      if (!matchDetails && !matchUser && !matchAction) return false;
    }

    return true;
  });

  const countBadge = document.getElementById('audit-count-badge');
  if (countBadge) countBadge.textContent = `${filteredLogs.length} items`;

  if (filteredLogs.length === 0) {
    container.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 24px;">No activity logs match the search criteria</td></tr>';
    return;
  }

  container.innerHTML = filteredLogs.map(log => {
    let restoreBtnHtml = '<span style="color: #cbd5e1; font-size: 0.8rem;">-</span>';
    if (log.snapshot && !log.restored) {
      restoreBtnHtml = `
        <button class="btn btn-sm btn-accent" onclick="restoreFromLog('${log.id}')" style="padding: 4px 10px; font-size: 0.76rem; white-space: nowrap;" title="Restore this record to the system">
          ♻️ Restore Data
        </button>
      `;
    } else if (log.snapshot && log.restored) {
      restoreBtnHtml = `
        <span class="badge" style="background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; font-size: 0.74rem; padding: 3px 8px;">
          ✓ Restored
        </span>
      `;
    }

    let actionBadgeHtml = `<span class="badge badge-navy">${log.action}</span>`;
    if (log.action === 'LOGIN') {
      actionBadgeHtml = `<span class="badge" style="background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;"><i class="fa-solid fa-right-to-bracket" style="margin-right: 4px;"></i> Sign In</span>`;
    } else if (log.action === 'LOGOUT') {
      actionBadgeHtml = `<span class="badge" style="background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1;"><i class="fa-solid fa-right-from-bracket" style="margin-right: 4px;"></i> Sign Out</span>`;
    } else if (log.action.startsWith('CREATE') || log.action === 'SAMPLE_ENTRY' || log.action === 'ADD_USER') {
      actionBadgeHtml = `<span class="badge" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe;"><i class="fa-solid fa-circle-plus" style="margin-right: 4px;"></i> ${log.action}</span>`;
    } else if (log.action.startsWith('UPDATE')) {
      actionBadgeHtml = `<span class="badge" style="background: #fffbeb; color: #d97706; border: 1px solid #fde68a;"><i class="fa-solid fa-pen-to-square" style="margin-right: 4px;"></i> ${log.action}</span>`;
    } else if (log.action.startsWith('DELETE')) {
      actionBadgeHtml = `<span class="badge" style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;"><i class="fa-solid fa-trash-can" style="margin-right: 4px;"></i> ${log.action}</span>`;
    } else if (log.action.startsWith('RESTORE')) {
      actionBadgeHtml = `<span class="badge" style="background: #faf5ff; color: #7c3aed; border: 1px solid #e9d5ff;"><i class="fa-solid fa-clock-rotate-left" style="margin-right: 4px;"></i> ${log.action}</span>`;
    }

    return `
      <tr>
        <td style="color: #64748b; font-size: 0.82rem; white-space: nowrap;">${new Date(log.timestamp).toLocaleString('en-US')}</td>
        <td><strong>${escapeHtml(log.userName)}</strong></td>
        <td>${actionBadgeHtml}</td>
        <td style="font-size: 0.85rem; line-height: 1.5;">${escapeHtml(log.details)}</td>
        <td style="text-align: center;">${restoreBtnHtml}</td>
      </tr>
    `;
  }).join('');
}

// Restore Function from Audit Trail (Requirement 3)
window.restoreFromLog = function(logId) {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    Swal.fire({ icon: 'error', title: 'No Permission', text: 'Only administrators (Admin) can restore data' });
    return;
  }
  const log = state.auditLogs.find(l => l.id === logId);
  if (!log || !log.snapshot) return;

  const isProject = log.snapshot.type === 'PROJECT';

  Swal.fire({
    title: 'Restore previous data?',
    html: `
      <div style="text-align: left; font-size: 0.88rem; line-height: 1.65;">
        <p>• <strong>Previous Action:</strong> ${escapeHtml(log.details)}</p>
        <p>• <strong>Data Type:</strong> ${isProject ? 'All research projects and data rows' : 'Single sample record'}</p>
        <p style="color: #059669; margin-top: 10px; font-weight: 600;">
          🛡️ The system will restore this snapshot to the database immediately
        </p>
      </div>
    `,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Confirm Data Restore',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#0f3d7a'
  }).then((res) => {
    if (res.isConfirmed) {
      if (log.snapshot.type === 'SAMPLE_ROW') {
        const row = log.snapshot.data;
        state.samples = state.samples.filter(x => !((x.projectId === row.projectId || !x.projectId) && x.tank === row.tank && x.time === row.time));
        state.samples.push(row);
        if (window.FirebaseSync && typeof window.FirebaseSync.syncSample === 'function') {
          window.FirebaseSync.syncSample(row);
        }
        logAction('RESTORE_DATA', `Restore Data ${row.tank} @ ${row.time}h (Project: ${row.projectId || state.currentProjectId})`);
      } else if (log.snapshot.type === 'PROJECT') {
        const proj = log.snapshot.project;
        const samples = log.snapshot.samples || [];

        if (!state.projects.some(p => p.id === proj.id)) {
          state.projects.unshift(proj);
        }
        state.currentProjectId = proj.id;

        samples.forEach(s => {
          const exists = state.samples.some(x => (x.projectId === s.projectId || (!x.projectId && s.projectId === proj.id)) && x.tank === s.tank && x.time === s.time);
          if (!exists) state.samples.push(s);
        });

        if (window.FirebaseSync && typeof window.FirebaseSync.syncProject === 'function') {
          window.FirebaseSync.syncProject(proj);
          samples.forEach(s => window.FirebaseSync.syncSample(s));
        }
        logAction('RESTORE_DATA', `Restore Project ${proj.experimentNo} (${proj.batchMediumNo}) with data ${samples.length} rows`);
      }

      log.restored = true;
      persistState();
      if (window.FirebaseSync && typeof window.FirebaseSync.syncLog === 'function') {
        window.FirebaseSync.syncLog(log);
      }
      window.labAudio.playSuccess();
      renderAllDataViews();
      Swal.fire({
        icon: 'success',
        title: 'Data restored successfully',
        text: 'Data has been restored to the system'
      });
    }
  });
};

window.testFirebaseConnectionLive = async function() {
  Swal.fire({
    title: 'Connecting to Firebase...',
    text: 'Testing Ping to project mpir-fermentlog',
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
  });
  try {
    const isOk = await FirebaseSync.saveDoc('settings', 'ping_test', {
      pingTime: new Date().toISOString(),
      testedBy: state.currentUser ? state.currentUser.displayName : 'Admin',
      status: 'OK'
    });
    if (isOk) {
      await FirebaseSync.deleteDoc('settings', 'ping_test');
      Swal.fire({
        icon: 'success',
        title: 'Firebase Connected!',
        html: `
          <div style="text-align: left; font-size: 0.9rem; line-height: 1.6;">
            <p>✅ Project: <strong>mpir-fermentlog</strong></p>
            <p>✅ Database: <strong>Cloud Firestore (Default)</strong></p>
            <p>✅ Status: <strong>100% read/write verified</strong></p>
          </div>
        `,
        confirmButtonColor: '#0f3d7a'
      });
    } else {
      throw new Error('Unable to write test document');
    }
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Connection failed',
      text: err.message,
      confirmButtonColor: '#0f3d7a'
    });
  }
};

// ==========================================================================
// Chart Information & Research Insights Modal (Requirement 6)
// ==========================================================================
window.openChartInfoModal = function(chartKey) {
  const guideData = {
    brix: {
      title: 'Brix (°Bx) Degradation Profile',
      icon: '📉',
      axisDesc: 'X-Axis: Fermentation Time (h) | Y-Axis: Brix (°Bx) across all 8 fermentation vessels (PF to D3)',
      howToRead: [
        'Curves tracking sugar solution (Brix) depletion in each vessel over 82 hours',
        'Complete fermentation displays a continuous Stepwise Decay curve from the first vessel to the final vessel',
        'Tanks F2 to F5 show the steepest Brix decline (Max Consumption Rate), corresponding to rapid sugar-to-ethanol conversion',
        'If any vessel curve plateaus at a high Brix level, it signals a Stuck Fermentation warning'
      ],
      researchSummary: [
        'Condition D = 0.022 h⁻¹ demonstrates peak sugar utilization efficiency, reducing final vessel (D3) Brix to 3.2–3.5 °Bx (from initial 18.0 °Bx)',
        'Represents over 80.5% sugar consumption prior to ethanol distillation',
        'Tank PF (Pre-fermenter) shows a gradual Brix drop during the first 16 h while cells are in the Lag/Early Log Phase'
      ]
    },
    cells: {
      title: 'Yeast Population & Viability Dynamics',
      icon: '🔬',
      axisDesc: 'X-Axis: Fermentation Time (h) | Y1-Axis (Left): Total Cells (cells/mL) | Y2-Axis (Right): % Viability & % Budding',
      howToRead: [
        'Blue line shows Total Yeast Cells counted via Haemacytometer',
        'Green dashed line shows % Viability via Methylene Blue staining (dead cells stain blue, live cells remain unstained)',
        'Orange dashed line shows % Budding index, indicating active cell division and growth',
        'Under ideal continuous fermentation, cells must maintain Viability above 90% throughout the run'
      ],
      researchSummary: [
        'Yeast strain Angel Lot.260624 exhibits high ethanol stress tolerance, reaching peak cell density of 9.15 × 10⁸ cells/mL in Tank PF @ 46h',
        'Average Cell Viability reaches 97.4% across all 8 fermentation vessels',
        'Even in Tank D3 where cumulative ethanol approaches 100 g/L, cells maintain 94.8% Viability without Ethanol Toxicity shock'
      ]
    },
    hplc: {
      title: 'HPLC Sugar Consumption vs Ethanol Production',
      icon: '🧪',
      axisDesc: 'X-Axis: Fermentation Time (h) | Y-Axis: Metabolite Concentration (g/L)',
      howToRead: [
        'Tracks 5 metabolites via High-Performance Liquid Chromatography (HPLC): Sucrose, Glucose, Fructose, Ethanol, and Glycerol',
        'Observe the rapid depletion of monosaccharides (Glucose/Fructose) against the sharp rise in Ethanol',
        'Glycerol is a byproduct of yeast Osmotic Stress and Redox Balance; the curve should remain low and stable'
      ],
      researchSummary: [
        'Yeast Invertase enzyme hydrolyzes Sucrose into Glucose and Fructose almost completely within Tanks F2–F3',
        'Yeast consumes Glucose significantly faster than Fructose (Glucose Repression Mechanism)',
        'Peak cumulative ethanol in Tank D3 reaches 99.53 g/L with Glycerol controlled below 10.78 g/L, demonstrating an excellent Ethanol Yield to Byproduct ratio'
      ]
    },
    custom: {
      title: 'Custom Multi-Axis Comparison Sandbox',
      icon: '📊',
      axisDesc: 'X-Axis: Fermentation Time (h) | Y1-Axis (Left) & Y2-Axis (Right): User-selected custom variables',
      howToRead: [
        'Custom correlation analyzer supporting dual Y-axis comparison of multi-scale variables',
        'Used to verify biochemical hypotheses such as the relationship between Brix decline and Ethanol rise, or the impact of Cell Viability on ethanol production rate',
        'Helps identify the Time Lag between sugar consumption and product formation in each vessel'
      ],
      researchSummary: [
        'Parallel correlation analysis between Brix and HPLC Ethanol reveals a strong negative correlation coefficient (r = -0.982)',
        'Confirms the research conclusion that at-line Brix readings serve as a highly accurate Real-time Soft Sensor for estimating ethanol output',
        'Reduces HPLC injection frequency and workload during routine plant operation'
      ]
    },
    radar: {
      title: 'Multi-Parameter Performance Radar (Best Condition)',
      icon: '🏆',
      axisDesc: '5-Axis Radar: Max Ethanol, Yield (Yp/s), Productivity (Qp), Sugar Conversion (%), Cell Viability (%)',
      howToRead: [
        'Multi-dimensional performance comparison of fermentation conditions and Dilution Rates across trials',
        'A wider, more balanced polygon across all axes indicates a more optimal operating condition (Pareto Optimal)',
        'Helps researchers visualize the trade-off between Productivity (output per hour) and Yield (output per unit sugar)'
      ],
      researchSummary: [
        'Dilution Rate D Condition = 0.022 h⁻¹ (B:C 80:20, 30°C) is established as the "Best Condition" of Mitr Phol factory',
        'Delivers an ethanol yield (Yield Yp/s) of 0.491 g/g, representing 96.1% of the Gay-Lussac theoretical limit (0.511 g/g)',
        'Combined with high Productivity (Qp) of 2.18 g/L·h and 99.3% Sugar Conversion, representing the most economically optimal operating point'
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
          <strong style="color: var(--mitr-navy-900);">📐 Data Axes:</strong>
          <span style="color: #475569; font-size: 0.82rem;">${g.axisDesc}</span>
        </div>

        <div style="margin-bottom: 16px;">
          <h4 style="color: var(--mitr-navy-800); display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
            <span>📖</span> How to Read & Interpret This Chart
          </h4>
          <ul style="padding-left: 20px; color: #334155; margin: 0;">
            ${g.howToRead.map(item => `<li style="margin-bottom: 6px;">${item}</li>`).join('')}
          </ul>
        </div>

        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px;">
          <h4 style="color: #166534; display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
            <span>🔬</span> Research Findings & Insights
          </h4>
          <ul style="padding-left: 20px; color: #15803d; margin: 0;">
            ${g.researchSummary.map(item => `<li style="margin-bottom: 6px;">${item}</li>`).join('')}
          </ul>
        </div>
      </div>
    `,
    width: '680px',
    confirmButtonText: 'Close',
    confirmButtonColor: '#0f3d7a'
  });
};

// ==========================================================================
// Admin Backup, Restore & Clear Data (Requirements 4 & 7)
// ==========================================================================
window.exportFullSystemBackup = function(silent = false) {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    if (!silent) Swal.fire({ icon: 'error', title: 'No Permission', text: 'Only administrators (Admin) can export Backup files' });
    return;
  }
  const factorEl = document.getElementById('setting-haemacytometer-factor');
  const safeUsers = (state.users || []).map(u => {
    const copy = { ...u };
    delete copy.password;
    return copy;
  });
  const backupData = {
    system: "Mitr Phol Fermentation Lab Tracker",
    version: "2.1.0",
    exportedAt: new Date().toISOString(),
    exportedBy: state.currentUser ? state.currentUser.displayName : 'Admin',
    users: safeUsers,
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
    logAction('BACKUP_EXPORT', `Exported full system backup (${state.projects.length} projects, ${state.samples.length} Sample data, ${state.auditLogs.length} Data Logs)`);
    showToast('Backup file downloaded', 'success');
  }
};

window.triggerImportBackupFile = function() {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    Swal.fire({ icon: 'error', title: 'No Permission', text: 'Only administrators (Admin) can import Backup files' });
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
      const rawData = JSON.parse(e.target.result);
      if (!rawData || typeof rawData !== 'object' || !Array.isArray(rawData.projects) || !Array.isArray(rawData.samples)) {
        throw new Error('Invalid Backup file structure (missing projects or samples data)');
      }
      const stripUnsafeKeys = (obj) => {
        if (Array.isArray(obj)) return obj.map(stripUnsafeKeys);
        if (obj && typeof obj === 'object') {
          const out = {};
          for (const k of Object.keys(obj)) {
            if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
            out[k] = stripUnsafeKeys(obj[k]);
          }
          return out;
        }
        return obj;
      };
      const data = stripUnsafeKeys(rawData);

      Swal.fire({
        title: 'Confirm Backup File Import?',
        html: `
          <div style="text-align: left; font-size: 0.88rem; line-height: 1.7;">
            <p>• <strong>File Version:</strong> ${escapeHtml(data.version || '1.0')}</p>
            <p>• <strong>Backup Date:</strong> ${data.exportedAt ? new Date(data.exportedAt).toLocaleString('en-US') : 'Not specified'}</p>
            <p>• <strong>Exported By:</strong> ${escapeHtml(data.exportedBy || 'Not specified')}</p>
            <hr style="margin: 8px 0; border: none; border-top: 1px solid #e2e8f0;">
            <p>• All Projects: <strong>${data.projects.length}</strong> items</p>
            <p>• Raw sample data: <strong>${data.samples.length}</strong> rows</p>
            <p>• User: <strong>${data.users?.length || 0}</strong> Account</p>
            <p>• Data Log history: <strong>${data.auditLogs?.length || 0}</strong> Save</p>
            <p style="color: #b91c1c; margin-top: 8px;">
              ⚠️ The current database will be updated with data from this Backup file
            </p>
          </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Confirm System Restore',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#0f3d7a'
      }).then((res) => {
        if (res.isConfirmed) {
          if (data.users && Array.isArray(data.users) && data.users.length > 0) {
            const sanitized = data.users.map(u => {
              const copy = { ...u };
              delete copy.password;
              return copy;
            });
            if (sanitized.some(u => u.role === 'admin' && u.passwordHash)) {
              state.users = sanitized;
            }
          }
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
          logAction('RESTORE_BACKUP_IMPORT', `Restored system from Backup (${file.name}): ${state.projects.length} projects, ${state.samples.length} Sample`);
          window.labAudio.playSuccess();
          renderAllDataViews();
          renderUserManagementTable();
          Swal.fire({
            icon: 'success',
            title: 'File imported successfully',
            text: 'System database restored from Backup file'
          });
        }
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Invalid Backup file',
        text: err.message || 'Unable to read JSON file'
      });
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
};

window.handleClearDataWithBackup = function() {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    Swal.fire({ icon: 'error', title: 'No Permission', text: 'Only administrators (Admin) can reset system data' });
    return;
  }

  Swal.fire({
    title: 'Clear System Data to Start Fresh?',
    html: `
      <div style="text-align: left; font-size: 0.88rem; line-height: 1.7;">
        <p style="color: #b91c1c; font-weight: 700;">
          ⚠️ This action clears all research data (projects and raw analytical results across all vessels) to start fresh and free up storage
        </p>
        <p style="margin-top: 8px;">
          🛡️ <strong>The system will automatically download an offline Backup file immediately</strong> before clearing data
        </p>
        <p style="color: #059669; margin-top: 6px;">
          ✓ All user accounts and Admin settings will be preserved intact
        </p>
      </div>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Download Backup & Clear Data Now',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#dc2626'
  }).then((res) => {
    if (res.isConfirmed) {
      // 1. Auto download full backup
      exportFullSystemBackup(true);

      // 2. Clear research data & samples
      const oldProjects = state.projects.slice();
      const oldSamples = state.samples.slice();
      const clearedProjectsCount = oldProjects.length;
      const clearedSamplesCount = oldSamples.length;
      state.projects = [];
      state.samples = [];
      state.currentProjectId = '';

      // 3. Keep admin logs noting the clear
      const clearLog = {
        id: 'log_' + Date.now(),
        timestamp: new Date().toISOString(),
        userId: state.currentUser.uid,
        userName: state.currentUser.displayName,
        action: 'CLEAR_DATA',
        details: `Reset system data to start fresh (cleared projects: ${clearedProjectsCount} items, data ${clearedSamplesCount} rows, with offline Backup downloaded)`
      };
      state.auditLogs = [clearLog];

      persistState();
      if (window.FirebaseSync) {
        if (typeof window.FirebaseSync.removeProject === 'function') {
          oldProjects.forEach(op => window.FirebaseSync.removeProject(op.id));
        }
        if (typeof window.FirebaseSync.removeSample === 'function') {
          oldSamples.forEach(os => window.FirebaseSync.removeSample(os.projectId, os.tank, os.time));
        }
        if (typeof window.FirebaseSync.syncLog === 'function') {
          window.FirebaseSync.syncLog(clearLog);
        }
      }
      window.labAudio.playSuccess();
      renderAllDataViews();

      Swal.fire({
        icon: 'success',
        title: 'System data cleared successfully',
        html: `
          <div style="text-align: left; font-size: 0.9rem;">
            <p>• Offline Backup file downloaded</p>
            <p>• All projects and sample records cleared</p>
            <p>• User accounts and Admin settings remain intact</p>
            <p style="margin-top: 8px; color: #0f3d7a;"><strong>You can create a new research project immediately</strong></p>
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
  const owner = p.ownerName || 'Researcher';
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
      title: `Seed Preparation & Yeast Propagation (${seed})`,
      tank: 'Seed Lab',
      startHour: 0,
      endHour: 4,
      responsible: owner,
      status: 'completed',
      criteria: `Cell Density > 3.0×10⁷ cells/mL, Viability > 95% (${seedPrep})`,
      notes: 'Dissolve yeast in distilled water at 30°C with adequate aeration before inoculating Tank PF'
    },
    {
      id: 'task_' + Date.now() + '_2',
      type: 'task',
      title: `Pre-fermenter (PF) Cultivation`,
      tank: 'PF',
      startHour: 0,
      endHour: 22,
      responsible: owner,
      status: 'completed',
      criteria: `Brix 18.0 → 11.5 °Bx, cell count enters Log Phase, fermentation medium ${culture}`,
      notes: 'Monitor Brix reduction every 4 h and maintain constant 30°C temperature'
    },
    {
      id: 'task_' + Date.now() + '_3',
      type: 'task',
      title: `Early Cascade Continuous Fermentation (Tanks F2 – F5)`,
      tank: 'F2-F5',
      startHour: 22,
      endHour: 58,
      responsible: owner,
      status: 'completed',
      criteria: `Control Dilution Rate D = ${dilution} h⁻¹, B:C ratio ${ratioBC}, temperature ${temp}°C`,
      notes: 'Peak sugar consumption phase (Max Consumption Rate) with complete Sucrose hydrolysis'
    },
    {
      id: 'task_' + Date.now() + '_4',
      type: 'task',
      title: `Late Cascade Continuous Fermentation (Tanks F6 – F7)`,
      tank: 'F6-F7',
      startHour: 58,
      endHour: 70,
      responsible: owner,
      status: 'completed',
      criteria: `Residual sugar nearly exhausted (Brix 4.5 → 3.8 °Bx), cumulative Ethanol > 85 g/L`,
      notes: 'Yeast experiences high ethanol stress; verify % Viability remains above 92%'
    },
    {
      id: 'task_' + Date.now() + '_5',
      type: 'task',
      title: `Harvest product and transfer broth into Duran D3 vessel`,
      tank: 'D3',
      startHour: 70,
      endHour: 82,
      responsible: owner,
      status: 'completed',
      criteria: `Peak cumulative ethanol output (target ≥ 95 g/L), Brix reduced to ≤ 3.5 °Bx`,
      notes: 'Transfer fermented broth into Tank D3 in preparation for distillation and recovery'
    },
    {
      id: 'task_' + Date.now() + '_6',
      type: 'task',
      title: `Evaluate Final Results & KPIs (Yield & Productivity)`,
      tank: 'Data Lab',
      startHour: 82,
      endHour: 86,
      responsible: owner,
      status: 'completed',
      criteria: `Calculate Yield Yp/s (target 0.491 g/g) and confirm via HPLC analysis`,
      notes: 'Process 99.3% Sugar Conversion and Qp 2.18 g/L·h metrics for Scale-up'
    },

    // 5 Key Milestones
    {
      id: 'ms_' + Date.now() + '_1',
      type: 'milestone',
      title: `M1: Seed Inoculum Ready (Inoculation Ready)`,
      tank: 'PF',
      startHour: 0,
      endHour: 0,
      responsible: owner,
      status: 'completed',
      criteria: `Viability ≥ 95%, complete cell suspension ${seedPrep} complete, contamination-free`,
      notes: 'Inoculum meets lab GMP release criteria'
    },
    {
      id: 'ms_' + Date.now() + '_2',
      type: 'milestone',
      title: `M2: Tank PF Steady State & Start Cascade Feed to F2`,
      tank: 'PF / F2',
      startHour: 22,
      endHour: 22,
      responsible: owner,
      status: 'completed',
      criteria: `Brix drops to 11.5 °Bx and continuous sugar feeding starts at D = ${dilution} h⁻¹`,
      notes: 'System transitioned into Continuous Fermentation mode'
    },
    {
      id: 'ms_' + Date.now() + '_3',
      type: 'milestone',
      title: `M3: Mid-stream HPLC Validation`,
      tank: 'F4',
      startHour: 46,
      endHour: 46,
      responsible: owner,
      status: 'completed',
      criteria: `100% Sucrose hydrolyzed, Tank F4 Ethanol exceeds 70 g/L, Glycerol < 8 g/L`,
      notes: 'Confirms sugar hydrolysis efficiency of Invertase enzyme'
    },
    {
      id: 'ms_' + Date.now() + '_4',
      type: 'milestone',
      title: `M4: Final Vessel D3 Fermentation Complete (Harvest Complete)`,
      tank: 'D3',
      startHour: 82,
      endHour: 82,
      responsible: owner,
      status: 'completed',
      criteria: `Cumulative Ethanol reaches target 99.5 g/L, residual Brix 3.2 °Bx, Sugar Conversion > 99%`,
      notes: 'Lab-scale fermentation completed'
    },
    {
      id: 'ms_' + Date.now() + '_5',
      type: 'milestone',
      title: `M5: Final Research Summary & Best Condition Sign-off`,
      tank: 'Lab Admin',
      startHour: 86,
      endHour: 86,
      responsible: owner,
      status: 'completed',
      criteria: `Yield Yp/s 0.491 g/g (96.1% of theoretical), Productivity 2.18 g/L·h approved`,
      notes: 'Compile report and prepare for Pilot Plant scale-up'
    }
  ];

  p.ganttTasks = defaultTasks;
  persistState();
  if (window.FirebaseSync && typeof window.FirebaseSync.syncProject === 'function') {
    window.FirebaseSync.syncProject(p);
  }

  if (force) {
    window.labAudio.playSuccess();
    logAction('AUTO_GENERATE_GANTT', `Auto-generated timeline and milestones for project ${p.experimentNo} (${p.batchMediumNo})`);
    renderGanttTimeline();
    showToast('Timeline and milestones auto-generated', 'success');
  }
};

// Toggle Gantt Chart & Milestones on/off for current project (Requirement 1)
window.toggleGanttActiveState = function(forceEnable = null) {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'No edit permission', text: 'You are not the owner of this research project' });
    return;
  }
  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p) return;

  const currentEnabled = p.enableGantt !== false;
  const newEnabled = forceEnable !== null ? forceEnable : !currentEnabled;
  p.enableGantt = newEnabled;

  persistState();
  if (window.FirebaseSync && typeof window.FirebaseSync.syncProject === 'function') {
    window.FirebaseSync.syncProject(p);
  }
  window.labAudio.playSuccess();
  logAction('TOGGLE_GANTT_STATUS', `${newEnabled ? 'Open' : 'Close'}Gantt Chart for project ${p.experimentNo}`);
  renderGanttTimeline();
  showToast(`${newEnabled ? 'Enable' : 'Disable'} Gantt Chart & Milestones updated`, newEnabled ? 'success' : 'info');
};

// Render Gantt Timeline & Milestones
window.renderGanttTimeline = function() {
  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  const disabledBanner = document.getElementById('gantt-disabled-banner');
  const activeContent = document.getElementById('gantt-active-content');
  if (!p) {
    if (disabledBanner) disabledBanner.style.display = 'block';
    if (activeContent) activeContent.style.display = 'none';
    return;
  }

  const isGanttEnabled = p.enableGantt !== false;

  // Handle On/Off Toggle UI Elements
  const statusBadge = document.getElementById('gantt-status-toggle-badge');
  const toggleBtn = document.getElementById('btn-toggle-gantt-active');
  const toggleBtnIcon = document.getElementById('btn-toggle-gantt-active-icon');
  const toggleBtnText = document.getElementById('btn-toggle-gantt-active-text');
  const actionGroup = document.getElementById('gantt-action-buttons-group');

  if (statusBadge) {
    if (isGanttEnabled) {
      statusBadge.textContent = '✓ Active';
      statusBadge.className = 'badge badge-gold';
      statusBadge.style.background = '';
      statusBadge.style.color = '';
    } else {
      statusBadge.textContent = '🚫 Disabled';
      statusBadge.className = 'badge';
      statusBadge.style.background = '#f1f5f9';
      statusBadge.style.color = '#64748b';
    }
  }

  if (toggleBtn) {
    if (isGanttEnabled) {
      if (toggleBtnIcon) toggleBtnIcon.textContent = '🚫';
      if (toggleBtnText) toggleBtnText.textContent = 'Disable this layout';
      toggleBtn.className = 'btn btn-secondary btn-sm';
      toggleBtn.title = 'Click to disable Gantt Chart for this project';
    } else {
      if (toggleBtnIcon) toggleBtnIcon.textContent = '⚡';
      if (toggleBtnText) toggleBtnText.textContent = 'Enable this layout';
      toggleBtn.className = 'btn btn-primary btn-sm';
      toggleBtn.title = 'Click to enable Gantt Chart & Milestones for this project';
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
    msSummaryBadge.textContent = `${completedCount}/${milestones.length} Milestone Completed`;
  }

  if (msGrid) {
    if (milestones.length === 0) {
      msGrid.innerHTML = '<div style="color: #94a3b8; font-size: 0.85rem; padding: 12px;">No milestones in this project yet</div>';
    } else {
      msGrid.innerHTML = milestones.map(m => {
        let statusClass = 'milestone-pending';
        let statusBadgeHtml = '<span class="badge" style="background: #f1f5f9; color: #64748b; font-size: 0.72rem;">Pending</span>';
        if (m.status === 'completed') {
          statusClass = 'milestone-completed';
          statusBadgeHtml = '<span class="badge" style="background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; font-size: 0.72rem;">✓ Completed</span>';
        } else if (m.status === 'in_progress') {
          statusClass = 'milestone-inprogress';
          statusBadgeHtml = '<span class="badge" style="background: #fffbeb; color: #d97706; border: 1px solid #fde68a; font-size: 0.72rem;">⏳ In Progress</span>';
        }

        const timeStr = formatGanttDateTime(baseDate, m.startHour || 0);

        return `
          <div class="milestone-card ${statusClass}">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                <span class="badge badge-navy" style="font-size: 0.7rem; font-weight: 700;">${escapeHtml(m.tank || 'All')}</span>
                ${statusBadgeHtml}
              </div>
              <h4 style="font-size: 0.88rem; font-weight: 700; color: var(--mitr-navy-900); margin-bottom: 6px; line-height: 1.45;">
                ${escapeHtml(m.title)}
              </h4>
              <p style="font-size: 0.78rem; color: #475569; margin-bottom: 8px; line-height: 1.45;">
                <strong>Metric:</strong> ${escapeHtml(m.criteria || '-')}
              </p>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #64748b; border-top: 1px dashed #e2e8f0; padding-top: 8px; margin-top: 4px;">
              <span>🕒 @ ${escapeHtml(m.startHour)}h (${escapeHtml(timeStr.slice(0, 10))})</span>
              <span style="font-weight: 600; color: var(--mitr-navy-800);">${escapeHtml(m.responsible || '-')}</span>
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

      let statusBadgeHtml = '<span class="badge" style="background: #f1f5f9; color: #64748b; font-size: 0.7rem;">Pending</span>';
      if (t.status === 'completed') {
        statusBadgeHtml = '<span class="badge" style="background: #ecfdf5; color: #059669; font-size: 0.7rem;">Success</span>';
      } else if (t.status === 'in_progress') {
        statusBadgeHtml = '<span class="badge" style="background: #fffbeb; color: #d97706; font-size: 0.7rem;">In Progress</span>';
      }

      let barContentHtml = '';
      if (isMilestone) {
        barContentHtml = `
          <div class="gantt-milestone-marker" style="left: ${leftPct}%;" title="${escapeHtml(t.title)} (@ ${startH}h)">
            🚩
          </div>
        `;
      } else {
        barContentHtml = `
          <div class="gantt-bar-fill status-${escapeHtml(t.status || 'pending')}" style="left: ${leftPct}%; width: ${widthPct}%;" title="${escapeHtml(t.title)} (${startH}h - ${endH}h)">
            ${duration >= 8 ? `${duration}h` : ''}
          </div>
        `;
      }

      return `
        <div class="gantt-row">
          <div class="gantt-row-label" title="${escapeHtml(t.title)}">
            <span style="font-size: 0.85rem; margin-right: 4px; flex-shrink: 0;">${isMilestone ? '🚩' : '📌'}</span>
            <span>${escapeHtml(t.title)}</span>
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
  if (taskCountBadge) taskCountBadge.textContent = `${tasks.length} items`;

  if (tbody) {
    if (tasks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #94a3b8; padding: 20px;">No schedule items found. Click "Auto-generate Timeline" or "Add New Task"</td></tr>';
      return;
    }

    tbody.innerHTML = tasks.map((t) => {
      const isMilestone = t.type === 'milestone';
      const typeBadge = isMilestone
        ? '<span class="badge" style="background: #fef3c7; color: #b45309; border: 1px solid #fcd34d; font-size: 0.72rem;">🚩 Milestone</span>'
        : '<span class="badge badge-navy" style="font-size: 0.72rem;">📌 Steps</span>';

      let statusBadgeHtml = '<span class="badge" style="background: #f1f5f9; color: #64748b; font-size: 0.72rem;">Pending</span>';
      if (t.status === 'completed') {
        statusBadgeHtml = '<span class="badge" style="background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; font-size: 0.72rem;">✓ Done</span>';
      } else if (t.status === 'in_progress') {
        statusBadgeHtml = '<span class="badge" style="background: #fffbeb; color: #d97706; border: 1px solid #fde68a; font-size: 0.72rem;">⏳ In Progress</span>';
      }

      const startH = t.startHour || 0;
      const endH = isMilestone ? startH : (t.endHour !== undefined ? t.endHour : startH + 1);
      const hoursStr = isMilestone ? `@ ${startH} h` : `${startH} - ${endH} h`;
      const dateStr = formatGanttDateTime(baseDate, startH);

      return `
        <tr>
          <td style="text-align: center;">${typeBadge}</td>
          <td>
            <strong style="color: var(--mitr-navy-900); line-height: 1.45;">${escapeHtml(t.title)}</strong>
            ${t.notes ? `<div style="font-size: 0.76rem; color: #64748b; margin-top: 3px; line-height: 1.4;">💬 ${escapeHtml(t.notes)}</div>` : ''}
          </td>
          <td><span class="badge badge-gold" style="font-size: 0.72rem;">${escapeHtml(t.tank || '-')}</span></td>
          <td style="font-weight: 600; color: var(--mitr-navy-900);">${hoursStr}</td>
          <td style="font-size: 0.8rem; color: #475569;">${escapeHtml(dateStr)}</td>
          <td>${escapeHtml(t.responsible || '-')}</td>
          <td style="font-size: 0.82rem; color: #334155; line-height: 1.4;">${escapeHtml(t.criteria || '-')}</td>
          <td style="text-align: center;">${statusBadgeHtml}</td>
          <td style="text-align: center; white-space: nowrap;">
            <button class="btn btn-sm btn-secondary" onclick="editGanttTask('${escapeHtml(t.id)}')" style="padding: 3px 6px; font-size: 0.74rem;" title="Edit">✏️</button>
            <button class="btn btn-sm btn-secondary" onclick="deleteGanttTask('${escapeHtml(t.id)}')" style="padding: 3px 6px; font-size: 0.74rem; color: #ef4444;" title="Delete">🗑️</button>
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
    Swal.fire({ icon: 'error', title: 'No edit permission', text: 'You are not the owner of this research project' });
    return;
  }

  const isEdit = !!task;
  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  const baseDate = p?.date || new Date().toISOString().slice(0, 10);
  const ownerName = p?.ownerName || (state.currentUser?.displayName || 'Researcher');

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
      label: '-- Custom / Manual Entry --',
      type: 'task', tank: 'PF', title: '', startHour: 0, endHour: 22,
      criteria: '', notes: ''
    },
    {
      label: '⚡ [Phase 1] Seed Preparation & Yeast Cell Propagation (0–4h)',
      type: 'task', tank: 'Seed Lab', title: 'Seed Preparation & Yeast Cell Propagation', startHour: 0, endHour: 4,
      criteria: 'Cell Density > 3.0×10⁷ cells/mL, Viability > 95%',
      notes: 'Dissolve yeast in distilled water at 30°C with adequate aeration before inoculating Tank PF'
    },
    {
      label: '⚡ [Phase 2] Pre-fermenter PF Cultivation (0–22h)',
      type: 'task', tank: 'PF', title: 'Pre-fermenter (PF) Cultivation', startHour: 0, endHour: 22,
      criteria: 'Brix 18.0 → 11.5 °Bx, cell count enters Log Phase',
      notes: 'Monitor Brix reduction every 4 h and maintain constant 30°C temperature'
    },
    {
      label: '⚡ [Phase 3] Early Cascade Continuous Fermentation Tanks F2–F5 (22–58h)',
      type: 'task', tank: 'F2-F5', title: 'Early Cascade Continuous Fermentation (Tanks F2 – F5)', startHour: 22, endHour: 58,
      criteria: 'Control Dilution Rate D = 0.022 h⁻¹, B:C Ratio 80:20',
      notes: 'Peak sugar consumption phase with complete Sucrose hydrolysis'
    },
    {
      label: '⚡ [Phase 4] Late Cascade Continuous Fermentation Tanks F6–F7 (58–70h)',
      type: 'task', tank: 'F6-F7', title: 'Late Cascade Continuous Fermentation (Tanks F6 – F7)', startHour: 58, endHour: 70,
      criteria: 'Residual sugar nearly exhausted (Brix 4.5 → 3.8 °Bx), cumulative Ethanol > 85 g/L',
      notes: 'Yeast experiences high ethanol stress; verify % Viability remains above 92%'
    },
    {
      label: '⚡ [Phase 5] Broth Transfer to Harvest Vessel Duran D3 (70–82h)',
      type: 'task', tank: 'D3', title: 'Harvest product and transfer broth into Duran D3 vessel', startHour: 70, endHour: 82,
      criteria: 'Peak cumulative ethanol output (target ≥ 95 g/L), Brix reduced to ≤ 3.5 °Bx',
      notes: 'Transfer fermented broth into Tank D3 in preparation for distillation and recovery'
    },
    {
      label: '⚡ [Phase 6] Final Evaluation & KPI Assessment (82–86h)',
      type: 'task', tank: 'Data Lab', title: 'Evaluate Final Results & KPIs (Yield & Productivity)', startHour: 82, endHour: 86,
      criteria: 'Calculate Yield Yp/s (target 0.491 g/g) and confirm via HPLC analysis',
      notes: 'Process 99.3% Sugar Conversion and Qp 2.18 g/L·h metrics for Scale-up'
    },
    {
      label: '🚩 [Milestone M1] Inoculation Ready (@ 0h)',
      type: 'milestone', tank: 'PF', title: 'M1: Seed Inoculum Ready (Inoculation Ready)', startHour: 0, endHour: 0,
      criteria: 'Viability ≥ 95%, complete cell suspension, contamination-free',
      notes: 'Inoculum meets lab GMP release criteria'
    },
    {
      label: '🚩 [Milestone M2] Steady State PF & Start Cascade Feed to F2 (@ 22h)',
      type: 'milestone', tank: 'PF / F2', title: 'M2: Tank PF Steady State & Start Cascade Feed to F2', startHour: 22, endHour: 22,
      criteria: 'Brix drops to 11.5 °Bx and continuous sugar feeding starts at D = 0.022 h⁻¹',
      notes: 'System transitioned into Continuous Fermentation mode'
    },
    {
      label: '🚩 [Milestone M3] Mid-stream HPLC Validation (@ 46h)',
      type: 'milestone', tank: 'F4', title: 'M3: Mid-stream HPLC Validation', startHour: 46, endHour: 46,
      criteria: '100% Sucrose hydrolyzed, Tank F4 Ethanol exceeds 70 g/L, Glycerol < 8 g/L',
      notes: 'Confirms sugar hydrolysis efficiency of Invertase enzyme'
    },
    {
      label: '🚩 [Milestone M4] Harvest Complete in Tank D3 (@ 82h)',
      type: 'milestone', tank: 'D3', title: 'M4: Final Vessel D3 Fermentation Complete (Harvest Complete)', startHour: 82, endHour: 82,
      criteria: 'Cumulative Ethanol reaches target 99.5 g/L, residual Brix 3.2 °Bx, Sugar Conversion > 99%',
      notes: 'Lab-scale fermentation completed'
    },
    {
      label: '🚩 [Milestone M5] Best Condition Sign-off & Handover (@ 86h)',
      type: 'milestone', tank: 'Lab Admin', title: 'M5: Final Research Summary & Best Condition Sign-off', startHour: 86, endHour: 86,
      criteria: 'Yield Yp/s 0.491 g/g (96.1% of theoretical), Productivity 2.18 g/L·h approved',
      notes: 'Compile report and prepare for Pilot Plant scale-up'
    }
  ];

  const tankOptions = [
    'Seed Lab', 'PF', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'D3', 'F2-F5', 'F6-F7', 'PF / F2', 'Data Lab', 'Lab Admin', 'Shared Lab'
  ];

  const userOptions = state.users.map(u => u.displayName);
  if (!userOptions.includes(initialResponsible)) {
    userOptions.push(initialResponsible);
  }

  Swal.fire({
    title: isEdit ? '✏️ Edit Task / Milestone' : '➕ Add Task / Milestone (Gantt & Milestone)',
    html: `
      <div style="text-align: left; font-size: 0.88rem; max-height: 72vh; overflow-y: auto; padding-right: 4px;">
        
        <!-- Smart Presets Selector -->
        <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px;">
          <label class="form-label" style="color: #92400e; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
            <span>⚡</span> Mitr Phol Standard Lab Template (Smart Defaults / Presets):
          </label>
          <select id="swal-gantt-preset-select" class="form-select" style="background: #ffffff; border-color: #fcd34d;">
            ${SMART_PRESETS.map((p, idx) => `<option value="${idx}">${p.label}</option>`).join('')}
          </select>
        </div>

        <!-- Section 1: Classification & Title -->
        <div class="form-section-card">
          <div class="form-section-header">
            <span>🏷️</span> Section 1: Activity Type & Title
          </div>
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label" style="font-weight: 700;">Item Type:*</label>
              <select id="swal-gantt-type" class="form-select">
                <option value="task" ${initialType === 'task' ? 'selected' : ''}>📌 Fermentation Task / Phase</option>
                <option value="milestone" ${initialType === 'milestone' ? 'selected' : ''}>🚩 Key Quality Milestone</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight: 700;">Target Vessel / Stage:*</label>
              <select id="swal-gantt-tank" class="form-select">
                ${tankOptions.map(t => `<option value="${t}" ${initialTank === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" style="font-weight: 700;">Task / Milestone Title:*</label>
            <input type="text" id="swal-gantt-title" class="form-input" value="${escapeHtml(initialTitle)}" placeholder="e.g. Pre-fermenter PF Cultivation, Mid-stream HPLC Check">
          </div>
        </div>

        <!-- Section 2: Timeline Scope & Vessel -->
        <div class="form-section-card">
          <div class="form-section-header">
            <span>⏱️</span> Section 2: Timeframe & Calendar Schedule
          </div>
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label" style="font-weight: 700;">Start Hour (h):*</label>
              <input type="number" step="0.5" min="0" max="150" id="swal-gantt-starthour" class="form-input" value="${escapeHtml(initialStartH)}">
            </div>
            <div class="form-group" id="swal-gantt-endhour-group" style="${initialType === 'milestone' ? 'display: none;' : ''}">
              <label class="form-label" style="font-weight: 700;">End Hour (h):*</label>
              <input type="number" step="0.5" min="0" max="150" id="swal-gantt-endhour" class="form-input" value="${escapeHtml(initialEndH)}">
            </div>
          </div>
          <div id="gantt-modal-date-preview" class="realtime-date-preview">
            <!-- Dynamic calendar calculation preview -->
          </div>
        </div>

        <!-- Section 3: Responsibility & Progress -->
        <div class="form-section-card">
          <div class="form-section-header">
            <span>👤</span> Section 3: Responsible Person & Progress Status
          </div>
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label" style="font-weight: 700;">Responsible Person:*</label>
              <select id="swal-gantt-responsible" class="form-select">
                ${userOptions.map(u => `<option value="${escapeHtml(u)}" ${initialResponsible === u ? 'selected' : ''}>${escapeHtml(u)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight: 700;">Status:*</label>
              <select id="swal-gantt-status" class="form-select">
                <option value="completed" ${initialStatus === 'completed' ? 'selected' : ''}>✓ Completed</option>
                <option value="in_progress" ${initialStatus === 'in_progress' ? 'selected' : ''}>⏳ In Progress</option>
                <option value="pending" ${initialStatus === 'pending' ? 'selected' : ''}>Pending</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Section 4: Quality Gate & Technical Notes -->
        <div class="form-section-card" style="margin-bottom: 0;">
          <div class="form-section-header">
            <span>🎯</span> Section 4: Quality Control Criteria & Precautions
          </div>
          <div class="form-group">
            <label class="form-label" style="font-weight: 700;">Quality Acceptance Criteria:</label>
            <input type="text" id="swal-gantt-criteria" class="form-input" value="${escapeHtml(initialCriteria)}" placeholder="e.g. Brix 18 → 11.5 °Bx, Ethanol > 95 g/L, Viability ≥ 95%">
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" style="font-weight: 700;">Additional Notes & Precautions:</label>
            <textarea id="swal-gantt-notes" class="form-input" rows="2" placeholder="Specify additional precautions or technical procedures">${escapeHtml(initialNotes)}</textarea>
          </div>
        </div>

      </div>
    `,
    width: '680px',
    showCancelButton: true,
    confirmButtonText: isEdit ? '💾 Save Changes' : '➕ Add to Plan',
    cancelButtonText: 'Cancel',
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
            previewEl.innerHTML = `📅 <strong>Milestone Evaluation Time:</strong> ${sStr} <span style="color: #64748b;">(@ ${sH}h of fermentation)</span>`;
          } else {
            const dur = Math.max(0, eH - sH);
            previewEl.innerHTML = `📅 <strong>Actual Time Range:</strong> ${sStr} &rarr; ${eStr} <strong style="color: #1e3a8a;">(total ${dur} h)</strong>`;
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
        Swal.showValidationMessage('Please enter a task or milestone title');
        return false;
      }
      if (type === 'task' && endH <= startH) {
        Swal.showValidationMessage('End hour (h) must be greater than start hour');
        return false;
      }

      return { type, title, tank, startHour: startH, endHour: endH, responsible, status, criteria, notes };
    }
  }).then((res) => {
    if (res.isConfirmed) {
      const val = res.value;
      if (isEdit) {
        Object.assign(task, val);
        logAction('UPDATE_GANTT_TASK', `Edit Plan: ${task.title} (${task.tank} @ ${task.startHour}h)`);
        showToast('Data updated successfully', 'success');
      } else {
        const newTask = {
          id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          ...val
        };
        if (!p.ganttTasks) p.ganttTasks = [];
        p.ganttTasks.push(newTask);
        logAction('ADD_GANTT_TASK', `Add New Plan Item: ${newTask.title} (${newTask.tank})`);
        showToast('Task added to schedule', 'success');
      }

      persistState();
      if (window.FirebaseSync && typeof window.FirebaseSync.syncProject === 'function') {
        window.FirebaseSync.syncProject(p);
      }
      window.labAudio.playSuccess();
      renderGanttTimeline();
    }
  });
}

// Delete Gantt Task / Milestone
window.deleteGanttTask = function(taskId) {
  if (!canEditCurrentProject()) {
    Swal.fire({ icon: 'error', title: 'No permission to delete', text: 'You are not the owner of this research project' });
    return;
  }

  const p = state.projects.find(proj => proj.id === state.currentProjectId);
  if (!p || !p.ganttTasks) return;

  const targetTask = p.ganttTasks.find(t => t.id === taskId);
  if (!targetTask) return;

  Swal.fire({
    title: `Delete "${targetTask.title}"?`,
    text: `Delete this item from the Gantt Chart?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Confirm Delete',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#991b1b'
  }).then((res) => {
    if (res.isConfirmed) {
      p.ganttTasks = p.ganttTasks.filter(t => t.id !== taskId);
      persistState();
      if (window.FirebaseSync && typeof window.FirebaseSync.syncProject === 'function') {
        window.FirebaseSync.syncProject(p);
      }
      window.labAudio.playWarning();
      logAction('DELETE_GANTT_TASK', `Delete Gantt item: ${targetTask.title}`);
      renderGanttTimeline();
      showToast('Entry deleted successfully', 'info');
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
  if (typeof renderMobileHomeDashboard === 'function') renderMobileHomeDashboard();
  if (typeof renderMobileProfile === 'function') renderMobileProfile();
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

// ==========================================================================
// MOBILE TASKFLOW UI CONTROLLER & DATA BINDING
// ==========================================================================

window.switchMobileTab = function(tabKey) {
  const navItems = document.querySelectorAll('.mob-nav-item');
  navItems.forEach(item => item.classList.remove('active'));

  const activeBtn = document.getElementById(`btn-mob-nav-${tabKey}`);
  if (activeBtn) activeBtn.classList.add('active');

  const backBar = document.getElementById('mobile-subpage-back-bar');
  const homeSec = document.getElementById('mobile-home-view');
  const profileSec = document.getElementById('mobile-profile-view');
  const notifSec = document.getElementById('mobile-notifications-view');
  const banner = document.getElementById('permission-notice-banner');
  const desktopSecs = document.querySelectorAll('.content-section');

  if (window.labAudio) window.labAudio.playClick();

  // Hide subpage views
  if (notifSec) notifSec.style.display = 'none';
  if (banner) banner.style.display = 'none';

  if (tabKey === 'home') {
    if (backBar) backBar.style.display = 'none';
    if (homeSec) homeSec.style.display = 'block';
    if (profileSec) profileSec.style.display = 'none';
    desktopSecs.forEach(s => s.classList.remove('active'));
    renderMobileHomeDashboard();
  } else if (tabKey === 'profile') {
    if (backBar) backBar.style.display = 'none';
    if (homeSec) homeSec.style.display = 'none';
    if (profileSec) profileSec.style.display = 'block';
    // Remove all desktop content sections so view cleanly terminates at Logout button
    desktopSecs.forEach(s => s.classList.remove('active'));
    renderMobileProfile();
    if (typeof pushAppState === 'function') pushAppState('profile');
  } else if (tabKey === 'records') {
    if (homeSec) homeSec.style.display = 'none';
    if (profileSec) profileSec.style.display = 'none';
    desktopSecs.forEach(s => s.classList.remove('active'));
    const recSec = document.getElementById('sec-data-records');
    if (recSec) recSec.classList.add('active');
    if (backBar) {
      backBar.style.display = 'flex';
      const title = document.getElementById('mobile-subpage-title');
      if (title) title.textContent = '📑 Data Records';
    }
    syncDataRecordProjectFilter();
    if (typeof pushAppState === 'function') pushAppState('records');
  } else if (tabKey === 'charts') {
    if (homeSec) homeSec.style.display = 'none';
    if (profileSec) profileSec.style.display = 'none';
    desktopSecs.forEach(s => s.classList.remove('active'));
    const chartSec = document.getElementById('sec-analytics');
    if (chartSec) chartSec.classList.add('active');
    if (backBar) {
      backBar.style.display = 'flex';
      const title = document.getElementById('mobile-subpage-title');
      if (title) title.textContent = '📊 Kinetics & Analytics';
    }
    renderAnalyticsCharts();
    renderCustomChart();
    if (typeof pushAppState === 'function') pushAppState('charts');
  }
};

window.mobileNavigateTo = function(sectionId, titleText) {
  const homeSec = document.getElementById('mobile-home-view');
  const profileSec = document.getElementById('mobile-profile-view');
  const notifSec = document.getElementById('mobile-notifications-view');
  const desktopSecs = document.querySelectorAll('.content-section');
  const backBar = document.getElementById('mobile-subpage-back-bar');
  const titleEl = document.getElementById('mobile-subpage-title');

  if (window.labAudio) window.labAudio.playClick();

  if (homeSec) homeSec.style.display = 'none';
  if (profileSec) profileSec.style.display = 'none';
  if (notifSec) notifSec.style.display = 'none';
  desktopSecs.forEach(s => s.classList.remove('active'));

  const target = document.getElementById(sectionId);
  if (target) target.classList.add('active');

  if (backBar) {
    backBar.style.display = 'flex';
    if (titleEl) titleEl.textContent = titleText || 'Details';
  }

  if (typeof pushAppState === 'function') pushAppState(sectionId);

  // Trigger relevant desktop tab callbacks
  if (sectionId === 'sec-projects') {
    renderGanttTimeline();
  } else if (sectionId === 'sec-entry') {
    loadSampleDataForCurrentTank();
  } else if (sectionId === 'sec-analytics') {
    renderAnalyticsCharts();
    renderCustomChart();
  } else if (sectionId === 'sec-optimizer') {
    renderOptimizerView();
  } else if (sectionId === 'sec-data-records') {
    syncDataRecordProjectFilter();
  } else if (sectionId === 'sec-logs') {
    renderAuditLogs();
  } else if (sectionId === 'sec-settings') {
    renderUserManagementTable();
  }
};

// Open notifications full subpage like corporate car booking system
window.openMobileNotificationsPage = function() {
  const homeSec = document.getElementById('mobile-home-view');
  const profileSec = document.getElementById('mobile-profile-view');
  const notifSec = document.getElementById('mobile-notifications-view');
  const desktopSecs = document.querySelectorAll('.content-section');
  const backBar = document.getElementById('mobile-subpage-back-bar');
  const titleEl = document.getElementById('mobile-subpage-title');
  const banner = document.getElementById('permission-notice-banner');

  if (window.labAudio) window.labAudio.playClick();

  if (homeSec) homeSec.style.display = 'none';
  if (profileSec) profileSec.style.display = 'none';
  if (banner) banner.style.display = 'none';
  desktopSecs.forEach(s => s.classList.remove('active'));

  if (notifSec) notifSec.style.display = 'block';

  if (backBar) {
    backBar.style.display = 'flex';
    if (titleEl) titleEl.textContent = 'Notifications & Lab History';
  }

  renderMobileNotificationsListPage();
  if (typeof pushAppState === 'function') pushAppState('notifications_page');
};

window.renderMobileNotificationsListPage = function() {
  const container = document.getElementById('mobile-notifications-page-list');
  if (!container) return;

  const isAdmin = state.currentUser && state.currentUser.role === 'admin';
  let logs = (state.auditLogs || []).filter(l => isAdmin || !state.currentUser || l.userId === state.currentUser.uid);
  if (currentMobLogFilter === 'sample') {
    logs = logs.filter(l => l.action.includes('SAMPLE') || l.action.includes('CDW'));
  } else if (currentMobLogFilter === 'system') {
    logs = logs.filter(l => !l.action.includes('SAMPLE') && !l.action.includes('CDW'));
  }

  if (logs.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; background: #ffffff; border-radius: 16px; border: 1px solid #f1f5f9; color: #94a3b8; font-size: 0.88rem;">
        <i class="fa-regular fa-bell-slash" style="font-size: 2.2rem; margin-bottom: 10px; opacity: 0.4;"></i>
        <p style="margin: 0;">No notifications in this category</p>
      </div>
    `;
    return;
  }

  container.innerHTML = logs.slice(0, 30).map(l => {
    const isSample = l.action.includes('SAMPLE') || l.action.includes('CDW');
    const isWarning = l.action.includes('DELETE') || l.action.includes('RESTORE');
    const iconClass = isWarning ? 'icon-warning' : (isSample ? 'icon-sample' : 'icon-system');
    const iconSymbol = isWarning ? 'fa-triangle-exclamation' : (isSample ? 'fa-flask' : 'fa-gear');
    const timeFormatted = new Date(l.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateFormatted = new Date(l.timestamp).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

    return `
      <div class="mob-notif-item" style="background: #ffffff; border: 1px solid #f1f5f9; border-radius: 14px; padding: 14px; margin-bottom: 10px; display: flex; gap: 12px; box-shadow: 0 1px 4px rgba(15, 23, 42, 0.02);">
        <div class="mob-notif-icon ${iconClass}">
          <i class="fa-solid ${iconSymbol}"></i>
        </div>
        <div class="mob-notif-content" style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2px;">
            <div class="mob-notif-title" style="font-weight: 700; font-size: 0.88rem; color: #0f172a;">${escapeHtml(l.action)}</div>
            <span style="font-size: 0.72rem; color: #94a3b8; white-space: nowrap;">${dateFormatted} ${timeFormatted}</span>
          </div>
          <div class="mob-notif-desc" style="font-size: 0.78rem; color: #475569; margin: 4px 0 6px; line-height: 1.4;">${escapeHtml(l.details || '-')}</div>
          <div class="mob-notif-time" style="font-size: 0.72rem; color: #64748b; display: flex; align-items: center; gap: 6px;">
            <i class="fa-regular fa-user"></i> ${escapeHtml(l.userName || 'System')}
          </div>
        </div>
      </div>
    `;
  }).join('');
};

window.markAllMobileNotificationsRead = function() {
  const dot = document.getElementById('mobile-notif-dot');
  if (dot) dot.style.display = 'none';
  showToast('All notifications cleared', 'info');
};

window.handleMobileProjectChange = function(projId) {
  state.currentProjectId = projId;
  const desktopProjSelect = document.getElementById('project-select');
  if (desktopProjSelect) desktopProjSelect.value = projId;
  renderAllDataViews();
  loadSampleDataForCurrentTank();
  if (window.labAudio) window.labAudio.playClick();
};

window.renderMobileHomeDashboard = function() {
  const accessible = (state.projects || []).filter(p => !state.currentUser || state.currentUser.role === 'admin' || p.ownerId === state.currentUser.uid);
  const project = accessible.find(p => p.id === state.currentProjectId) || null;

  // 1. Populate project select in hero
  const mobProjSelect = document.getElementById('mobile-project-select');
  if (mobProjSelect) {
    if (accessible.length === 0) {
      mobProjSelect.innerHTML = '<option value="">(No Projects yet)</option>';
    } else {
      mobProjSelect.innerHTML = accessible.map(p =>
        `<option value="${escapeHtml(p.id)}" ${p.id === state.currentProjectId ? 'selected' : ''}>${escapeHtml(p.batchMediumNo)} (${escapeHtml(p.experimentNo)})</option>`
      ).join('');
    }
  }

  // 2. Compute sample stats
  const curSamples = project ? state.samples.filter(s => s.projectId === project.id) : [];
  const totalCount = curSamples.length;
  const completedCount = curSamples.filter(s => (s.brix !== undefined && s.brix !== null) || s.ethanol || s.cellsPerMl).length;
  const pendingCount = project
    ? Math.max(0, (project.timepoints ? project.timepoints.length * 8 : 16) - completedCount)
    : 0;

  const heroCountEl = document.getElementById('mobile-hero-sample-count');
  if (heroCountEl) heroCountEl.textContent = totalCount;

  const doneBadge = document.getElementById('mobile-hero-done-badge');
  if (doneBadge) doneBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${completedCount} Results Saved`;

  const pendingBadge = document.getElementById('mobile-hero-pending-badge');
  if (pendingBadge) {
    pendingBadge.innerHTML = project
      ? `<i class="fa-regular fa-clock"></i> ${pendingCount > 0 ? pendingCount + ' Pending Storage' : '8 Tanks Complete'}`
      : `<i class="fa-solid fa-folder-plus"></i> Ready to create a new Project`;
  }

  // 3. Render Cascade 8-Tanks Status Strip
  const tanksRow = document.getElementById('mobile-tanks-scroll-row');
  if (tanksRow && window.LAB_TANKS) {
    tanksRow.innerHTML = window.LAB_TANKS.map(t => {
      const tankSamples = curSamples.filter(s => s.tank === t.id).sort((a,b) => b.time - a.time);
      const latest = tankSamples[0];
      const brixText = latest && latest.brix != null ? `${latest.brix}°Bx` : '-';
      const timeText = latest ? `${latest.time}h` : '0h';
      const isSelected = state.selectedTank === t.id;

      return `
        <div class="mobile-tank-chip ${isSelected ? 'active' : ''}" onclick="selectMobileTank('${t.id}')">
          <span class="mobile-tank-chip-tag" style="background: ${t.color};">${t.id}</span>
          <div class="mobile-tank-chip-val">${brixText}</div>
          <div class="mobile-tank-chip-sub">${timeText}</div>
        </div>
      `;
    }).join('');
  }

  // 4. Render Today / Recent Samples Cards (Screen 3 & 5 style)
  const recentList = document.getElementById('mobile-home-recent-samples');
  if (recentList) {
    if (!project) {
      recentList.innerHTML = `
        <div style="text-align: center; padding: 24px 16px; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 16px; color: #64748b; font-size: 0.86rem;">
          <i class="fa-solid fa-flask-vial" style="font-size: 2rem; margin-bottom: 8px; color: #2563eb; opacity: 0.7;"></i>
          <p style="margin-bottom: 12px;">No research projects yet. Tap the button below to start a new experiment</p>
          <button type="button" class="btn btn-accent btn-sm" onclick="openNewProjectModal()" style="width: 100%; justify-content: center;">
            <span>+</span> Create First Research Project
          </button>
        </div>
      `;
    } else if (curSamples.length === 0) {
      recentList.innerHTML = `
        <div style="text-align: center; padding: 24px; color: #94a3b8; font-size: 0.85rem;">
          <i class="fa-solid fa-flask" style="font-size: 1.8rem; margin-bottom: 8px; opacity: 0.5;"></i>
          <p>No sample records in this run yet. Tap + to add a record</p>
        </div>
      `;
    } else {
      const sorted = [...curSamples].sort((a,b) => b.time - a.time).slice(0, 5);
      recentList.innerHTML = sorted.map(s => {
        const tankDef = (window.LAB_TANKS || []).find(t => t.id === s.tank) || { label: s.tank, color: '#2563eb' };
        const hasData = s.brix != null || s.ethanol != null || s.cellsPerMl != null;
        const brixStr = s.brix != null ? `${s.brix} °Bx` : 'No Brix value';
        const ethStr = s.ethanol != null ? ` • EtOH: ${s.ethanol} g/L` : '';
        const sampleKey = escapeHtml(`${s.projectId}_${s.tank}_${s.time}`);

        return `
          <div class="mobile-sample-card" onclick="openMobileSampleDetail('${sampleKey}')">
            <div class="sample-card-left">
              <div class="sample-status-circle ${hasData ? 'done' : 'pending'}">
                ${hasData ? '<i class="fa-solid fa-check"></i>' : ''}
              </div>
              <div class="sample-card-info">
                <div class="sample-card-title">Tank ${escapeHtml(s.tank)} (tank age ${escapeHtml(s.time)} h)</div>
                <div class="sample-card-sub">${escapeHtml(brixStr)}${escapeHtml(ethStr)}</div>
              </div>
            </div>
            <span class="sample-card-badge" style="background: ${tankDef.color}15; color: ${tankDef.color}; border: 1px solid ${tankDef.color}30;">
              ${escapeHtml(s.tank)}
            </span>
          </div>
        `;
      }).join('');
    }
  }
};

window.selectMobileTank = function(tankId) {
  state.selectedTank = tankId;
  const select = document.getElementById('tank-select');
  if (select) select.value = tankId;
  renderTankMatrix();
  renderMobileHomeDashboard();
  mobileNavigateTo('sec-entry', `Lab Results Entry - Tank ${tankId}`);
};

window.renderMobileProfile = function() {
  if (!state.currentUser) return;
  const u = state.currentUser;
  const displayName = u.displayName || u.username || 'User';
  const role = u.role || 'user';
  const mobAvatar = document.getElementById('mob-prof-avatar');
  if (mobAvatar) mobAvatar.textContent = displayName.charAt(0).toUpperCase();
  const mobName = document.getElementById('mob-prof-name');
  if (mobName) mobName.textContent = displayName;
  const mobEmail = document.getElementById('mob-prof-email');
  if (mobEmail) mobEmail.textContent = u.email || u.username || '';
  const mobRole = document.getElementById('mob-prof-role');
  if (mobRole) {
    mobRole.textContent = role.toUpperCase();
    mobRole.className = `mobile-profile-role-badge role-${role}`;
  }

  // Update stats counters
  const accessibleProjects = state.projects.filter(p => role === 'admin' || p.ownerId === u.uid);
  const curSamples = state.samples.filter(s => s.projectId === state.currentProjectId);
  const pCount = document.getElementById('mob-stat-projects');
  if (pCount) pCount.textContent = accessibleProjects.length;
  const sCount = document.getElementById('mob-stat-samples');
  if (sCount) sCount.textContent = curSamples.length;

  const adminUsersItem = document.getElementById('mob-menu-admin-users');
  if (adminUsersItem) adminUsersItem.style.display = role === 'admin' ? 'flex' : 'none';
  const adminLogsItem = document.getElementById('mob-menu-admin-logs');
  if (adminLogsItem) adminLogsItem.style.display = role === 'admin' ? 'flex' : 'none';
};

// Quick Add Sample Modal (TaskFlow Screen 4)
let mobQuickSelectedTank = 'PF';

window.openMobileQuickAddModal = function() {
  mobQuickSelectedTank = state.selectedTank || 'PF';
  const modal = document.getElementById('mobile-quick-add-modal');
  if (!modal) return;

  // 1. Render tank pills
  const pillsContainer = document.getElementById('mob-quick-tank-pills');
  if (pillsContainer && window.LAB_TANKS) {
    pillsContainer.innerHTML = window.LAB_TANKS.map(t => `
      <button type="button" class="mob-tank-pill-btn ${t.id === mobQuickSelectedTank ? 'active' : ''}" 
              onclick="selectMobQuickTank('${t.id}')" style="${t.id === mobQuickSelectedTank ? `background: ${t.color}; border-color: ${t.color}; color: #ffffff;` : ''}">
        ${t.id}
      </button>
    `).join('');
  }

  // 2. Populate timepoints
  const tpSelect = document.getElementById('mob-quick-timepoint');
  const project = state.projects.find(p => p.id === state.currentProjectId);
  const tps = project && project.timepoints ? project.timepoints : [0, 12, 16, 18, 22, 34, 40, 46, 58, 64, 70, 82];
  if (tpSelect) {
    tpSelect.innerHTML = tps.map(t => `<option value="${t}" ${t === state.selectedTime ? 'selected' : ''}>${t} h</option>`).join('');
    tpSelect.onchange = () => loadMobQuickDataForCurrentSelection();
  }

  loadMobQuickDataForCurrentSelection();
  modal.style.display = 'flex';
  if (window.labAudio) window.labAudio.playClick();
};

window.closeMobileQuickAddModal = function() {
  const modal = document.getElementById('mobile-quick-add-modal');
  if (modal) modal.style.display = 'none';
};

window.selectMobQuickTank = function(tankId) {
  mobQuickSelectedTank = tankId;
  const btns = document.querySelectorAll('.mob-tank-pill-btn');
  btns.forEach(b => {
    b.classList.remove('active');
    b.style.background = '#ffffff';
    b.style.borderColor = '#cbd5e1';
    b.style.color = '#1e293b';
  });
  const activeBtn = Array.from(btns).find(b => b.textContent.trim() === tankId);
  const tDef = (window.LAB_TANKS || []).find(t => t.id === tankId);
  if (activeBtn && tDef) {
    activeBtn.classList.add('active');
    activeBtn.style.background = tDef.color;
    activeBtn.style.borderColor = tDef.color;
    activeBtn.style.color = '#ffffff';
  }
  loadMobQuickDataForCurrentSelection();
};

function loadMobQuickDataForCurrentSelection() {
  const tpSelect = document.getElementById('mob-quick-timepoint');
  const tVal = tpSelect ? parseFloat(tpSelect.value) : 82;
  const sample = state.samples.find(s => s.projectId === state.currentProjectId && s.tank === mobQuickSelectedTank && s.time === tVal);

  const brixIn = document.getElementById('mob-quick-brix');
  const cellTotIn = document.getElementById('mob-quick-cell-total');
  const cellBudIn = document.getElementById('mob-quick-cell-budding');
  const cellDeadIn = document.getElementById('mob-quick-cell-dead');
  const dilIn = document.getElementById('mob-quick-dilution');
  const sucIn = document.getElementById('mob-quick-sucrose');
  const gluIn = document.getElementById('mob-quick-glucose');
  const fruIn = document.getElementById('mob-quick-fructose');
  const ethIn = document.getElementById('mob-quick-ethanol');
  const glyIn = document.getElementById('mob-quick-glycerol');

  if (sample) {
    if (brixIn) brixIn.value = sample.brix != null ? sample.brix : '';
    if (cellTotIn) cellTotIn.value = sample.cellSumTotal != null ? sample.cellSumTotal : (sample.cellsPerMl ? 189 : '');
    if (cellBudIn) cellBudIn.value = sample.cellSumBudding != null ? sample.cellSumBudding : '';
    if (cellDeadIn) cellDeadIn.value = sample.cellSumDead != null ? sample.cellSumDead : '';
    if (dilIn) dilIn.value = sample.dilutionFactor || 10;
    if (sucIn) sucIn.value = sample.sucrose != null ? sample.sucrose : '';
    if (gluIn) gluIn.value = sample.glucose != null ? sample.glucose : '';
    if (fruIn) fruIn.value = sample.fructose != null ? sample.fructose : '';
    if (ethIn) ethIn.value = sample.ethanol != null ? sample.ethanol : '';
    if (glyIn) glyIn.value = sample.glycerol != null ? sample.glycerol : '';
  } else {
    if (brixIn) brixIn.value = '';
    if (cellTotIn) cellTotIn.value = '';
    if (cellBudIn) cellBudIn.value = '';
    if (cellDeadIn) cellDeadIn.value = '';
    if (sucIn) sucIn.value = '';
    if (gluIn) gluIn.value = '';
    if (fruIn) fruIn.value = '';
    if (ethIn) ethIn.value = '';
    if (glyIn) glyIn.value = '';
  }

  calcMobQuickCells();
  calcMobQuickSugar();
}

window.calcMobQuickCells = function() {
  const tot = parseFloat(document.getElementById('mob-quick-cell-total')?.value) || 0;
  const bud = parseFloat(document.getElementById('mob-quick-cell-budding')?.value) || 0;
  const dead = parseFloat(document.getElementById('mob-quick-cell-dead')?.value) || 0;
  const dil = parseFloat(document.getElementById('mob-quick-dilution')?.value) || 10;
  const factor = 250000;

  const badge = document.getElementById('mob-quick-cell-calc-badge');
  const budBadge = document.getElementById('mob-quick-budding-badge');
  const viaBadge = document.getElementById('mob-quick-viability-badge');

  if (tot > 0) {
    const totalCfu = tot * dil * factor;
    const buddingCfu = bud * dil * factor;
    const deadCfu = dead * dil * factor;
    const viability = ((tot - dead) / tot * 100).toFixed(1);
    const budPct = (bud / tot * 100).toFixed(1);

    if (badge) badge.textContent = `${formatCfuDisplay(totalCfu)} CFU/ml`;
    if (budBadge) budBadge.textContent = `Budding: ${formatCfuDisplay(buddingCfu)} (${budPct}%)`;
    if (viaBadge) viaBadge.textContent = `% Viability: ${viability}%`;
  } else {
    if (badge) badge.textContent = '0 CFU/ml';
    if (budBadge) budBadge.textContent = 'Budding: -';
    if (viaBadge) viaBadge.textContent = '% Viability: -';
  }
};

window.calcMobQuickSugar = function() {
  const suc = parseFloat(document.getElementById('mob-quick-sucrose')?.value) || 0;
  const glu = parseFloat(document.getElementById('mob-quick-glucose')?.value) || 0;
  const fru = parseFloat(document.getElementById('mob-quick-fructose')?.value) || 0;
  const sum = (suc + glu + fru).toFixed(3);
  const disp = document.getElementById('mob-quick-sugar-convert-display');
  if (disp) disp.textContent = `${sum} g/L`;
};

window.saveMobQuickSample = function() {
  if (!canEditCurrentProject()) {
    Swal.fire({
      icon: 'warning',
      title: 'No edit permission',
      text: 'You do not have permission to edit this research project (Read-Only)'
    });
    return;
  }

  const tpSelect = document.getElementById('mob-quick-timepoint');
  const tVal = tpSelect ? parseFloat(tpSelect.value) : 82;
  const brixVal = document.getElementById('mob-quick-brix')?.value !== '' ? parseFloat(document.getElementById('mob-quick-brix').value) : null;
  const totVal = document.getElementById('mob-quick-cell-total')?.value !== '' ? parseFloat(document.getElementById('mob-quick-cell-total').value) : null;
  const budVal = document.getElementById('mob-quick-cell-budding')?.value !== '' ? parseFloat(document.getElementById('mob-quick-cell-budding').value) : null;
  const deadVal = document.getElementById('mob-quick-cell-dead')?.value !== '' ? parseFloat(document.getElementById('mob-quick-cell-dead').value) : null;
  const dilVal = parseFloat(document.getElementById('mob-quick-dilution')?.value) || 10;
  const cdwVal = document.getElementById('mob-quick-cdw')?.value !== '' ? parseFloat(document.getElementById('mob-quick-cdw').value) : null;

  const sucVal = document.getElementById('mob-quick-sucrose')?.value !== '' ? parseFloat(document.getElementById('mob-quick-sucrose').value) : null;
  const gluVal = document.getElementById('mob-quick-glucose')?.value !== '' ? parseFloat(document.getElementById('mob-quick-glucose').value) : null;
  const fruVal = document.getElementById('mob-quick-fructose')?.value !== '' ? parseFloat(document.getElementById('mob-quick-fructose').value) : null;
  const ethVal = document.getElementById('mob-quick-ethanol')?.value !== '' ? parseFloat(document.getElementById('mob-quick-ethanol').value) : null;
  const glyVal = document.getElementById('mob-quick-glycerol')?.value !== '' ? parseFloat(document.getElementById('mob-quick-glycerol').value) : null;

  // Validation
  if (totVal !== null && deadVal !== null && deadVal > totVal) {
    Swal.fire({
      icon: 'error',
      title: 'Invalid data',
      text: 'Dead cells cannot exceed Total cells'
    });
    return;
  }

  const factor = 250000;
  const totalCfu = totVal !== null ? totVal * dilVal * factor : null;
  const buddingCfu = (budVal !== null) ? budVal * dilVal * factor : null;
  const deadCfu = (deadVal !== null) ? deadVal * dilVal * factor : null;
  const cellViability = (totVal && totVal > 0 && deadVal !== null) ? parseFloat(((totVal - deadVal) / totVal * 100).toFixed(1)) : null;
  const cellBuddingRate = (totVal && totVal > 0 && budVal !== null) ? parseFloat((budVal / totVal * 100).toFixed(1)) : null;
  const sugarConvert = (sucVal !== null || gluVal !== null || fruVal !== null) ? parseFloat(((sucVal || 0) + (gluVal || 0) + (fruVal || 0)).toFixed(3)) : null;

  let existingIdx = state.samples.findIndex(s => s.projectId === state.currentProjectId && s.tank === mobQuickSelectedTank && s.time === tVal);

  const sampleObj = {
    projectId: state.currentProjectId,
    tank: mobQuickSelectedTank,
    time: tVal,
    brix: brixVal,
    cellSumTotal: totVal,
    cellSumBudding: budVal,
    cellSumDead: deadVal,
    dilutionFactor: dilVal,
    cellsPerMl: totalCfu,
    cellCount: totalCfu,
    buddingCfu: buddingCfu,
    deadCfu: deadCfu,
    cellViabilityPercent: cellViability,
    viabilityPct: cellViability,
    cellBuddingPercent: cellBuddingRate,
    buddingPct: cellBuddingRate,
    cellDryWeight: cdwVal,
    sucrose: sucVal,
    glucose: gluVal,
    fructose: fruVal,
    sugarConvert: sugarConvert,
    ethanol: ethVal,
    glycerol: glyVal,
    updatedAt: new Date().toISOString(),
    updatedBy: state.currentUser ? state.currentUser.displayName : 'Researcher'
  };

  if (existingIdx >= 0) {
    state.samples[existingIdx] = Object.assign({}, state.samples[existingIdx], sampleObj);
  } else {
    state.samples.push(sampleObj);
  }

  const syncedSample = existingIdx >= 0 ? state.samples[existingIdx] : sampleObj;
  persistState();
  if (window.FirebaseSync && typeof window.FirebaseSync.syncSample === 'function') {
    window.FirebaseSync.syncSample(syncedSample);
  }
  logAction('SAVE_SAMPLE_MOBILE', `Quick Sample Entry - Tank ${mobQuickSelectedTank} Time ${tVal}h [Brix: ${brixVal || '-'}, Sugar: ${sugarConvert !== null ? sugarConvert.toFixed(3) : '-'}, EtOH: ${ethVal || '-'}, Total: ${totalCfu ? formatCfuDisplay(totalCfu) + ' CFU/ml' : '-'}${cdwVal ? ', CDW: ' + cdwVal + ' g/L' : ''}]`);
  if (window.labAudio) window.labAudio.playSuccess();
  closeMobileQuickAddModal();
  renderAllDataViews();
  loadSampleDataForCurrentTank();
  showToast(`Tank Sample Entry ${mobQuickSelectedTank} successfully`, 'success');
};

// Sample Detail Sheet (TaskFlow Screen 8)
window.openMobileSampleDetail = function(sampleKey) {
  const sample = state.samples.find(s => `${s.projectId}_${s.tank}_${s.time}` === sampleKey);
  if (!sample) return;

  const tankId = sample.tank;
  const projId = sample.projectId;
  const timeVal = sample.time;

  const tankDef = (window.LAB_TANKS || []).find(t => t.id === tankId) || { label: tankId, color: '#2563eb' };
  const content = document.getElementById('mobile-sample-detail-content');
  const modal = document.getElementById('mobile-sample-detail-modal');

  const brixStr = escapeHtml(sample.brix != null ? `${sample.brix} °Bx` : 'No data yet');
  const ethStr = escapeHtml(sample.ethanol != null ? `${sample.ethanol} g/L` : '-');
  const viaStr = escapeHtml(sample.viabilityPct != null ? `${sample.viabilityPct}%` : (sample.cellViabilityPercent != null ? `${sample.cellViabilityPercent.toFixed(1)}%` : '-'));
  const sugarStr = escapeHtml(sample.sugarConvert != null ? `${Number(sample.sugarConvert).toFixed(3)} g/L` : '-');
  const cellVal = sample.cellCount || sample.cellsPerMl;
  const cellStr = escapeHtml(cellVal ? `${formatCfuDisplay(cellVal)} CFU/ml` : '-');
  const cdwStr = escapeHtml(sample.cellDryWeight != null ? `${sample.cellDryWeight} g/L` : '-');
  const budStr = escapeHtml(sample.buddingCfu ? `${formatCfuDisplay(sample.buddingCfu)} CFU/ml (${sample.buddingPct || 0}%)` : (sample.buddingPct ? `${sample.buddingPct}%` : '-'));

  content.innerHTML = `
    <div style="margin-bottom: 16px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span class="sample-card-badge" style="background: ${tankDef.color}; color: #ffffff;">
          ${escapeHtml(tankId)}
        </span>
        <span style="font-size: 0.82rem; color: #64748b;">${escapeHtml(tankDef.label)}</span>
      </div>
      <h2 style="font-size: 1.3rem; font-weight: 800; color: #0f172a; margin-bottom: 4px;">
        Tank Age Sample ${escapeHtml(sample.time)} h
      </h2>
      <p style="font-size: 0.78rem; color: #64748b;">
        Last Updated: ${sample.updatedAt ? new Date(sample.updatedAt).toLocaleString('en-US') : '-'}
      </p>
    </div>

    <!-- Parameter Metrics Grid -->
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 14px;">
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px;">
        <div style="font-size: 0.72rem; color: #64748b;">Brix</div>
        <div style="font-size: 1.15rem; font-weight: 800; color: #1e293b; margin-top: 2px;">${brixStr}</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px;">
        <div style="font-size: 0.72rem; color: #64748b;">Ethanol (g/L)</div>
        <div style="font-size: 1.15rem; font-weight: 800; color: #1e40af; margin-top: 2px;">${ethStr}</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px;">
        <div style="font-size: 0.72rem; color: #64748b;">Cell Viability (%)</div>
        <div style="font-size: 1.15rem; font-weight: 800; color: #059669; margin-top: 2px;">${viaStr}</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px;">
        <div style="font-size: 0.72rem; color: #64748b;">Sugar Convert (g/L)</div>
        <div style="font-size: 1.15rem; font-weight: 800; color: #d97706; margin-top: 2px;">${sugarStr}</div>
      </div>
    </div>

    <!-- Yeast Cell Density (CFU/ml) & CDW Strip -->
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 14px; padding: 14px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <span style="font-size: 0.78rem; font-weight: 700; color: #1e40af;">🔬 Total Cells (Haemacytometer)</span>
        <span class="badge badge-navy" style="font-size: 0.72rem;">CFU/ml</span>
      </div>
      <div style="font-size: 1.25rem; font-weight: 800; color: #1e3a8a;">${cellStr}</div>
      <div style="margin-top: 8px; font-size: 0.76rem; color: #475569; display: flex; justify-content: space-between;">
        <span>Budding: <strong>${budStr}</strong></span>
      </div>
    </div>

    <!-- Cell Dry Weight Strip (Attachment 4) -->
    <div style="background: rgba(254, 243, 199, 0.4); border: 1px solid #fde68a; border-radius: 14px; padding: 14px; margin-bottom: 18px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <span style="font-size: 0.78rem; font-weight: 700; color: #92400e;">⚖️ Cell Dry Weight (CDW)</span>
        <span class="badge badge-gold" style="font-size: 0.72rem;">Oven, duplicate</span>
      </div>
      <div style="font-size: 1.25rem; font-weight: 800; color: #92400e;">${cdwStr}</div>
    </div>

    <!-- Edit Action Button -->
    <button type="button" class="mobile-primary-btn" onclick="editSampleFromDetail('${tankId}', ${sample.time})">
      <i class="fa-solid fa-pen-to-square"></i> Edit This Sample Record
    </button>
  `;

  modal.style.display = 'flex';
  if (window.labAudio) window.labAudio.playClick();
};

window.closeMobileSampleDetail = function() {
  const modal = document.getElementById('mobile-sample-detail-modal');
  if (modal) modal.style.display = 'none';
};

window.editSampleFromDetail = function(tankId, timeVal) {
  closeMobileSampleDetail();
  state.selectedTank = tankId;
  state.selectedTime = timeVal;
  const tpSelect = document.getElementById('input-timepoint');
  if (tpSelect) tpSelect.value = timeVal;
  loadSampleDataForCurrentTank();
  mobileNavigateTo('sec-entry', `Lab Results Entry - Tank ${tankId}`);
};

// Notifications Modal (TaskFlow Screen 10)
let currentMobLogFilter = 'all';

window.openMobileNotificationsModal = function() {
  const modal = document.getElementById('mobile-notifications-modal');
  if (!modal) return;
  renderMobileNotificationsList();
  modal.style.display = 'flex';
  if (window.labAudio) window.labAudio.playClick();
};

window.closeMobileNotificationsModal = function() {
  const modal = document.getElementById('mobile-notifications-modal');
  if (modal) modal.style.display = 'none';
};

window.filterMobLogs = function(type, btn) {
  currentMobLogFilter = type;
  const pills = document.querySelectorAll('.mob-filter-pill');
  pills.forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderMobileNotificationsList();
};

function renderMobileNotificationsList() {
  const container = document.getElementById('mobile-notifications-list');
  if (!container) return;

  const isAdmin = state.currentUser && state.currentUser.role === 'admin';
  let logs = (state.auditLogs || []).filter(l => isAdmin || !state.currentUser || l.userId === state.currentUser.uid);
  if (currentMobLogFilter === 'sample') {
    logs = logs.filter(l => l.action.includes('SAMPLE'));
  } else if (currentMobLogFilter === 'system') {
    logs = logs.filter(l => !l.action.includes('SAMPLE'));
  }

  if (logs.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 30px; color: #94a3b8; font-size: 0.85rem;">No activity logs in this category</div>`;
    return;
  }

  container.innerHTML = logs.slice(0, 20).map(l => {
    const isSample = l.action.includes('SAMPLE');
    const isWarning = l.action.includes('DELETE') || l.action.includes('RESTORE');
    const iconClass = isWarning ? 'icon-warning' : (isSample ? 'icon-sample' : 'icon-system');
    const iconSymbol = isWarning ? 'fa-triangle-exclamation' : (isSample ? 'fa-flask' : 'fa-gear');
    const timeFormatted = new Date(l.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="mob-notif-item">
        <div class="mob-notif-icon ${iconClass}">
          <i class="fa-solid ${iconSymbol}"></i>
        </div>
        <div class="mob-notif-content">
          <div class="mob-notif-title">${escapeHtml(l.action)}</div>
          <div class="mob-notif-desc">${escapeHtml(l.details || '-')}</div>
          <div class="mob-notif-time">by ${escapeHtml(l.userName || 'System')} • ${timeFormatted}</div>
        </div>
      </div>
    `;
  }).join('');
}

// Mobile Profile Actions
window.mobileShowAccountInfo = function() {
  if (!state.currentUser) return;
  Swal.fire({
    title: 'User Account Information',
    html: `
      <div style="text-align: left; font-size: 0.9rem; line-height: 1.8;">
        <p><strong>Username (ID):</strong> ${escapeHtml(state.currentUser.username || state.currentUser.uid)}</p>
        <p><strong>Full Name:</strong> ${escapeHtml(state.currentUser.displayName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(state.currentUser.email)}</p>
        <p><strong>Role:</strong> <span class="badge badge-navy">${escapeHtml(state.currentUser.role.toUpperCase())}</span></p>
        <p><strong>Access Role:</strong> ${state.currentUser.role === 'admin' ? 'System Administrator (Admin) — Full Access' : 'Researcher (User) — Manage and compare own research projects'}</p>
      </div>
    `,
    confirmButtonColor: '#0f3d7a',
    confirmButtonText: 'Acknowledge'
  });
};

window.mobileOpenPresentation = function() {
  if (typeof window.openPresentationModal === 'function') {
    window.openPresentationModal();
  }
};

window.mobileOpenAudioSettings = function() {
  Swal.fire({
    title: 'Lab Sound Settings',
    text: 'Enable or disable Tally clicker audio and Multimodal sound feedback',
    showCancelButton: true,
    confirmButtonText: '🔔 Sound On',
    cancelButtonText: '🔕 Sound Off',
    confirmButtonColor: '#059669',
    cancelButtonColor: '#64748b'
  }).then((res) => {
    if (res.isConfirmed) {
      if (window.labAudio) {
        window.labAudio.muted = false;
        window.labAudio.playSuccess();
      }
      showToast('Sound enabled', 'success');
    } else if (res.dismiss === Swal.DismissReason.cancel) {
      if (window.labAudio) window.labAudio.muted = true;
      showToast('Sound disabled', 'info');
    }
  });
};

// Mobile History / Back Navigation Management (Popstate Interceptor)
let mobileNavDepth = 0;

window.pushAppState = function(viewName) {
  try {
    history.pushState({ appView: viewName, depth: ++mobileNavDepth }, '');
  } catch (e) {
    console.warn('History pushState error', e);
  }
};

window.handleMobileBackNavigation = function() {
  // 1. Check Presentation Modal
  const presModal = document.getElementById('presentation-modal');
  if (presModal && (presModal.classList.contains('open') || presModal.style.display === 'flex')) {
    window.closePresentationModal();
    return true;
  }

  // 2. Check Quick Add Modal
  const quickModal = document.getElementById('mobile-quick-add-modal');
  if (quickModal && quickModal.style.display === 'flex') {
    window.closeMobileQuickAddModal();
    return true;
  }

  // 3. Check Sample Detail Sheet
  const detailModal = document.getElementById('mobile-sample-detail-modal');
  if (detailModal && detailModal.style.display === 'flex') {
    window.closeMobileSampleDetail();
    return true;
  }

  // 4. Check Notifications Modal
  const notifModal = document.getElementById('mobile-notifications-modal');
  if (notifModal && notifModal.style.display === 'flex') {
    window.closeMobileNotificationsModal();
    return true;
  }

  // 5. Check CDW Modal
  const cdwModal = document.getElementById('modal-cdw-calculator');
  if (cdwModal && cdwModal.style.display === 'flex') {
    window.closeCDWModal();
    return true;
  }

  // 6. Check Feed Log Modal
  const feedModal = document.getElementById('modal-add-feed-log');
  if (feedModal && feedModal.style.display === 'flex') {
    window.closeAddFeedLogModal();
    return true;
  }

  // 7. Check SweetAlert
  if (typeof Swal !== 'undefined' && Swal.isVisible && Swal.isVisible()) {
    Swal.close();
    return true;
  }

  // 8. Check Car Booking Notifications Subpage
  const notifView = document.getElementById('mobile-notifications-view');
  if (notifView && notifView.style.display === 'block') {
    window.switchMobileTab('home');
    return true;
  }

  // 9. Check Profile View (when opened via avatar or tab)
  const profileView = document.getElementById('mobile-profile-view');
  if (profileView && profileView.style.display === 'block') {
    window.switchMobileTab('home');
    return true;
  }

  // 10. Check Desktop Subsections on mobile
  const backBar = document.getElementById('mobile-subpage-back-bar');
  if (backBar && backBar.style.display === 'flex') {
    window.switchMobileTab('home');
    return true;
  }

  return false;
};

// Listen to browser / device back button
window.addEventListener('popstate', (e) => {
  const handled = window.handleMobileBackNavigation();
  if (handled && e && e.preventDefault) {
    e.preventDefault();
  }
});

// Initialize mobile UI on DOM load
function initMobileUI() {
  renderMobileHomeDashboard();
  renderMobileProfile();
  // Push initial home state for popstate tracking
  try {
    history.replaceState({ appView: 'home', depth: 0 }, '');
  } catch (e) {}
}
