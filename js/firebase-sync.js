/**
 * Mitr Phol Fermentation Lab Tracker - Firebase Cloud Firestore Sync Engine
 * Project: mpir-fermentlog
 * Supports Firebase Web SDK (v10 compat) with automatic Firestore REST API fallback
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBlqETozwm0Zb44XKWsnWSviVjpuC8SV4s",
  authDomain: "mpir-fermentlog.firebaseapp.com",
  projectId: "mpir-fermentlog",
  storageBucket: "mpir-fermentlog.firebasestorage.app",
  messagingSenderId: "1054889597811",
  appId: "1:1054889597811:web:4b549b93c00f1c7ac18306"
};

const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

window.FirebaseSync = {
  initialized: false,
  isOnline: false,
  sdkAvailable: false,
  db: null,

  async init() {
    try {
      if (typeof firebase !== 'undefined' && firebase.initializeApp) {
        if (!firebase.apps || !firebase.apps.length) {
          firebase.initializeApp(FIREBASE_CONFIG);
        }
        this.db = firebase.firestore();
        this.sdkAvailable = true;
        this.isOnline = true;
        console.log('[FirebaseSync] Firebase SDK initialized successfully');
      } else {
        console.log('[FirebaseSync] Firebase SDK not loaded, using direct Firestore REST API');
      }
      this.initialized = true;
      this.updateConnectionBadge('connected');
      
      // Auto-sync remote data on startup
      await this.pullFromCloud();
    } catch (err) {
      console.warn('[FirebaseSync] Initialization warning, fallback to REST:', err);
      this.initialized = true;
      this.updateConnectionBadge('fallback');
    }
  },

  updateConnectionBadge(status) {
    const badge = document.getElementById('firebase-status-badge');
    if (!badge) return;
    if (status === 'connected') {
      badge.className = 'badge badge-green';
      badge.innerHTML = '<i class="fa-solid fa-cloud" style="margin-right: 4px;"></i> Firebase Cloud: เชื่อมต่อสำเร็จ (mpir-fermentlog)';
    } else if (status === 'syncing') {
      badge.className = 'badge badge-orange';
      badge.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin" style="margin-right: 4px;"></i> กำลังบันทึกขึ้น Cloud...';
    } else if (status === 'fallback') {
      badge.className = 'badge badge-cyan';
      badge.innerHTML = '<i class="fa-solid fa-cloud-arrow-up" style="margin-right: 4px;"></i> Firebase Cloud REST Online';
    } else {
      badge.className = 'badge badge-gray';
      badge.innerHTML = '<i class="fa-solid fa-cloud-slash" style="margin-right: 4px;"></i> ออฟไลน์ (บันทึกใน Local Storage)';
    }
  },

  // Convert JS object to Firestore REST document field format
  toFirestoreFields(obj) {
    const fields = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val === null || val === undefined) {
        fields[key] = { nullValue: null };
      } else if (typeof val === 'string') {
        fields[key] = { stringValue: val };
      } else if (typeof val === 'boolean') {
        fields[key] = { booleanValue: val };
      } else if (typeof val === 'number') {
        if (Number.isInteger(val)) {
          fields[key] = { integerValue: val.toString() };
        } else {
          fields[key] = { doubleValue: val };
        }
      } else if (Array.isArray(val)) {
        fields[key] = {
          arrayValue: {
            values: val.map(v => {
              if (typeof v === 'string') return { stringValue: v };
              if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: v.toString() } : { doubleValue: v };
              if (typeof v === 'boolean') return { booleanValue: v };
              if (typeof v === 'object' && v !== null) return { mapValue: { fields: this.toFirestoreFields(v) } };
              return { nullValue: null };
            })
          }
        };
      } else if (typeof val === 'object') {
        fields[key] = { mapValue: { fields: this.toFirestoreFields(val) } };
      }
    }
    return fields;
  },

  // Convert Firestore REST document fields to standard JS object
  fromFirestoreFields(fields) {
    if (!fields) return {};
    const obj = {};
    for (const key of Object.keys(fields)) {
      const valObj = fields[key];
      if ('stringValue' in valObj) obj[key] = valObj.stringValue;
      else if ('booleanValue' in valObj) obj[key] = valObj.booleanValue;
      else if ('integerValue' in valObj) obj[key] = parseInt(valObj.integerValue, 10);
      else if ('doubleValue' in valObj) obj[key] = parseFloat(valObj.doubleValue);
      else if ('nullValue' in valObj) obj[key] = null;
      else if ('arrayValue' in valObj) {
        obj[key] = (valObj.arrayValue.values || []).map(v => {
          if ('stringValue' in v) return v.stringValue;
          if ('integerValue' in v) return parseInt(v.integerValue, 10);
          if ('doubleValue' in v) return parseFloat(v.doubleValue);
          if ('booleanValue' in v) return v.booleanValue;
          if ('mapValue' in v) return this.fromFirestoreFields(v.mapValue.fields);
          return null;
        });
      } else if ('mapValue' in valObj) {
        obj[key] = this.fromFirestoreFields(valObj.mapValue.fields);
      }
    }
    return obj;
  },

  // Save document
  async saveDoc(collection, docId, data) {
    this.updateConnectionBadge('syncing');
    try {
      if (this.sdkAvailable && this.db) {
        await this.db.collection(collection).doc(docId).set(data, { merge: true });
        this.updateConnectionBadge('connected');
        return true;
      }
      // REST API Fallback
      const url = `${FIRESTORE_REST_BASE}/${collection}/${encodeURIComponent(docId)}?key=${FIREBASE_CONFIG.apiKey}`;
      const payload = { fields: this.toFirestoreFields(data) };
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      this.updateConnectionBadge('connected');
      return res.ok;
    } catch (e) {
      console.warn(`[FirebaseSync] Error saving doc ${collection}/${docId}:`, e);
      this.updateConnectionBadge('connected');
      return false;
    }
  },

  // Delete document
  async deleteDoc(collection, docId) {
    this.updateConnectionBadge('syncing');
    try {
      if (this.sdkAvailable && this.db) {
        await this.db.collection(collection).doc(docId).delete();
        this.updateConnectionBadge('connected');
        return true;
      }
      const url = `${FIRESTORE_REST_BASE}/${collection}/${encodeURIComponent(docId)}?key=${FIREBASE_CONFIG.apiKey}`;
      const res = await fetch(url, { method: 'DELETE' });
      this.updateConnectionBadge('connected');
      return res.ok;
    } catch (e) {
      console.warn(`[FirebaseSync] Error deleting doc ${collection}/${docId}:`, e);
      this.updateConnectionBadge('connected');
      return false;
    }
  },

  // Fetch all documents from a collection
  async getCollection(collection) {
    try {
      if (this.sdkAvailable && this.db) {
        const snap = await this.db.collection(collection).get();
        return snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      }
      const url = `${FIRESTORE_REST_BASE}/${collection}?key=${FIREBASE_CONFIG.apiKey}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const json = await res.json();
      if (!json.documents) return [];
      return json.documents.map(d => {
        const docId = d.name.split('/').pop();
        const data = this.fromFirestoreFields(d.fields);
        if (!data.id) data.id = docId;
        return data;
      });
    } catch (e) {
      console.warn(`[FirebaseSync] Error fetching collection ${collection}:`, e);
      return [];
    }
  },

  // Pull remote data from Cloud Firestore into state
  async pullFromCloud() {
    try {
      const [remoteProjects, remoteSamples, remoteLogs, remoteUsers] = await Promise.all([
        this.getCollection('projects'),
        this.getCollection('samples'),
        this.getCollection('logs'),
        this.getCollection('users')
      ]);

      if (remoteProjects && remoteProjects.length > 0) {
        state.projects = remoteProjects;
        localStorage.setItem('mitr_projects', JSON.stringify(state.projects));
      }
      if (remoteSamples && remoteSamples.length > 0) {
        state.samples = remoteSamples;
        localStorage.setItem('mitr_samples', JSON.stringify(state.samples));
      }
      if (remoteLogs && remoteLogs.length > 0) {
        state.auditLogs = remoteLogs;
        localStorage.setItem('mitr_logs', JSON.stringify(state.auditLogs));
      }
      if (remoteUsers && remoteUsers.length > 0) {
        // Ensure initial accounts admin and user are always present
        const mergedUsers = [...window.INITIAL_USERS];
        remoteUsers.forEach(ru => {
          if (!mergedUsers.some(u => u.uid === ru.uid || u.username === ru.username)) {
            mergedUsers.push(ru);
          }
        });
        state.users = mergedUsers;
        localStorage.setItem('mitr_users', JSON.stringify(state.users));
      }

      console.log(`[FirebaseSync] Pulled from Cloud: ${state.projects.length} projects, ${state.samples.length} samples, ${state.auditLogs.length} logs`);
    } catch (e) {
      console.warn('[FirebaseSync] Pull failed:', e);
    }
  },

  // Explicit sync helpers
  async syncProject(p) {
    if (!p || !p.id) return;
    return await this.saveDoc('projects', p.id, p);
  },

  async removeProject(projectId) {
    if (!projectId) return;
    return await this.deleteDoc('projects', projectId);
  },

  async syncSample(s) {
    if (!s) return;
    const docId = `${s.projectId || 'proj'}_${s.tank}_${s.time}`;
    return await this.saveDoc('samples', docId, s);
  },

  async removeSample(projectId, tank, time) {
    const docId = `${projectId || 'proj'}_${tank}_${time}`;
    return await this.deleteDoc('samples', docId);
  },

  async syncLog(logEntry) {
    if (!logEntry || !logEntry.id) return;
    return await this.saveDoc('logs', logEntry.id, logEntry);
  },

  async removeLog(logId) {
    if (!logId) return;
    return await this.deleteDoc('logs', logId);
  },

  async syncUser(u) {
    if (!u || !u.uid) return;
    return await this.saveDoc('users', u.uid, u);
  },

  async removeUser(uid) {
    if (!uid) return;
    return await this.deleteDoc('users', uid);
  }
};

