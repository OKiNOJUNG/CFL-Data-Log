# ADR-0005: โครงสร้างตัวแปร Condition, Smart Defaults และตัวชี้วัด Best Condition (KPIs)

- **สถานะ:** ยอมรับแล้ว
- **วันที่:** 2026-10-06

## บริบท
การเปรียบเทียบสภาวะการหมัก (Conditions) เพื่อหาจุดที่ดีที่สุด (Optimization) ต้องการข้อมูลตัวแปรที่ชัดเจน ไม่เป็นข้อความอิสระที่ดึงค่าตัวเลขยาก และต้องการดัชนีชี้วัดประสิทธิภาพ (KPIs) ที่ครอบคลุมทุกมิติ

## การตัดสินใจ
1. **โครงสร้าง Condition (Structured Fields):**
   - **Dilution Rate (D):** ทศนิยม เช่น 0.017, 0.022, 0.025 (h⁻¹)
   - **สัดส่วน Feed / Medium (B:C Ratio):** เช่น 80:20 (Brix/Mol หรือส่วนผสม)
   - **อุณหภูมิการหมัก (Temperature):** เช่น 30 (°C)
   - **%FS (Feed Sugar):** เช่น 8 (%)
   - **Seed & Lot:** เช่น Angel Lot.260624
   - **Seed Preparation:** เช่น 0.4 g yeast dissolve in water
   - **หมายเหตุสภาวะเพิ่มเติม (Notes):** ข้อความอิสระ
   - *ระบบจะสรุปเป็น Condition summary badge/string ให้อัตโนมัติ*
2. **Smart Defaults (แม่แบบตัวเลือกอัตโนมัติ):**
   - มีปุ่ม "โหลดค่ามาตรฐานห้องแล็บ" (Lab Presets) เติมค่าบ่อยๆ ได้ในคลิกเดียว (เช่น 30°C, D=0.022, Dilution 10x)
3. **KPIs สำหรับหา "Condition ที่ดีที่สุด" (Optimization Dashboard):**
   - **Max Ethanol (g/L):** ปริมาณเอทานอลสูงสุดที่ผลิตได้
   - **Ethanol Yield ($Y_{P/S}$):** ผลได้เอทานอลต่อน้ำตาลที่บริโภค ($\text{g Ethanol} / \text{g Sugar consumed}$)
   - **Ethanol Productivity ($Q_p$):** อัตราการผลิตเอทานอลต่อหน่วยเวลา ($\text{g/L}\cdot\text{h}$)
   - **Sugar Conversion Efficiency (%):** ประสิทธิภาพการแปลงน้ำตาล (น้ำตาลถูกใช้ไปกี่ %)
   - **Cell Viability & Trend:** ความสมบูรณ์ของเซลล์ (% Viable, % Budding, % Death)
   - แสดงผลในรูปแบบตารางเปรียบเทียบ Ranking, Radar Chart และ Multiple Line Charts ข้ามโปรเจกต์

## ผลที่ตามมา
- สามารถ Filter และพล็อตเปรียบเทียบ Curve ข้าม Condition เช่น กราฟ Ethanol vs Time ที่ D ต่างๆ (0.017 vs 0.022 vs 0.025) ได้โดยตรงแบบเดียวกับตารางใน Excel
