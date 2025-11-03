import React, { useState, useEffect } from 'react';
import { Box, AppBar, Toolbar, Typography, IconButton, useMediaQuery } from '@mui/material';
import { Menu as MenuIcon } from '@mui/icons-material';
import Sidebar, { DRAWER_WIDTH } from './Sidebar';
import ProfileMenu from './ProfileMenu';

const API_URL = process.env.REACT_APP_API_URL || 'https://fastprep-admin-api.onrender.com';

const DashboardLayout = ({ children, title = 'Dashboard', onNewChatClick }) => {
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isTabletOrMobile = useMediaQuery('(max-width: 1024px)');

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No token found');
        return;
      }
      
      try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.status === 401) {
          // Token expired or invalid - try to get user from JWT token
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const userFromToken = {
              id: payload.sub || payload.id,
              name: payload.name || payload.username || payload.email?.split('@')[0] || 'User',
              email: payload.email,
              role: payload.role || 'admin'
            };
            setUser(userFromToken);
            console.log('Using user data from JWT token');
          } catch (tokenErr) {
            console.error('Failed to decode token:', tokenErr);
            // Token is invalid - redirect to login
            localStorage.removeItem('token');
            window.location.href = '/login';
          }
          return;
        }

        if (!response.ok) throw new Error('Failed to fetch user');
        const data = await response.json();
        setUser(data);
      } catch (err) {
        console.error('Error fetching user:', err);
        // Try to get user from token as fallback
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const userFromToken = {
            id: payload.sub || payload.id,
            name: payload.name || payload.username || payload.email?.split('@')[0] || 'User',
            email: payload.email,
            role: payload.role || 'admin'
          };
          setUser(userFromToken);
          console.log('Using user data from JWT token as fallback');
        } catch (tokenErr) {
          console.error('Failed to decode token:', tokenErr);
        }
      }
    };

    fetchUser();
  }, []);

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: isTabletOrMobile ? '100%' : `calc(100% - ${DRAWER_WIDTH}px)`,
          ml: isTabletOrMobile ? 0 : `${DRAWER_WIDTH}px`,
          backgroundColor: 'white',
          color: 'text.primary',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          zIndex: isTabletOrMobile ? 1300 : 1100,
        }}
      >
        <Toolbar>
          {isTabletOrMobile && (
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
            {title}
          </Typography>
          <ProfileMenu user={user} />
        </Toolbar>
      </AppBar>

      <Sidebar mobileOpen={mobileOpen} onMobileClose={handleDrawerToggle} onNewChatClick={onNewChatClick} />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: '#fafafa',
          minHeight: '100vh',
          ml: isTabletOrMobile ? 0 : `${DRAWER_WIDTH}px`,
          mt: '64px',
          p: isTabletOrMobile ? 1 : 3,
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default DashboardLayout;

