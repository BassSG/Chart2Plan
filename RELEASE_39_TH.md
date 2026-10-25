# รุ่น 39 — TAProAlerts และ TAProSignalLog ครบทั้งสองแท็บ

ตรวจงาน “ปรับปรุงแอป TAPro Signal” และซอร์สแอป 3.3.0 แล้ว: หน้าสรุปอ่าน TAProSignalLog ส่วนต้นทางเดิมอ่าน TAProAlerts เป็นกลุ่ม Entry / SL / TP1

- แผน Allindy มี 3 แถว Entry / SL / TP1 ใน TAProAlerts และ 1 แถวสรุปใน TAProSignalLog ผูก Run ID และ Plan Key เดียวกัน
- ใช้ตำแหน่ง A:L จริงเหมือน saveAlert ของต้นแบบ โดยคงหัวตารางเดิมที่เยื้องไว้เพื่อไม่ย้ายข้อมูลเดิม
- เพิ่ม Plan Source / Plan Key / Monitoring Mode / Source Revision / Pending ExpiresAt / Hold Until ต่อท้าย TAProAlerts
- บันทึกซ้ำและเปลี่ยนสถานะจะอัปเดตแถวเดิม ถ้าบันทึกได้บางจุดจะซ่อมส่วนที่ขาดก่อนยืนยันแถวสรุป
- การยกเลิก Entry ที่ยัง Pending ใน TAProAlerts จะเข้าบัญชี PAPER และสะท้อนแถวสรุปในรอบตรวจถัดไป
- ตัวติดตามเดิมของ Allindy ยังเป็นผู้คำนวณสถานะตามแท่ง M1 และกฎ 60 / 240 นาที ตัวอย่างโปรเจกต์จะข้ามแถว ALLINDY_FIBO ใน legacy lifecycle / news reconciliation / EA snapshot / trade-command reconciliation
- เส้นทาง Push ยังคงใช้แถวสรุปหนึ่งแถว จึงไม่แจ้งซ้ำสามครั้งจากแถว Entry / SL / TP1
- ปุ่ม Google Sheet เปิด TAProAlerts ส่วนลิงก์แผนแต่ละรอบยังเปิดแถวสรุปได้

กฎวิเคราะห์และราคาจาก Planner / Allindy / Fibo / DayTrade และ pure PAPER reducer ไม่เปลี่ยน ไม่เรียก AI เพื่อย้ายข้อมูล และไม่ส่งคำสั่งซื้อขายจากแถว PAPER

ไฟล์ integrations/TAProPaperRouting.patch ใช้กับ Clasp source ของโปรเจกต์ตัวอย่าง และ integrations/TAProRouting.test.cjs ตรวจการแยก PAPER จากเส้นทางเดิมได้โดยส่งพาธซอร์สที่ดึงมาเป็นอาร์กิวเมนต์
