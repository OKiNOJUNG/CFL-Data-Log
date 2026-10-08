# ADR-0007: การส่งออกสไลด์พรีเซนเทชัน (Presentation Generator) และระบบดีไซน์ Mitr Phol 60-30-10

- **สถานะ:** ยอมรับแล้ว
- **วันที่:** 2026-10-06

## บริบท
การทดแทนระบบ Excel เดิมต้องครอบคลุมถึงการทำสไลด์สรุปผลการประชุมแล็บอัตโนมัติ และการกำหนดระบบสี (Design System) ตามหลัก 60-30-10 ร่วมกับอัตลักษณ์องค์กรของกลุ่มมิตรผล เพื่อให้อ่านง่าย ชัดเจน และดูพรีเมี่ยมเป็นมาตรฐานสากล

## การตัดสินใจ
1. **ระบบสร้างและส่งออกรายงาน (Reporting & Presentation Suite):**
   - **One-Click Presentation Deck:** หน้าโหมดสไลด์นำเสนออัตโนมัติ (Executive Summary Slides) รวบรวม Condition Header, Kinetic Curves, ตารางสรุป KPI, และคำแนะนำ Best Condition
   - **High-Res Chart Export:** ปุ่มดาวน์โหลดกราฟแต่ละรูปความละเอียดสูง (PNG/SVG คมชัด 300 DPI)
   - **Excel/CSV Export:** ปุ่มส่งออกข้อมูลดิบและค่าคำนวณทั้งหมดสำหรับนำไปประมวลผลต่อ
2. **ระบบดีไซน์ Mitr Phol (Design Tokens 60-30-10):**
   - **60% พื้นที่ฐาน (Dominant Canvas):** White Clean Lab Canvas (`#F8FAFC` ถึง `#FFFFFF`) พร้อมพื้นผิวการ์ดแบบกระจกฝ้าเนียน (Glassmorphism / Crisp Borders `#E2E8F0`)
   - **30% สีหลักองค์กร (Secondary Structure):** Mitr Phol Deep Navy Blue (`#0A2540` / `#0F3D7A`) ใช้สำหรับ Navigation Header, Primary Buttons, Typography หัวข้อหลัก
   - **10% สีเน้น (Accent & Action):** Mitr Phol Golden Cane Amber (`#D97706` / `#F59E0B`) ใช้สำหรับ Call-to-action, ไฮไลต์ Best Condition, Badge สำคัญ
   - **ระบบสี 8 ถังหมัก (8-Tank Fixed Color Identity):**
     - `PF1`: Deep Navy (`#1E3A8A`)
     - `F2`: Amber Orange (`#EA580C`)
     - `F3`: Emerald Green (`#059669`)
     - `F4`: Cyan Teal (`#0891B2`)
     - `F5`: Amethyst Violet (`#7C3AED`)
     - `F6`: Olive Lime (`#65A30D`)
     - `F7`: Rose Coral (`#E11D48`)
     - `D3`: Bronze Ochre (`#92400E`)
   - **ตัวอักษรและการจัดระยะ:** ฟอนต์สากลทันสมัย `Plus Jakarta Sans` / `Prompt` พร้อมปรับ Leading (Line-height 1.6–1.75) ให้อ่านง่าย ไม่เบียดเสียด
   - **UI Elements:** SweetAlert2 ขอบมน (border-radius 16px), Interactive hover lift, Micro-animations, Multimodal sounds (Web Audio API)
