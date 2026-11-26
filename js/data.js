/**
 * Mitr Phol Fermentation Lab Tracker - Seed Data & Default State
 * Clean production initialization.
 */

window.LAB_TANKS = [
  { id: 'PF', label: 'PF (ถังเพาะเชื้อ)', color: '#1E3A8A', desc: 'Pre-fermenter 1' },
  { id: 'F2', label: 'F2 (ถังหมัก 2)', color: '#EA580C', desc: 'Cascade Stage 1' },
  { id: 'F3', label: 'F3 (ถังหมัก 3)', color: '#059669', desc: 'Cascade Stage 2' },
  { id: 'F4', label: 'F4 (ถังหมัก 4)', color: '#0891B2', desc: 'Cascade Stage 3' },
  { id: 'F5', label: 'F5 (ถังหมัก 5)', color: '#7C3AED', desc: 'Cascade Stage 4' },
  { id: 'F6', label: 'F6 (ถังหมัก 6)', color: '#65A30D', desc: 'Cascade Stage 5' },
  { id: 'F7', label: 'F7 (ถังหมัก 7)', color: '#E11D48', desc: 'Cascade Stage 6' },
  { id: 'D3', label: 'D3 (Duran 3)', color: '#92400E', desc: 'Final Harvesting Vessel' }
];

window.INITIAL_USERS = [
  {
    uid: 'usr_admin',
    username: 'admin',
    email: 'admin@mitrphol.com',
    password: 'admin321',
    passwordHash: '921443c5e72aac9f10321d52f095edd5ed04ab8deeca8cd0eb425ad46c135c14',
    displayName: 'Admin (ผู้ดูแลระบบ)',
    role: 'admin'
  },
  {
    uid: 'usr_user',
    username: 'user',
    email: 'user@mitrphol.com',
    password: 'user123',
    passwordHash: 'e606e38b0d8c19b24cf0ee3808183162ea7cd63ff7912dbb22b5e803286b4446',
    displayName: 'User (นักวิจัย)',
    role: 'user'
  }
];

// Clean initial collections
window.INITIAL_PROJECTS = [];
window.INITIAL_TIMEPOINTS = [0, 12, 16, 18, 22, 34, 40, 46, 58, 64, 70, 82];
window.SEED_SAMPLES_220326 = [];
window.CROSS_CONDITIONS_SUMMARY = [];
window.INITIAL_LOGS = [];
