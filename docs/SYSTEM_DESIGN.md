# เอกสารสถาปัตยกรรมระบบ (System Design Document)
## ระบบบันทึกและวิเคราะห์การหมักชีวภาพอัจฉริยะ (Mitr Phol Fermentation Lab Tracker)
**เวอร์ชัน:** 1.0.0  
**วันที่จัดทำ:** 6 ตุลาคม 2026  
**ผู้ออกแบบ:** Google Antigravity & Mitr Phol Biotech Research Unit  
**เป้าหมาย:** ทดแทนระบบบันทึกแบบเดิมใน Excel ด้วยเว็บแอปพลิเคชัน รองรับ Mobile & Desktop พร้อมประมวลผลกราฟ, ค้นหา Best Condition, สร้างสไลด์พรีเซนเทชัน และระบบ Data Log ตรวจสอบย้อนกลับ 100%

---

## 1. ภาพรวมสถาปัตยกรรม (System Architecture)

ระบบถูกออกแบบในรูปแบบ **Modern Progressive Web Application (PWA) + Cloud Backend** ที่เน้นความคล่องตัว ใช้งานได้ลื่นไหลทั้งบนสมาร์ทโฟนข้างถังหมักและคอมพิวเตอร์ในห้องวิเคราะห์ โดยมีสถาปัตยกรรม 3 ระดับ:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Client Presentation Layer                       │
│  [Mobile / Responsive UI]                 [Desktop Lab Workstation]   │
│  • Quick Numpad & Tally Mode              • Multi-Tank Grid Matrix     │
│  • Microscope Audio & Haptic              • Cross-Condition Analytics  │
│  • SweetAlert 2.0 & Toast Alerts          • One-Click Presentation Deck│
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ HTTPS / WebSocket Realtime
┌────────────────────────────────────▼───────────────────────────────────┐
│                    Business & Logic Calculation Engine                 │
│  • Cell Count Engine (Σ 5 squares × dilution × 250,000)                │
│  • HPLC Sugar Convert Engine (Sucrose + Glucose + Fructose)            │
│  • Fermentation Kinetics (Ethanol Yield Yp/s, Productivity Qp)         │
│  • Optimization Engine (Multi-parameter Best Condition Ranking)        │
│  • Web Audio Synthesizer (Chimes, Warning, Tally Clicker)              │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ SDK & Security Rules
┌────────────────────────────────────▼───────────────────────────────────┐
│                     Cloud Database & Storage (Firebase)                │
│  • Firebase Authentication (Email/Password + Admin Approval)           │
│  • Cloud Firestore (Projects, Batches, Samples, AuditLogs)             │
│  • Local Persistence Cache (ทำงานออฟไลน์ชั่วคราวขณะอยู่ในแล็บ)        │
│  • Firebase Hosting (CDN ขอบเขตสูง โหลดเร็ว ปลอดภัย)                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. โครงสร้างฐานข้อมูล (Database Schema - Cloud Firestore)

ฐานข้อมูลแบ่งโครงสร้างออกเป็น 5 คอลเลกชันหลัก ตามลำดับชั้นของงานวิจัย:

### 2.1 Collection: `users`
เก็บข้อมูลนักวิจัยและสิทธิ์การเข้าถึง
```json
{
  "uid": "usr_987654321",
  "email": "somchai.r@mitrphol.com",
  "displayName": "ดร.สมชาย นักวิจัย",
  "role": "researcher", // หรือ "admin"
  "status": "active", // "pending_approval", "active", "suspended"
  "createdAt": "2026-10-06T08:00:00Z"
}
```

### 2.2 Collection: `projects` (หน่วยของงาน / หน่วยสิทธิ์ความเป็นเจ้าของ)
ตรงตามส่วนหัวของไฟล์แนบที่ 4 ข้อมูลตั้งต้นที่ถูกล็อกไว้ทั้งโปรเจกต์
```json
{
  "id": "proj_220326_01",
  "batchMediumNo": "x_220326",
  "experimentNo": "Test ethanol",
  "conditionText": "B:C (80:20), 30 C, continuous fermentation D=0.022",
  "conditionParams": {
    "dilutionRateD": 0.022,
    "ratioBC": "80:20",
    "temperature": 30.0,
    "feedSugarPercentFS": 8.0,
    "feedCulture": "PK B:C mol (80:20)",
    "defaultDilutionFactor": 10
  },
  "date": "2022-03-26",
  "seed": "Angel Lot.260624",
  "seedPreparation": "0.4 g yeast dissolve in water",
  "ownerId": "usr_987654321",
  "ownerName": "ดร.สมชาย นักวิจัย",
  "totalBatches": 1,
  "createdAt": "2026-10-06T08:30:00Z",
  "updatedAt": "2026-10-06T08:30:00Z"
}
```

### 2.3 Collection: `batches` (รอบการทดลอง / Replicates ภายใต้โปรเจกต์)
```json
{
  "id": "batch_220326_R1",
  "projectId": "proj_220326_01",
  "replicateNumber": 1,
  "notes": "รอบทดสอบที่ 1 สภาวะ D=0.022",
  "status": "in_progress", // "in_progress", "completed"
  "createdAt": "2026-10-06T09:00:00Z"
}
```

### 2.4 Collection: `samples` (จุดเก็บตัวอย่างแยกรายถังและรายชั่วโมง)
ครอบคลุมถังหมักทั้ง 8 ใบ: `PF, F2, F3, F4, F5, F6, F7, D3`
```json
{
  "id": "smp_220326_F3_34h",
  "projectId": "proj_220326_01",
  "batchId": "batch_220326_R1",
  "tankId": "F3", // PF, F2, F3, F4, F5, F6, F7, D3
  "tankAgeHours": 34.0, // ชั่วโมงอายุถังนั้นๆ
  "globalHours": 34.0, // ชั่วโมงรวมโปรเจกต์
  
  // ผลตรวจ Brix
  "brix": 19.6,

  // ข้อมูลการนับเซลล์ (เก็บค่าดิบ 5 ช่องทั้ง 3 ซีรีส์ + เท่าการเจือจาง)
  "cellCount": {
    "dilutionFactor": 10,
    "total": {
      "squares": [20, 23, 45, 77, 24],
      "sum": 189,
      "cellsPerMl": 4.725e8
    },
    "budding": {
      "squares": [2, 3, 5, 8, 3],
      "sum": 21,
      "cellsPerMl": 5.25e7,
      "percentOfTotal": 11.11
    },
    "dead": {
      "squares": [1, 0, 2, 1, 1],
      "sum": 5,
      "cellsPerMl": 1.25e7,
      "percentOfTotal": 2.65
    },
    "viabilityPercent": 97.35 // (Total - Dead) / Total * 100
  },

  // ผลวิเคราะห์ HPLC (g/L)
  "hplc": {
    "sucrose": 25.12,
    "glucose": 15.40,
    "fructose": 19.068,
    "sugarConvert": 59.588, // คำนวณอัตโนมัติ: Sucrose + Glucose + Fructose
    "ethanol": 61.082,
    "glycerol": 12.408
  },

  "recordedBy": "usr_987654321",
  "recordedAt": "2026-10-06T11:45:00Z"
}
```

### 2.5 Collection: `auditLogs` (บันทึกตรวจสอบย้อนกลับ - Data Log)
ห้ามแก้ไขหรือลบ (Append-only) บันทึกทุกความเคลื่อนไหว:
```json
{
  "id": "log_1020025_001",
  "timestamp": "2026-10-06T11:45:00Z",
  "userId": "usr_987654321",
  "userName": "ดร.สมชาย นักวิจัย",
  "action": "UPDATE_SAMPLE", // CREATE_PROJECT, UPDATE_SAMPLE, DELETE_SAMPLE, CONFIG_CHANGE
  "entityType": "sample",
  "entityId": "smp_220326_F3_34h",
  "changes": {
    "field": "hplc.ethanol",
    "oldValue": 60.10,
    "newValue": 61.082,
    "reason": "แก้ตัวเลขตามใบรายงานแล็บฉบับสมบูรณ์"
  }
}
```

---

## 3. กฎความปลอดภัยและการเข้าถึง (Firestore Security Rules)

กำหนดให้ผู้ใช้ทุกคนดูข้อมูลร่วมกันได้ แต่จำกัดสิทธิ์แก้ไขเฉพาะเจ้าของงานหรือ Admin:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // ตรวจสอบสถานะการล็อกอินและบทบาท
    function isAuthenticated() {
      return request.auth != null;
    }
    function isAdmin() {
      return isAuthenticated() && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    function isOwner(ownerId) {
      return isAuthenticated() && request.auth.uid == ownerId;
    }

    // Projects: ทุกคนอ่านได้, สร้างได้, แก้/ลบ ได้เฉพาะเจ้าของหรือ Admin
    match /projects/{projectId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && request.resource.data.ownerId == request.auth.uid;
      allow update, delete: if isAdmin() || isOwner(resource.data.ownerId);
      
      // Batches ภายในโปรเจกต์
      match /batches/{batchId} {
        allow read: if isAuthenticated();
        allow write: if isAdmin() || isOwner(get(/databases/$(database)/documents/projects/$(projectId)).data.ownerId);
      }
    }

    // Samples: แก้ไขได้เฉพาะเจ้าของโปรเจกต์หรือ Admin
    match /samples/{sampleId} {
      allow read: if isAuthenticated();
      allow create, update, delete: if isAdmin() || 
        isOwner(get(/databases/$(database)/documents/projects/$(resource.data.projectId)).data.ownerId);
    }

    // AuditLogs: ห้ามอัปเดตหรือลบเด็ดขาด (Append-only)
    match /auditLogs/{logId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
      allow update, delete: if false; 
    }

    // Users: แก้ไขบทบาทได้เฉพาะ Admin
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }
  }
}
```

---

## 4. สูตรการคำนวณทางคณิตศาสตร์และชีวเคมี (Mathematical Engine)

### 4.1 การนับเซลล์ด้วย Haemacytometer (ADR-0001)
$$\text{Total Cells (cells/mL)} = \left(\sum_{i=1}^{5} \text{Square}_i\right) \times \text{Dilution Factor} \times 250{,}000$$

- **% Budding (อัตราการแตกหน่อ):**
  $$\% \text{Budding} = \left(\frac{\text{Budding Count}}{\text{Total Count}}\right) \times 100$$
- **% Cell Death (อัตราเซลล์ตาย):**
  $$\% \text{Death} = \left(\frac{\text{Dead Count}}{\text{Total Count}}\right) \times 100$$
- **% Cell Viability (ความมีชีวิตของเซลล์):**
  $$\% \text{Viability} = 100 - \% \text{Death} = \left(\frac{\text{Total} - \text{Dead}}{\text{Total}}\right) \times 100$$

### 4.2 HPLC Sugar Convert (ADR-0004)
$$\text{Sugar Convert (Total Sugar g/L)} = \text{Sucrose (g/L)} + \text{Glucose (g/L)} + \text{Fructose (g/L)}$$

### 4.3 ตัวชี้วัดประสิทธิภาพการหมัก (Optimization KPIs - ADR-0005)
1. **Ethanol Yield ($Y_{P/S}$ - ผลได้เอทานอลต่อน้ำตาล):**
   $$Y_{P/S} = \frac{\Delta \text{Ethanol}}{\Delta \text{Sugar Consumed}} = \frac{\text{Ethanol}_{\text{final}} - \text{Ethanol}_{\text{initial}}}{\text{Sugar}_{\text{initial}} - \text{Sugar}_{\text{final}}} \quad (\text{g/g})$$
   *(ทฤษฎีทางชีวเคมี Gay-Lussac สูงสุดคือ 0.511 g/g)*
2. **Ethanol Productivity ($Q_P$ - อัตราการผลิตเอทานอล):**
   $$Q_P = \frac{\text{Ethanol}_{\text{final}} - \text{Ethanol}_{\text{initial}}}{\Delta t} \quad (\text{g/L}\cdot\text{h})$$
3. **Sugar Conversion Efficiency (ประสิทธิภาพการใช้น้ำตาล %):**
   $$\text{Conversion Rate (\%)} = \left(\frac{\text{Sugar}_{\text{initial}} - \text{Sugar}_{\text{final}}}{\text{Sugar}_{\text{initial}}}\right) \times 100$$

---

## 5. ระบบดีไซน์ Mitr Phol 60-30-10 & UI Hierarchy (ADR-0007)

### 5.1 สัดส่วนคู่สี (Color Distribution 60-30-10)
| สัดส่วน | สี | โค้ดสี Hex | บทบาทหน้าที่ |
|---|---|---|---|
| **60% (Dominant)** | Crisp Lab White / Clean Canvas | `#F8FAFC` ถึง `#FFFFFF` | พื้นหลังของเว็บ, การ์ดแสดงผล, ตารางข้อมูล ช่วยให้อ่านสบายตา |
| **30% (Secondary)** | Mitr Phol Deep Navy | `#0A2540` / `#0F3D7A` | แถบ Navigation, Header, ข้อความพาดหัว, โครงสร้างหลัก สื่อถึงวิทยาศาสตร์และอุตสาหกรรม |
| **10% (Accent)** | Cane Sugar Gold / Warm Amber | `#D97706` / `#F59E0B` | ปุ่มบันทึก, ไอคอน Active, Badge "Best Condition", จุดแจ้งเตือนสำคัญ |

### 5.2 สีประจำถังหมัก 8 ใบ (Fixed 8-Tank Palette for Consistency)
เพื่อให้นักวิจัยจำสีของแต่ละถังได้ทันทีในทุกกราฟ:
- **PF1:** `#1E3A8A` (Deep Indigo)
- **F2:** `#EA580C` (Amber Orange)
- **F3:** `#059669` (Emerald Green)
- **F4:** `#0891B2` (Cyan Teal)
- **F5:** `#7C3AED` (Royal Violet)
- **F6:** `#65A30D` (Olive Lime)
- **F7:** `#E11D48` (Rose Coral)
- **D3:** `#92400E` (Bronze Ochre)

### 5.3 Multimodal Feedback Specifications
1. **Audio Feedback (Web Audio API Synthesizer):**
   - *Success Save:* สองโทนความถี่คู่เสียงนุ่ม 523Hz (C5) และ 659Hz (E5) ระยะเวลา 120ms
   - *Warning / Out of range:* โทนต่ำเตือนสติ 330Hz (E4) ระยะเวลา 150ms
   - *Tally Counter Click:* โทนคล้าย Mechanical click 800Hz สั้น 20ms
2. **Haptic Feedback:** สั่นสั้น 25ms บนอุปกรณ์สัมผัสเมื่อกดนับเซลล์หรือบันทึกสำเร็จ
3. **Visual Alerts:**
   - *Inline Warning:* แถบข้อความขอบมนสีส้มใต้ช่อง หากกรอกค่าผิดปกติ (เช่น Dead > Total หรือ Brix ติดลบ)
   - *Toast Notifications:* แสดงมุมขวาบน 3 วินาทีสำหรับบันทึก/ซิงค์อัตโนมัติ
   - *SweetAlert 2.0:* Modal ขอบมนพรีเมี่ยมรัศมี 16px สำหรับยืนยันการลบ หรือสร้างสไลด์พรีเซนต์
