/**
 * Mitr Phol Fermentation Lab Tracker - Seed Data & Default State
 * Grounded in historical laboratory data from Attachments 1, 2, 3, and 4.
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
    uid: 'usr_01',
    email: 'somchai.r@mitrphol.com',
    password: 'password123',
    displayName: 'ดร.สมชาย นักวิจัย (เจ้าของงานหลัก)',
    role: 'researcher'
  },
  {
    uid: 'usr_02',
    email: 'araya.k@mitrphol.com',
    password: 'password123',
    displayName: 'ดร.อารยา นักวิจัย (ผู้ร่วมวิจัย)',
    role: 'researcher'
  },
  {
    uid: 'usr_admin',
    email: 'admin.lab@mitrphol.com',
    password: 'admin123',
    displayName: 'ผู้ดูแลระบบส่วนกลาง (Lab Admin)',
    role: 'admin'
  }
];

window.INITIAL_PROJECTS = [
  {
    id: 'proj_220326',
    batchMediumNo: 'x_220326',
    experimentNo: 'Test ethanol',
    conditionText: 'B:C (80:20), 30 C, continuous fermentation D=0.022',
    conditionParams: {
      dilutionRateD: 0.022,
      ratioBC: '80:20',
      temperature: 30.0,
      feedSugarPercentFS: 8.0,
      feedCulture: 'PK B:C mol (80:20)',
      defaultDilutionFactor: 10
    },
    // New Experiment Header Fields (Attachment 1 & 4)
    inletMolassesSugar: 240.0, // g/L
    initialBrix: 26.4, // %Brix
    preparedVolume: 4.0, // L
    remainingVolume: 1.5, // L (1,500 mL)
    feedLogs: [
      { id: 'flog_1', date: '2026-09-01', time: '08:00', medium: 'BF.1', feedNo: 'Feed 1', brix: 17.1, initialVolume: '4 L', remainingVolume: '1,500 mL', remark: '200 ml/h' },
      { id: 'flog_2', date: '2026-09-01', time: '08:00', medium: 'BF.2', feedNo: 'Feed 1', brix: 16.5, initialVolume: '4 L', remainingVolume: '1,580 mL', remark: '' },
      { id: 'flog_3', date: '2026-09-01', time: '16:00', medium: 'BF.1', feedNo: 'Feed 2', brix: 17.1, initialVolume: '2 L', remainingVolume: '500 mL', remark: '' },
      { id: 'flog_4', date: '2026-09-02', time: '09:00', medium: 'BF.2', feedNo: 'Feed 3', brix: 16.5, initialVolume: '4 L', remainingVolume: '1,400 mL', remark: '200 ml/h' }
    ],
    date: '2022-03-26',
    seed: 'Angel Lot.260624',
    seedPreparation: '0.4 g yeast dissolve in water',
    ownerId: 'usr_01',
    ownerName: 'ดร.สมชาย นักวิจัย (เจ้าของงานหลัก)',
    totalBatches: 1,
    createdAt: '2022-03-26T08:00:00Z',
    status: 'completed'
  },
  {
    id: 'proj_220410',
    batchMediumNo: 'x_220410',
    experimentNo: 'Optimization D=0.017',
    conditionText: 'B:C (80:20), 30 C, continuous fermentation D=0.017',
    conditionParams: {
      dilutionRateD: 0.017,
      ratioBC: '80:20',
      temperature: 30.0,
      feedSugarPercentFS: 8.0,
      feedCulture: 'PK B:C mol (80:20)',
      defaultDilutionFactor: 10
    },
    inletMolassesSugar: 235.0,
    initialBrix: 25.8,
    preparedVolume: 3.5,
    remainingVolume: 1.2,
    feedLogs: [
      { id: 'flog_101', date: '2026-09-02', time: '08:00', medium: 'BF.1', feedNo: 'Feed 1', brix: 17.3, initialVolume: '3 L', remainingVolume: '1,500 mL', remark: '' }
    ],
    date: '2022-04-10',
    seed: 'Angel Lot.260624',
    seedPreparation: '0.4 g yeast dissolve in water',
    ownerId: 'usr_01',
    ownerName: 'ดร.สมชาย นักวิจัย (เจ้าของงานหลัก)',
    totalBatches: 1,
    createdAt: '2022-04-10T08:00:00Z',
    status: 'completed'
  },
  {
    id: 'proj_220501',
    batchMediumNo: 'x_220501',
    experimentNo: 'High Rate D=0.025',
    conditionText: 'B:C (80:20), 30 C, continuous fermentation D=0.025',
    conditionParams: {
      dilutionRateD: 0.025,
      ratioBC: '80:20',
      temperature: 30.0,
      feedSugarPercentFS: 8.0,
      feedCulture: 'PK B:C mol (80:20)',
      defaultDilutionFactor: 10
    },
    inletMolassesSugar: 250.0,
    initialBrix: 26.5,
    preparedVolume: 4.0,
    remainingVolume: 1.8,
    feedLogs: [
      { id: 'flog_201', date: '2026-09-03', time: '08:00', medium: 'BF.2', feedNo: 'Feed 1', brix: 16.6, initialVolume: '3 L', remainingVolume: '1,580 mL', remark: '' }
    ],
    date: '2022-05-01',
    seed: 'Angel Lot.260624',
    seedPreparation: '0.4 g yeast dissolve in water',
    ownerId: 'usr_02',
    ownerName: 'ดร.อารยา นักวิจัย (ผู้ร่วมวิจัย)',
    totalBatches: 1,
    createdAt: '2022-05-01T08:00:00Z',
    status: 'completed'
  }
];

// Seed time points extracted from Excel (Attachments 1, 2, 3)
window.INITIAL_TIMEPOINTS = [0, 12, 16, 18, 22, 34, 40, 46, 58, 64, 70, 82];

// Ground-truth sampling data matrix for Projects
window.SEED_SAMPLES_220326 = [
  // PF (Pre-fermenter) - proj_220326
  { projectId: 'proj_220326', tank: 'PF', time: 0,  brix: 18.0, cellCount: 3.35e7,  sugarConvert: 125.2, ethanol: 1.787,  glycerol: 4.268, sucrose: 50.0, glucose: 40.0, fructose: 35.2, cellDryWeight: 1.83 },
  { projectId: 'proj_220326', tank: 'PF', time: 12, brix: 9.6,  cellCount: 5.55e8,  sugarConvert: 4.044, ethanol: 52.237, glycerol: 6.856, sucrose: 1.0,  glucose: 1.5,  fructose: 1.544, cellDryWeight: 2.85 },
  { projectId: 'proj_220326', tank: 'PF', time: 16, brix: 9.0,  cellCount: 5.93e8,  sugarConvert: 0.668, ethanol: 39.933, glycerol: 7.171, sucrose: 0.1,  glucose: 0.2,  fructose: 0.368, cellDryWeight: 2.95 },
  { projectId: 'proj_220326', tank: 'PF', time: 18, brix: 9.1,  cellCount: 6.20e8,  sugarConvert: 1.871, ethanol: 40.503, glycerol: 6.175, sucrose: 0.5,  glucose: 0.6,  fructose: 0.771, cellDryWeight: 3.10 },
  { projectId: 'proj_220326', tank: 'PF', time: 22, brix: 8.8,  cellCount: 5.73e8,  sugarConvert: 0.797, ethanol: 45.624, glycerol: 5.659, sucrose: 0.2,  glucose: 0.2,  fructose: 0.397, cellDryWeight: 3.25 },
  { projectId: 'proj_220326', tank: 'PF', time: 34, brix: 8.6,  cellCount: 7.00e8,  sugarConvert: 0.280, ethanol: 49.853, glycerol: 4.285, sucrose: 0.05, glucose: 0.1,  fructose: 0.130, cellDryWeight: 3.80 },
  { projectId: 'proj_220326', tank: 'PF', time: 40, brix: 8.6,  cellCount: 8.53e8,  sugarConvert: 0.347, ethanol: 50.060, glycerol: 3.703, sucrose: 0.05, glucose: 0.12, fructose: 0.177, cellDryWeight: 4.15 },
  { projectId: 'proj_220326', tank: 'PF', time: 46, brix: 8.6,  cellCount: 9.15e8,  sugarConvert: 0.355, ethanol: 50.072, glycerol: 3.598, sucrose: 0.05, glucose: 0.15, fructose: 0.155, cellDryWeight: 4.35 },
  { projectId: 'proj_220326', tank: 'PF', time: 58, brix: 8.7,  cellCount: 8.30e8,  sugarConvert: 0.218, ethanol: 48.516, glycerol: 3.480, sucrose: 0.02, glucose: 0.08, fructose: 0.118, cellDryWeight: 4.20 },
  { projectId: 'proj_220326', tank: 'PF', time: 64, brix: 8.5,  cellCount: 8.70e8,  sugarConvert: 0.000, ethanol: 49.326, glycerol: 3.696, sucrose: 0.0,  glucose: 0.0,  fructose: 0.000, cellDryWeight: 4.30 },
  { projectId: 'proj_220326', tank: 'PF', time: 70, brix: 8.6,  cellCount: 8.65e8,  sugarConvert: 0.348, ethanol: 48.574, glycerol: 3.580, sucrose: 0.05, glucose: 0.14, fructose: 0.158, cellDryWeight: 4.28 },
  { projectId: 'proj_220326', tank: 'PF', time: 82, brix: 8.5,  cellCount: 8.40e8,  sugarConvert: 0.209, ethanol: 50.229, glycerol: 3.204, sucrose: 0.02, glucose: 0.08, fructose: 0.109, cellDryWeight: 4.25 },

  // F2 (Cascade 1)
  { projectId: 'proj_220326', tank: 'F2', time: 34, brix: 21.7, cellCount: 5.00e8, sugarConvert: 100.34, ethanol: 49.886, glycerol: 11.427, sucrose: 40.0, glucose: 30.0, fructose: 30.34, cellDryWeight: 3.50 },
  { projectId: 'proj_220326', tank: 'F2', time: 40, brix: 20.9, cellCount: 6.20e8, sugarConvert: 77.997, ethanol: 51.263, glycerol: 10.444, sucrose: 30.0, glucose: 25.0, fructose: 22.997, cellDryWeight: 3.75 },
  { projectId: 'proj_220326', tank: 'F2', time: 46, brix: 20.5, cellCount: 6.33e8, sugarConvert: 71.945, ethanol: 53.325, glycerol: 9.935,  sucrose: 28.0, glucose: 22.0, fructose: 21.945, cellDryWeight: 3.80 },
  { projectId: 'proj_220326', tank: 'F2', time: 58, brix: 20.5, cellCount: 5.63e8, sugarConvert: 79.929, ethanol: 55.637, glycerol: 10.452, sucrose: 31.0, glucose: 25.0, fructose: 23.929, cellDryWeight: 3.82 },
  { projectId: 'proj_220326', tank: 'F2', time: 64, brix: 21.6, cellCount: 6.58e8, sugarConvert: 80.811, ethanol: 55.200, glycerol: 10.351, sucrose: 32.0, glucose: 25.0, fructose: 23.811, cellDryWeight: 3.85 },
  { projectId: 'proj_220326', tank: 'F2', time: 70, brix: 20.8, cellCount: 5.65e8, sugarConvert: 78.258, ethanol: 57.838, glycerol: 10.362, sucrose: 30.0, glucose: 24.0, fructose: 24.258, cellDryWeight: 3.88 },
  { projectId: 'proj_220326', tank: 'F2', time: 82, brix: 20.5, cellCount: 5.48e8, sugarConvert: 69.205, ethanol: 56.502, glycerol: 9.220,  sucrose: 26.0, glucose: 22.0, fructose: 21.205, cellDryWeight: 3.90 },

  // F3 (Cascade 2)
  { projectId: 'proj_220326', tank: 'F3', time: 34, brix: 19.6, cellCount: 5.05e8, sugarConvert: 59.588, ethanol: 61.082, glycerol: 12.408, sucrose: 22.0, glucose: 19.0, fructose: 18.588, cellDryWeight: 3.65 },
  { projectId: 'proj_220326', tank: 'F3', time: 40, brix: 17.9, cellCount: 6.68e8, sugarConvert: 35.786, ethanol: 76.406, glycerol: 12.980, sucrose: 12.0, glucose: 12.0, fructose: 11.786, cellDryWeight: 3.95 },
  { projectId: 'proj_220326', tank: 'F3', time: 46, brix: 17.4, cellCount: 5.70e8, sugarConvert: 28.445, ethanol: 81.993, glycerol: 12.734, sucrose: 9.0,  glucose: 10.0, fructose: 9.445, cellDryWeight: 4.05 },
  { projectId: 'proj_220326', tank: 'F3', time: 58, brix: 16.8, cellCount: 5.53e8, sugarConvert: 17.854, ethanol: 80.648, glycerol: 10.960, sucrose: 5.0,  glucose: 6.0,  fructose: 6.854, cellDryWeight: 4.10 },
  { projectId: 'proj_220326', tank: 'F3', time: 64, brix: 16.8, cellCount: 6.38e8, sugarConvert: 26.658, ethanol: 82.988, glycerol: 11.990, sucrose: 8.0,  glucose: 9.0,  fructose: 9.658, cellDryWeight: 4.12 },
  { projectId: 'proj_220326', tank: 'F3', time: 70, brix: 17.5, cellCount: 6.78e8, sugarConvert: 25.679, ethanol: 79.414, glycerol: 11.444, sucrose: 8.0,  glucose: 8.5,  fructose: 9.179, cellDryWeight: 4.15 },
  { projectId: 'proj_220326', tank: 'F3', time: 82, brix: 17.4, cellCount: 5.13e8, sugarConvert: 19.635, ethanol: 78.436, glycerol: 10.375, sucrose: 6.0,  glucose: 6.5,  fructose: 7.135, cellDryWeight: 4.18 },

  // F4 (Cascade 3)
  { projectId: 'proj_220326', tank: 'F4', time: 40, brix: 16.8, cellCount: 4.90e8, sugarConvert: 19.412, ethanol: 85.794, glycerol: 13.891, sucrose: 6.0,  glucose: 7.0,  fructose: 6.412, cellDryWeight: 4.00 },
  { projectId: 'proj_220326', tank: 'F4', time: 46, brix: 15.9, cellCount: 4.80e8, sugarConvert: 5.230,  ethanol: 90.812, glycerol: 13.320, sucrose: 1.5,  glucose: 2.0,  fructose: 1.730, cellDryWeight: 4.20 },
  { projectId: 'proj_220326', tank: 'F4', time: 58, brix: 15.5, cellCount: 6.40e8, sugarConvert: 0.457,  ethanol: 95.395, glycerol: 12.131, sucrose: 0.1,  glucose: 0.15, fructose: 0.207, cellDryWeight: 4.30 },
  { projectId: 'proj_220326', tank: 'F4', time: 64, brix: 15.5, cellCount: 6.08e8, sugarConvert: 1.724,  ethanol: 99.978, glycerol: 12.343, sucrose: 0.5,  glucose: 0.6,  fructose: 0.624, cellDryWeight: 4.32 },
  { projectId: 'proj_220326', tank: 'F4', time: 70, brix: 15.7, cellCount: 5.63e8, sugarConvert: 1.928,  ethanol: 95.621, glycerol: 11.880, sucrose: 0.6,  glucose: 0.6,  fructose: 0.728, cellDryWeight: 4.35 },
  { projectId: 'proj_220326', tank: 'F4', time: 82, brix: 15.7, cellCount: 5.13e8, sugarConvert: 1.178,  ethanol: 98.912, glycerol: 13.228, sucrose: 0.3,  glucose: 0.4,  fructose: 0.478, cellDryWeight: 4.38 },

  // F5 (Cascade 4)
  { projectId: 'proj_220326', tank: 'F5', time: 46, brix: 15.5, cellCount: 5.23e8, sugarConvert: 0.730,  ethanol: 92.927, glycerol: 13.764, sucrose: 0.2,  glucose: 0.25, fructose: 0.280, cellDryWeight: 4.10 },
  { projectId: 'proj_220326', tank: 'F5', time: 58, brix: 15.5, cellCount: 5.80e8, sugarConvert: 0.032,  ethanol: 95.046, glycerol: 10.982, sucrose: 0.01, glucose: 0.01, fructose: 0.012, cellDryWeight: 4.25 },
  { projectId: 'proj_220326', tank: 'F5', time: 64, brix: 15.5, cellCount: 5.35e8, sugarConvert: 0.036,  ethanol: 92.947, glycerol: 10.270, sucrose: 0.01, glucose: 0.01, fructose: 0.016, cellDryWeight: 4.28 },
  { projectId: 'proj_220326', tank: 'F5', time: 70, brix: 15.5, cellCount: 5.70e8, sugarConvert: 0.073,  ethanol: 97.938, glycerol: 10.508, sucrose: 0.02, glucose: 0.02, fructose: 0.033, cellDryWeight: 4.30 },
  { projectId: 'proj_220326', tank: 'F5', time: 82, brix: 15.5, cellCount: 5.40e8, sugarConvert: 0.042,  ethanol: 96.890, glycerol: 10.177, sucrose: 0.01, glucose: 0.01, fructose: 0.022, cellDryWeight: 4.35 },

  // F6 (Cascade 5)
  { projectId: 'proj_220326', tank: 'F6', time: 58, brix: 15.5, cellCount: 5.33e8, sugarConvert: 0.099,  ethanol: 96.111, glycerol: 13.786, sucrose: 0.03, glucose: 0.03, fructose: 0.039, cellDryWeight: 4.20 },
  { projectId: 'proj_220326', tank: 'F6', time: 64, brix: 15.6, cellCount: 5.90e8, sugarConvert: 0.038,  ethanol: 96.163, glycerol: 11.128, sucrose: 0.01, glucose: 0.01, fructose: 0.018, cellDryWeight: 4.22 },
  { projectId: 'proj_220326', tank: 'F6', time: 70, brix: 15.5, cellCount: 5.45e8, sugarConvert: 0.040,  ethanol: 96.339, glycerol: 10.680, sucrose: 0.01, glucose: 0.01, fructose: 0.020, cellDryWeight: 4.25 },
  { projectId: 'proj_220326', tank: 'F6', time: 82, brix: 15.4, cellCount: 5.25e8, sugarConvert: 0.055,  ethanol: 96.419, glycerol: 10.339, sucrose: 0.01, glucose: 0.02, fructose: 0.025, cellDryWeight: 4.28 },

  // F7 (Cascade 6)
  { projectId: 'proj_220326', tank: 'F7', time: 58, brix: 15.4, cellCount: 5.80e8, sugarConvert: 0.037,  ethanol: 96.808, glycerol: 11.259, sucrose: 0.01, glucose: 0.01, fructose: 0.017, cellDryWeight: 4.20 },
  { projectId: 'proj_220326', tank: 'F7', time: 64, brix: 15.5, cellCount: 5.35e8, sugarConvert: 0.034,  ethanol: 95.933, glycerol: 10.906, sucrose: 0.01, glucose: 0.01, fructose: 0.014, cellDryWeight: 4.22 },
  { projectId: 'proj_220326', tank: 'F7', time: 70, brix: 15.4, cellCount: 5.05e8, sugarConvert: 0.039,  ethanol: 94.682, glycerol: 10.791, sucrose: 0.01, glucose: 0.01, fructose: 0.019, cellDryWeight: 4.24 },
  { projectId: 'proj_220326', tank: 'F7', time: 82, brix: 15.4, cellCount: 5.55e8, sugarConvert: 0.045,  ethanol: 94.898, glycerol: 10.199, sucrose: 0.01, glucose: 0.01, fructose: 0.025, cellDryWeight: 4.26 },

  // D3 (Duran3 Final Harvesting)
  { projectId: 'proj_220326', tank: 'D3', time: 70, brix: 15.4, cellCount: 5.33e8, sugarConvert: 0.025,  ethanol: 92.879, glycerol: 10.497, sucrose: 0.005, glucose: 0.01, fructose: 0.010, cellDryWeight: 4.25 },
  { projectId: 'proj_220326', tank: 'D3', time: 82, brix: 15.4, cellCount: 5.50e8, sugarConvert: 0.096,  ethanol: 99.530, glycerol: 10.775, sucrose: 0.02,  glucose: 0.03, fructose: 0.046, cellDryWeight: 4.45 },

  // Samples for Dr. Somchai's second project: proj_220410 (D=0.017)
  { projectId: 'proj_220410', tank: 'PF', time: 0,  brix: 18.2, cellCount: 3.20e7,  sugarConvert: 126.0, ethanol: 1.500,  glycerol: 4.100, sucrose: 50.0, glucose: 41.0, fructose: 35.0 },
  { projectId: 'proj_220410', tank: 'PF', time: 82, brix: 8.8,  cellCount: 8.10e8,  sugarConvert: 0.350, ethanol: 47.800, glycerol: 3.500, sucrose: 0.05, glucose: 0.10, fructose: 0.200 },
  { projectId: 'proj_220410', tank: 'F2', time: 82, brix: 21.0, cellCount: 5.20e8, sugarConvert: 72.50, ethanol: 54.200, glycerol: 9.800,  sucrose: 28.0, glucose: 22.5, fructose: 22.00 },
  { projectId: 'proj_220410', tank: 'F3', time: 82, brix: 17.8, cellCount: 5.00e8, sugarConvert: 22.10, ethanol: 76.100, glycerol: 10.80,  sucrose: 7.0,  glucose: 7.5,  fructose: 7.600 },
  { projectId: 'proj_220410', tank: 'F4', time: 82, brix: 16.0, cellCount: 4.90e8, sugarConvert: 2.100,  ethanol: 95.000, glycerol: 12.80,  sucrose: 0.5,  glucose: 0.7,  fructose: 0.900 },
  { projectId: 'proj_220410', tank: 'F5', time: 82, brix: 15.8, cellCount: 5.10e8, sugarConvert: 0.120,  ethanol: 95.200, glycerol: 10.50,  sucrose: 0.02, glucose: 0.04, fructose: 0.060 },
  { projectId: 'proj_220410', tank: 'F6', time: 82, brix: 15.7, cellCount: 5.05e8, sugarConvert: 0.080,  ethanol: 95.800, glycerol: 10.40,  sucrose: 0.01, glucose: 0.03, fructose: 0.040 },
  { projectId: 'proj_220410', tank: 'F7', time: 82, brix: 15.6, cellCount: 5.20e8, sugarConvert: 0.060,  ethanol: 96.100, glycerol: 10.30,  sucrose: 0.01, glucose: 0.02, fructose: 0.030 },
  { projectId: 'proj_220410', tank: 'D3', time: 82, brix: 15.5, cellCount: 5.30e8, sugarConvert: 0.050,  ethanol: 96.500, glycerol: 10.60,  sucrose: 0.01, glucose: 0.01, fructose: 0.030 },

  // Samples for Dr. Araya's project: proj_220501 (D=0.025)
  { projectId: 'proj_220501', tank: 'PF', time: 0,  brix: 18.0, cellCount: 3.40e7,  sugarConvert: 124.8, ethanol: 1.850,  glycerol: 4.300, sucrose: 49.8, glucose: 40.0, fructose: 35.0 },
  { projectId: 'proj_220501', tank: 'PF', time: 82, brix: 8.6,  cellCount: 8.60e8,  sugarConvert: 0.400, ethanol: 51.000, glycerol: 3.600, sucrose: 0.05, glucose: 0.15, fructose: 0.200 },
  { projectId: 'proj_220501', tank: 'F2', time: 82, brix: 20.2, cellCount: 5.60e8, sugarConvert: 68.00, ethanol: 55.400, glycerol: 9.600,  sucrose: 25.0, glucose: 22.0, fructose: 21.00 },
  { projectId: 'proj_220501', tank: 'F3', time: 82, brix: 17.2, cellCount: 5.30e8, sugarConvert: 18.50, ethanol: 77.200, glycerol: 10.90,  sucrose: 5.5,  glucose: 6.0,  fructose: 7.000 },
  { projectId: 'proj_220501', tank: 'F4', time: 82, brix: 15.8, cellCount: 5.00e8, sugarConvert: 1.800,  ethanol: 93.500, glycerol: 12.90,  sucrose: 0.4,  glucose: 0.6,  fructose: 0.800 },
  { projectId: 'proj_220501', tank: 'F5', time: 82, brix: 15.6, cellCount: 5.25e8, sugarConvert: 0.090,  ethanol: 93.800, glycerol: 10.40,  sucrose: 0.02, glucose: 0.03, fructose: 0.040 },
  { projectId: 'proj_220501', tank: 'F6', time: 82, brix: 15.5, cellCount: 5.15e8, sugarConvert: 0.070,  ethanol: 94.000, glycerol: 10.30,  sucrose: 0.01, glucose: 0.02, fructose: 0.040 },
  { projectId: 'proj_220501', tank: 'F7', time: 82, brix: 15.5, cellCount: 5.30e8, sugarConvert: 0.060,  ethanol: 93.900, glycerol: 10.20,  sucrose: 0.01, glucose: 0.02, fructose: 0.030 },
  { projectId: 'proj_220501', tank: 'D3', time: 82, brix: 15.4, cellCount: 5.40e8, sugarConvert: 0.080,  ethanol: 94.200, glycerol: 10.50,  sucrose: 0.02, glucose: 0.02, fructose: 0.040 }
];

// Cross-Condition comparison data tagged by researcher (ownerId)
window.CROSS_CONDITIONS_SUMMARY = [
  // Dr. Somchai's conditions (usr_01)
  {
    conditionKey: 'D=0.022 (Current)',
    ownerId: 'usr_01',
    researcher: 'ดร.สมชาย นักวิจัย',
    dilutionRateD: 0.022,
    temp: 30,
    ratioBC: '80:20',
    finalEthanol: 11.2,
    maxEthanolGPerL: 99.53,
    yieldYps: 0.491, // Near Gay-Lussac maximum!
    productivityQp: 2.18, // Highest Productivity!
    sugarConversionPct: 99.3,
    cellViabilityPct: 97.4,
    isBest: true, // Marked as Best Condition for Dr. Somchai
    tanks: { PF: 5.5, F2: 7.9, F3: 10.3, F4: 11.0, F5: 11.1, F6: 11.3, F7: 11.3, D3: 11.2 }
  },
  {
    conditionKey: 'D=0.017',
    ownerId: 'usr_01',
    researcher: 'ดร.สมชาย นักวิจัย',
    dilutionRateD: 0.017,
    temp: 30,
    ratioBC: '80:20',
    finalEthanol: 10.9,
    maxEthanolGPerL: 96.5,
    yieldYps: 0.472,
    productivityQp: 1.64,
    sugarConversionPct: 98.6,
    cellViabilityPct: 96.2,
    isBest: false,
    tanks: { PF: 5.3, F2: 8.6, F3: 10.7, F4: 11.0, F5: 10.9, F6: 10.9, F7: 10.9, D3: 10.9 }
  },
  {
    conditionKey: '%FS=8',
    ownerId: 'usr_01',
    researcher: 'ดร.สมชาย นักวิจัย',
    dilutionRateD: 0.022,
    temp: 30,
    ratioBC: '80:20',
    finalEthanol: 10.1,
    maxEthanolGPerL: 91.8,
    yieldYps: 0.448,
    productivityQp: 1.82,
    sugarConversionPct: 94.2,
    cellViabilityPct: 95.0,
    isBest: false,
    tanks: { PF: 3.6, F2: 10.0, F3: 10.2, F4: 10.1, F5: 10.1, F6: 9.9, F7: 10.0, D3: 10.1 }
  },

  // Dr. Araya's conditions (usr_02)
  {
    conditionKey: 'D=0.025 (High Rate)',
    ownerId: 'usr_02',
    researcher: 'ดร.อารยา นักวิจัย',
    dilutionRateD: 0.025,
    temp: 30,
    ratioBC: '80:20',
    finalEthanol: 10.8,
    maxEthanolGPerL: 94.2,
    yieldYps: 0.458,
    productivityQp: 2.35,
    sugarConversionPct: 95.8,
    cellViabilityPct: 94.1,
    isBest: true, // Marked as Best Condition for Dr. Araya
    tanks: { PF: 5.1, F2: 7.8, F3: 10.1, F4: 10.8, F5: 10.9, F6: 10.8, F7: 10.7, D3: 10.8 }
  },
  {
    conditionKey: 'D=0.020 (Trial)',
    ownerId: 'usr_02',
    researcher: 'ดร.อารยา นักวิจัย',
    dilutionRateD: 0.020,
    temp: 30,
    ratioBC: '80:20',
    finalEthanol: 10.4,
    maxEthanolGPerL: 92.5,
    yieldYps: 0.450,
    productivityQp: 1.85,
    sugarConversionPct: 96.0,
    cellViabilityPct: 94.8,
    isBest: false,
    tanks: { PF: 5.0, F2: 7.7, F3: 9.9, F4: 10.5, F5: 10.6, F6: 10.5, F7: 10.5, D3: 10.5 }
  }
];

window.INITIAL_LOGS = [
  {
    id: 'log_001',
    timestamp: '2022-03-26T08:15:00Z',
    userName: 'ดร.สมชาย นักวิจัย',
    action: 'CREATE_PROJECT',
    details: 'สร้างโปรเจกต์ x_220326 Test ethanol (สภาวะ D=0.022, B:C 80:20)'
  },
  {
    id: 'log_002',
    timestamp: '2022-03-26T08:30:00Z',
    userName: 'ดร.สมชาย นักวิจัย',
    action: 'SAMPLE_ENTRY',
    details: 'บันทึกค่าเริ่มต้นถัง PF @ 0h (Brix: 18.0 °Bx, Cell count: 3.35E+07 cells/mL)'
  },
  {
    id: 'log_003',
    timestamp: '2022-03-29T16:45:00Z',
    userName: 'ดร.สมชาย นักวิจัย',
    action: 'HPLC_ENTRY',
    details: 'บันทึกผลวิเคราะห์ HPLC ถัง D3 @ 82h (Ethanol 99.53 g/L, Glycerol 10.775 g/L)'
  }
];
