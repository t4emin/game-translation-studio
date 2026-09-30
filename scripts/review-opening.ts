import { editTranslation } from "../src/core/projects.ts";
const id=process.argv[2];
const corrections:Record<string,string>={
  "dialog-1c5ce8":"สวัสดี![NEW_LINE]ยินดีที่ได้รู้จัก![PROMPT_CLEAR]ยินดีต้อนรับสู่โลกของ POKéMON![PROMPT_CLEAR]ฉันชื่อ OAK[PROMPT_CLEAR]ผู้คนมักเรียกฉันว่า[NEW_LINE]ศาสตราจารย์ POKéMON[PROMPT_CLEAR]",
  "dialog-1c5d82":"...มีสิ่งมีชีวิตอาศัยอยู่ทั่วทุกแห่ง[NEW_LINE]พวกมันมีชื่อว่า POKéMON[PROMPT_CLEAR]",
  "dialog-1c5dbb":"บางคนเลี้ยง POKéMON เป็นเพื่อน[NEW_LINE]บางคนก็ใช้พวกมันต่อสู้[PROMPT_CLEAR]ส่วนฉันน่ะ...[PROMPT_CLEAR]ฉันศึกษา POKéMON เป็นอาชีพ[PROMPT_CLEAR]",
  "dialog-1c5e2d":"แต่ก่อนอื่น เล่าเรื่อง[NEW_LINE]ตัวเธอให้ฉันฟังหน่อย[PROMPT_CLEAR]",
  "dialog-1c5e9e":"นี่คือหลานชายของฉัน[PROMPT_CLEAR]เขาเป็นคู่แข่งของเธอ[NEW_LINE]ตั้งแต่พวกเธอยังเป็นเด็กทารก[PROMPT_CLEAR]เอ่อ... เขาชื่ออะไรนะ?",
  "dialog-1c5f01":"คู่แข่งของเธอชื่ออะไรนะ?",
  "dialog-1c5f25":"...เอ่อ ชื่อ [VAR:RIVAL] ใช่ไหม?",
  "dialog-1c589d":"ปุ่มต่างๆ ของเกม[NEW_LINE]เรียงตามความสำคัญ",
  "dialog-1c58e5":"ขยับตัวละครหลัก[NEW_LINE]และเลือกหัวข้อ[NEW_LINE]ต่างๆ",
  "dialog-1c592a":"ยืนยัน ตรวจสอบ[NEW_LINE]พูดคุย และเลื่อนข้อความ",
  "dialog-1c5969":"ออกหรือยกเลิก[NEW_LINE]สิ่งที่เลือก",
  "dialog-1c599b":"เปิด[NEW_LINE]MENU",
  "dialog-1c59bf":"ย้ายไอเทม หรือใช้[NEW_LINE]ไอเทมที่ลงทะเบียนไว้",
  "dialog-1c59f1":"ถ้าต้องการความช่วยเหลือ[NEW_LINE]ในการเล่นเกม[NEW_LINE]กดปุ่ม L หรือ R",
  "dialog-1c5a74":"ในโลกที่คุณจะ[NEW_LINE]ก้าวเข้าไป คุณจะเป็น[NEW_LINE]ผู้กล้าในการผจญภัย[NEW_LINE][NEW_LINE]พูดคุยและสำรวจสิ่งต่างๆ[NEW_LINE]ทั้งในเมือง บนถนน[NEW_LINE]และในถ้ำ เพื่อเก็บข้อมูล[NEW_LINE]และเบาะแสจากทุกที่",
  "dialog-1c5b5b":"ทางใหม่จะเปิดเมื่อคุณ[NEW_LINE]ช่วยผู้คน ฝ่าอุปสรรค[NEW_LINE]และไขปริศนา[NEW_LINE][NEW_LINE]บางครั้งจะมีคนท้าสู้[NEW_LINE]และพบการโจมตีจากสัตว์ป่า[NEW_LINE]จงกล้าและเดินหน้าต่อไป",
  "dialog-1c5c29":"เราหวังว่าการผจญภัย[NEW_LINE]จะทำให้คุณได้พบผู้คน[NEW_LINE]และเติบโตขึ้น[NEW_LINE]นั่นคือเป้าหมายของเรา[NEW_LINE][NEW_LINE]กดปุ่ม A เพื่อเริ่ม[NEW_LINE]การผจญภัยได้เลย!"
};
for(const [entry,text] of Object.entries(corrections)) await editTranslation(id,entry,text);
console.log(`Reviewed ${Object.keys(corrections).length} opening messages.`);
