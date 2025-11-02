import React, { useState, useEffect } from 'react';
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
  IconButton,
} from '@mui/material';
import {
  Telegram as TelegramIcon,
  WhatsApp as WhatsAppIcon,
  Instagram as InstagramIcon,
  Facebook as FacebookIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import DashboardLayout from '../components/DashboardLayout';

const API_URL = process.env.REACT_APP_API_URL || 'https://fastprep-admin-api.onrender.com';

const platformIcons = {
  telegram: <TelegramIcon sx={{ color: '#0088cc' }} />,
  whatsapp: <WhatsAppIcon sx={{ color: '#25D366' }} />,
  instagram: <InstagramIcon sx={{ color: '#E4405F' }} />,
  facebook: <FacebookIcon sx={{ color: '#1877F2' }} />,
};

const ArchivePage = () => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchArchivedConversations();
  }, []);

  const fetchArchivedConversations = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/inbox/conversations/archived`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch archived conversations');
      }
      
      const data = await response.json();
      setConversations(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
    e.stopPropagation();
    
    if (!window.confirm('Are you sure you want to permanently delete this conversation? This action cannot be undone.')) {
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

      // Remove from list
      setConversations(prev => prev.filter(conv => conv.id !== convId));
      alert('Conversation deleted permanently');
    } catch (err) {
      alert('Failed to delete conversation: ' + err.message);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Archived Conversations">
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
        </Box>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout title="Archived Conversations">
        <Alert severity="error">{error}</Alert>
      </DashboardLayout>
    );
  }

  if (conversations.length === 0) {
    return (
      <DashboardLayout title="Archived Conversations">
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            No archived conversations
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Archived conversations will appear here
          </Typography>
        </Paper>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Archived Conversations">
      <Paper sx={{ overflow: 'auto' }}>
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" fontWeight="bold">
            Archived Conversations ({conversations.length})
          </Typography>
        </Box>
        <List sx={{ p: 0 }}>
          {conversations.map((conv) => {
            const platform = getPlatformFromChannelId(conv.channel_id);
            return (
              <React.Fragment key={conv.id}>
                <ListItem
                  sx={{
                    backgroundColor: 'transparent',
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
                      <Typography variant="caption">
                        Archived: {formatTime(conv.last_message_at || conv.created_at)}
                      </Typography>
                    }
                  />
                </ListItem>
                <Divider />
              </React.Fragment>
            );
          })}
        </List>
      </Paper>
    </DashboardLayout>
  );
};

export default ArchivePage;

