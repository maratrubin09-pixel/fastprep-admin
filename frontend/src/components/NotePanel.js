import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  IconButton,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Close as CloseIcon,
  Save as SaveIcon,
  Note as NoteIcon,
} from '@mui/icons-material';

const API_URL = process.env.REACT_APP_API_URL || 'https://fastprep-admin-api.onrender.com';

const NotePanel = ({ open, onClose, conversationId }) => {
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasNote, setHasNote] = useState(false);
  const debounceTimeoutRef = useRef(null);
  const textFieldRef = useRef(null);

  // Load note on mount
  useEffect(() => {
    if (open && conversationId) {
      loadNote();
    }
  }, [open, conversationId]);

  // Auto-save with debounce
  useEffect(() => {
    if (!open || !conversationId || !noteText.trim()) return;

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Save to localStorage as fallback
    const storageKey = `note_${conversationId}`;
    try {
      localStorage.setItem(storageKey, noteText);
    } catch (e) {
      console.error('Failed to save note to localStorage:', e);
    }

    // Debounce API save
    debounceTimeoutRef.current = setTimeout(() => {
      saveNote(noteText, true); // silent save
    }, 500);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [noteText, open, conversationId]);

  const loadNote = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Try localStorage first (fallback)
      const storageKey = `note_${conversationId}`;
      const localNote = localStorage.getItem(storageKey);
      
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/inbox/conversations/${conversationId}/notes`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.note_text || '';
        setNoteText(text);
        setHasNote(!!text);
        
        // Update localStorage if server has newer data
        if (text && text !== localNote) {
          localStorage.setItem(storageKey, text);
        }
      } else if (response.status >= 500 && localNote) {
        // Use localStorage fallback on 5xx
        setNoteText(localNote);
        setHasNote(true);
        setError('Using local backup (server unavailable)');
      } else if (response.status === 404) {
        // No note exists, use local if available
        if (localNote) {
          setNoteText(localNote);
          setHasNote(true);
        }
      } else {
        throw new Error('Failed to load note');
      }
    } catch (err) {
      console.error('Error loading note:', err);
      // Try localStorage fallback
      const storageKey = `note_${conversationId}`;
      const localNote = localStorage.getItem(storageKey);
      if (localNote) {
        setNoteText(localNote);
        setHasNote(true);
        setError('Using local backup (network error)');
      }
    } finally {
      setLoading(false);
    }
  };

  const saveNote = async (text, silent = false) => {
    if (!conversationId) return;

    if (!silent) {
      setSaving(true);
    }
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/inbox/conversations/${conversationId}/notes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note_text: text }),
      });

      if (!response.ok) {
        if (response.status >= 500) {
          // On 5xx, keep in localStorage
          const storageKey = `note_${conversationId}`;
          localStorage.setItem(storageKey, text);
          if (!silent) {
            setError('Saved locally (server unavailable)');
          }
        } else {
          throw new Error('Failed to save note');
        }
      } else {
        const data = await response.json();
        setNoteText(data.note_text || text);
        setHasNote(!!data.note_text);
        // Update localStorage
        const storageKey = `note_${conversationId}`;
        localStorage.setItem(storageKey, data.note_text || text);
      }
    } catch (err) {
      console.error('Error saving note:', err);
      // Save to localStorage as fallback
      const storageKey = `note_${conversationId}`;
      localStorage.setItem(storageKey, text);
      if (!silent) {
        setError('Saved locally (network error)');
      }
    } finally {
      if (!silent) {
        setSaving(false);
      }
    }
  };

  const handleDelete = async () => {
    if (!conversationId) return;

    setSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/inbox/conversations/${conversationId}/notes`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok || response.status === 404) {
        setNoteText('');
        setHasNote(false);
        // Clear localStorage
        const storageKey = `note_${conversationId}`;
        localStorage.removeItem(storageKey);
      } else {
        throw new Error('Failed to delete note');
      }
    } catch (err) {
      console.error('Error deleting note:', err);
      setError('Failed to delete note');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    // Clear any pending saves
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '400px',
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <NoteIcon />
          <Typography variant="h6">Internal Note</Typography>
        </Box>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {error && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <TextField
              inputRef={textFieldRef}
              fullWidth
              multiline
              rows={12}
              placeholder="Add internal notes about this conversation..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              variant="outlined"
              disabled={saving}
              sx={{
                '& .MuiInputBase-root': {
                  fontFamily: 'monospace',
                  fontSize: '0.9rem',
                }
              }}
            />
            {hasNote && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Note saved. Auto-saving...
              </Typography>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={handleDelete}
          color="error"
          disabled={!hasNote || saving || loading}
          size="small"
        >
          Delete
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          onClick={handleClose}
          disabled={saving}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NotePanel;

