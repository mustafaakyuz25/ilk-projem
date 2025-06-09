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

// Random Chat için yeni veri yapıları
const waitingUsers = new Set(); // Bekleyen kullanıcılar
const activeChats = new Map(); // chatId -> { user1: socketId, user2: socketId, startTime, timer }
const randomUsers = new Map(); // socketId -> { username, chatId }

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

  // Random Chat - Partner Arama
  socket.on('find_random_partner', (data) => {
    const { username } = data;
    console.log(`Random partner arıyor: ${username} (${socket.id})`);
    
    // Kullanıcıyı kaydet
    randomUsers.set(socket.id, { username });
    
    // Bekleyen kullanıcı var mı kontrol et
    if (waitingUsers.size > 0) {
      // İlk bekleyen kullanıcıyı al
      const partnerId = waitingUsers.values().next().value;
      waitingUsers.delete(partnerId);
      
      // Chat oluştur
      const chatId = uuidv4();
      const partnerData = randomUsers.get(partnerId);
      
      activeChats.set(chatId, {
        user1: socket.id,
        user2: partnerId,
        startTime: Date.now(),
        timer: null
      });
      
      // Her iki kullanıcıya da partner bulundu bilgisini gönder
      socket.emit('partner_found', {
        chat_id: chatId,
        partner_name: partnerData.username
      });
      
      io.to(partnerId).emit('partner_found', {
        chat_id: chatId,
        partner_name: username
      });
      
      // 5 dakika timer başlat
      const chatTimer = setTimeout(() => {
        endRandomChat(chatId, 'time_expired');
      }, 5 * 60 * 1000); // 5 dakika
      
      activeChats.get(chatId).timer = chatTimer;
      
      console.log(`Random chat başladı: ${username} <-> ${partnerData.username}`);
    } else {
      // Bekleyen listesine ekle
      waitingUsers.add(socket.id);
      console.log(`Kullanıcı bekleme listesine eklendi: ${username}`);
    }
  });

  // Random Chat - Mesaj Gönderme
  socket.on('send_random_message', (data) => {
    const { chat_id, message, sender } = data;
    const chat = activeChats.get(chat_id);
    
    if (chat) {
      // Partner'ı bul ve mesajı gönder
      const partnerId = chat.user1 === socket.id ? chat.user2 : chat.user1;
      
      io.to(partnerId).emit('random_message_received', {
        sender,
        message,
        chat_id
      });
      
      console.log(`Random mesaj gönderildi: ${sender} -> ${message}`);
    }
  });

  // Random Chat - Chat'den Ayrılma
  socket.on('leave_random_chat', (data) => {
    const { chat_id } = data;
    endRandomChat(chat_id, 'user_left');
  });

  // Random Chat bitiş fonksiyonu
  function endRandomChat(chatId, reason) {
    const chat = activeChats.get(chatId);
    if (chat) {
      // Timer'ı temizle
      if (chat.timer) {
        clearTimeout(chat.timer);
      }
      
      // Her iki kullanıcıya da chat bittiğini bildir
      const eventName = reason === 'time_expired' ? 'chat_time_expired' : 'partner_disconnected';
      
      io.to(chat.user1).emit(eventName, { chat_id: chatId });
      io.to(chat.user2).emit(eventName, { chat_id: chatId });
      
      // Chat'i sil
      activeChats.delete(chatId);
      
      console.log(`Random chat sona erdi: ${chatId} (${reason})`);
    }
  }

  // Bağlantı koptuğunda
  socket.on('disconnect', () => {
    console.log(`Kullanıcı ayrıldı: ${socket.id}`);
    
    // Normal room sistemini temizle
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
    
    // Random chat sistemini temizle
    waitingUsers.delete(socket.id);
    
    const randomUser = randomUsers.get(socket.id);
    if (randomUser) {
      // Aktif chat var mı kontrol et
      for (const [chatId, chat] of activeChats.entries()) {
        if (chat.user1 === socket.id || chat.user2 === socket.id) {
          endRandomChat(chatId, 'user_disconnected');
          break;
        }
      }
      randomUsers.delete(socket.id);
    }
    
    users.delete(socket.id);
  });
});

// Server'ı başlat
server.listen(PORT, () => {
  console.log(`🚀 BoTing Socket.IO Server ${PORT} portunda çalışıyor`);
  console.log(`📡 Websocket endpoint: ws://localhost:${PORT}`);
}); 