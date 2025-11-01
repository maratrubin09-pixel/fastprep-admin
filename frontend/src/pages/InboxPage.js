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
  IconButton,
} from '@mui/material';
import {
  Telegram as TelegramIcon,
  WhatsApp as WhatsAppIcon,
  Instagram as InstagramIcon,
  Facebook as FacebookIcon,
  Send as SendIcon,
  Done as DoneIcon,
  DoneAll as DoneAllIcon,
  Delete as DeleteIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  AttachFile as AttachFileIcon,
} from '@mui/icons-material';
import { io } from 'socket.io-client';
import DashboardLayout from '../components/DashboardLayout';
import FileUpload from '../components/FileUpload';

const API_URL = process.env.REACT_APP_API_URL || 'https://fastprep-admin-api.onrender.com';

// Компонент для отображения медиафайлов
const MediaPreview = ({ objectKey }) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [isImage, setIsImage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);

  React.useEffect(() => {
    if (!objectKey) return;

    // Определяем тип файла по расширению
    const extension = objectKey.split('.').pop()?.toLowerCase();
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const isImg = imageExtensions.includes(extension || '');

    setIsImage(isImg);

    if (isImg) {
      // Получаем presigned URL для изображения через наш backend
      const token = localStorage.getItem('token');
      const downloadUrl = `${API_URL}/api/inbox/uploads/download/${encodeURIComponent(objectKey)}`;
      
      // Создаем URL с токеном для изображения
      // Backend вернет редирект на presigned URL, но мы можем использовать его напрямую
      // Для упрощения используем наш endpoint как proxy
      setImageUrl(`${downloadUrl}?t=${Date.now()}`);
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [objectKey]);

  const handleDownload = () => {
    const token = localStorage.getItem('token');
    const downloadUrl = `${API_URL}/api/inbox/uploads/download/${encodeURIComponent(objectKey)}`;
    
    // Создаем временную ссылку для скачивания
    fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
      .then(res => res.url)
      .then(url => {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.download = objectKey.split('/').pop() || 'file';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      })
      .catch(err => {
        console.error('Download error:', err);
        alert('Не удалось скачать файл');
      });
  };

  if (loading) {
    return <CircularProgress size={20} />;
  }

  if (isImage && imageUrl) {
    return (
      <>
        <Box
          sx={{
            position: 'relative',
            maxWidth: '100%',
            cursor: 'pointer',
            '&:hover': { opacity: 0.9 },
          }}
          onClick={() => setOpenModal(true)}
        >
          <img
            src={imageUrl}
            alt="Attachment"
            style={{
              maxWidth: '200px',
              maxHeight: '200px',
              borderRadius: '8px',
              objectFit: 'cover',
            }}
            onError={() => setIsImage(false)}
          />
        </Box>
        {openModal && (
          <Box
            onClick={() => setOpenModal(false)}
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.9)',
              zIndex: 1300,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <img
              src={imageUrl}
              alt="Full size"
              style={{
                maxWidth: '90%',
                maxHeight: '90%',
                objectFit: 'contain',
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </Box>
        )}
      </>
    );
  }

  // Для не-изображений показываем кнопку скачивания
  return (
    <Button
      variant="outlined"
      size="small"
      startIcon={<AttachFileIcon />}
      onClick={handleDownload}
      sx={{ mt: 1 }}
    >
      Скачать файл
    </Button>
  );
};

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
  const [attachedFileKey, setAttachedFileKey] = useState(null);
  const socketRef = useRef(null);
  const messageInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const selectedThreadRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  // Setup WebSocket connection (не зависит от selectedThread!)
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
        console.log('📨 New message received via WebSocket:', data);
        
        if (!data || !data.conversationId || !data.message) {
          console.warn('⚠️ Invalid new_message data:', data);
          return;
        }

        const isIncoming = data.message.direction === 'in';
        
        // Уведомление для входящих сообщений (если чат не открыт)
        if (isIncoming && selectedThreadRef.current?.id !== data.conversationId) {
          // Браузерное уведомление (нужны разрешения)
          if ('Notification' in window && Notification.permission === 'granted') {
            // Используем setConversations callback для получения актуальных данных
            setConversations(prev => {
              const conv = prev.find(c => c.id === data.conversationId);
              const convTitle = conv?.chat_title || data.message.sender_name || 'New message';
              new Notification(convTitle, {
                body: data.message.text || 'New message',
                icon: '/favicon.ico',
                tag: data.conversationId, // Предотвращаем дубликаты
              });
              return prev; // Не изменяем состояние
            });
          } else if ('Notification' in window && Notification.permission === 'default') {
            // Запрашиваем разрешение при первом сообщении
            Notification.requestPermission();
          }
        }

        // Update conversations list FIRST (move to top and update last_message_at)
        setConversations(prev => {
          const existingConv = prev.find(conv => conv.id === data.conversationId);
          
          if (existingConv) {
            // Обновляем существующий чат
            const updated = prev.map(conv => {
              if (conv.id === data.conversationId) {
                return {
                  ...conv,
                  last_message_at: data.message.created_at,
                  unread_count: isIncoming && selectedThreadRef.current?.id !== data.conversationId
                    ? (conv.unread_count || 0) + 1
                    : conv.unread_count || 0
                };
              }
              return conv;
            });
            // Сортируем по last_message_at
            return updated.sort((a, b) => 
              new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at)
            );
          } else {
            // Если чата нет в списке (новый чат или восстановленный), обновляем список чатов
            console.log('🔄 Conversation not in list, fetching updated list...');
            fetchConversations();
            return prev;
          }
        });
        
        // Add message to current conversation if it's selected
        setMessages(prev => {
          // Проверяем, выбран ли этот чат (используем ref)
          const currentThread = selectedThreadRef.current;
          const isSelected = currentThread?.id === data.conversationId;
          
          if (!isSelected) {
            console.log(`⏭️ Message not added to UI (chat not selected): ${data.conversationId}`);
            return prev;
          }
          
          // Проверяем, нет ли уже этого сообщения
          const exists = prev.find(msg => msg.id === data.message.id);
          if (exists) {
            console.log(`⏭️ Message already exists: ${data.message.id}`);
            return prev;
          }
          
          console.log(`✅ Adding message to UI: ${data.message.id}`);
          return [...prev, data.message];
        });
      });

      // Handle message status updates
      socket.on('message_status_update', (data) => {
        console.log('📊 Message status update:', data);
        
        // Update message status in current conversation
        setMessages(prev => {
          const currentThread = selectedThreadRef.current;
          const isSelected = currentThread?.id === data.conversationId;
          if (!isSelected) return prev;
          
          return prev.map(msg => 
            msg.id === data.messageId 
              ? { ...msg, delivery_status: data.status }
              : msg
          );
        });
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
  }, []); // Убрали зависимость от selectedThread - слушаем все сообщения!

  // Обновляем ref при изменении selectedThread
  useEffect(() => {
    selectedThreadRef.current = selectedThread;
  }, [selectedThread]);

  // Fetch messages when thread is selected
  useEffect(() => {
    if (selectedThread) {
      fetchMessages(selectedThread.id);
      // Прокручиваем вниз после загрузки сообщений
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
        }
      }, 100);
    }
  }, [selectedThread]);

  // Умная автопрокрутка - только если пользователь уже внизу
  useEffect(() => {
    if (!messagesContainerRef.current || messages.length === 0) return;

    const container = messagesContainerRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

    // Прокручиваем только если пользователь уже внизу
    if (isNearBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Проверка, нужно ли показать кнопку "Прокрутить вниз"
  useEffect(() => {
    if (!messagesContainerRef.current) return;

    const container = messagesContainerRef.current;
    const checkScroll = () => {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      setShowScrollToBottom(!isNearBottom);
    };

    container.addEventListener('scroll', checkScroll);
    checkScroll(); // Проверяем сразу

    return () => container.removeEventListener('scroll', checkScroll);
  }, [selectedThread, messages]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

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
      
      // Обновляем счетчик непрочитанных в списке чатов
      setConversations(prev => 
        prev.map(conv => 
          conv.id === threadId ? { ...conv, unread_count: 0 } : conv
        )
      );
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const sendMessage = async () => {
    // Читаем текст напрямую из input через ref
    const text = messageInputRef.current?.value || messageText;
    console.log('🔍 Frontend sendMessage - text:', text, 'from ref:', messageInputRef.current?.value, 'from state:', messageText);
    
    if ((!text.trim() && !attachedFileKey) || !selectedThread) return;
    
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
          text: text || '', // Пустой текст если только файл
          objectKey: attachedFileKey || undefined,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to send message');
      }
      
      // Получаем созданное сообщение из ответа
      const newMessage = await response.json();
      
      // Немедленно добавляем сообщение в UI со статусом "queued" (отправляется...)
      setMessages(prev => [...prev, newMessage]);
      
      // Показываем успешное уведомление только если есть текст (для файлов может быть пустой)
      if (text.trim()) {
        console.log('✅ Message sent successfully');
      }
      
      // Очищаем поле ввода и вложение
      setMessageText('');
      setAttachedFileKey(null);
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
      console.error('❌ Failed to send message:', err);
      
      // Показываем ошибку пользователю
      const errorMessage = err.message || 'Не удалось отправить сообщение';
      
      // Простое уведомление (можно улучшить с toast-библиотекой)
      if (window.confirm(`${errorMessage}\n\nПовторить попытку?`)) {
        // Retry механизм
        setTimeout(() => sendMessage(), 1000);
      } else {
        // Показываем ошибку в UI
        setError(errorMessage);
        setTimeout(() => setError(null), 5000);
      }
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

  const handleDeleteConversation = async (convId, e) => {
    e.stopPropagation(); // Предотвращаем выбор чата при клике на кнопку
    
    if (!window.confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${API_URL}/api/inbox/conversations/${convId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete conversation');
      }

      const result = await response.json();
      
      // Удаляем чат из списка
      setConversations(prev => prev.filter(conv => conv.id !== convId));
      
      // Если удаленный чат был выбран, снимаем выбор
      if (selectedThread?.id === convId) {
        setSelectedThread(null);
        setMessages([]);
      }

      alert(result.message || 'Conversation deleted successfully');
    } catch (err) {
      alert('Failed to delete conversation: ' + err.message);
    }
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

  // Показываем ошибку как snackbar/alert внизу страницы, а не блокируем весь экран
  const showErrorAlert = error && (
    <Box
      sx={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1400,
      }}
    >
      <Alert 
        severity="error" 
        onClose={() => setError(null)}
        sx={{ minWidth: 300 }}
      >
        {error}
      </Alert>
    </Box>
  );

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
      {showErrorAlert}
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
                      backgroundColor: conv.unread_count > 0 ? 'action.hover' : 'transparent',
                      fontWeight: conv.unread_count > 0 ? 'bold' : 'normal',
                    }}
                    secondaryAction={
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                        sx={{ 
                          color: 'error.main',
                          '&:hover': {
                            backgroundColor: 'error.light',
                            color: 'error.dark',
                          },
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemAvatar>
                      <Avatar>
                        {platformIcons[platform] || '💬'}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box display="flex" justifyContent="space-between" alignItems="center" gap={1}>
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
                      secondary={
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography variant="caption">
                            {formatTime(conv.last_message_at || conv.created_at)}
                          </Typography>
                          {conv.unread_count > 0 && (
                            <Chip
                              label={conv.unread_count}
                              size="small"
                              color="primary"
                              sx={{ ml: 1, minWidth: 20, height: 20, fontSize: '0.7rem' }}
                            />
                          )}
                        </Box>
                      }
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
              <Box 
                ref={messagesContainerRef}
                sx={{ flex: 1, overflow: 'auto', p: 2, position: 'relative' }}
              >
                {showScrollToBottom && (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={scrollToBottom}
                    sx={{
                      position: 'absolute',
                      bottom: 16,
                      right: 16,
                      zIndex: 10,
                      minWidth: 'auto',
                      borderRadius: '50%',
                      width: 40,
                      height: 40,
                      boxShadow: 3,
                    }}
                  >
                    <KeyboardArrowDownIcon />
                  </Button>
                )}
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
                          {/* Отображение медиафайлов */}
                          {msg.object_key && (
                            <Box sx={{ mb: 1 }}>
                              <MediaPreview objectKey={msg.object_key} />
                            </Box>
                          )}
                          {msg.metadata?.attachments && msg.metadata.attachments.length > 0 && (
                            <Box sx={{ mb: 1 }}>
                              {msg.metadata.attachments.map((att, idx) => (
                                <Box key={idx} sx={{ mb: 1 }}>
                                  {att.type === 'photo' && (
                                    <Typography variant="caption" display="block">📷 Photo</Typography>
                                  )}
                                  {att.type === 'video' && (
                                    <Typography variant="caption" display="block">🎥 Video</Typography>
                                  )}
                                  {att.type === 'voice' && (
                                    <Typography variant="caption" display="block">🎤 Voice message</Typography>
                                  )}
                                  {att.type === 'audio' && (
                                    <Typography variant="caption" display="block">🎵 Audio: {att.fileName || 'audio'}</Typography>
                                  )}
                                  {att.type === 'document' && (
                                    <Typography variant="caption" display="block">📎 {att.fileName || 'Document'}</Typography>
                                  )}
                                  {att.type === 'sticker' && (
                                    <Typography variant="caption" display="block">😀 Sticker</Typography>
                                  )}
                                  {att.caption && (
                                    <Typography variant="caption" display="block" sx={{ fontStyle: 'italic' }}>
                                      {att.caption}
                                    </Typography>
                                  )}
                                </Box>
                              ))}
                            </Box>
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
                                  <DoneIcon sx={{ fontSize: 14, opacity: 0.5, color: 'grey.400' }} />
                                )}
                                {msg.delivery_status === 'sending' && (
                                  <CircularProgress size={14} sx={{ opacity: 0.7 }} />
                                )}
                                {msg.delivery_status === 'sent' && (
                                  <DoneAllIcon sx={{ fontSize: 14, opacity: 0.7, color: 'primary.light' }} />
                                )}
                                {msg.delivery_status === 'delivered' && (
                                  <DoneAllIcon sx={{ fontSize: 14, opacity: 1, color: 'primary.main' }} />
                                )}
                                {msg.delivery_status === 'failed' && (
                                  <DoneIcon sx={{ fontSize: 14, opacity: 1, color: 'error.main' }} />
                                )}
                              </>
                            )}
                          </Box>
                        </Paper>
                      </Box>
                    ))}
                    {/* Ref для автопрокрутки */}
                    <div ref={messagesEndRef} />
                  </Stack>
                )}
              </Box>

              {/* Input */}
              <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box display="flex" gap={1} alignItems="flex-end">
                  <FileUpload
                    threadId={selectedThread.id}
                    onFileUploaded={(objectKey) => {
                      setAttachedFileKey(objectKey);
                      // Если файл удален (objectKey === null), очищаем состояние
                      if (objectKey === null) {
                        setAttachedFileKey(null);
                      }
                    }}
                    disabled={sending}
                  />
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
                    disabled={(!messageText.trim() && !attachedFileKey) || sending}
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













