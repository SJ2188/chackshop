const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();
const PORT = 3002;
const fileUpload = require('express-fileupload');
app.use(fileUpload({ limits: { fileSize: 5 * 1024 * 1024 } }));

// ============ Line Notify Config ============
// ได้รับ Token ได้ที่ https://notify-bot.line.me/
const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN || '';

function sendLineNotify(message) {
  if (!LINE_NOTIFY_TOKEN) {
    console.log('[Line Notify] Token not configured, skipping:', message);
    return Promise.resolve();
  }
  
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams({ message });
    const options = {
      hostname: 'notify-api.line.me',
      path: '/api/notify',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LINE_NOTIFY_TOKEN}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.toString().length
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('[Line Notify] Sent successfully');
          resolve();
        } else {
          console.log('[Line Notify] Failed:', body);
          reject(new Error(body));
        }
      });
    });
    
    req.on('error', reject);
    req.write(data.toString());
    req.end();
  });
}

// ============ Line Pay Config ============
// ได้รับ Channel ID และ Secret ได้จาก Line Pay Console
const LINE_PAY_CHANNEL_ID = process.env.LINE_PAY_CHANNEL_ID || '';
const LINE_PAY_CHANNEL_SECRET = process.env.LINE_PAY_CHANNEL_SECRET || '';
const LINE_PAY_API_URL = 'https://sandbox-api.line.me'; // เปลี่ยนเป็น 'https://api.line.me' สำหรับ Production

function linePayConfirm(transactionId, amount) {
  if (!LINE_PAY_CHANNEL_ID || !LINE_PAY_CHANNEL_SECRET) {
    console.log('[Line Pay] Not configured, skipping confirmation');
    return Promise.resolve({ success: false, message: 'Line Pay not configured' });
  }
  
  const uri = '/v2/payments/confirm';
  const body = JSON.stringify({
    amount,
    currency: 'THB',
    orderId: `ORDER_${transactionId}`
  });
  
  const nonce = Date.now().toString();
  const signature = generateHmacsha256(LINE_PAY_CHANNEL_SECRET, LINE_PAY_CHANNEL_SECRET + uri + body + nonce);
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'sandbox-api.line.me',
      path: uri,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LINE-ChannelId': LINE_PAY_CHANNEL_ID,
        'X-LINE-Authorization': signature,
        'X-LINE-Nonce': nonce
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ success: false, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function generateHmacsha256(secret, message) {
  const crypto = require('crypto');
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============ Real Product Data (100 items) ============
const realProducts = [
  // === น้ำมัน & ไขมัน ===
  { id: 1, name: "น้ำมันถั่วลิสงตราช้าง 1 ลิตร", price: 75, original: 89, unit: "ขวด", category: "น้ำมัน", image: "https://placehold.co/400x400/FFF3E0/FF6B00?text=น้ำมันถั่วลิสง", stock: 80, desc: "น้ำมันถั่วลิสงสกัดเย็น คุณภาพดี รสชาติอร่อย" },
  { id: 2, name: "น้ำมันปาล์มโอลีน 1.5 ลิตร", price: 62, original: 72, unit: "ขวด", category: "น้ำมัน", image: "https://placehold.co/400x400/FFF3E0/E65100?text=น้ำมันปาล์ม", stock: 120, desc: "น้ำมันปาล์มบริสุทธิ์ เหมาะสำหรับทอดและผัด" },
  { id: 3, name: "น้ำมันรำข้าวลิโต้ 1 ลิตร", price: 95, original: 115, unit: "ขวด", category: "น้ำมัน", image: "https://placehold.co/400x400/FFF3E0/795548?text=น้ำมันรำข้าว", stock: 60, desc: "น้ำมันรำข้าวผสมน้ำมันถั่วลิสง ดีต่อสุขภาพ" },
  { id: 4, name: "เนยเทียมแพม 500 กรัม", price: 89, original: 105, unit: "ก้อน", category: "น้ำมัน", image: "https://placehold.co/400x400/FFFDE7/FFC107?text=เนยเทียม", stock: 45, desc: "เนยเทียมเนื้อนุ่ม เหมาะสำหรับทาขนมปัง" },
  
  // === เครื่องปรุงรส ===
  { id: 5, name: "น้ำปลาไทยตราฉลู 700 มล.", price: 32, original: 38, unit: "ขวด", category: "เครื่องปรุง", image: "https://placehold.co/400x400/3E2723/FFF?text=น้ำปลา", stock: 200, desc: "น้ำปลาสูตรพิเศษ หอม อร่อย เค็มกำลังดี" },
  { id: 6, name: "ซีอิ๊วขาวตราห้าวพลัส 300 มล.", price: 28, original: 35, unit: "ขวด", category: "เครื่องปรุง", image: "https://placehold.co/400x400/4E342E/FFF?text=ซีอิ๊วขาว", stock: 150, desc: "ซีอิ๊วขาวสูตรพิเศษ รสชาติกลมกล่อม" },
  { id: 7, name: "ซีอิ๊วดำตราสุก 300 มล.", price: 30, original: 36, unit: "ขวด", category: "เครื่องปรุง", image: "https://placehold.co/400x400/212121/FFF?text=ซีอิ๊วดำ", stock: 90, desc: "ซีอิ๊วดำหวาน เหมาะสำหรับผัดและต้มยำ" },
  { id: 8, name: "น้ำตาลทรายขาวมิตรผล 1 กิโล", price: 22, original: 26, unit: "ถุง", category: "เครื่องปรุง", image: "https://placehold.co/400x400/F5F5F5/757575?text=น้ำตาล", stock: 300, desc: "น้ำตาลทรายขาวบริสุทธิ์ คุณภาพดี" },
  { id: 9, name: "เกลือป่นเค็มดี 500 กรัม", price: 12, original: 15, unit: "ถุง", category: "เครื่องปรุง", image: "https://placehold.co/400x400/F5F5F5/9E9E9E?text=เกลือ", stock: 250, desc: "เกลือป่นสะอาด บริสุทธิ์" },
  { id: 10, name: "ผงกะหรี่สำเร็จรูปมาซาลา 50 กรัม", price: 35, original: 42, unit: "ซอง", category: "เครื่องปรุง", image: "https://placehold.co/400x400/FF8F00/FFF?text=ผงกะหรี่", stock: 80, desc: "ผงกะหรี่สูตรมาซาลาแท้ๆ จากอินเดีย" },
  { id: 11, name: "พริกไทยป่นหยวก 50 กรัม", price: 25, original: 30, unit: "ซอง", category: "เครื่องปรุง", image: "https://placehold.co/400x400/1B5E20/FFF?text=พริกไทย", stock: 120, desc: "พริกไทยป่นคุณภาพดี หอม เผ็ด" },
  { id: 12, name: "ข่า ตระไคร้ มะกรูดแห้ง 30 กรัม", price: 22, original: 28, unit: "ซอง", category: "เครื่องปรุง", image: "https://placehold.co/400x400/E8F5E9/2E7D32?text=เครื่องเทศ", stock: 60, desc: "เครื่องเทศสำหรับต้มยำ หอม สดชื่น" },
  { id: 13, name: "ซอสปรุงรสตราอินทรี 350 มล.", price: 28, original: 34, unit: "ขวด", category: "เครื่องปรุง", image: "https://placehold.co/400x400/5D4037/FFF?text=ซอสปรุงรส", stock: 140, desc: "ซอสปรุงรสอเนกประสงค์ รสชาติกลมกล่อม" },
  { id: 14, name: "ซอสมะเขือเทศตราอินทรี 350 มล.", price: 28, original: 34, unit: "ขวด", category: "เครื่องปรุง", image: "https://placehold.co/400x400/D32F2F/FFF?text=ซอสมะเขือเทศ", stock: 100, desc: "ซอสมะเขือเทศเนื้อเข้มข้น" },
  { id: 15, name: "ซอสหอยนางรมตราอินทรี 340 มล.", price: 32, original: 39, unit: "ขวด", category: "เครื่องปรุง", image: "https://placehold.co/400x400/795548/FFF?text=ซอสหอยนางรม", stock: 85, desc: "ซอสหอยนางรม รสชาติเข้มข้น หอมอร่อย" },
  { id: 16, name: "ผงชูรสตราห้าว 100 กรัม", price: 38, original: 45, unit: "ซอง", category: "เครื่องปรุง", image: "https://placehold.co/400x400/FFB300/FFF?text=ผงชูรส", stock: 110, desc: "ผงชูรสเพิ่มความอร่อย" },
  { id: 17, name: "น้ำส้มสายชูขาวมิตรผล 750 มล.", price: 25, original: 30, unit: "ขวด", category: "เครื่องปรุง", image: "https://placehold.co/400x400/FFFDE7/F9A825?text=น้ำส้มสายชู", stock: 70, desc: "น้ำส้มสายชูขาวบริสุทธิ์" },
  { id: 18, name: "มาม่ารสต้มยำกุ้ง 75 กรัม", price: 7, original: 8, unit: "ซอง", category: "เครื่องปรุง", image: "https://placehold.co/400x400/FF5722/FFF?text=มาม่า", stock: 400, desc: "มาม่ารสต้มยำกุ้ง รสจัดจ้าน" },
  
  // === ข้าว & แป้ง ===
  { id: 19, name: "ข้าวหอมมะลิทุ่งกุลา 5 กิโลกรัม", price: 165, original: 189, unit: "ถุง", category: "ข้าว", image: "https://placehold.co/400x400/FFF8E1/FF6B00?text=ข้าวหอมมะลิ", stock: 100, desc: "ข้าวหอมมะลิคุณภาพดี หอม นุ่ม อร่อย" },
  { id: 20, name: "ข้าวเหนียวกข.63 5 กิโลกรัม", price: 145, original: 165, unit: "ถุง", category: "ข้าว", image: "https://placehold.co/400x400/F5F5F5/5D4037?text=ข้าวเหนียว", stock: 80, desc: "ข้าวเหนียวเม็ดเรียว หอม มัน อร่อย" },
  { id: 21, name: "ข้าวโพดธัญญาหารา 500 กรัม", price: 45, original: 55, unit: "ถุง", category: "ข้าว", image: "https://placehold.co/400x400/FFEB3B/5D4037?text=ข้าวโพด", stock: 50, desc: "ข้าวโพดธัญญาหาราอินทรีย์ อุดมด้วยไฟเบอร์" },
  { id: 22, name: "แป้งสาลีอินทรี 1 กิโลกรัม", price: 35, original: 42, unit: "ถุง", category: "ข้าว", image: "https://placehold.co/400x400/F5F5F5/757575?text=แป้งสาลี", stock: 90, desc: "แป้งสาลีเอนกประสงค์ เหมาะสำหรับทำขนมและอบ" },
  { id: 23, name: "แป้งมันสำปะหลังสยาม 500 กรัม", price: 22, original: 28, unit: "ถุง", category: "ข้าว", image: "https://placehold.co/400x400/EFEBE9/8D6E63?text=แป้งมัน", stock: 75, desc: "แป้งมันสำปะหลังเนื้อละเอียด" },
  { id: 24, name: "แป้งข้าวเจ้าตราหงษ์ 500 กรัม", price: 25, original: 30, unit: "ถุง", category: "ข้าว", image: "https://placehold.co/400x400/F5F5F5/757575?text=แป้งข้าวเจ้า", stock: 65, desc: "แป้งข้าวเจ้าสำหรับทำขนม" },
  
  // === ผลิตภัณฑ์ทำความสะอาด ===
  { id: 25, name: "น้ำยาซักผ้าชนิดเข้มข้นไบรท์ 2.7 ลิตร", price: 159, original: 189, unit: "ขวด", category: "ผลิตภัณฑ์ทำความสะอาด", image: "https://placehold.co/400x400/3F51B5/FFF?text=น้ำยาซักผ้า", stock: 60, desc: "น้ำยาซักผ้าเข้มข้น กลิ่นหอมสดชื่น ซักนุ่ม" },
  { id: 26, name: "ผงซักฟอกแอริออน 3.4 กิโลกรัม", price: 175, original: 199, unit: "ถุง", category: "ผลิตภัณฑ์ทำความสะอาด", image: "https://placehold.co/400x400/E91E63/FFF?text=ผงซักฟอก", stock: 55, desc: "ผงซักฟอกแอริออน ซักสะอาด หอมนาน" },
  { id: 27, name: "น้ำยาปรับผ้านุ่มดาวนี่ 900 มล.", price: 65, original: 78, unit: "ขวด", category: "ผลิตภัณฑ์ทำความสะอาด", image: "https://placehold.co/400x400/9C27B0/FFF?text=น้ำยาปรับผ้า", stock: 80, desc: "น้ำยาปรับผ้านุ่ม กลิ่นหอมละเอียดอ่อน" },
  { id: 28, name: "น้ำยาล้างจานสูตรเข้มข้นไบรท์ 750 มล.", price: 49, original: 59, unit: "ขวด", category: "ผลิตภัณฑ์ทำความสะอาด", image: "https://placehold.co/400x400/00BCD4/FFF?text=น้ำยาล้างจาน", stock: 120, desc: "น้ำยาล้างจานฆ่าเชื้อแบคทีเรีย 99.9%" },
  { id: 29, name: "น้ำยาทำความสะอาดครัวฮาร์ปิค 500 มล.", price: 45, original: 55, unit: "ขวด", category: "ผลิตภัณฑ์ทำความสะอาด", image: "https://placehold.co/400x400/4CAF50/FFF?text=น้ำยาครัว", stock: 70, desc: "น้ำยาทำความสะอาดครัว ขจัดคราบมัน" },
  { id: 30, name: "น้ำยาทำความสะอาดห้องน้ำฮาร์ปิค 500 มล.", price: 45, original: 55, unit: "ขวด", category: "ผลิตภัณฑ์ทำความสะอาด", image: "https://placehold.co/400x400/00BCD4/FFF?text=น้ำยาห้องน้ำ", stock: 65, desc: "น้ำยาทำความสะอาดห้องน้ำ ขจัดคราบหินปูน" },
  { id: 31, name: "สบู่ผัววิชตี้ฟรุต 125 กรัม 3 ชิ้น", price: 35, original: 42, unit: "แพ็ค", category: "ผลิตภัณฑ์ทำความสะอาด", image: "https://placehold.co/400x400/E91E63/FFF?text=สบู่ผัว", stock: 90, desc: "สบู่ผัววิชตี้กลิ่นฟรุตหอมสดชื่น" },
  { id: 32, name: "กระดาษทิชชู่ออร์แกนิค 12 ม้วน", price: 55, original: 65, unit: "แพ็ค", category: "ผลิตภัณฑ์ทำความสะอาด", image: "https://placehold.co/400x400/F5F5F5/757575?text=ทิชชู่", stock: 100, desc: "กระดาษทิชชู่เนื้อนุ่ม ซับแห้งเร็ว" },
  
  // === อาหารแห้ง & กระป๋อง ===
  { id: 33, name: "ข้าวหอมมะลิสีสัน 5 กิโลกรัม", price: 175, original: 195, unit: "ถุง", category: "อาหารแห้ง", image: "https://placehold.co/400x400/FFF8E1/FF6B00?text=ข้าวหอมมะลิ", stock: 85, desc: "ข้าวหอมมะลิเม็ดยาว หอมนุ่ม อร่อย" },
  { id: 34, name: "มาม่ารสต้มยำกุ้ง 75 กรัม", price: 7, original: 8, unit: "ซอง", category: "อาหารแห้ง", image: "https://placehold.co/400x400/FF5722/FFF?text=มาม่า", stock: 500, desc: "บะหมี่กึ่งสำเร็จรูปรสต้มยำกุ้ง" },
  { id: 35, name: "มาม่ารสหมูผัดโบราณ 75 กรัม", price: 7, original: 8, unit: "ซอง", category: "อาหารแห้ง", image: "https://placehold.co/400x400/D84315/FFF?text=มาม่าหมู", stock: 450, desc: "บะหมี่กึ่งสำเร็จรูปรสหมูผัดโบราณ" },
  { id: 36, name: "มาม่ารสผัดขี้เมา 75 กรัม", price: 7, original: 8, unit: "ซอง", category: "อาหารแห้ง", image: "https://placehold.co/400x400/BF360C/FFF?text=มาม่าขี้เมา", stock: 400, desc: "บะหมี่กึ่งสำเร็จรูปรสผัดขี้เมา" },
  { id: 37, name: "ปลาซาร์ดีนน้ำมันมะกอก 155 กรัม", price: 22, original: 28, unit: "กระป๋อง", category: "อาหารแห้ง", image: "https://placehold.co/400x400/78909C/FFF?text=ปลาซาร์ดีน", stock: 110, desc: "ปลาซาร์ดีนในน้ำมันมะกอก อุดมด้วยโอเมก้า 3" },
  { id: 38, name: "ปลาทูน่ากระป๋อง 185 กรัม", price: 35, original: 42, unit: "กระป๋อง", category: "อาหารแห้ง", image: "https://placehold.co/400x400/607D8B/FFF?text=ปลาทูน่า", stock: 95, desc: "ปลาทูน่าเนื้อนุ่มในน้ำแห้ง" },
  { id: 39, name: "ข้าวซอยนิรมิต 100 กรัม", price: 28, original: 35, unit: "ซอง", category: "อาหารแห้ง", image: "https://placehold.co/400x400/FFCC80/795548?text=ข้าวซอย", stock: 60, desc: "เส้นข้าวซอยแห้งสำเร็จรูป" },
  { id: 40, name: "ซุปเปอร์มิลล์ผง 60 กรัม", price: 18, original: 22, unit: "ซอง", category: "อาหารแห้ง", image: "https://placehold.co/400x400/FFAB91/BF360C?text=ซุปเปอร์มิลล์", stock: 80, desc: "ซุปเปอร์มิลล์ผงรสกลมกล่อม" },
  
  // === ไข่ & ผลิตภัณฑ์นม ===
  { id: 41, name: "ไข่ไก่คุณภาพดี 10 ฟอง", price: 52, original: 62, unit: "แผง", category: "ไข่ & นม", image: "https://placehold.co/400x400/FFF8E1/FF8F00?text=ไข่ไก่", stock: 60, desc: "ไข่ไก่สดใหม่ เกรด A ขนาดกลาง" },
  { id: 42, name: "ไข่เป็ดใหญ่ 10 ฟอง", price: 55, original: 65, unit: "แผง", category: "ไข่ & นม", image: "https://placehold.co/400x400/F5F5F5/5D4037?text=ไข่เป็ด", stock: 40, desc: "ไข่เป็ดสดใหม่ ขนาดใหญ่" },
  { id: 43, name: "นมสดยูเอชทีโฮโฮลด์ 1 ลิตร", price: 45, original: 52, unit: "กล่อง", category: "ไข่ & นม", image: "https://placehold.co/400x400/F5F5F5/1565C0?text=นมสด", stock: 80, desc: "นมสดพาสเจอร์ไรส์ สดใหม่ อร่อย" },
  { id: 44, name: "นมถั่วเหลืองอินทรีย์ 1 ลิตร", price: 38, original: 45, unit: "กล่อง", category: "ไข่ & นม", image: "https://placehold.co/400x400/E8F5E9/2E7D32?text=นมถั่วเหลือง", stock: 50, desc: "นมถั่วเหลืองสูตรไม่เติมน้ำตาล" },
  { id: 45, name: "โยเกิร์ตกล่องซื่อตรง 100 มล. 4 กล่อง", price: 28, original: 35, unit: "แพ็ค", category: "ไข่ & นม", image: "https://placehold.co/400x400/FCE4EC/C2185B?text=โยเกิร์ต", stock: 60, desc: "โยเกิร์ตพร้อมดื่ม รสสดชื่น" },
  
  // === เครื่องดื่ม ===
  { id: 46, name: "น้ำเปล่าครอสตอน 1500 มล.", price: 12, original: 15, unit: "ขวด", category: "เครื่องดื่ม", image: "https://placehold.co/400x400/E3F2FD/2196F3?text=น้ำเปล่า", stock: 300, desc: "น้ำดื่มบริสุทธิ์ สะอาด ปลอดภัย" },
  { id: 47, name: "น้ำอัดลมโคคาโคล่า 1.5 ลิตร", price: 22, original: 26, unit: "ขวด", category: "เครื่องดื่ม", image: "https://placehold.co/400x400/D32F2F/FFF?text=โคคาโคล่า", stock: 150, desc: "น้ำอัดลมโคคาโคล่า รสชาติเดิม" },
  { id: 48, name: "น้ำอัดลมเป๊ปซี่ 1.5 ลิตร", price: 19, original: 23, unit: "ขวด", category: "เครื่องดื่ม", image: "https://placehold.co/400x400/1565C0/FFF?text=เป๊ปซี่", stock: 180, desc: "น้ำอัดลมเป๊ปซี่ รสหอมเปรี้ยว" },
  { id: 49, name: "น้ำดื่มเนสกาแฟ 600 มล.", price: 15, original: 18, unit: "ขวด", category: "เครื่องดื่ม", image: "https://placehold.co/400x400/795548/FFF?text=เนสกาแฟ", stock: 120, desc: "น้ำดื่มผสมกาแฟเนสกาแฟ รสเข้มข้น" },
  { id: 50, name: "กาแฟเย็นเลคเมคเมอร์ 180 มล.", price: 12, original: 15, unit: "กล่อง", category: "เครื่องดื่ม", image: "https://placehold.co/400x400/3E2723/FFF?text=กาแฟเย็น", stock: 200, desc: "กาแฟเย็นพร้อมดื่ม รสเข้มข้น" },
  { id: 51, name: "น้ำผลไม้ผสมทรอปิคอล 1 ลิตร", price: 35, original: 42, unit: "ขวด", category: "เครื่องดื่ม", image: "https://placehold.co/400x400/FF9800/FFF?text=น้ำผลไม้", stock: 70, desc: "น้ำผลไม้ผสมรสส้ม มะม่วง สัปปะรด" },
  { id: 52, name: "ชาเขียวโอวอนี่ 500 มล.", price: 18, original: 22, unit: "ขวด", category: "เครื่องดื่ม", image: "https://placehold.co/400x400/4CAF50/FFF?text=ชาเขียว", stock: 90, desc: "ชาเขียวรสหวานอ่อน เย็นสดชื่น" },
  { id: 53, name: "เบียร์ลีโอ 330 มล.", price: 28, original: 33, unit: "กระป๋อง", category: "เครื่องดื่ม", image: "https://placehold.co/400x400/FFC107/795548?text=เบียร์", stock: 100, desc: "เบียร์ลีโอ สดชื่น รสเบาๆ" },
  { id: 54, name: "กาแฟซองอร่อย 30 กรัม 20 ซอง", price: 85, original: 99, unit: "แพ็ค", category: "เครื่องดื่ม", image: "https://placehold.co/400x400/4E342E/FFF?text=กาแฟซอง", stock: 60, desc: "กาแฟซองผสมครีม รสกลมกล่อม" },
  
  // === ขนม & อาหารว่าง ===
  { id: 55, name: "ขนมปังกรอบโฮลวีตลาวาติ้ง 100 กรัม", price: 38, original: 45, unit: "ถุง", category: "ขนม", image: "https://placehold.co/400x400/FFCC80/795548?text=ขนมปังกรอบ", stock: 75, desc: "ขนมปังกรอบรสธรรมชาติ กรอบอร่อย" },
  { id: 56, name: "คุกกี้ช็อกโกแลตชิปอร่อย 180 กรัม", price: 42, original: 50, unit: "ถุง", category: "ขนม", image: "https://placehold.co/400x400/5D4037/FFF?text=คุกกี้", stock: 80, desc: "คุกกี้ช็อกโกแลตชิปเนื้อนุ่ม" },
  { id: 57, name: "เลย์รสออริจินัล 30 กรัม", price: 12, original: 15, unit: "ถุง", category: "ขนม", image: "https://placehold.co/400x400/FFCA28/795548?text=เลย์", stock: 200, desc: "เลย์เค็มอร่อย กรอบสดใหม่" },
  { id: 58, name: "ถั่วเน้าทอดกรอบ 100 กรัม", price: 28, original: 35, unit: "ถุง", category: "ขนม", image: "https://placehold.co/400x400/8D6E63/FFF?text=ถั่วเน้า", stock: 60, desc: "ถั่วเน้าทอดกรอบ รสเค็มอร่อย" },
  { id: 59, name: "มันฝรั่งแผ่นอบกรอบ 80 กรัม", price: 32, original: 38, unit: "ถุง", category: "ขนม", image: "https://placehold.co/400x400/FFB300/5D4037?text=มันฝรั่ง", stock: 70, desc: "มันฝรั่งแผ่นอบกรอบ รสชาติหลากหลาย" },
  { id: 60, name: "ข้าวตังหอมเย็น 50 กรัม", price: 18, original: 22, unit: "ถุง", category: "ขนม", image: "https://placehold.co/400x400/FFCC80/795548?text=ข้าวตัง", stock: 80, desc: "ข้าวตังหอมเย็น กรอบ อร่อย รสชาติเดิม" },
  
  // === ผลไม้ & ผัก ===
  { id: 61, name: "กล้วยน้ำหวาน 1 กิโลกรัม", price: 35, original: 42, unit: "พวง", category: "ผลไม้", image: "https://placehold.co/400x400/FFF59D/F9A825?text=กล้วย", stock: 40, desc: "กล้วยน้ำหวานสุกหอม หวานอร่อย" },
  { id: 62, name: "ส้มเขียวหวาน 1 กิโลกรัม", price: 45, original: 55, unit: "กิโล", category: "ผลไม้", image: "https://placehold.co/400x400/FF9800/FFF?text=ส้ม", stock: 35, desc: "ส้มเขียวหวานนำเข้า รสหวานอมเปรี้ยว" },
  { id: 63, name: "แตงโม 1 ลูก", price: 65, original: 80, unit: "ลูก", category: "ผลไม้", image: "https://placehold.co/400x400/4CAF50/FFF?text=แตงโม", stock: 25, desc: "แตงโมเนื้อแดงหวาน สดจากไร่" },
  { id: 64, name: "มะม่วงน้ำดอกไม้สุก 1 ลูก", price: 25, original: 32, unit: "ลูก", category: "ผลไม้", image: "https://placehold.co/400x400/FFC107/795548?text=มะม่วง", stock: 30, desc: "มะม่วงน้ำดอกไม้สุกหวานฉ่ำ" },
  { id: 65, name: "ผักบุ้ง 300 กรัม", price: 18, original: 22, unit: "ชุด", category: "ผัก", image: "https://placehold.co/400x400/4CAF50/FFF?text=ผักบุ้ง", stock: 50, desc: "ผักบุ้งสดใหม่ ออร์แกนิก ปลอดสารเคมี" },
  { id: 66, name: "ผักคะน้า 200 กรัม", price: 15, original: 18, unit: "ชุด", category: "ผัก", image: "https://placehold.co/400x400/2E7D32/FFF?text=ผักคะน้า", stock: 40, desc: "ผักคะน้าสดกรอบ อร่อย" },
  { id: 67, name: "มันเทศสีส้ม 500 กรัม", price: 25, original: 30, unit: "ชุด", category: "ผัก", image: "https://placehold.co/400x400/FF7043/FFF?text=มันเทศ", stock: 30, desc: "มันเทศเนื้อสีส้ม หวานอร่อย อุดมด้วยไฟเบอร์" },
  
  // === เนื้อสัตว์ ===
  { id: 68, name: "เนื้อหมูสไลด์ 250 กรัม", price: 85, original: 99, unit: "แพ็ค", category: "เนื้อสัตว์", image: "https://placehold.co/400x400/FFCCBC/BF360C?text=เนื้อหมู", stock: 30, desc: "เนื้อหมูสไลด์บาง เหมาะสำหรับหมูแดง ผัด" },
  { id: 69, name: "อกไก่สไตล์ 250 กรัม", price: 55, original: 65, unit: "แพ็ค", category: "เนื้อสัตว์", image: "https://placehold.co/400x400/FFCC80/FF5722?text=อกไก่", stock: 40, desc: "อกไก่สดใหม่ เนื้อนุ่ม คุณภาพดี" },
  { id: 70, name: "ปลานิลแล่บด 250 กรัม", price: 45, original: 55, unit: "แพ็ค", category: "เนื้อสัตว์", image: "https://placehold.co/400x400/90CAF9/1565C0?text=ปลานิล", stock: 25, desc: "ปลานิลแล่สดใหม่ เนื้อนุ่ม สะอาด" },
  
  // === ของใช้ในครัว ===
  { id: 71, name: "ถุงขยะดำใหญ่ 10 ใบ", price: 45, original: 55, unit: "แพ็ค", category: "ของใช้", image: "https://placehold.co/400x400/424242/FFF?text=ถุงขยะ", stock: 80, desc: "ถุงขยะดำขนาดใหญ่ ความแข็งแรงสูง" },
  { id: 72, name: "พลาสติกห่ออาหารใส 30 ซม. 50 เมตร", price: 55, original: 65, unit: "ม้วน", category: "ของใช้", image: "https://placehold.co/400x400/E3F2FD/2196F3?text=พลาสติกห่อ", stock: 60, desc: "พลาสติกห่ออาหาร เนื้อเหนียว ทนความร้อน" },
  { id: 73, name: "กระดาษฟอยล์อลูมิเนียม 30 ซม. 40 เมตร", price: 48, original: 58, unit: "ม้วน", category: "ของใช้", image: "https://placehold.co/400x400/CFD8DC/607D8B?text=ฟอยล์", stock: 50, desc: "กระดาษฟอยล์อลูมิเนียม เหมาะสำหรับอบและห่อ" },
  { id: 74, name: "แผ่นรองอบไม้ใหญ่ 50 ใบ", price: 35, original: 42, unit: "แพ็ค", category: "ของใช้", image: "https://placehold.co/400x400/F5F5F5/757575?text=แผ่นรองอบ", stock: 40, desc: "แผ่นรองอบไม้ กันติด สะดวกใช้งาน" },
  { id: 75, name: "ถุงมือถุงพลาสติก 100 คู่", price: 38, original: 45, unit: "แพ็ค", category: "ของใช้", image: "https://placehold.co/400x400/E3F2FD/1976D2?text=ถุงมือ", stock: 70, desc: "ถุงมือพลาสติกใส สำหรับทำความสะอาด" },
  { id: 76, name: "ฟอกขาวผ้าคลอรอกซ์ 1 ลิตร", price: 55, original: 65, unit: "ขวด", category: "ของใช้", image: "https://placehold.co/400x400/E8F5E9/00ACC1?text=คลอรอกซ์", stock: 45, desc: "ฟอกขาวผ้าคลอรอกซ์ ขาวสะอาด" },
  { id: 77, name: "สเปรย์ไล่แมลงตราอื่น 450 มล.", price: 65, original: 78, unit: "ขวด", category: "ของใช้", image: "https://placehold.co/400x400/C8E6C9/2E7D32?text=สเปรย์ไล่แมลง", stock: 35, desc: "สเปรย์ไล่แมลง กลิ่นหอมสดชื่น" },
  
  // === สุขภาพ & ความงาม ===
  { id: 78, name: "แอลกอฮอล์ล้างมือ 500 มล.", price: 45, original: 55, unit: "ขวด", category: "สุขภาพ", image: "https://placehold.co/400x400/E3F2FD/1565C0?text=แอลกอฮอล์", stock: 100, desc: "แอลกอฮอล์ล้างมือ ฆ่าเชื้อ 99.9%" },
  { id: 79, name: "หน้ากากอนามัย 50 ชิ้น", price: 95, original: 115, unit: "กล่อง", category: "สุขภาพ", image: "https://placehold.co/400x400/BBDEFB/1976D2?text=หน้ากาก", stock: 80, desc: "หน้ากากอนามัย 3 ชั้น กรองฝุ่น PM2.5" },
  { id: 80, name: "เจลล้างมือแอลกอฮอล์ไบรท์ 100 มล.", price: 25, original: 32, unit: "ขวด", category: "สุขภาพ", image: "https://placehold.co/400x400/B3E5FC/0288D1?text=เจลล้างมือ", stock: 120, desc: "เจลล้างมือแห้งเร็ว ฆ่าเชื้อ" },
  { id: 81, name: "ยาสีฟันไซลิทอลฟลูออไรด์ 150 กรัม", price: 45, original: 55, unit: "หลอด", category: "สุขภาพ", image: "https://placehold.co/400x400/E3F2FD/1565C0?text=ยาสีฟัน", stock: 70, desc: "ยาสีฟันไซลิทอลฟลูออไรด์ ป้องกันฟันผุ" },
  { id: 82, name: "สบู่ล้างมือไบรท์ 250 มล.", price: 28, original: 35, unit: "ขวด", category: "สุขภาพ", image: "https://placehold.co/400x400/FCE4EC/E91E63?text=สบู่ล้างมือ", stock: 85, desc: "สบู่ล้างมือสมุนไพร กลิ่นหอมละเอียด" },
  
  // === ของใช้ส่วนตัว ===
  { id: 83, name: "กระดาษชำระทิชชู่าแฟมิลี่ 10 ม้วน", price: 65, original: 78, unit: "แพ็ค", category: "ของใช้", image: "https://placehold.co/400x400/F5F5F5/757575?text=กระดาษชำระ", stock: 90, desc: "กระดาษชำระเนื้อนุ่ม ซับแห้งเร็ว" },
  { id: 84, name: "ผ้าอ้อมสามเณรแบบคาดเสื้อ M 64 ชิ้น", price: 299, original: 349, unit: "แพ็ค", category: "ของใช้", image: "https://placehold.co/400x400/FCE4EC/C2185B?text=ผ้าอ้อม", stock: 30, desc: "ผ้าอ้อมสามเณรแบบคาดเสื้อ ซับนุ่ม" },
  { id: 85, name: "แชมพูสมุนไพรหอมสดชื่น 400 มล.", price: 55, original: 65, unit: "ขวด", category: "ของใช้", image: "https://placehold.co/400x400/E8F5E9/2E7D32?text=แชมพู", stock: 50, desc: "แชมพูสมุนไพรไทย บำรุงผม" },
  { id: 86, name: "ครีมอาบน้ำผู้ชาย 400 มล.", price: 65, original: 78, unit: "ขวด", category: "ของใช้", image: "https://placehold.co/400x400/E3F2FD/1976D2?text=ครีมอาบน้ำ", stock: 40, desc: "ครีมอาบน้ำกลิ่นหอมเข้ม สำหรับผู้ชาย" },
  { id: 87, name: "ลูกเดือยยาสีฟัน 2 ชิ้น", price: 35, original: 42, unit: "แพ็ค", category: "ของใช้", image: "https://placehold.co/400x400/F5F5F5/757575?text=ลูกเดือย", stock: 60, desc: "ลูกเดือยยาสีฟัน ขจัดคราบเหลือง" },
  
  // === อาหารพิเศษ ===
  { id: 88, name: "คอหมูย่างแพค 200 กรัม", price: 75, original: 89, unit: "แพ็ค", category: "อาหารพิเศษ", image: "https://placehold.co/400x400/FFCCBC/795548?text=คอหมูย่าง", stock: 20, desc: "คอหมูย่างเนื้อนุ่ม หอมกลิ่นสมุนไพร" },
  { id: 89, name: "หมูยอคุณภาพ 250 กรัม", price: 55, original: 65, unit: "แพ็ค", category: "อาหารพิเศษ", image: "https://placehold.co/400x400/FFAB91/BF360C?text=หมูยอ", stock: 25, desc: "หมูยอสดใหม่ เนื้อเดียว อร่อย" },
  { id: 90, name: "ไส้กรอกหมูแดง 250 กรัม", price: 48, original: 58, unit: "แพ็ค", category: "อาหารพิเศษ", image: "https://placehold.co/400x400/8D6E63/FFF?text=ไส้กรอก", stock: 30, desc: "ไส้กรอกหมูแดง รมควันหอมอร่อย" },
  { id: 91, name: "หมูแดงสไตล์ 300 กรัม", price: 65, original: 78, unit: "แพ็ค", category: "อาหารพิเศษ", image: "https://placehold.co/400x400/D84315/FFF?text=หมูแดง", stock: 20, desc: "หมูแดงเนื้อนุ่ม หมักรสชาติเข้ม" },
  { id: 92, name: "พริกแกงสัตว์น้ำ 100 กรัม", price: 22, original: 28, unit: "ซอง", category: "เครื่องปรุง", image: "https://placehold.co/400x400/4CAF50/FFF?text=พริกแกงน้ำ", stock: 60, desc: "พริกแกงสัตว์น้ำ สูตรต้นตำรับ" },
  { id: 93, name: "พริกแกงเขียวหวาน 100 กรัม", price: 22, original: 28, unit: "ซอง", category: "เครื่องปรุง", image: "https://placehold.co/400x400/8BC34A/33691E?text=พริกแกงเขียว", stock: 60, desc: "พริกแกงเขียวหวาน สูตรความเข้มข้นกำลังดี" },
  { id: 94, name: "พริกแกงมัสมั่น 100 กรัม", price: 25, original: 32, unit: "ซอง", category: "เครื่องปรุง", image: "https://placehold.co/400x400/FFC107/795548?text=พริกแกงมัสมั่น", stock: 50, desc: "พริกแกงมัสมั่น รสกลมกล่อม หอมเครื่องเทศ" },
  { id: 95, name: "น้ำพริกลาบ 100 กรัม", price: 28, original: 35, unit: "ซอง", category: "เครื่องปรุง", image: "https://placehold.co/400x400/FF5722/FFF?text=น้ำพริกลาบ", stock: 40, desc: "น้ำพริกลาบรสจัดจ้าน พร้อมทาน" },
  { id: 96, name: "แจ่วบอง 100 กรัม", price: 25, original: 32, unit: "ซอง", category: "เครื่องปรุง", image: "https://placehold.co/400x400/B71C1C/FFF?text=แจ่วบอง", stock: 35, desc: "แจ่วบองรสอร่อย เผ็ด หอม มัน" },
  { id: 97, name: "น้ำจิ้มซีฟู้ด 250 มล.", price: 32, original: 38, unit: "ขวด", category: "เครื่องปรุง", image: "https://placehold.co/400x400/FF9800/FFF?text=น้ำจิ้มซีฟู้ด", stock: 55, desc: "น้ำจิ้มซีฟู้ด รสเปรี้ยว หวาน เผ็ด" },
  
  // === อาหารสุขภาพ ===
  { id: 98, name: "น้ำผึ้งแท้ดอกคูน 350 กรัม", price: 95, original: 115, unit: "ขวด", category: "อาหารสุขภาพ", image: "https://placehold.co/400x400/FFC107/795548?text=น้ำผึ้ง", stock: 25, desc: "น้ำผึ้งแท้ 100% จากดอกคูน" },
  { id: 99, name: "งาดำคั่ว 200 กรัม", price: 35, original: 42, unit: "ถุง", category: "อาหารสุขภาพ", image: "https://placehold.co/400x400/212121/FFF?text=งาดำ", stock: 40, desc: "งาดำคั่ว อุดมด้วยแคลเซียม" },
  { id: 100, name: "ข้าวกล้องงอกงาดำ 500 กรัม", price: 55, original: 68, unit: "ถุง", category: "อาหารสุขภาพ", image: "https://placehold.co/400x400/33691E/FFF?text=ข้าวกล้องงอก", stock: 30, desc: "ข้าวกล้องงอกงาดำ อุดมด้วยสารอาหาร" },
];

// ============ Database Functions ============
const DB_FILE = path.join(__dirname, 'db.json');

function loadDB() {
  if (fs.existsSync(DB_FILE)) {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }
  return { users: [], orders: [] };
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function initDB() {
  let db = loadDB();
  // Use products from db.json if available (has more fields like makroImage), otherwise use realProducts
  const dbHasMakroProducts = db.products.length > 0 && db.products[0] && db.products[0].makroImage;
  if (dbHasMakroProducts || db.products.length > realProducts.length) {
    console.log(`[DB] Using ${db.products.length} products from db.json`);
  } else {
    db.products = realProducts.map(p => ({ ...p, discount: p.original > p.price ? Math.round((1 - p.price / p.original) * 100) : 0 }));
    // Only save if we actually loaded from realProducts (first run)
    saveDB(db);
  }
  
  if (db.users.length === 0) {
    db.users = [
      { id: 1, name: "พี่ต้น", email: "ton@email.com", password: "123456", phone: "0861234567", isAdmin: true },
      { id: 2, name: "ลูกค้าทดสอบ", email: "test@email.com", password: "123456", phone: "0899999999", isAdmin: false }
    ];
  } else {
    // Ensure ton@email.com always has isAdmin: true
    const tonUser = db.users.find(u => u.email === 'ton@email.com');
    if (tonUser) tonUser.isAdmin = true;
  }

  // Default payment settings
  if (!db.settings) {
    db.settings = {
      codFeePercent: 10,
      transferFeePercent: 3,
      qrFeePercent: 3,
      bankName: "ธนาคารกรุงไทย",
      bankAccount: "854-3-10966-3",
      bankAccountName: "บริษัท สุขใจไอที จำกัด",
      qrCodeUrl: "/qr-payment.png"
    };
  }

  saveDB(db);
  console.log(`[DB] Initialized with ${db.products.length} products, ${db.users.length} users`);
  return db;
}

initDB();

// ============ Auth ============
function generateToken(user) {
  const payload = { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function verifyToken(token) {
  try {
    return JSON.parse(Buffer.from(token, 'base64').toString());
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  }
  const token = authHeader.split(' ')[1];
  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Token ไม่ถูกต้อง' });
  }
  req.user = user;
  next();
}

// ============ API Routes ============

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
  }
  const db = loadDB();
  if (db.users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'อีเมลนี้มีผู้ใช้งานแล้ว' });
  }
  const user = { id: Date.now(), name, email, password, phone: phone || '', isAdmin: false };
  db.users.push(user);
  saveDB(db);
  const token = generateToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const db = loadDB();
  const user = db.users.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }
  const token = generateToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  res.json({ id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin });
});

app.get('/api/products', (req, res) => {
  const db = loadDB();
  res.json(db.products);
});

app.get('/api/products/:id', (req, res) => {
  const db = loadDB();
  const product = db.products.find(p => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: 'ไม่พบสินค้า' });
  res.json(product);
});

app.post('/api/products', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const db = loadDB();
  const product = { id: Date.now(), ...req.body };
  db.products.push(product);
  saveDB(db);
  res.json(product);
});

app.put('/api/products/:id', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const db = loadDB();
  const idx = db.products.findIndex(p => p.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'ไม่พบสินค้า' });
  db.products[idx] = { ...db.products[idx], ...req.body };
  saveDB(db);
  res.json(db.products[idx]);
});

app.delete('/api/products/:id', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const db = loadDB();
  db.products = db.products.filter(p => p.id !== parseInt(req.params.id));
  saveDB(db);
  res.json({ success: true });
});

app.get('/api/categories', (req, res) => {
  const db = loadDB();
  const categories = [...new Set(db.products.map(p => p.category))];
  res.json(categories);
});

// Guest order (from external link)
app.post('/api/guest-order', async (req, res) => {
  const { items, subtotal, feeAmount, total, paymentMethod, deliveryMethod, address, customerName, customerEmail, customerPhone } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'ไม่มีสินค้าในคำสั่งซื้อ' });
  }
  if (!customerName || !customerEmail) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
  }
  const db = loadDB();
  const orderId = Date.now();

  // Auto stock deduction
  for (const item of items) {
    const product = db.products.find(p => p.id === item.productId);
    if (product) {
      product.stock = Math.max(0, product.stock - item.qty);
    }
  }

  const order = {
    id: orderId,
    userId: null,
    userName: customerName,
    userEmail: customerEmail,
    userPhone: customerPhone || '',
    items,
    subtotal: subtotal || total,
    feeAmount: feeAmount || 0,
    total,
    paymentMethod: paymentMethod || 'cod',
    deliveryMethod: deliveryMethod || 'pickup',
    address: address || '',
    status: 'pending',
    isGuest: true,
    createdAt: new Date().toISOString()
  };
  db.orders.push(order);
  saveDB(db);

  console.log('[Guest Order]', `Order #${orderId}`, `${customerName}`, `Total: ฿${total}`, `Payment: ${paymentMethod}`, `Delivery: ${deliveryMethod}`);

  res.json({ success: true, orderId });
});

app.post('/api/orders', authMiddleware, async (req, res) => {
  const { items, total, paymentMethod, address, deliveryMethod, subtotal, feeAmount } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'ไม่มีสินค้าในคำสั่งซื้อ' });
  }
  const db = loadDB();
  const orderId = Date.now();
  
  // Auto stock deduction
  const stockUpdates = [];
  for (const item of items) {
    const product = db.products.find(p => p.id === item.productId);
    if (product) {
      const newStock = Math.max(0, product.stock - item.qty);
      stockUpdates.push({ id: product.id, name: product.name, oldStock: product.stock, newStock, qty: item.qty });
      product.stock = newStock;
    }
  }
  
  const order = {
    id: orderId,
    userId: req.user.id,
    userName: req.user.name,
    userEmail: req.user.email,
    items,
    subtotal: subtotal || total,
    feeAmount: feeAmount || 0,
    total,
    paymentMethod: paymentMethod || 'cod',
    deliveryMethod: deliveryMethod || 'pickup', // 'pickup' or 'delivery'
    address: address || '',
    total,
    paymentMethod: paymentMethod || 'cod',
    address: address || '',
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  db.orders.push(order);
  saveDB(db);
  
  // Send Line Notify
  if (LINE_NOTIFY_TOKEN) {
    const itemList = items.slice(0, 5).map(i => `• ${i.name} x${i.qty}`).join('\n');
    const more = items.length > 5 ? `\n...และอีก ${items.length - 5} รายการ` : '';
    const deliveryLabel = deliveryMethod === 'pickup' ? '🏪 รับเองที่ร้าน' : `📍 จัดส่ง: ${address}`;
    const paymentLabel = paymentMethod === 'cod' ? 'COD' : paymentMethod === 'qrcode' ? 'QR Code' : 'โอน';
    const feeLine = feeAmount > 0 ? `\n💰 ค่าธรรมเนียม: ฿${feeAmount.toLocaleString()}` : '';
    const message = [
      `🛒 มีออเดอร์ใหม่!`,
      `────────────────`,
      `📋 Order #${orderId}`,
      `👤 ${req.user.name}`,
      `📱 ${req.user.email}`,
      `────────────────`,
      `${itemList}${more}`,
      `────────────────`,
      `🛍️ ราคาสินค้า: ฿${(subtotal || total).toLocaleString()}${feeLine}`,
      `💰 รวม: ฿${total.toLocaleString()}`,
      `💳 ชำระ: ${paymentLabel}`,
      `${deliveryLabel}`,
      `────────────────`,
      `📦 สต็อกอัปเดต: ${stockUpdates.map(s => `${s.name}: ${s.oldStock}→${s.newStock}`).join(', ')}`
    ].join('\n');
    
    try {
      await sendLineNotify(message);
    } catch (e) {
      console.log('[Line Notify] Failed to send:', e.message);
    }
  } else {
    console.log('[Order Created]', `Order #${orderId}`, `${req.user.name}`, `Total: ฿${total}`, `Payment: ${paymentMethod}`, `Delivery: ${deliveryMethod}`);
    console.log('[Stock Updates]', stockUpdates.map(s => `${s.name}: ${s.oldStock}→${s.newStock}`).join(', '));
  }
  
  res.json(order);
});

app.get('/api/orders', authMiddleware, (req, res) => {
  const db = loadDB();
  let orders = db.orders;
  if (!req.user.isAdmin) {
    orders = orders.filter(o => o.userId === req.user.id);
  }
  orders = orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(orders);
});

app.get('/api/orders/:id', authMiddleware, (req, res) => {
  const db = loadDB();
  const order = db.orders.find(o => o.id === parseInt(req.params.id));
  if (!order) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
  if (!req.user.isAdmin && order.userId !== req.user.id) {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์ดูคำสั่งซื้อนี้' });
  }
  res.json(order);
});

app.put('/api/orders/:id/status', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const { status } = req.body;
  const db = loadDB();
  const idx = db.orders.findIndex(o => o.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
  db.orders[idx].status = status;
  saveDB(db);
  res.json(db.orders[idx]);
});

// Line Pay Payment
app.post('/api/linepay/create', authMiddleware, (req, res) => {
  const { amount, orderId } = req.body;
  
  if (!LINE_PAY_CHANNEL_ID || !LINE_PAY_CHANNEL_SECRET) {
    return res.status(400).json({ error: 'Line Pay not configured. Please set LINE_PAY_CHANNEL_ID and LINE_PAY_CHANNEL_SECRET environment variables.' });
  }
  
  const packageName = `ORDER_${orderId}_${Date.now()}`;
  const nonce = Date.now().toString();
  const uri = '/v2/payments/request';
  const body = JSON.stringify({
    amount: parseInt(amount),
    currency: 'THB',
    orderId: packageName,
    packages: [{ id: packageName, name: 'ShopThai Order', amount: parseInt(amount), items: [] }],
    redirectUrls: {
      confirmUrl: `${req.protocol}://${req.get('host')}/admin`,
      cancelUrl: `${req.protocol}://${req.get('host')}/admin`
    }
  });
  
  const signature = generateHmacsha256(LINE_PAY_CHANNEL_SECRET, LINE_PAY_CHANNEL_SECRET + uri + body + nonce);
  
  const options = {
    hostname: 'sandbox-api.line.me',
    path: uri,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-LINE-ChannelId': LINE_PAY_CHANNEL_ID,
      'X-LINE-Authorization': signature,
      'X-LINE-Nonce': nonce
    }
  };
  
  const request = https.request(options, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      try {
        const result = JSON.parse(data);
        if (result.returnCode === '0000') {
          res.json({ success: true, paymentUrl: result.info.paymentUrl.web, transactionId: result.info.transactionId });
        } else {
          res.status(400).json({ error: result.returnMessage || 'Line Pay error' });
        }
      } catch {
        res.status(400).json({ error: 'Invalid response from Line Pay' });
      }
    });
  });
  
  request.on('error', (e) => {
    res.status(500).json({ error: 'Line Pay request failed: ' + e.message });
  });
  request.write(body);
  request.end();
});

app.get('/api/stats', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const db = loadDB();
  res.json({
    totalProducts: db.products.length,
    totalOrders: db.orders.length,
    totalUsers: db.users.length,
    totalRevenue: db.orders.filter(o => o.status === 'completed').reduce((sum, o) => sum + o.total, 0),
    pendingOrders: db.orders.filter(o => o.status === 'pending').length,
    lineNotifyConfigured: !!LINE_NOTIFY_TOKEN,
    linePayConfigured: !!(LINE_PAY_CHANNEL_ID && LINE_PAY_CHANNEL_SECRET)
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    linePayAvailable: !!(LINE_PAY_CHANNEL_ID && LINE_PAY_CHANNEL_SECRET),
    lineNotifyConfigured: !!LINE_NOTIFY_TOKEN
  });
});

// Users API (Admin only)
app.get('/api/users', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const db = loadDB();
  // Return users without passwords
  const safeUsers = db.users.map(u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone || '', isAdmin: u.isAdmin, createdAt: u.createdAt || new Date().toISOString() }));
  res.json(safeUsers);
});

app.put('/api/users/:id', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const { name, email, phone, password } = req.body;
  const db = loadDB();
  const idx = db.users.findIndex(u => u.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  if (name) db.users[idx].name = name;
  if (email) db.users[idx].email = email;
  if (phone !== undefined) db.users[idx].phone = phone;
  if (password) db.users[idx].password = password;
  saveDB(db);
  res.json({ id: db.users[idx].id, name: db.users[idx].name, email: db.users[idx].email, phone: db.users[idx].phone, isAdmin: db.users[idx].isAdmin });
});

app.delete('/api/users/:id', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const db = loadDB();
  const idx = db.users.findIndex(u => u.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  db.users.splice(idx, 1);
  saveDB(db);
  res.json({ success: true });
});

// Settings API
app.get('/api/settings', (req, res) => {
  const db = loadDB();
  res.json(db.settings || {});
});

// Image upload endpoint
const imagesDir = path.join(__dirname, 'public', 'images');
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

app.post('/api/upload', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  if (!req.files || !req.files.image) return res.status(400).json({ error: 'ไม่พบไฟล์' });
  const file = req.files.image;
  const ext = path.extname(file.name).toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  if (!allowed.includes(ext)) return res.status(400).json({ error: 'รองรับเฉพาะไฟล์รูปภาพ (jpg, png, gif, webp)' });
  const filename = `product_${Date.now()}${ext}`;
  const filepath = path.join(imagesDir, filename);
  file.mv(filepath, (err) => {
    if (err) return res.status(500).json({ error: 'อัปโหลดไม่สำเร็จ' });
    res.json({ url: `/images/${filename}` });
  });
});

app.put('/api/settings', authMiddleware, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const db = loadDB();
  const {
    codFeePercent, transferFeePercent, qrFeePercent,
    bankName, bankAccount, bankAccountName, qrCodeUrl
  } = req.body;
  db.settings = {
    ...db.settings,
    codFeePercent: codFeePercent !== undefined ? parseFloat(codFeePercent) : db.settings.codFeePercent,
    transferFeePercent: transferFeePercent !== undefined ? parseFloat(transferFeePercent) : db.settings.transferFeePercent,
    qrFeePercent: qrFeePercent !== undefined ? parseFloat(qrFeePercent) : db.settings.qrFeePercent,
    bankName: bankName || db.settings.bankName,
    bankAccount: bankAccount || db.settings.bankAccount,
    bankAccountName: bankAccountName || db.settings.bankAccountName,
    qrCodeUrl: qrCodeUrl || db.settings.qrCodeUrl
  };
  saveDB(db);
  res.json(db.settings);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🛒 ShopThai Server running!`);
  console.log(`   Local:    http://localhost:${PORT}`);
  console.log(`   Network:  http://192.168.1.102:${PORT}`);
  console.log(`   Admin:    http://192.168.1.102:${PORT}/admin`);
  console.log(`\n   📦 Products: ${realProducts.length}`);
  console.log(`   📢 Line Notify: ${LINE_NOTIFY_TOKEN ? '✅ Configured' : '⚠️ Not set'}`);
  console.log(`   💳 Line Pay: ${LINE_PAY_CHANNEL_ID && LINE_PAY_CHANNEL_SECRET ? '✅ Configured' : '⚠️ Not set (sandbox)'}`);
  console.log(`\n   Test: ton@email.com / 123456\n`);
});
