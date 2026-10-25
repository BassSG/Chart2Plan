# Chart2Plan — Day Trade และหน้าแสดงผลใช้งานบนเว็บแล้ว

วันที่: 24 ตุลาคม 2026

ใช้ซอร์สที่เข้าถึงได้จริงจาก BassSG/Chart2Plan และตรวจเทียบ GAS Script ID `1SM3hKmFADM-gYV6IuuZiH6XreZcwhIiAqUaObuiZf5KXGmUMKBHUfzdu` ชุดตั้งต้นไม่มี DayTrade.gs; Planner ผ่าน 42 กลุ่ม และ ResearchLog ผ่าน 46 กรณี จึงสร้างส่วนที่ขาดตาม brief หลังผู้ใช้ยืนยันให้ทำจากไฟล์ที่มี

## สิ่งที่แก้

- เพิ่ม DayTrade.gs และโหลดก่อน Workflow.gs ใน Planner.test.cjs; ResearchLog.test.cjs โหลดกฎร่วมด้วย
- แผน daytrade ต้องห่าง Entry จาก Ask สำหรับ BUY / Bid สำหรับ SELL ไม่เกิน 6 ATR ของ execution TF ตรวจทั้งก่อนและหลัง AI ค่า ATR/ราคาไม่ครบต้องปฏิเสธ ไม่มีการเลื่อน Entry เพื่อทำให้ผ่าน
- แก้ prompt ให้รับทั้ง side 1/-1 และ BUY/SELL ส่งเฉพาะ valid:true และ eligible:true พร้อมราคาและ R/R ที่คำนวณแล้ว ทั้งแผน legacy และ unified จึงไม่ตกหล่นเพียงเพราะรูปแบบ side ต่างกัน
- ไม่เปลี่ยนแผนที่ไม่ผ่านให้ผ่าน; AI ยังเลือก NO_TRADE ได้เมื่อไม่มีแผนเหมาะสม การแก้นี้ไม่รับประกันว่าจะมีสัญญาณทุกครั้ง
- Pending ของแผน daytrade ใหม่หมดอายุ 60 นาทีหลังยอมรับแผน ส่วนการเริ่มจำลองยังเป็นนาที M1 เต็มถัดไป ไม่ย้อนหลังอ้าง fill ในเศษนาที
- หลัง modeled fill ถือได้สูงสุด 240 นาที นับจาก fillAt ที่ทราบเมื่อแท่ง M1 ปิด แล้วปิดจำลอง TIME_EXIT ด้วยราคาปิด Bid สำหรับ BUY / Ask ที่คำนวณจาก Bid+spread ที่ล็อกไว้สำหรับ SELL พร้อมหัก exit allowance
- SL/TP ที่เกิดในแท่งสุดท้ายได้รับการพิจารณาก่อน TIME_EXIT; แตะทั้งคู่หรือ Entry/expiry อยู่ใน M1 เดียวกันโดยไม่รู้ลำดับให้ REVIEW ไม่แต่งผลแพ้/ชนะ
- การหมดเวลาต้องมีแท่ง M1 ปิดและข้อมูลต่อเนื่อง การเปิดหน้าเว็บหลังครบเวลาโดยไม่มีข้อมูลไม่สร้างราคา exit ขึ้นเอง
- TIME_EXIT เป็นผลจำลองที่ resolved เมื่อมีราคาครบและรวมในสถิติ พร้อมแสดงจำนวนบน Research UI; ไม่ใช่ broker fill หรือคำสั่งปิดจริง
- ใช้ Rolling Horizon ไม่มีเวลาตัดรอบรายวัน จึงอาจพาดผ่านเที่ยงคืนตามเวลาที่สร้าง/เข้าแผน
- แผนเก่าที่บันทึกไว้และ style อื่นคงนโยบายเดิมที่ล็อกไว้ ไม่ย้อนหลังแปลงสถานะหรือแก้ประวัติ
- หน้าประวัติแสดง audit candidate แบบย่อสูงสุด 60 รายการต่อรอบ พร้อมจำนวนรวม ส่วนหลักฐานเต็มยังเก็บใน Sheet เพื่อลดข้อมูลตอบกลับบนเว็บ (ทดสอบจาก 106,566,730 เหลือ 384,074 อักขระ)
- หน้า Research แสดงผลเป็นลำดับ: สถานะที่อ่านง่าย → Entry/SL/TP/R/R → มุมมองตลาดและเหตุผล BUY/SELL → สถิติผ่านกฎ → การ์ดแผนที่ผ่านกฎ โดยเน้นแผนที่ AI เลือก; รายการแผนและรหัสเทคนิคย้ายไว้ในรายละเอียดที่เปิดดูได้
- แก้การอ่าน TP ของ Unified candidate ที่แยก geom ออกจาก target และไม่แสดงเลขศูนย์ลวงเมื่อคำขอ Busy/ยังไม่ได้ประเมิน
- ในการ์ดผล AI ส่วน “รายละเอียดต้นฉบับจากระบบ” แบ่งข้อความเป็นหัวข้อตามลำดับเดิม: มุมมองตลาด, BUY, SELL, ประเภทคำสั่งและระดับราคา, เหตุผลของราคา, สถานะระบบ พร้อมจัดรายการราคาแบบป้ายกำกับและค่าที่อ่านได้ชัดเจน; เปิด “ดูข้อความดิบแบบเดิม” เพื่ออ่านต้นฉบับรวมบรรทัดว่างได้ครบ

## ผลตรวจ

- Planner.test.cjs: 50/50 กลุ่ม ผ่าน (42 เดิม + 8 เพิ่ม)
- ResearchLog.test.cjs: 73/73 กรณี ผ่าน (46 เดิม + 27 เพิ่ม)
- Parse และ initialize 19 ไฟล์ .gs ใน scope รวมด้วย V8 ผ่าน ไม่มีชื่อฟังก์ชัน global ซ้ำ
- Parse script ฝั่ง HTML ในชุดส่งมอบ 4 ส่วน ผ่าน
- staging ส่วนตัวที่รวมไฟล์ GAS ล่าสุดและ provider config เดิม: parse 20 ไฟล์ JavaScript ใน scope รวม ผ่าน; manifest เป็น V8
- Deploy ผ่าน Clasp ไปยัง Script ID ที่ระบุแล้ว: deployment เดิมรุ่น 29, revision `2026-10-24-original-details-1`; pull รุ่น 29 กลับมาตรวจเทียบไฟล์ 26/26 ตรงกับ staging รวม private config เดิม
- เปิด PWA และตรวจ status revision จริง; diagnostics ได้ 3 แผนผ่านจาก 791 แผน; กดวิเคราะห์ AI จริงหนึ่งครั้งได้ SIGNAL READY และยืนยันบันทึกแผนจำลองใน Sheet
- โหลดประวัติจากเซิร์ฟเวอร์บนเว็บรุ่น 25 สำเร็จ: แผนที่บันทึกมี createdAt 1792845939799 และ expiresAt 1792849539799 (ต่างกัน 60 นาที), maxHoldMinutes 240
- ทดสอบ Research UI ด้วยข้อมูลตัวอย่างที่มีผล AI, diagnostics, Busy และข้อความ HTML แปลกปลอม; เปิดภาพตัวอย่างในเบราว์เซอร์ตรวจการจัดวาง แล้วตรวจหน้าเว็บจริงหลัง deploy
- เว็บรุ่น 28 แสดงผลตรวจจริง 791 แผน / ผ่าน 3 แผน พร้อม Entry/SL/TP/Net R ครบทั้ง 3 การ์ด และเปิด-ปิดตารางรายละเอียดได้; ภาพหลักฐานอยู่ที่ `outputs/daytrade-validation/research-ui-v28-live.png`
- PremiumUi.test.cjs ตรวจเนื้อหาครบ ลำดับเดิม การ escape HTML ข้อความว่าง และ NO_TRADE ผ่าน; เปิด PWA รุ่น 29 ตรวจผลเดิมที่บันทึกไว้จริง มี 5 หัวข้อ, 11 บรรทัด, Entry/SL/TP และเปิดข้อความดิบครบได้ โดยไม่เรียก AI ซ้ำ; ภาพอยู่ที่ `outputs/daytrade-validation/premium-original-details-live-v29.png` และ `premium-original-details-raw-v29.png`

เทสต์ 50/73 ข้อเป็น offline ส่วนผล status, diagnostics, AI และประวัติข้างต้นตรวจผ่านเว็บ GAS/PWA จริง เป็นโหมด PAPER ไม่มีคำสั่งเทรดจริง และยังไม่ได้ยืนยัน Pine runtime parity หรือผลกำไร

## ไฟล์ที่เปลี่ยนสำหรับ GAS

DayTrade.gs, Workflow.gs, ResearchLog.gs, ResearchUi.html, PremiumUi.html, PremiumStyles.html, Code.gs, Planner.gs และ AfUnifiedPlannerEngine.gs โดยสองไฟล์ท้ายเพิ่ม tolerance เพียงหนึ่งในพันล้านของ tick สำหรับความคลาดเคลื่อน floating point ตรงขอบ 6 ATR และ Code.gs เปลี่ยน revision เป็น `2026-10-24-original-details-1` ส่วนไฟล์เทสต์ไม่ต้องอัปโหลดเข้า GAS

ชุดนี้ไม่มี API key, PrivateProviderConfig หรือ credentials ของ Clasp ห้าม push ทั้งโฟลเดอร์นี้ตรง ๆ เพราะเป็นชุดซอร์สสำหรับตรวจและเทสต์ ไม่ใช่สำเนาคอนฟิกครบชุด

สคริปต์ Prepare-GAS.ps1 จะ pull GAS ปัจจุบันลง staging ส่วนตัว เก็บไฟล์ที่ไม่ได้เปลี่ยนและ config เดิมไว้ เทียบ hash ของไฟล์ฐาน แล้ว overlay เฉพาะ 9 ไฟล์ข้างต้น หากไฟล์บน GAS เปลี่ยนจากฐานที่ตรวจไว้จะหยุดให้ตรวจความต่างก่อน จึงไม่ทับงานใหม่เงียบ ๆ

```powershell
# ตรวจเทสต์จากในโฟลเดอร์ชุดส่งมอบ
node Planner.test.cjs
node ResearchLog.test.cjs
node PremiumUi.test.cjs
node Validate.cjs .

# เตรียม staging และแสดง clasp status (ยังไม่เขียน GAS)
./Prepare-GAS.ps1

# ส่งเฉพาะ HEAD หลังตรวจ staging
./Prepare-GAS.ps1 -Push

# ส่ง HEAD และอัปเดต deployment URL เดิม
./Prepare-GAS.ps1 -Deploy
```

ต้องใช้ Clasp ที่ login บัญชีเจ้าของโปรเจกต์ไว้แล้ว สคริปต์ไม่เปลี่ยนสิทธิ์ แชร์ไฟล์ OAuth scopes หรือ API keys

หลัง deploy ให้ตรวจ status revision, เปิด UI, กด diagnostics ที่ไม่เสียค่า AI และตรวจ Sheet/audit ก่อนรายงานว่ารุ่นนี้ทำงานจริงครบเส้นทาง
