# CONTEXT — Fermentation Lab Tracker (Mitr Phol)

> Living glossary for the domain. Updated during the grilling session.
> Status legend: ✅ confirmed by user · 🟡 inferred from attachments (needs confirmation) · ❓ open question

## Purpose
Replace the Excel workflow (manual entry → manual charts → manual slides) for
**fed-batch / continuous fermentation** experiments with a multi-user web app
(mobile + desktop) backed by Firebase (free tier first). ✅

## Glossary

| Term (EN) | ไทย | Definition | Status |
|---|---|---|---|
| **Researcher** | นักวิจัย | Logged-in user via Email/Password (Admin approval required). Can **view all** projects; can **create/edit/delete only their own** (ADR-0006). | ✅ |
| **Admin** | ผู้ดูแลระบบ | Manages user accounts & roles, edits calculation formulas, can edit/delete any data, views all logs (ADR-0003). | ✅ |
| **Project** | โปรเจกต์ / งาน | **Unit of ownership.** Created from the header in attachment 4. Its settings are locked for all batches; a new header = a new project (ADR-0002). | ✅ |
| **Batch** | รอบการหมัก (ทำซ้ำ) | One replicate run inside a Project, from the first tank to the last (all 8 tanks). A Project can have many Batches. | ✅ |
| **Data Log** | บันทึกการใช้งาน | Append-only audit trail: who, when, what, before → after (ADR-0003). | ✅ |
| **Lab Entry Modes** | โหมดกรอกในแล็บ | Dual mode: Quick Numpad (auto-advance) & Microscope Tally Counter (audio click) + Multimodal feedback (ADR-0006). | ✅ |
| **Experiment header** | ข้อมูลตั้งต้น | Batch Medium no., Experiment no., Condition, Feed culture, Date, Seed (lot), Seed preparation. Entered *before* any results. | ✅ |
| **Condition** | สภาวะการทดลอง | Structured fields: B:C ratio, Temp (°C), Dilution rate D (h⁻¹), %FS, Seed Lot, Seed prep. Includes Smart Defaults presets (ADR-0005). | ✅ |
| **Dilution rate (D)** | อัตราการเจือจาง | Continuous parameter (h⁻¹) (e.g. 0.017, 0.022, 0.025). Key axis for condition comparison. | ✅ |
| **Optimization KPIs** | ดัชนีหา Condition ที่ดีที่สุด | Max Ethanol (g/L), Ethanol Yield ($Y_{P/S}$), Productivity ($Q_p$ g/L·h), Sugar Conversion %, Cell Viability profile (ADR-0005). | ✅ |
| **Tank** (Fermenter) | ถังหมัก | 8 vessels in cascade: `PF, F2, F3, F4, F5, F6, F7, D3` (Excel labels `PF1`, `Duran3`). | ✅ |
| **Tank start time** | เวลาเริ่มของถัง | Tanks start staggered (e.g. PF @0 h, F2/F3 @22 h, F4 @34 h, … D3 @64 h). First reading is 0. Managed by Tank-Age Timeline (ADR-0004). | ✅ |
| **Time point** | จุดเวลาเก็บตัวอย่าง | Hours since tank start or overall (0–82 h or custom). Researcher-defined, flexible per tank (ADR-0004). | ✅ |
| **Brix** | บริกซ์ | °Bx, measured at every time point per tank. | ✅ |
| **Cell count** | การนับเซลล์ | Haemacytometer. **cells/mL = Σ(5 squares) × dilution × 250,000** (ADR-0001). Three series counted **separately** (5 squares each = 15 raw values/sample): **Total**, **Budding**, **Dead** (blue-stained). Raw counts stored; result computed. Dual input mode + Sound feedback (ADR-0006). | ✅ |
| **HPLC panel** | ผล HPLC | Sucrose, Glucose, Fructose, Ethanol, Glycerol (g/L). Sampled at flexible time points (0, 2, 4, 5, 24, 48, 72h or custom) based on **Tank Age** (ADR-0004). | ✅ |
| **Sugar convert** | น้ำตาลคงเหลือ/แปลงรูป | Auto-computed: **Sucrose + Glucose + Fructose** (g/L) (ADR-0004). | ✅ |
| **Presentation Suite** | ระบบสร้างสไลด์และส่งออก | One-Click Executive Slide Deck, High-Res Chart PNGs, Excel/CSV Export (ADR-0007). | ✅ |
| **Design System** | ระบบอัตลักษณ์มิตรผล | Mitr Phol 60-30-10 palette, 8 fixed tank colors, SweetAlert2, Multimodal audio/haptics, Leading typography (ADR-0007). | ✅ |

## Data integrity rules (Handled from Excel transition)
- **"Not started / No sample" vs "0":** The database explicitly treats un-sampled time points as `null`/`undefined` (not `0`), eliminating Excel's misleading `#DIV/0!`, `#REF!` and artificial vertical chart drops.
- **Microscope count validity:** Automatic checks warn if Dead > Total or Budding > Total.
- **Traceability:** Every calculated parameter (cells/mL, Sugar convert, % Viability, Yield) links to original raw inputs and audit logs.
