import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
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
  KeyboardArrowDown as KeyboardArrowDownIcon,
  AttachFile as AttachFileIcon,
  ArrowBack as ArrowBackIcon,
  Archive as ArchiveIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { useMediaQuery as useMuiMediaQuery } from '@mui/material';
import { io } from 'socket.io-client';
import Linkify from 'linkify-react';
import DashboardLayout from '../components/DashboardLayout';
import FileUpload from '../components/FileUpload';
import NewChatModal from '../components/NewChatModal';
import { MOBILE_MAX, TABLET_MAX } from '../utils/breakpoints';

const API_URL = process.env.REACT_APP_API_URL || 'https://fastprep-admin-api.onrender.com';

// Компонент для отображения медиафайлов
const MediaPreview = ({ objectKey }) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [isImage, setIsImage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);

  React.useEffect(() => {
    if (!objectKey) {
      setLoading(false);
      return;
    }

    console.log('🖼️ MediaPreview loading objectKey:', objectKey);

    // Определяем тип файла по расширению
    const extension = objectKey.split('.').pop()?.toLowerCase();
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'svg'];
    const isImg = imageExtensions.includes(extension || '');

    setIsImage(isImg);

    if (isImg) {
      // Получаем presigned URL для изображения через наш backend
      const token = localStorage.getItem('token');
      const downloadUrl = `${API_URL}/api/inbox/uploads/download/${encodeURIComponent(objectKey)}?url=true`;
      
      console.log('🔗 Requesting presigned URL:', downloadUrl);
      
      // Запрашиваем presigned URL напрямую
      fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
        .then(res => {
          console.log('📥 Presigned URL response status:', res.status);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          return res.json();
        })
        .then(data => {
          console.log('✅ Got presigned URL:', data.url?.substring(0, 50) + '...');
          setImageUrl(data.url);
        })
        .catch(err => {
          console.error('❌ Failed to get image URL:', err);
          // Fallback - пробуем напрямую через download endpoint
          setImageUrl(`${API_URL}/api/inbox/uploads/download/${encodeURIComponent(objectKey)}?url=true`);
        })
        .finally(() => setLoading(false));
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
            onError={(e) => {
              console.error('❌ Failed to load image:', imageUrl);
              console.error('Error event:', e);
              setIsImage(false);
              setImageUrl(null);
            }}
            onLoad={() => {
              console.log('✅ Image loaded successfully:', objectKey);
            }}
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
  const location = useLocation();
  const [conversations, setConversations] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachedFileKey, setAttachedFileKey] = useState(null);
  const [fileUploadResetKey, setFileUploadResetKey] = useState(0);
  const socketRef = useRef(null);
  const messageInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const selectedThreadRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const prevMessagesLengthRef = useRef(0);
  const prevSelectedThreadIdRef = useRef(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  
  // Responsive design
  const isMobile = useMuiMediaQuery(`(max-width: ${MOBILE_MAX}px)`);
  const isTablet = useMuiMediaQuery(`(min-width: ${MOBILE_MAX + 1}px) and (max-width: ${TABLET_MAX}px)`);
  const [showChat, setShowChat] = useState(false); // Для мобильных: показывать чат или список
  
  // Get platform from URL pathname
  const getPlatformFromPath = () => {
    const path = location.pathname;
    if (path.includes('/whatsapp')) return 'whatsapp';
    if (path.includes('/telegram')) return 'telegram';
    if (path.includes('/instagram')) return 'instagram';
    if (path.includes('/facebook')) return 'facebook';
    return null; // 'All Messages' - no filter
  };

  // Fetch conversations on mount and when pathname changes
  useEffect(() => {
    fetchConversations();
  }, [location.pathname]);

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
            // Сортируем по last_message_at (более свежие сверху)
            const sorted = updated.sort((a, b) => {
              const dateA = new Date(a.last_message_at || a.created_at || 0).getTime();
              const dateB = new Date(b.last_message_at || b.created_at || 0).getTime();
              return dateB - dateA;
            });
            return sorted;
          } else {
            // Если чата нет в списке (новый чат или восстановленный), обновляем список чатов
            console.log('🔄 Conversation not in list, fetching updated list...');
            fetchConversations();
            return prev;
          }
        });
        
        // Проверяем, выбран ли этот чат (используем ref) ПЕРЕД добавлением сообщения
        const currentThread = selectedThreadRef.current;
        const isSelected = currentThread?.id === data.conversationId;
        
        // Add message to current conversation if it's selected
        setMessages(prev => {
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
        
        // Автопрокрутка будет обработана в useEffect при изменении messages
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
    }
  }, [selectedThread]);

  // Автопрокрутка при загрузке сообщений или новых сообщениях
  // Всегда прокручиваем к последнему сообщению при:
  // 1. Загрузке сообщений чата впервые (смена selectedThread) - ВСЕГДА
  // 2. Новых входящих сообщениях (через WebSocket) - ВСЕГДА
  // Для остальных случаев (пользователь прокрутил вверх) - только если он уже внизу
  useEffect(() => {
    if (!messagesContainerRef.current || messages.length === 0 || !selectedThread) {
      // Сбрасываем состояние кнопки если нет сообщений
      setShowScrollToBottom(false);
      return;
    }

    const container = messagesContainerRef.current;
    const scrollHeight = container.scrollHeight;
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom < 200; // Порог 200px

    // Проверяем, загрузились ли сообщения впервые для этого чата
    const isFirstLoad = prevSelectedThreadIdRef.current !== selectedThread.id;
    const prevMessagesLength = prevMessagesLengthRef.current;
    const currentMessagesLength = messages.length;
    
    // Новое сообщение добавлено (через WebSocket)
    const isNewMessage = currentMessagesLength > prevMessagesLength && !isFirstLoad;
    const lastMessage = messages[messages.length - 1];
    const isNewIncomingMessage = isNewMessage && lastMessage && lastMessage.direction === 'in';

    // Обновляем refs
    prevMessagesLengthRef.current = currentMessagesLength;
    prevSelectedThreadIdRef.current = selectedThread.id;

    // Всегда прокручиваем если:
    // 1. Это первая загрузка чата - ВСЕГДА
    // 2. Новое входящее сообщение - ВСЕГДА
    // 3. Пользователь уже внизу
    const shouldScroll = isFirstLoad || isNewIncomingMessage || isNearBottom;

    if (shouldScroll && messagesEndRef.current) {
      // Используем несколько попыток для гарантии
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (messagesEndRef.current && messagesContainerRef.current) {
            const container = messagesContainerRef.current;
            // Для первой загрузки используем 'auto' (быстрее), для остальных - 'smooth'
            const behavior = isFirstLoad ? 'auto' : 'smooth';
            // Сначала прокручиваем через scrollTop (более надежно)
            container.scrollTop = container.scrollHeight;
            // Затем через scrollIntoView как дополнительная гарантия
            setTimeout(() => {
              if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
              }
              // Обновляем состояние кнопки после прокрутки
              if (messagesContainerRef.current) {
                const c = messagesContainerRef.current;
                const dFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
                setShowScrollToBottom(dFromBottom >= 100);
              }
            }, isFirstLoad ? 100 : 100);
          } else if (messagesEndRef.current) {
            const behavior = isFirstLoad ? 'auto' : 'smooth';
            messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
            // Обновляем состояние кнопки
            setTimeout(() => {
              if (messagesContainerRef.current) {
                const c = messagesContainerRef.current;
                const dFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
                setShowScrollToBottom(dFromBottom >= 100);
              }
            }, 100);
          }
        }, isFirstLoad ? 200 : 100);

        // Вторая попытка для гарантии
        setTimeout(() => {
          if (messagesContainerRef.current) {
            const container = messagesContainerRef.current;
            container.scrollTop = container.scrollHeight;
            // Обновляем состояние кнопки после прокрутки
            const dFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            setShowScrollToBottom(dFromBottom >= 100);
          } else if (messagesEndRef.current) {
            const behavior = isFirstLoad ? 'auto' : 'smooth';
            messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
            // Обновляем состояние кнопки
            setTimeout(() => {
              if (messagesContainerRef.current) {
                const c = messagesContainerRef.current;
                const dFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
                setShowScrollToBottom(dFromBottom >= 100);
              }
            }, 100);
          }
        }, isFirstLoad ? 500 : 300);
      });
    } else {
      // Если не прокручиваем, обновляем состояние кнопки
      setShowScrollToBottom(distanceFromBottom >= 100);
    }
  }, [messages, selectedThread]);

  // Проверка, нужно ли показать кнопку "Прокрутить вниз"
  useEffect(() => {
    if (!messagesContainerRef.current || !selectedThread || messages.length === 0) {
      setShowScrollToBottom(false);
      return;
    }

    const container = messagesContainerRef.current;
    const checkScroll = () => {
      if (!container) return;
      const scrollHeight = container.scrollHeight;
      const scrollTop = container.scrollTop;
      const clientHeight = container.clientHeight;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isNearBottom = distanceFromBottom < 100; // Порог 100px
      setShowScrollToBottom(!isNearBottom);
    };

    // Проверяем сразу с небольшой задержкой для гарантии готовности DOM
    setTimeout(checkScroll, 100);

    // Добавляем обработчик scroll
    container.addEventListener('scroll', checkScroll);

    // Также периодически проверяем (на случай если scroll событие не срабатывает)
    const intervalId = setInterval(checkScroll, 300);

    return () => {
      container.removeEventListener('scroll', checkScroll);
      clearInterval(intervalId);
    };
  }, [selectedThread, messages]);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      // Используем прямой scrollTop для более надежной прокрутки
      container.scrollTop = container.scrollHeight;
      // Дополнительно используем scrollIntoView
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
        // Обновляем состояние кнопки после прокрутки
        setTimeout(() => {
          if (messagesContainerRef.current) {
            const c = messagesContainerRef.current;
            const dFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
            setShowScrollToBottom(dFromBottom >= 100);
          }
        }, 100);
      }, 50);
    } else if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      // Обновляем состояние кнопки
      setTimeout(() => {
        if (messagesContainerRef.current) {
          const c = messagesContainerRef.current;
          const dFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
          setShowScrollToBottom(dFromBottom >= 100);
        }
      }, 100);
    }
  };

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const platform = getPlatformFromPath();
      const url = platform 
        ? `${API_URL}/api/inbox/conversations?platform=${platform}`
        : `${API_URL}/api/inbox/conversations`;
      
      const response = await fetch(url, {
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
    
    if ((!text.trim() && !attachedFileKey) || !selectedThread) {
      console.warn('⚠️ Cannot send message: no text and no file, or no thread selected');
      return;
    }
    
    // Проверяем, что если есть attachedFileKey, он валидный
    if (attachedFileKey && !attachedFileKey.startsWith('inbox/')) {
      console.error('❌ Invalid objectKey format:', attachedFileKey);
      alert('Ошибка: неправильный формат файла. Попробуйте загрузить файл заново.');
      return;
    }
    
    try {
      setSending(true);
      const token = localStorage.getItem('token');
      const requestBody = {
        text: text || '', // Пустой текст если только файл
        objectKey: attachedFileKey || undefined,
      };
      
      console.log('📤 Sending message request:', {
        threadId: selectedThread.id,
        text: text || '(empty)',
        attachedFileKey: attachedFileKey || '(none)',
        requestBody,
      });
      
      const response = await fetch(`${API_URL}/api/inbox/conversations/${selectedThread.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to send message');
      }
      
      // Получаем созданное сообщение из ответа
      const newMessage = await response.json();
      console.log('📤 New message from server:', newMessage);
      console.log('📤 Object key:', newMessage.object_key || newMessage.objectKey);
      
      // Немедленно добавляем сообщение в UI со статусом "queued" (отправляется...)
      // Убеждаемся, что объект имеет правильную структуру
      const messageToAdd = {
        ...newMessage,
        object_key: newMessage.object_key || newMessage.objectKey, // Поддержка обоих вариантов
        direction: 'out',
      };
      setMessages(prev => [...prev, messageToAdd]);
      
      // Показываем успешное уведомление только если есть текст (для файлов может быть пустой)
      if (text.trim()) {
        console.log('✅ Message sent successfully');
      }
      
      // Очищаем поле ввода и вложение
      setMessageText('');
      setAttachedFileKey(null);
      setFileUploadResetKey(prev => prev + 1); // Сбрасываем FileUpload компонент
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

  const handleEditName = () => {
    if (!selectedThread) return;
    setEditedName(selectedThread.custom_name || selectedThread.chat_title || '');
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!selectedThread) return;
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${API_URL}/api/inbox/conversations/${selectedThread.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ custom_name: editedName.trim() || null }),
      });

      if (!response.ok) {
        throw new Error('Failed to update conversation name');
      }

      // Update local state
      setSelectedThread({ ...selectedThread, custom_name: editedName.trim() || null });
      setConversations(prev => prev.map(conv => 
        conv.id === selectedThread.id 
          ? { ...conv, custom_name: editedName.trim() || null }
          : conv
      ));
      setIsEditingName(false);
    } catch (err) {
      alert('Failed to update conversation name: ' + err.message);
    }
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditedName('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleArchiveConversation = async () => {
    if (!selectedThread) return;
    
    if (!window.confirm('Are you sure you want to archive this conversation?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${API_URL}/api/inbox/conversations/${selectedThread.id}/archive`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to archive conversation');
      }

      // Remove from list and clear selection
      setConversations(prev => prev.filter(conv => conv.id !== selectedThread.id));
      setSelectedThread(null);
      setMessages([]);
    } catch (err) {
      alert('Failed to archive conversation: ' + err.message);
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

  const handleNewChatSuccess = (conversation) => {
    // Add to conversations list and select it
    setConversations(prev => [conversation, ...prev]);
    setSelectedThread(conversation);
    if (isMobile) {
      setShowChat(true);
    }
  };

  return (
    <DashboardLayout title="Unified Inbox" onNewChatClick={() => setNewChatModalOpen(true)}>
      {showErrorAlert}
      <NewChatModal
        open={newChatModalOpen}
        onClose={() => setNewChatModalOpen(false)}
        onSuccess={handleNewChatSuccess}
      />
      <Box sx={{ 
        display: 'flex', 
        gap: 2, 
        height: 'calc(100vh - 200px)',
        flexDirection: isMobile && showChat ? 'column' : 'row',
      }}>
        {/* Conversations List */}
        <Paper sx={{ 
          width: isMobile ? '100%' : isTablet ? '300px' : '350px',
          overflow: 'auto',
          display: isMobile && showChat ? 'none' : 'block',
          height: isMobile ? '100%' : 'auto',
        }}>
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
                    onClick={() => {
                      setSelectedThread(conv);
                      if (isMobile) {
                        setShowChat(true); // На мобильных показываем чат
                      }
                    }}
                    sx={{
                      '&.Mui-selected': {
                        backgroundColor: '#E8EAF6', // Очень светло-фиолетовый вместо яркого
                        color: '#6A1B9A', // Фиолетовый текст
                        '&:hover': {
                          backgroundColor: '#E8EAF6',
                        },
                      },
                      backgroundColor: conv.unread_count > 0 ? 'action.hover' : 'transparent',
                      fontWeight: conv.unread_count > 0 ? 'bold' : 'normal',
                    }}
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
                            {conv.custom_name || conv.chat_title || conv.external_chat_id || 'Unknown'}
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
        <Paper sx={{ 
          flex: 1, 
          display: isMobile && !showChat ? 'none' : 'flex',
          flexDirection: 'column',
          position: isMobile ? 'fixed' : 'relative',
          top: isMobile ? 0 : 'auto',
          left: isMobile ? 0 : 'auto',
          right: isMobile ? 0 : 'auto',
          bottom: isMobile ? 0 : 'auto',
          width: isMobile ? '100%' : 'auto',
          height: isMobile ? '100vh' : 'auto',
          zIndex: isMobile ? 1300 : 'auto',
        }}>
          {selectedThread ? (
            <>
              {/* Header */}
              <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box display="flex" alignItems="center" gap={1}>
                  {isMobile && (
                    <IconButton
                      onClick={() => {
                        setShowChat(false);
                        setSelectedThread(null);
                      }}
                      sx={{ mr: 1 }}
                    >
                      <ArrowBackIcon />
                    </IconButton>
                  )}
                  <Avatar>
                    {platformIcons[getPlatformFromChannelId(selectedThread.channel_id)] || '💬'}
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    {isEditingName ? (
                      <TextField
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveName();
                          } else if (e.key === 'Escape') {
                            handleCancelEditName();
                          }
                        }}
                        size="small"
                        autoFocus
                        sx={{ mb: 0.5 }}
                      />
                    ) : (
                      <Typography 
                        variant="h6" 
                        fontWeight="bold"
                        sx={{ cursor: 'pointer', '&:hover': { opacity: 0.7 } }}
                        onClick={handleEditName}
                      >
                        {selectedThread.custom_name || selectedThread.chat_title || selectedThread.external_chat_id || 'Unknown'}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {selectedThread.channel_id}
                    </Typography>
                  </Box>
                  {isEditingName ? (
                    <>
                      <IconButton
                        onClick={handleSaveName}
                        sx={{ color: 'primary.main' }}
                        title="Save"
                      >
                        <SaveIcon />
                      </IconButton>
                      <IconButton
                        onClick={handleCancelEditName}
                        sx={{ color: 'text.secondary' }}
                        title="Cancel"
                      >
                        <CancelIcon />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <IconButton
                        onClick={handleEditName}
                        sx={{ color: 'text.secondary' }}
                        title="Edit name"
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        onClick={handleArchiveConversation}
                        sx={{ color: 'text.secondary' }}
                        title="Archive conversation"
                      >
                        <ArchiveIcon />
                      </IconButton>
                    </>
                  )}
                </Box>
              </Box>

              {/* Messages */}
              <Box 
                ref={messagesContainerRef}
                sx={{ 
                  flex: 1, 
                  overflow: 'auto', 
                  p: 2, 
                  position: 'relative',
                  backgroundColor: '#F8F9FA', // Очень светло-серый фон для области чата
                }}
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
                            backgroundColor: msg.direction === 'out' ? '#E1BEE7' : 'white', // Очень светло-фиолетовый для исходящих, белый для входящих
                            color: msg.direction === 'out' ? '#6A1B9A' : 'text.primary', // Фиолетовый текст вместо белого для лучшей читаемости
                            border: msg.direction === 'in' ? '1px solid #e0e0e0' : '2px solid #BA68C8', // Фиолетовая рамка для исходящих
                            boxShadow: msg.direction === 'in' ? '0 1px 2px rgba(0,0,0,0.05)' : '0 1px 3px rgba(156,39,176,0.15)', // Мягкие тени
                            wordWrap: 'break-word',
                            overflowWrap: 'break-word',
                            '& .message-link': {
                              wordBreak: 'break-all',
                              overflowWrap: 'anywhere',
                              '& a': {
                                color: msg.direction === 'out' ? '#6A1B9A' : '#9C27B0', // Темно-фиолетовый для исходящих (лучше читается), фиолетовый для входящих
                                textDecoration: 'underline',
                                fontWeight: 500, // Чуть жирнее для лучшей читаемости
                                wordBreak: 'break-all',
                                overflowWrap: 'anywhere',
                                '&:hover': {
                                  opacity: 0.7,
                                  textDecoration: 'underline',
                                },
                              },
                            },
                          }}
                        >
                          {msg.sender_name && msg.direction === 'in' && (
                            <Typography variant="caption" fontWeight="bold" display="block" sx={{ mb: 0.5 }}>
                              {msg.sender_name}
                            </Typography>
                          )}
                          {/* Отображение медиафайлов */}
                          {(msg.object_key || msg.objectKey) && (
                            <Box sx={{ mb: 1 }}>
                              <MediaPreview objectKey={msg.object_key || msg.objectKey} />
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
                          <Typography 
                            variant="body1" 
                            component="div"
                            sx={{
                              wordWrap: 'break-word',
                              overflowWrap: 'break-word',
                              wordBreak: 'break-word',
                            }}
                          >
                            <Linkify
                              options={{
                                target: '_blank',
                                rel: 'noopener noreferrer',
                                className: 'message-link',
                              }}
                            >
                              {msg.text}
                            </Linkify>
                          </Typography>
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
                    resetKey={fileUploadResetKey}
                    onFileUploaded={(objectKey) => {
                      console.log('📎 FileUpload callback: objectKey=', objectKey);
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
                    onKeyDown={handleKeyDown}
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













