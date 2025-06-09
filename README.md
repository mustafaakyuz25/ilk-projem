# BoTing Socket.IO Server

Flutter BoTing uygulaması için Socket.IO backend server'ı.

## Özellikler

- ✅ Real-time mesajlaşma
- ✅ Oda oluşturma ve yönetimi
- ✅ Kullanıcı yönetimi
- ✅ CORS desteği
- ✅ Health check endpoint'i

## Kurulum

1. Dependencies'leri yükle:
```bash
npm install
```

2. Environment variables'ları ayarla:
```
PORT=3000
NODE_ENV=production
```

3. Server'ı başlat:
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

- `GET /` - Server durumu
- `GET /health` - Health check

## Socket.IO Events

### Client -> Server
- `ID` - Kullanıcı ID'sini kaydet
- `CreateRoom` - Yeni oda oluştur
- `joinRoom` - Odaya katıl
- `connectRoom` - Odaya bağlan
- `send_message` - Mesaj gönder
- `getMembers` - Oda üyelerini getir

### Server -> Client
- `USERID` - Unique kullanıcı ID'si
- `RoomDetail` - Oda detayları
- `receive_message` - Gelen mesaj
- `getMembers` - Oda üye listesi

## Render.com Deploy

1. Bu klasörü GitHub'a push edin
2. Render.com'da yeni Web Service oluşturun
3. GitHub repository'sini bağlayın
4. Build komutunu ayarlayın: `npm install`
5. Start komutunu ayarlayın: `npm start` 