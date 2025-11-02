import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
} from '@mui/material';

const API_URL = process.env.REACT_APP_API_URL || 'https://fastprep-admin-api.onrender.com';

const NewChatModal = ({ open, onClose, onSuccess }) => {
  const [tab, setTab] = useState(0); // 0 = username, 1 = phone
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    if (tab === 0 && !username.trim()) {
      setError('Please enter a username');
      return;
    }
    if (tab === 1 && !phone.trim()) {
      setError('Please enter a phone number');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_URL}/api/inbox/telegram/find-and-start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: tab === 0 ? username.trim() : undefined,
          phone: tab === 1 ? phone.trim() : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to find user');
      }

      const data = await response.json();
      
      // Reset form
      setUsername('');
      setPhone('');
      setError(null);
      
      // Notify parent
      if (onSuccess) {
        onSuccess(data.conversation);
      }
      
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to find user');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setUsername('');
    setPhone('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Start New Telegram Chat</DialogTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)} sx={{ mb: 2 }}>
          <Tab label="By Username" />
          <Tab label="By Phone" />
        </Tabs>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {tab === 0 ? (
          <TextField
            fullWidth
            label="Username"
            placeholder="@username or username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) {
                handleSearch();
              }
            }}
            disabled={loading}
            helperText="Enter Telegram username (with or without @)"
            sx={{ mb: 2 }}
          />
        ) : (
          <TextField
            fullWidth
            label="Phone Number"
            placeholder="+1234567890"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) {
                handleSearch();
              }
            }}
            disabled={loading}
            helperText="Enter phone number with country code"
            sx={{ mb: 2 }}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSearch}
          variant="contained"
          disabled={loading || (tab === 0 && !username.trim()) || (tab === 1 && !phone.trim())}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {loading ? 'Searching...' : 'Find & Start Chat'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewChatModal;

