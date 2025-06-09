const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// CORS ayarları
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  credentials: true
}));

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Port ayarı
const PORT = process.env.PORT || 3000;

// Veri saklama
const rooms = new Map(); // roomId -> { name, link, createat, members: Set }
const users = new Map(); // socketId -> { userId, username, color, roomId }

// Ana route
app.get('/', (req, res) => {
  res.json({ 
    message: 'BoTing Socket.IO Server Çalışıyor!',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

// Socket.IO bağlantı yönetimi
io.on('connection', (socket) => {
  console.log(`Yeni kullanıcı bağlandı: ${socket.id}`);
  
  // Kullanıcıya unique ID gönder
  const userId = uuidv4();
  socket.emit('USERID', userId);
  
  // Kullanıcı ID'sini kaydet
  socket.on('ID', (id) => {
    console.log(`Kullanıcı ID kaydedildi: ${id}`);
    if (!users.has(socket.id)) {
      users.set(socket.id, { userId: id });
    }
  });

  // Oda oluşturma
  socket.on('CreateRoom', (data) => {
    const { id: userId, username, color, roomname } = data;
    const roomId = uuidv4();
    const roomLink = `BOT-${roomId.substring(0, 8).toUpperCase()}`;
    const createat = new Date().toISOString();
    
    // Oda bilgilerini kaydet
    rooms.set(roomId, {
      name: roomname,
      link: roomLink,
      createat,
      members: new Set([socket.id])
    });
    
    // Kullanıcı bilgilerini güncelle
    users.set(socket.id, {
      userId,
      username,
      color,
      roomId
    });
    
    // Odaya katıl
    socket.join(roomId);
    
    // Başarılı yanıt gönder
    socket.emit('RoomDetail', {
      success: true,
      roomid: roomId,
      roomname,
      link: roomLink,
      createat
    });
    
    console.log(`Oda oluşturuldu: ${roomname} (${roomId})`);
  });

  // Odaya katılma
  socket.on('joinRoom', (data) => {
    const { id: userId, username, color, link } = data;
    
    // Link ile odayı bul
    let targetRoom = null;
    let targetRoomId = null;
    
    for (const [roomId, room] of rooms.entries()) {
      if (room.link === link) {
        targetRoom = room;
        targetRoomId = roomId;
        break;
      }
    }
    
    if (!targetRoom) {
      socket.emit('RoomDetail', {
        success: false,
        error: 'Oda bulunamadı'
      });
      return;
    }
    
    // Kullanıcıyı odaya ekle
    targetRoom.members.add(socket.id);
    
    // Kullanıcı bilgilerini güncelle
    users.set(socket.id, {
      userId,
      username,
      color,
      roomId: targetRoomId
    });
    
    // Odaya katıl
    socket.join(targetRoomId);
    
    // Başarılı yanıt gönder
    socket.emit('RoomDetail', {
      success: true,
      roomid: targetRoomId,
      roomname: targetRoom.name,
      link: targetRoom.link,
      createat: targetRoom.createat
    });
    
    console.log(`Kullanıcı odaya katıldı: ${username} -> ${targetRoom.name}`);
  });

  // Odaya bağlanma
  socket.on('connectRoom', (roomId) => {
    socket.join(roomId);
    console.log(`Kullanıcı odaya bağlandı: ${roomId}`);
  });

  // Mesaj gönderme
  socket.on('send_message', (data) => {
    const { userid, room, author, message, color, time } = data;
    
    // Mesajı odadaki herkese gönder (gönderen hariç)
    socket.to(room).emit('receive_message', {
      userid,
      author,
      message,
      color,
      time
    });
    
    console.log(`Mesaj gönderildi - ${author}: ${message}`);
  });

  // Oda üyelerini getir
  socket.on('getMembers', (roomId) => {
    const room = rooms.get(roomId);
    if (room) {
      const memberCount = room.members.size;
      socket.emit('getMembers', {
        roomId,
        memberCount,
        members: Array.from(room.members).map(socketId => {
          const user = users.get(socketId);
          return user ? { username: user.username, color: user.color } : null;
        }).filter(Boolean)
      });
    }
  });

  // Bağlantı koptuğunda
  socket.on('disconnect', () => {
    console.log(`Kullanıcı ayrıldı: ${socket.id}`);
    
    const user = users.get(socket.id);
    if (user && user.roomId) {
      const room = rooms.get(user.roomId);
      if (room) {
        room.members.delete(socket.id);
        
        // Oda boşsa sil
        if (room.members.size === 0) {
          rooms.delete(user.roomId);
          console.log(`Boş oda silindi: ${user.roomId}`);
        }
      }
    }
    
    users.delete(socket.id);
  });
});

// Server'ı başlat
server.listen(PORT, () => {
  console.log(`🚀 BoTing Socket.IO Server ${PORT} portunda çalışıyor`);
  console.log(`📡 Websocket endpoint: ws://localhost:${PORT}`);
}); 