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
  InputAdornment,
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
  Reply as ReplyIcon,
  Close as CloseIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  InsertEmoticon as EmoticonIcon,
  ContentCopy as TemplateIcon,
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
  const draftKeyRef = useRef(null); // Key for localStorage draft
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
  const [replyingTo, setReplyingTo] = useState(null); // Сообщение на которое отвечаем { id, text, sender_name }
  const [editingMessageId, setEditingMessageId] = useState(null); // ID сообщения которое редактируем
  const [editingMessageText, setEditingMessageText] = useState(''); // Текст редактируемого сообщения
  const [searchQuery, setSearchQuery] = useState(''); // Поисковый запрос
  const [searchResults, setSearchResults] = useState({ conversations: [], messages: [] }); // Результаты поиска
  const [isSearching, setIsSearching] = useState(false); // Флаг активного поиска
  const searchTimeoutRef = useRef(null); // Ref для debounce поиска
  const [typingUsers, setTypingUsers] = useState([]); // Пользователи которые печатают
  const typingTimeoutRef = useRef(null); // Timeout для отправки typing события
  const [templates, setTemplates] = useState([]); // Шаблоны сообщений
  const [showTemplates, setShowTemplates] = useState(false); // Показать/скрыть шаблоны
  const [showEmojiPicker, setShowEmojiPicker] = useState(false); // Показать/скрыть emoji picker
  
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
      // Listen for typing events
      socket.on('typing', (data) => {
        const token = localStorage.getItem('token');
        let currentUserId = null;
        if (token) {
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            currentUserId = payload.sub || payload.id;
          } catch (e) {}
        }
        if (data.conversation_id === selectedThreadRef.current?.id && data.user_id !== currentUserId) {
          setTypingUsers(prev => {
            const filtered = prev.filter(u => u.user_id !== data.user_id);
            return [...filtered, { user_id: data.user_id, user_name: data.user_name || 'Someone' }];
          });
          
          // Clear typing indicator after 3 seconds
          setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u.user_id !== data.user_id));
          }, 3000);
        }
      });

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

  // Load templates on mount
  useEffect(() => {
    const savedTemplates = localStorage.getItem('message_templates');
    if (savedTemplates) {
      try {
        setTemplates(JSON.parse(savedTemplates));
      } catch (e) {
        console.error('Failed to parse templates:', e);
      }
    }
  }, []);

  // Fetch messages when thread is selected
  useEffect(() => {
    if (selectedThread) {
      fetchMessages(selectedThread.id);
      setReplyingTo(null); // Сбрасываем reply при смене чата
      
      // Сначала очищаем поле ввода
      setMessageText('');
      if (messageInputRef.current) {
        messageInputRef.current.value = '';
      }
      
      // Затем загружаем черновик для этого чата (если есть)
      const draftKey = `draft_${selectedThread.id}`;
      draftKeyRef.current = draftKey;
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft && savedDraft.trim()) {
        // Небольшая задержка чтобы убедиться что очистка завершена
        setTimeout(() => {
          setMessageText(savedDraft);
          if (messageInputRef.current) {
            messageInputRef.current.value = savedDraft;
          }
        }, 50);
      }
    }
  }, [selectedThread]); // Убираем messageText из зависимостей!

  // Автопрокрутка при загрузке сообщений или новых сообщениях
  // При первой загрузке чата - сразу устанавливаем позицию внизу БЕЗ прокрутки
  // При новых входящих сообщениях - прокручиваем к ним
  // Для остальных случаев - только если пользователь уже внизу
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

    if (isFirstLoad) {
      // При первой загрузке - СРАЗУ устанавливаем позицию внизу БЕЗ анимации
      // Используем несколько попыток для гарантии, но без видимой прокрутки
      const setToBottom = () => {
        if (messagesContainerRef.current && messagesEndRef.current) {
          const c = messagesContainerRef.current;
          // Сразу устанавливаем scrollTop в конец - без анимации
          const targetScroll = c.scrollHeight;
          c.scrollTop = targetScroll;
          
          // Принудительно через scrollIntoView с behavior: 'auto'
          try {
            messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end', inline: 'nearest' });
          } catch (e) {
            // Fallback если scrollIntoView не поддерживается
            c.scrollTop = targetScroll;
          }
          
          // Обновляем состояние кнопки
          const dFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
          setShowScrollToBottom(dFromBottom >= 100);
        }
      };

      // Первая попытка - после рендера (увеличено время для гарантии что DOM готов)
      requestAnimationFrame(() => {
        setToBottom();
        
        // Вторая попытка - через 100ms
        setTimeout(setToBottom, 100);
        
        // Третья попытка - через 300ms
        setTimeout(setToBottom, 300);
        
        // Четвертая попытка - через 500ms (на случай медленного рендера)
        setTimeout(setToBottom, 500);
        
        // Пятая попытка - через 800ms (для очень медленных случаев)
        setTimeout(setToBottom, 800);
      });
    } else if (isNewIncomingMessage || isNearBottom) {
      // Для новых сообщений или если пользователь внизу - используем плавную прокрутку
      if (messagesEndRef.current) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (messagesEndRef.current && messagesContainerRef.current) {
              const container = messagesContainerRef.current;
              container.scrollTop = container.scrollHeight;
              setTimeout(() => {
                if (messagesEndRef.current) {
                  messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }
                // Обновляем состояние кнопки после прокрутки
                if (messagesContainerRef.current) {
                  const c = messagesContainerRef.current;
                  const dFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
                  setShowScrollToBottom(dFromBottom >= 100);
                }
              }, 50);
            } else if (messagesEndRef.current) {
              messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
              setTimeout(() => {
                if (messagesContainerRef.current) {
                  const c = messagesContainerRef.current;
                  const dFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
                  setShowScrollToBottom(dFromBottom >= 100);
                }
              }, 100);
            }
          }, 100);

          // Вторая попытка для гарантии
          setTimeout(() => {
            if (messagesContainerRef.current) {
              const container = messagesContainerRef.current;
              container.scrollTop = container.scrollHeight;
              const dFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
              setShowScrollToBottom(dFromBottom >= 100);
            } else if (messagesEndRef.current) {
              messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
              setTimeout(() => {
                if (messagesContainerRef.current) {
                  const c = messagesContainerRef.current;
                  const dFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
                  setShowScrollToBottom(dFromBottom >= 100);
                }
              }, 100);
            }
          }, 300);
        });
      }
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
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
        }
        // Обновляем состояние кнопки после прокрутки
        setTimeout(() => {
          if (messagesContainerRef.current) {
            const c = messagesContainerRef.current;
            const dFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
            setShowScrollToBottom(dFromBottom >= 100);
          }
        }, 150);
      }, 50);
    } else if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
      // Обновляем состояние кнопки
      setTimeout(() => {
        if (messagesContainerRef.current) {
          const c = messagesContainerRef.current;
          const dFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
          setShowScrollToBottom(dFromBottom >= 100);
        }
      }, 150);
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
      
      if (response.status === 401) {
        // Token expired or invalid
        console.error('401 Unauthorized - token may be expired');
        setError('Authentication failed. Please refresh the page or log in again.');
        // Try to clear invalid token and reload
        setTimeout(() => {
          localStorage.removeItem('token');
          window.location.href = '/login';
        }, 2000);
        return;
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch conversations: ${response.status} ${response.statusText}`);
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

  const performSearch = async (query) => {
    if (!query || query.trim().length === 0) {
      setSearchResults({ conversations: [], messages: [] });
      setIsSearching(false);
      return;
    }

    try {
      setIsSearching(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/inbox/search?q=${encodeURIComponent(query.trim())}&limit=50`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to search');
      }
      
      const data = await response.json();
      setSearchResults(data);
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults({ conversations: [], messages: [] });
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search effect
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // If search query is empty, clear results
    if (!searchQuery || searchQuery.trim().length === 0) {
      setSearchResults({ conversations: [], messages: [] });
      setIsSearching(false);
      return;
    }

    // Set new timeout for search
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300); // 300ms debounce

    // Cleanup
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

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
      
      // Детальное логирование состояния replyingTo
      console.log('🔍 DEBUG replyingTo state:', {
        replyingTo,
        replyingToId: replyingTo?.id,
        replyingToIdType: typeof replyingTo?.id,
        replyingToIdValue: replyingTo?.id ? replyingTo.id : 'null or undefined'
      });
      
      const requestBody = {
        text: text || '', // Пустой текст если только файл
        objectKey: attachedFileKey || undefined,
        replyTo: replyingTo?.id || undefined, // ID сообщения на которое отвечаем
      };
      
      console.log('📤 Sending message request:', {
        threadId: selectedThread.id,
        text: text || '(empty)',
        attachedFileKey: attachedFileKey || '(none)',
        replyTo: replyingTo?.id || '(none)',
        replyingToState: replyingTo,
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
      console.log('📤 Reply to message:', newMessage.reply_to_message ? {
        id: newMessage.reply_to_message.id,
        text: newMessage.reply_to_message.text?.substring(0, 50),
        sender_name: newMessage.reply_to_message.sender_name
      } : 'none');
      
      // Немедленно добавляем сообщение в UI со статусом "queued" (отправляется...)
      // Убеждаемся, что объект имеет правильную структуру, включая reply_to_message
      const messageToAdd = {
        ...newMessage,
        object_key: newMessage.object_key || newMessage.objectKey, // Поддержка обоих вариантов
        direction: 'out',
        // Сохраняем reply_to_message если оно есть в ответе
        reply_to_message: newMessage.reply_to_message || null,
      };
      console.log('📤 Message to add to UI:', {
        id: messageToAdd.id,
        hasReplyTo: !!messageToAdd.reply_to_message,
        replyToId: messageToAdd.reply_to_message?.id
      });
      setMessages(prev => [...prev, messageToAdd]);
      
      // Показываем успешное уведомление только если есть текст (для файлов может быть пустой)
      if (text.trim()) {
        console.log('✅ Message sent successfully');
      }
      
      // Очищаем поле ввода, вложение и reply
      // Сначала очищаем ref напрямую для немедленного эффекта
      if (messageInputRef.current) {
        messageInputRef.current.value = '';
      }
      setMessageText('');
      setAttachedFileKey(null);
      setReplyingTo(null); // Сбрасываем reply
      // Clear draft
      if (draftKeyRef.current) {
        localStorage.removeItem(draftKeyRef.current);
      }
      setFileUploadResetKey(prev => prev + 1); // Сбрасываем FileUpload компонент
      
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

  const formatTime = (timestamp, showTime = false) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const diffMinutes = Math.floor(diff / 60000);
    const diffHours = Math.floor(diff / 3600000);
    const diffDays = Math.floor(diff / 86400000);
    
    // Today - show time
    if (diffDays === 0) {
      if (diffMinutes < 1) return 'Just now';
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (showTime) {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }
      return 'Today';
    }
    
    // Yesterday
    if (diffDays === 1) {
      if (showTime) {
        return `Yesterday ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
      }
      return 'Yesterday';
    }
    
    // Within this week
    if (diffDays < 7) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = days[date.getDay()];
      if (showTime) {
        return `${dayName} ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
      }
      return dayName;
    }
    
    // Older than a week - show date
    if (diffDays < 365) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    // Older than a year
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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

  const handleSaveEdit = async (messageId) => {
    if (!editingMessageText.trim()) {
      alert('Message cannot be empty');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/inbox/messages/${messageId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: editingMessageText.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to edit message');
      }

      const updatedMessage = await response.json();
      
      // Update message in local state
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, text: updatedMessage.text, edited_at: updatedMessage.edited_at, updated_at: updatedMessage.updated_at } : m
      ));

      setEditingMessageId(null);
      setEditingMessageText('');
    } catch (err) {
      console.error('Failed to edit message:', err);
      alert('Failed to edit message: ' + err.message);
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
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', backgroundColor: 'background.default' }}>
            {/* Search field - prominently displayed at the top */}
            <TextField
              fullWidth
              size="small"
              placeholder="🔍 Search chats and messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              variant="outlined"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                  </InputAdornment>
                ),
                endAdornment: searchQuery && (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setSearchQuery('')}
                      edge="end"
                      sx={{ padding: '4px' }}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{ 
                mb: 2,
                mt: 0,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: 'background.paper',
                  border: '2px solid',
                  borderColor: 'primary.light',
                  borderRadius: '8px',
                  fontSize: '14px',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                    borderColor: 'primary.main',
                  },
                  '&.Mui-focused': {
                    borderColor: 'primary.main',
                    backgroundColor: 'background.paper',
                    boxShadow: '0 0 0 3px rgba(156, 39, 176, 0.1)',
                  },
                },
                '& .MuiOutlinedInput-input': {
                  padding: '10px 14px',
                },
              }}
            />
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 1, mt: 0 }}>
              Conversations
            </Typography>
            {isSearching && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="caption" color="text.secondary">
                  Searching...
            </Typography>
              </Box>
            )}
            {searchQuery && !isSearching && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Found {searchResults.conversations.length} chats, {searchResults.messages.length} messages
              </Typography>
            )}
          </Box>
          <List sx={{ p: 0 }}>
            {(searchQuery && !isSearching ? searchResults.conversations : conversations).map((conv) => {
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
            {/* Display search results for messages */}
            {searchQuery && !isSearching && searchResults.messages.length > 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ px: 2, py: 1 }}>
                  <Typography variant="subtitle2" fontWeight="bold" color="text.secondary">
                    Found Messages
                  </Typography>
                </Box>
                {searchResults.messages.map((msg) => {
                  const convId = msg.conversation_id_display || msg.conversation_id;
                  const convTitle = msg.custom_name || msg.chat_title || 'Unknown Chat';
                  const platform = msg.channel_id ? getPlatformFromChannelId(msg.channel_id) : 'unknown';
                  return (
                    <React.Fragment key={`msg-${msg.id}`}>
                      <ListItem
                        button
                        onClick={async () => {
                          // Find the conversation for this message
                          let conversation = conversations.find(c => c.id === convId) || 
                                           searchResults.conversations.find(c => c.id === convId);
                          
                          // If not found, create a minimal conversation object from message data
                          // We'll fetch the full conversation details when opening it
                          if (!conversation && msg) {
                            conversation = {
                              id: convId,
                              chat_title: convTitle,
                              custom_name: msg.custom_name,
                              channel_id: msg.channel_id,
                            };
                          }
                          
                          if (conversation) {
                            setSelectedThread(conversation);
                            if (isMobile) {
                              setShowChat(true);
                            }
                            // Clear search after selecting
                            setSearchQuery('');
                          }
                        }}
                        sx={{
                          '&:hover': {
                            backgroundColor: 'action.hover',
                          },
                        }}
                      >
                        <ListItemAvatar>
                          <Avatar sx={{ bgcolor: 'primary.light' }}>
                            💬
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={
                            <Box>
                              <Typography variant="body2" fontWeight="medium" noWrap>
                                {convTitle}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                {msg.text ? (msg.text.length > 60 ? msg.text.substring(0, 60) + '...' : msg.text) : '[Media]'}
                              </Typography>
                            </Box>
                          }
                          secondary={
                            <Typography variant="caption" color="text.secondary">
                              {formatTime(msg.created_at)} • {platform}
                            </Typography>
                          }
                        />
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  );
                })}
              </>
            )}
            {searchQuery && !isSearching && searchResults.conversations.length === 0 && searchResults.messages.length === 0 && (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  No results found
                </Typography>
              </Box>
            )}
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
                  scrollBehavior: 'auto', // Отключаем плавную прокрутку по умолчанию
                  overflowAnchor: 'none', // Отключаем автоматическую прокрутку браузера
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
                  <Stack spacing={0.5}>
                    {messages
                      .filter(msg => {
                        // Filter by media type if media filter is active
                        if (!selectedThread.mediaFilter || selectedThread.mediaFilter === 'all') {
                          return true;
                        }
                        const hasMedia = msg.object_key || msg.objectKey || msg.metadata?.attachments?.length > 0;
                        if (!hasMedia) return false;
                        
                        if (selectedThread.mediaFilter === 'photos') {
                          return msg.metadata?.attachments?.some(a => a.type === 'photo') || 
                                 msg.object_key?.includes('photo') || 
                                 msg.objectKey?.includes('photo');
                        }
                        if (selectedThread.mediaFilter === 'videos') {
                          return msg.metadata?.attachments?.some(a => a.type === 'video') || 
                                 msg.object_key?.includes('video') || 
                                 msg.objectKey?.includes('video');
                        }
                        if (selectedThread.mediaFilter === 'files') {
                          return msg.metadata?.attachments?.some(a => ['document', 'audio', 'voice'].includes(a.type)) ||
                                 msg.object_key || msg.objectKey;
                        }
                        return true;
                      })
                      .map((msg, index) => {
                        // Check if this message should be grouped with the previous one
                        const prevMsg = index > 0 ? messages[index - 1] : null;
                        const isGrouped = prevMsg && 
                          prevMsg.direction === msg.direction && 
                          prevMsg.sender_name === msg.sender_name &&
                          prevMsg.sender_id === msg.sender_id &&
                          new Date(msg.created_at) - new Date(prevMsg.created_at) < 300000; // 5 minutes
                        
                        return (
                      <Box
                        key={msg.id}
                        sx={{
                          display: 'flex',
                          justifyContent: msg.direction === 'out' ? 'flex-end' : 'flex-start',
                          position: 'relative',
                          mt: isGrouped ? 0.5 : 2,
                          '&:hover .action-button': {
                            opacity: 1,
                          },
                        }}
                      >
                        <Paper
                          sx={{
                            p: isGrouped ? 1.5 : 2,
                            pt: isGrouped && msg.direction === 'in' ? 0.5 : (isGrouped ? 1.5 : 2),
                            maxWidth: '70%',
                            width: 'fit-content',
                            backgroundColor: msg.direction === 'out' ? '#E1BEE7' : 'white', // Очень светло-фиолетовый для исходящих, белый для входящих
                            color: msg.direction === 'out' ? '#6A1B9A' : 'text.primary', // Фиолетовый текст вместо белого для лучшей читаемости
                            border: msg.direction === 'in' ? '1px solid #e0e0e0' : '2px solid #BA68C8', // Фиолетовая рамка для исходящих
                            boxShadow: msg.direction === 'in' ? '0 1px 2px rgba(0,0,0,0.05)' : '0 1px 3px rgba(156,39,176,0.15)', // Мягкие тени
                            wordWrap: 'break-word',
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word',
                            overflow: 'hidden',
                            position: 'relative',
                            borderRadius: isGrouped ? '12px' : '16px', // Меньше скругление для сгруппированных
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
                          {msg.sender_name && msg.direction === 'in' && !isGrouped && (
                            <Typography variant="caption" fontWeight="bold" display="block" sx={{ mb: 0.5 }}>
                              {msg.sender_name}
                            </Typography>
                          )}
                          {/* Отображение reply_to сообщения (цитата) */}
                          {msg.reply_to_message && (
                            <Box
                              sx={{
                                mb: 1,
                                pl: 1.5,
                                borderLeft: '3px solid',
                                borderColor: msg.direction === 'out' ? '#BA68C8' : 'primary.main',
                                backgroundColor: msg.direction === 'out' ? 'rgba(186, 104, 200, 0.1)' : 'rgba(156, 39, 176, 0.05)',
                                borderRadius: '4px',
                                py: 0.5,
                                maxWidth: '100%',
                              }}
                            >
                              <Typography variant="caption" fontWeight="bold" display="block" sx={{ mb: 0.25 }}>
                                {msg.reply_to_message.direction === 'out' ? 'You' : (msg.reply_to_message.sender_name || 'Unknown')}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  display: 'block',
                                  opacity: 0.8,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {msg.reply_to_message.text || '[Media]'}
                              </Typography>
                            </Box>
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
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <audio controls style={{ maxWidth: '100%' }}>
                                        <source src={att.url || att.objectKey || ''} />
                                      </audio>
                                      <Typography variant="caption" display="block">🎤 Voice message</Typography>
                                    </Box>
                                  )}
                                  {att.type === 'audio' && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <audio controls style={{ maxWidth: '100%' }}>
                                        <source src={att.url || att.objectKey || ''} />
                                      </audio>
                                      <Typography variant="caption" display="block">🎵 {att.fileName || 'Audio'}</Typography>
                                    </Box>
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
                          {/* Message reactions */}
                          {(msg.reactions || []).length > 0 && (
                            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                              {msg.reactions.map((reaction, idx) => (
                                <Chip
                                  key={idx}
                                  label={`${reaction.emoji} ${reaction.count || 1}`}
                                  size="small"
                                  sx={{ height: 24, fontSize: '0.75rem' }}
                                  onClick={() => {
                                    // Toggle reaction
                                    const currentReactions = msg.reactions || [];
                                    const existing = currentReactions.find(r => r.emoji === reaction.emoji);
                                    // This would need backend API to persist
                                    console.log('Toggle reaction:', reaction.emoji);
                                  }}
                                />
                              ))}
                            </Box>
                          )}
                          {/* Add reaction button - appears on hover */}
                          <IconButton
                            size="small"
                            sx={{
                              position: 'absolute',
                              bottom: 4,
                              right: 4,
                              opacity: 0,
                              transition: 'opacity 0.2s',
                              '&:hover': { opacity: 1 },
                            }}
                            onClick={() => {
                              const emoji = prompt('Choose emoji reaction:');
                              if (emoji) {
                                // This would need backend API
                                console.log('Add reaction:', emoji, 'to message:', msg.id);
                              }
                            }}
                            title="Add reaction"
                          >
                            <EmoticonIcon fontSize="small" />
                          </IconButton>
                          {/* Режим редактирования или обычное отображение */}
                          {editingMessageId === msg.id ? (
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 1 }}>
                              <TextField
                                fullWidth
                                multiline
                                value={editingMessageText}
                                onChange={(e) => setEditingMessageText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSaveEdit(msg.id);
                                  } else if (e.key === 'Escape') {
                                    setEditingMessageId(null);
                                    setEditingMessageText('');
                                  }
                                }}
                                autoFocus
                                size="small"
                                sx={{ flex: 1 }}
                              />
                              <IconButton
                                size="small"
                                onClick={() => handleSaveEdit(msg.id)}
                                color="primary"
                                title="Save"
                              >
                                <SaveIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setEditingMessageId(null);
                                  setEditingMessageText('');
                                }}
                                title="Cancel"
                              >
                                <CancelIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          ) : (
                            <>
                              <Box
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
                              </Box>
                              {/* Link preview - extract URLs and show preview */}
                              {(() => {
                                const urlRegex = /(https?:\/\/[^\s]+)/g;
                                const urls = msg.text?.match(urlRegex) || [];
                                return urls.length > 0 ? (
                                  <Box sx={{ mt: 1 }}>
                                    {urls.slice(0, 1).map((url, idx) => (
                                      <Box 
                                        key={idx}
                                        sx={{
                                          mt: 1,
                                          p: 1,
                                          border: '1px solid #e0e0e0',
                                          borderRadius: '8px',
                                          backgroundColor: '#f5f5f5',
                                        }}
                                      >
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                          🔗 {new URL(url).hostname}
                                        </Typography>
                                        <Typography 
                                          variant="caption" 
                                          component="a" 
                                          href={url} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                                        >
                                          {url}
                                        </Typography>
                                      </Box>
                                    ))}
                                  </Box>
                                ) : null;
                              })()}
                            </>
                          )}
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
                              {formatTime(msg.created_at, true)}
                              {msg.edited_at && ' (edited)'}
                            </Typography>
                            {msg.direction === 'out' && (
                              <>
                                {msg.delivery_status === 'queued' && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <DoneIcon sx={{ fontSize: 14, opacity: 0.5, color: 'grey.400' }} />
                                    <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.65rem' }}>Queued</Typography>
                                  </Box>
                                )}
                                {msg.delivery_status === 'sending' && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <CircularProgress size={14} sx={{ opacity: 0.7 }} />
                                    <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.65rem' }}>Sending...</Typography>
                                  </Box>
                                )}
                                {msg.delivery_status === 'sent' && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <DoneAllIcon sx={{ fontSize: 14, opacity: 0.7, color: 'primary.light' }} />
                                    <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.65rem' }}>Sent</Typography>
                                  </Box>
                                )}
                                {msg.delivery_status === 'delivered' && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <DoneAllIcon sx={{ fontSize: 14, opacity: 1, color: 'primary.main' }} />
                                    <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.65rem' }}>Delivered</Typography>
                                  </Box>
                                )}
                                {msg.delivery_status === 'read' && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <DoneAllIcon sx={{ fontSize: 14, opacity: 1, color: 'info.main' }} />
                                    <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.65rem' }}>Read</Typography>
                                  </Box>
                                )}
                                {msg.delivery_status === 'failed' && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <DoneIcon sx={{ fontSize: 14, opacity: 1, color: 'error.main' }} />
                                    <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.65rem', color: 'error.main' }}>Failed</Typography>
                                  </Box>
                                )}
                                {msg.delivery_status === 'pending' && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <CircularProgress size={14} sx={{ opacity: 0.5 }} />
                                    <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.65rem' }}>Pending</Typography>
                                  </Box>
                                )}
                              </>
                            )}
                          </Box>
                          {/* Кнопки действий - появляются при hover */}
                          <Box sx={{ 
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            display: 'flex',
                            gap: 0.5,
                            opacity: 0,
                            transition: 'opacity 0.2s',
                            '&:hover': { opacity: 1 },
                            '& .action-button': {
                              backgroundColor: 'rgba(255, 255, 255, 0.8)',
                              '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.95)' }
                            }
                          }}>
                            {msg.direction === 'out' && (
                              <IconButton
                                className="action-button edit-button"
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingMessageId(msg.id);
                                  setEditingMessageText(msg.text || '');
                                }}
                                title="Edit"
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            )}
                            <IconButton
                              className="action-button reply-button"
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReplyingTo({ 
                                  id: msg.id, 
                                  text: msg.text, 
                                  sender_name: msg.sender_name || (msg.direction === 'out' ? 'You' : 'Unknown') 
                                });
                              }}
                              title="Reply"
                            >
                              <ReplyIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Paper>
                      </Box>
                      );
                    })}
                    {/* Typing indicator */}
                    {typingUsers.length > 0 && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1 }}>
                        <CircularProgress size={16} />
                        <Typography variant="caption" color="text.secondary">
                          {typingUsers.map(u => u.user_name).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                        </Typography>
                      </Box>
                    )}
                    {/* Ref для автопрокрутки */}
                    <div ref={messagesEndRef} />
                  </Stack>
                )}
              </Box>

              {/* Input */}
              <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                {/* Отображение сообщения на которое отвечаем */}
                {replyingTo && (
                  <Box
                    sx={{
                      mb: 1,
                      p: 1,
                      pl: 1.5,
                      backgroundColor: 'rgba(156, 39, 176, 0.08)',
                      borderLeft: '3px solid',
                      borderColor: 'primary.main',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" fontWeight="bold" display="block" sx={{ mb: 0.25 }}>
                        Replying to {replyingTo.sender_name || 'Unknown'}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          opacity: 0.8,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {replyingTo.text || '[Media]'}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      onClick={() => setReplyingTo(null)}
                      sx={{ ml: 1 }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                )}
                <Box display="flex" gap={1} alignItems="flex-end" position="relative">
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
                  <IconButton
                    onClick={() => setShowTemplates(!showTemplates)}
                    title="Message templates"
                    sx={{ alignSelf: 'flex-end' }}
                  >
                    <TemplateIcon />
                  </IconButton>
                  <IconButton
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    title="Add emoji"
                    sx={{ alignSelf: 'flex-end' }}
                  >
                    <EmoticonIcon />
                  </IconButton>
                  {/* Emoji picker */}
                  {showEmojiPicker && (
                    <Paper
                      sx={{
                        position: 'absolute',
                        bottom: '100%',
                        right: 0,
                        mb: 1,
                        p: 1,
                        maxHeight: 200,
                        overflow: 'auto',
                        zIndex: 1000,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(8, 1fr)',
                        gap: 0.5,
                        width: 300,
                      }}
                    >
                      {['😀', '😂', '😍', '🤔', '👍', '❤️', '🔥', '✨', '😊', '😢', '😮', '😡', '🎉', '💪', '👏', '🙏', '👍', '👎', '❤️', '💯', '✅', '❌', '⚠️', 'ℹ️'].map((emoji) => (
                        <IconButton
                          key={emoji}
                          size="small"
                          onClick={() => {
                            const currentText = messageInputRef.current?.value || messageText;
                            const newText = currentText + emoji;
                            setMessageText(newText);
                            if (messageInputRef.current) {
                              messageInputRef.current.value = newText;
                            }
                            setShowEmojiPicker(false);
                          }}
                          sx={{ fontSize: '1.5rem' }}
                        >
                          {emoji}
                        </IconButton>
                      ))}
                    </Paper>
                  )}
                  {/* Templates menu */}
                  {showTemplates && (
                    <Paper
                      sx={{
                        position: 'absolute',
                        bottom: '100%',
                        right: 0,
                        mb: 1,
                        p: 1,
                        maxHeight: 200,
                        overflow: 'auto',
                        zIndex: 1000,
                        minWidth: 250,
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Templates</Typography>
                      {templates.length === 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          No templates yet
                        </Typography>
                      ) : (
                        templates.map((template, idx) => (
                          <Box
                            key={idx}
                            sx={{
                              p: 1,
                              mb: 0.5,
                              cursor: 'pointer',
                              '&:hover': { backgroundColor: 'action.hover' },
                              borderRadius: 1,
                            }}
                            onClick={() => {
                              setMessageText(template.text);
                              if (messageInputRef.current) {
                                messageInputRef.current.value = template.text;
                              }
                              setShowTemplates(false);
                            }}
                          >
                            <Typography variant="body2">{template.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {template.text.substring(0, 50)}...
                            </Typography>
                          </Box>
                        ))
                      )}
                      <Button
                        size="small"
                        fullWidth
                        sx={{ mt: 1 }}
                        onClick={() => {
                          const name = prompt('Template name:');
                          const text = prompt('Template text:');
                          if (name && text) {
                            const newTemplates = [...templates, { name, text }];
                            setTemplates(newTemplates);
                            localStorage.setItem('message_templates', JSON.stringify(newTemplates));
                          }
                          setShowTemplates(false);
                        }}
                      >
                        + New Template
                      </Button>
                    </Paper>
                  )}
                  <TextField
                    inputRef={messageInputRef}
                    fullWidth
                    placeholder="Type a message..."
                    value={messageText}
                    onChange={(e) => {
                      const newText = e.target.value;
                      setMessageText(newText);
                      // Auto-save draft
                      if (draftKeyRef.current) {
                        if (newText.trim()) {
                          localStorage.setItem(draftKeyRef.current, newText);
                        } else {
                          localStorage.removeItem(draftKeyRef.current);
                        }
                      }
                      // Send typing indicator
                      if (selectedThread && socketRef.current) {
                        const token = localStorage.getItem('token');
                        if (token) {
                          try {
                            const payload = JSON.parse(atob(token.split('.')[1]));
                            const currentUserId = payload.sub || payload.id;
                            const userName = payload.name || payload.username || 'You';
                            
                            // Clear previous timeout
                            if (typingTimeoutRef.current) {
                              clearTimeout(typingTimeoutRef.current);
                            }
                            
                            // Send typing event
                            socketRef.current.emit('typing', {
                              conversation_id: selectedThread.id,
                              user_id: currentUserId,
                              user_name: userName
                            });
                            
                            // Set timeout to stop typing after 2 seconds of inactivity
                            typingTimeoutRef.current = setTimeout(() => {
                              if (socketRef.current && selectedThread) {
                                socketRef.current.emit('typing_stop', {
                                  conversation_id: selectedThread.id,
                                  user_id: currentUserId
                                });
                              }
                            }, 2000);
                          } catch (e) {
                            console.error('Failed to decode token for typing:', e);
                          }
                        }
                      }
                    }}
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













