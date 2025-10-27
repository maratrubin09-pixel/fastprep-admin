import React, { useState, useEffect, useRef } from 'react';
import {
  Paper,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  CircularProgress,
  Alert,
  Chip,
  TextField,
  Button,
  Stack,
} from '@mui/material';
import {
  Telegram as TelegramIcon,
  WhatsApp as WhatsAppIcon,
  Instagram as InstagramIcon,
  Facebook as FacebookIcon,
  Send as SendIcon,
  Done as DoneIcon,
  DoneAll as DoneAllIcon,
} from '@mui/icons-material';
import { io } from 'socket.io-client';
import DashboardLayout from '../components/DashboardLayout';

const API_URL = process.env.REACT_APP_API_URL || 'https://fastprep-admin-api.onrender.com';

const platformIcons = {
  telegram: <TelegramIcon sx={{ color: '#0088cc' }} />,
  whatsapp: <WhatsAppIcon sx={{ color: '#25D366' }} />,
  instagram: <InstagramIcon sx={{ color: '#E4405F' }} />,
  facebook: <FacebookIcon sx={{ color: '#1877F2' }} />,
};

const InboxPage = () => {
  const [conversations, setConversations] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const socketRef = useRef(null);
  const messageInputRef = useRef(null);

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  // Setup WebSocket connection
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Decode JWT to get userId (simple base64 decode)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const userId = payload.sub || payload.id;

      // Connect to WebSocket
      const socket = io(`${API_URL}/ws`, {
        auth: {
          userId: userId,
          token: token,
        },
      });

      socket.on('connect', () => {
        console.log('✅ WebSocket connected');
      });

      socket.on('hello', (data) => {
        console.log('👋 Hello from server:', data);
      });

      // Handle incoming messages
      socket.on('new_message', (data) => {
        console.log('📨 New message received:', data);
        
        // Add message to current conversation if it's selected
        if (selectedThread && data.conversationId === selectedThread.id) {
          setMessages(prev => [...prev, data.message]);
        }

        // Update conversations list (move to top and update last_message_at)
        setConversations(prev => {
          const updated = prev.map(conv => 
            conv.id === data.conversationId 
              ? { ...conv, last_message_at: data.message.created_at }
              : conv
          );
          // Sort by last_message_at
          return updated.sort((a, b) => 
            new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at)
          );
        });
      });

      // Handle message status updates
      socket.on('message_status_update', (data) => {
        console.log('📊 Message status update:', data);
        
        // Update message status in current conversation
        if (selectedThread && data.conversationId === selectedThread.id) {
          setMessages(prev => prev.map(msg => 
            msg.id === data.messageId 
              ? { ...msg, delivery_status: data.status }
              : msg
          ));
        }
      });

      socket.on('disconnect', () => {
        console.log('❌ WebSocket disconnected');
      });

      socketRef.current = socket;

      // Cleanup on unmount
      return () => {
        socket.disconnect();
      };
    } catch (err) {
      console.error('Failed to setup WebSocket:', err);
    }
  }, [selectedThread]);

  // Fetch messages when thread is selected
  useEffect(() => {
    if (selectedThread) {
      fetchMessages(selectedThread.id);
    }
  }, [selectedThread]);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/inbox/conversations`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }
      
      const data = await response.json();
      setConversations(data);
      
      // Auto-select first conversation
      if (data.length > 0 && !selectedThread) {
        setSelectedThread(data[0]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (threadId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/inbox/conversations/${threadId}/messages`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      
      const data = await response.json();
      setMessages(data);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const sendMessage = async () => {
    // Читаем текст напрямую из input через ref
    const text = messageInputRef.current?.value || messageText;
    console.log('🔍 Frontend sendMessage - text:', text, 'from ref:', messageInputRef.current?.value, 'from state:', messageText);
    
    if (!text.trim() || !selectedThread) return;
    
    try {
      setSending(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/inbox/conversations/${selectedThread.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send message');
      }
      
      // Получаем созданное сообщение из ответа
      const newMessage = await response.json();
      
      // Немедленно добавляем сообщение в UI со статусом "queued" (отправляется...)
      setMessages(prev => [...prev, newMessage]);
      
      // Очищаем поле ввода
      setMessageText('');
      if (messageInputRef.current) {
        messageInputRef.current.value = '';
      }
      
      // Обновляем список чатов (переместить текущий чат наверх)
      setConversations(prev => {
        const updated = prev.map(conv => 
          conv.id === selectedThread.id 
            ? { ...conv, last_message_at: new Date().toISOString() }
            : conv
        );
        // Сортируем по last_message_at
        return updated.sort((a, b) => 
          new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at)
        );
      });
    } catch (err) {
      alert('Failed to send message: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const getPlatformFromChannelId = (channelId) => {
    if (!channelId) return 'unknown';
    return channelId.split(':')[0] || 'unknown';
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <DashboardLayout title="Unified Inbox">
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
        </Box>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout title="Unified Inbox">
        <Alert severity="error">{error}</Alert>
      </DashboardLayout>
    );
  }

  if (conversations.length === 0) {
    return (
      <DashboardLayout title="Unified Inbox">
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            No conversations yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Messages from Telegram, WhatsApp, Instagram, and Facebook will appear here
          </Typography>
        </Paper>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Unified Inbox">
      <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 200px)' }}>
        {/* Conversations List */}
        <Paper sx={{ width: '350px', overflow: 'auto' }}>
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="h6" fontWeight="bold">
              Conversations
            </Typography>
          </Box>
          <List sx={{ p: 0 }}>
            {conversations.map((conv) => {
              const platform = getPlatformFromChannelId(conv.channel_id);
              return (
                <React.Fragment key={conv.id}>
                  <ListItem
                    button
                    selected={selectedThread?.id === conv.id}
                    onClick={() => setSelectedThread(conv)}
                    sx={{
                      '&.Mui-selected': {
                        backgroundColor: 'primary.light',
                      },
                    }}
                  >
                    <ListItemAvatar>
                      <Avatar>
                        {platformIcons[platform] || '💬'}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography variant="subtitle1" fontWeight="bold">
                            {conv.chat_title || conv.external_chat_id || 'Unknown'}
                          </Typography>
                          <Chip
                            label={platform}
                            size="small"
                            sx={{ textTransform: 'capitalize' }}
                          />
                        </Box>
                      }
                      secondary={formatTime(conv.last_message_at || conv.created_at)}
                    />
                  </ListItem>
                  <Divider />
                </React.Fragment>
              );
            })}
          </List>
        </Paper>

        {/* Messages Area */}
        <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {selectedThread ? (
            <>
              {/* Header */}
              <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box display="flex" alignItems="center" gap={1}>
                  <Avatar>
                    {platformIcons[getPlatformFromChannelId(selectedThread.channel_id)] || '💬'}
                  </Avatar>
                  <Box>
                    <Typography variant="h6" fontWeight="bold">
                      {selectedThread.chat_title || selectedThread.external_chat_id || 'Unknown'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {selectedThread.channel_id}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* Messages */}
              <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                {messages.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 4 }}>
                    No messages yet
                  </Typography>
                ) : (
                  <Stack spacing={2}>
                    {messages.map((msg) => (
                      <Box
                        key={msg.id}
                        sx={{
                          display: 'flex',
                          justifyContent: msg.direction === 'out' ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <Paper
                          sx={{
                            p: 2,
                            maxWidth: '70%',
                            backgroundColor: msg.direction === 'out' ? 'primary.main' : 'grey.100',
                            color: msg.direction === 'out' ? 'white' : 'text.primary',
                          }}
                        >
                          {msg.sender_name && msg.direction === 'in' && (
                            <Typography variant="caption" fontWeight="bold" display="block" sx={{ mb: 0.5 }}>
                              {msg.sender_name}
                            </Typography>
                          )}
                          <Typography variant="body1">{msg.text}</Typography>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              mt: 0.5,
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                opacity: 0.7,
                              }}
                            >
                              {formatTime(msg.created_at)}
                            </Typography>
                            {msg.direction === 'out' && (
                              <>
                                {msg.delivery_status === 'queued' && (
                                  <DoneIcon sx={{ fontSize: 14, opacity: 0.7 }} />
                                )}
                                {msg.delivery_status === 'sent' && (
                                  <DoneAllIcon sx={{ fontSize: 14, opacity: 0.7 }} />
                                )}
                              </>
                            )}
                          </Box>
                        </Paper>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>

              {/* Input */}
              <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box display="flex" gap={1}>
                  <TextField
                    inputRef={messageInputRef}
                    fullWidth
                    placeholder="Type a message..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    multiline
                    maxRows={4}
                  />
                  <Button
                    variant="contained"
                    endIcon={<SendIcon />}
                    onClick={sendMessage}
                    disabled={!messageText.trim() || sending}
                  >
                    {sending ? 'Sending...' : 'Send'}
                  </Button>
                </Box>
              </Box>
            </>
          ) : (
            <Box display="flex" justifyContent="center" alignItems="center" height="100%">
              <Typography variant="body1" color="text.secondary">
                Select a conversation to view messages
              </Typography>
            </Box>
          )}
        </Paper>
      </Box>
    </DashboardLayout>
  );
};

export default InboxPage;




