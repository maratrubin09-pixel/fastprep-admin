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
  Button,
} from '@mui/material';
import {
  Telegram as TelegramIcon,
  WhatsApp as WhatsAppIcon,
  Instagram as InstagramIcon,
  Facebook as FacebookIcon,
  RestoreFromTrash as RestoreIcon,
} from '@mui/icons-material';
import DashboardLayout from '../components/DashboardLayout';

const API_URL = process.env.REACT_APP_API_URL || 'https://fastprep-admin-api.onrender.com';

const platformIcons = {
  telegram: <TelegramIcon sx={{ color: '#0088cc' }} />,
  whatsapp: <WhatsAppIcon sx={{ color: '#25D366' }} />,
  instagram: <InstagramIcon sx={{ color: '#E4405F' }} />,
  facebook: <FacebookIcon sx={{ color: '#1877F2' }} />,
};

const TrashPage = () => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDeletedConversations();
  }, []);

  const fetchDeletedConversations = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/inbox/conversations/trash`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch deleted conversations');
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

  const handleRestoreConversation = async (convId) => {
    if (!window.confirm('Are you sure you want to restore this conversation?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${API_URL}/api/inbox/conversations/${convId}/restore`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to restore conversation');
      }

      // Remove from list
      setConversations(prev => prev.filter(conv => conv.id !== convId));
      alert('Conversation restored successfully');
    } catch (err) {
      alert('Failed to restore conversation: ' + err.message);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Trash">
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
        </Box>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout title="Trash">
        <Alert severity="error">{error}</Alert>
      </DashboardLayout>
    );
  }

  if (conversations.length === 0) {
    return (
      <DashboardLayout title="Trash">
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            Trash is empty
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Deleted conversations will appear here
          </Typography>
        </Paper>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Trash">
      <Paper sx={{ overflow: 'auto' }}>
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" fontWeight="bold">
            Deleted Conversations ({conversations.length})
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
                      aria-label="restore"
                      onClick={() => handleRestoreConversation(conv.id)}
                      sx={{ 
                        color: 'primary.main',
                        '&:hover': {
                          backgroundColor: 'primary.light',
                          color: 'primary.dark',
                        },
                      }}
                    >
                      <RestoreIcon fontSize="small" />
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
                        Deleted: {formatTime(conv.deleted_at || conv.updated_at)}
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

export default TrashPage;

