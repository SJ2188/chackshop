// Default seed products (used when MongoDB collection is empty)
// This is a minimal fallback - the actual products come from MongoDB Atlas
const seedProducts = [
  { id: 1, name: "ข้าวหอมมะลิ 5 กก.", price: 165, original: 189, unit: "ถุง", category: "ข้าว", image: "https://placehold.co/400x400/FFF8E1/FF6B00?text=ข้าว", stock: 100, desc: "ข้าวหอมมะลิคุณภาพดี", emoji: "🍚" },
  { id: 2, name: "น้ำปลาไทย 700 มล.", price: 32, original: 38, unit: "ขวด", category: "เครื่องปรุง", image: "https://placehold.co/400x400/3E2723/FFF?text=น้ำปลา", stock: 200, desc: "น้ำปลาสูตรพิเศษ", emoji: "🧂" },
  { id: 3, name: "น้ำมันถั่วลิสง 1 ลิตร", price: 75, original: 89, unit: "ขวด", category: "น้ำมัน", image: "https://placehold.co/400x400/FFF3E0/FF6B00?text=น้ำมัน", stock: 80, desc: "น้ำมันถั่วลิสงสกัดเย็น", emoji: "🫒" },
  { id: 4, name: "ไข่ไก่ 10 ฟอง", price: 52, original: 62, unit: "แผง", category: "ไข่ & นม", image: "https://placehold.co/400x400/FFF8E1/FF8F00?text=ไข่ไก่", stock: 60, desc: "ไข่ไก่คุณภาพดี เกรด A", emoji: "🥚" },
  { id: 5, name: "น้ำเปล่า 1500 มล.", price: 12, original: 15, unit: "ขวด", category: "เครื่องดื่ม", image: "https://placehold.co/400x400/E3F2FD/2196F3?text=น้ำเปล่า", stock: 300, desc: "น้ำดื่มบริสุทธิ์", emoji: "💧" },
];

module.exports = seedProducts;
