# Chart2Plan (Allindy + EBW-Fibo)

> อัปเดต 30 ตุลาคม 2026: แยกไฟล์บันทึก Allindy + Fibo โดยใช้ Revision `2026-10-30-separate-paper-sheet` ตาม **RELEASE_45_TH.md** ใช้งานผ่าน https://basssg.github.io/Chart2Plan/

> **AI Trading Decision Support & Evidence-Based Execution Engine**  
> ผสานตรรกะ **All Indy 1.3.5** และ **EBW-Fibo 1.10.19** เป็นระบบวางแผนการเทรดคำนวณราคาล่วงหน้า (Deterministic Planning) และติดตามผลจำลอง (Audit Ledger) บน Google Apps Script และ Web App / PWA สำหรับโทรศัพท์มือถือ

---

## 📱 Web App & Mobile Application (PWA)

- **ลิงก์ใช้งาน Web App:** [เปิดใช้งาน Chart2Plan](https://script.google.com/macros/s/AKfycbxShlJXB7L1ctoDWG0TV9exyI3SQUA66cypHoeYUmID3_NUzVoREz39yLi1OnWnksNs9g/exec)
- **สถานะ:** Revision `2026-10-30-separate-paper-sheet` (Mode: TEST / Live Trading: False)

### 📲 วิธีติดตั้งเป็น Application บนโทรศัพท์มือถือ (iOS & Android)

คุณสามารถติดตั้งเว็บนี้ให้เป็นแอปพลิเคชันเต็มหน้าจอ (Standalone App) ได้โดยไม่ต้องดาวน์โหลดผ่าน App Store:

#### สำหรับ iPhone (iOS / Safari):
1. เปิดลิงก์ [Web App](https://script.google.com/macros/s/AKfycbxShlJXB7L1ctoDWG0TV9exyI3SQUA66cypHoeYUmID3_NUzVoREz39yLi1OnWnksNs9g/exec) ในเบราว์เซอร์ **Safari**
2. แตะที่ปุ่ม **แชร์ (Share)** (ไอคอนสี่เหลี่ยมที่มีลูกศรชี้ขึ้น ด้านล่างของจอ)
3. เลื่อนลงมาเลือก **"เพิ่มไปยังหน้าจอโฮม" (Add to Home Screen)**
4. ตั้งชื่อเป็น **Chart2Plan** แล้วแตะ **"เพิ่ม" (Add)**
5. ตัวแอปจะปรากฏเป็นไอคอนบนหน้าจอมือถือ สามารถแตะเปิดใช้งานได้เหมือน Application ปกติแบบเต็มหน้าจอ (ไม่มีแถบ URL)

#### สำหรับ Android (Chrome):
1. เปิดลิงก์ [Web App](https://script.google.com/macros/s/AKfycbxShlJXB7L1ctoDWG0TV9exyI3SQUA66cypHoeYUmID3_NUzVoREz39yLi1OnWnksNs9g/exec) ในเบราว์เซอร์ **Google Chrome**
2. แตะที่ไอคอน **จุด 3 จุด** ที่มุมขวาบน
3. เลือก **"ติดตั้งแอป" (Install app)** หรือ **"เพิ่มลงในหน้าจอหลัก" (Add to Home Screen)**
4. ยืนยันการติดตั้ง ตัวแอปจะถูกติดตั้งลงในหน้าจอแอปพลิเคชันทันที

---

## 🧠 สถาปัตยกรรมและการรวมตรรกะ (How It Works)

ระบบใหม่แบ่งงานระหว่าง **คณิตศาสตร์ (Algorithm)** กับ **ปัญญาประดิษฐ์ (AI)** อย่างชัดเจน เพื่อแก้ปัญหาที่เดิมแผนขึ้นไม่ผ่าน:

```
[Eightcap MT5 Market Data (M1–D1 Closed Bars)]
                      │
                      ▼
       [Deterministic Candidate Planner (Planner.gs)]
       - คำนวณหาคู่ Zone Allindy + ชุด Fibo ที่ยืนยันแล้ว
       - คำนวณ Entry กึ่งกลางโซน
       - คำนวณ SL หลัง Distal Edge / Liquidity Anchor พร้อม ATR Buffer
       - คำนวณ TP จากเป้า Fibo (161.8% / 261.8%) และตัดหน้าแนวต้านแรก 1 Tick
       - ตรวจสอบ Net R/R >= 1.50 เท่าหลังหักต้นทุน Spread
                      │
                      ├─ [ไม่มี Candidate ผ่านเกณฑ์] ──> จบงาน NO_TRADE (ไม่เสียค่าเรียก AI)
                      │
                      ▼
       [AI Context & Qualitative Analyst (Workflow.gs)]
       - ส่งเฉพาะ Candidate ที่ผ่านกฎราคาให้โมเดล AI วิเคราะห์
       - ประเมินสอดคล้องกับเทรนด์ใหญ่และสภาวะข่าว
       - เขียนบทสรุปวิเคราะห์เป็นภาษาไทย
                      │
                      ▼
       [Durable Audit & Paper Execution Ledger (ResearchLog.gs)]
       - บันทึก Candidate และสาเหตุที่ปัดตกทั้งหมดลง Google Sheets
       - ติดตามผลจำลอง (Closed M1 Replay) เริ่มที่ต้นนาทีถัดไป (NEXT_COMPLETE_M1_OPEN)
       - ล็อกระดับราคา Entry, SL, TP ทันทีเมื่อเข้า ไม่ขยับหนี
       - หากเกิด Ambiguous (แท่งเดียวแตะทั้งเข้าและออก) จะปรับเป็น REVIEW ไม่มั่วเป็นไม้ชนะ
```

---

## 📁 โครงสร้างไฟล์ในโครงการ

| ไฟล์ | หน้าที่ |
|---|---|
| `Planner.gs` | ตัวคำนวณและกรองแผน Entry / SL / TP ล่วงหน้าตามตรรกะอินดิเคเตอร์ |
| `Planner.test.cjs` | ชุดทดสอบออฟไลน์ของ Planner (ผ่าน 41/41 การทดสอบ) |
| `ResearchLog.gs` | ระบบบันทึก Logs แยกอิสระ ติดตามผลแท่ง M1 และส่งข้อมูลแดชบอร์ด |
| `ResearchLog.test.cjs` | ชุดทดสอบออฟไลน์ของ ResearchLog (ผ่าน 46/46 การทดสอบ) |
| `ResearchUi.html` | หน้าจอ "ห้องพิสูจน์แผน" บน Web App สำหรับตรวจแผนฟรีและดูประวัติ |
| `Allindy.gs` | ตัวแปลงสัญญาณ All Indy 1.3.5 (แก้ไขการรวบรวม M3 จากแท่ง M1 ปิดจริง) |
| `Fibo.gs` | ตัวแปลงโครงสร้าง EBW-Fibo 1.10.19 (Active Fibo Book & Multi-TF Retained) |
| `Workflow.gs` | จัดการกระบวนการเรียก AI, Admission Gate และ Post-quote Freshness Check |
| `Workspace.gs` | เชื่อมโยงบัญชีผู้ใช้และส่งต่อ Logs ไปยัง Google Sheets |
| `Index.html` & `PremiumStyles.html` | โครงสร้างหน้าเว็บและธีมการแสดงผลแบบ Responsive รองรับมือถือ |
| `ClientScript.html` & `PremiumUi.html` | การทำงานฝั่งหน้าบ้าน (Client interactions & History) |
| `manifest.json` & `sw.js` | ไฟล์รองรับ Progressive Web App (PWA) บนโทรศัพท์มือถือ |
| `CHART2PLAN_AUDIT_REPORT.md` | รายงานผลการตรวจสอบเชิงลึกและหลักฐานทางเทคนิคทั้งหมด |

---

## 🧪 การทดสอบระบบ (Test Results)

รันชุดทดสอบออฟไลน์ทั้งระบบด้วย Node.js:
```bash
node Planner.test.cjs      # 41 test groups passed
node ResearchLog.test.cjs  # 46 test groups passed
```
**รวมทั้งสิ้น 87 การทดสอบ ผ่านครบถ้วน 100%**

