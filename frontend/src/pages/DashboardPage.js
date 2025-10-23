import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
  AppBar,
  Toolbar,
  Alert,
} from '@mui/material';

const API_URL = process.env.REACT_APP_API_URL || 'https://fastprep-admin-api.onrender.com';

const DashboardPage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('token');
      
      try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user');
        }

        const data = await response.json();
        setUser(data);
      } catch (err) {
        setError('Failed to load user data');
        console.error(err);
      }
    };

    fetchUser();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            FastPrep Admin Dashboard
          </Typography>
          <Button color="inherit" onClick={handleLogout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h4" gutterBottom>
            Welcome to FastPrep Admin! 🎉
          </Typography>
          
          {user && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body1">
                <strong>User ID:</strong> {user.id || 'N/A'}
              </Typography>
              <Typography variant="body1">
                <strong>Email:</strong> {user.email || 'N/A'}
              </Typography>
              <Typography variant="body1">
                <strong>Role:</strong> {user.role || 'N/A'}
              </Typography>
            </Box>
          )}

          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Available Features:
            </Typography>
            <Typography variant="body2">
              ✅ Authentication & Authorization (JWT + Redis cache)
            </Typography>
            <Typography variant="body2">
              ✅ WebSocket Real-time Communication
            </Typography>
            <Typography variant="body2">
              ✅ S3/R2 File Uploads (Presigned URLs)
            </Typography>
            <Typography variant="body2">
              ✅ Outbox Worker (Background processing)
            </Typography>
            <Typography variant="body2">
              ✅ Prometheus Metrics & Alerts
            </Typography>
          </Box>
        </Paper>
      </Container>
    </>
  );
};

export default DashboardPage;

