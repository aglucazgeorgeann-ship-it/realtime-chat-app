const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Socket.io setup with CORS
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000", // React app URL
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory storage (for now - will add database later)
let users = new Map(); // Store connected users
let messages = []; // Store messages
let rooms = [
  { id: 'general', name: 'general', messages: [] },
  { id: 'development', name: 'development', messages: [] },
  { id: 'design', name: 'design', messages: [] },
  { id: 'random', name: 'random', messages: [] }
];

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user joining
  socket.on('user_join', (userData) => {
    users.set(socket.id, {
      id: socket.id,
      name: userData.name || 'Anonymous',
      avatar: userData.avatar || '👤',
      status: 'online',
      joinedAt: new Date()
    });

    // Join default room
    socket.join('general');

    // Send updated user list to all clients
    io.emit('users_update', Array.from(users.values()));
    
    // Send existing messages for general room
    const generalRoom = rooms.find(r => r.id === 'general');
    socket.emit('room_messages', {
      room: 'general',
      messages: generalRoom.messages
    });

    console.log(`${userData.name || 'Anonymous'} joined the chat`);
  });

  // Handle joining specific rooms
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    const room = rooms.find(r => r.id === roomId);
    if (room) {
      socket.emit('room_messages', {
        room: roomId,
        messages: room.messages
      });
    }
  });

  // Handle new messages
  socket.on('send_message', (messageData) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = {
      id: Date.now() + Math.random(),
      user: user.name,
      avatar: user.avatar,
      message: messageData.message,
      timestamp: new Date().toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      room: messageData.room || 'general',
      type: 'text',
      createdAt: new Date()
    };

    // Add message to room
    const room = rooms.find(r => r.id === message.room);
    if (room) {
      room.messages.push(message);
      // Keep only last 100 messages per room
      if (room.messages.length > 100) {
        room.messages = room.messages.slice(-100);
      }
    }

    // Broadcast message to all users in the room
    io.to(message.room).emit('new_message', message);
    
    console.log(`Message from ${user.name} in ${message.room}: ${message.message}`);
  });

  // Handle typing indicators
  socket.on('typing_start', (data) => {
    const user = users.get(socket.id);
    if (user) {
      socket.to(data.room).emit('user_typing', {
        user: user.name,
        room: data.room
      });
    }
  });

  socket.on('typing_stop', (data) => {
    const user = users.get(socket.id);
    if (user) {
      socket.to(data.room).emit('user_stop_typing', {
        user: user.name,
        room: data.room
      });
    }
  });

  // Handle user status updates
  socket.on('status_update', (status) => {
    const user = users.get(socket.id);
    if (user) {
      user.status = status;
      users.set(socket.id, user);
      io.emit('users_update', Array.from(users.values()));
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      console.log(`${user.name} disconnected`);
      users.delete(socket.id);
      io.emit('users_update', Array.from(users.values()));
    }
  });
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Chat server is running',
    connectedUsers: users.size,
    totalMessages: rooms.reduce((sum, room) => sum + room.messages.length, 0)
  });
});

app.get('/api/rooms', (req, res) => {
  const roomsData = rooms.map(room => ({
    id: room.id,
    name: room.name,
    messageCount: room.messages.length,
    lastMessage: room.messages[room.messages.length - 1] || null
  }));
  res.json(roomsData);
});

app.get('/api/rooms/:roomId/messages', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.find(r => r.id === roomId);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  res.json({
    room: roomId,
    messages: room.messages
  });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Chat server running on port ${PORT}`);
  console.log(`📡 Socket.io server ready for connections`);
  console.log(`🌐 Server URL: http://localhost:${PORT}`);
});