import React, { useState, useEffect } from 'react';
import { Box, AppBar, Toolbar, Typography } from '@mui/material';
import Sidebar, { DRAWER_WIDTH } from './Sidebar';
import ProfileMenu from './ProfileMenu';

const API_URL = process.env.REACT_APP_API_URL || 'https://fastprep-admin-api.onrender.com';

const DashboardLayout = ({ children, title = 'Dashboard' }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('token');
      
      try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) throw new Error('Failed to fetch user');
        const data = await response.json();
        setUser(data);
      } catch (err) {
        console.error(err);
      }
    };

    fetchUser();
  }, []);

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: `calc(100% - ${DRAWER_WIDTH}px)`,
          ml: `${DRAWER_WIDTH}px`,
          backgroundColor: 'white',
          color: 'text.primary',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
            {title}
          </Typography>
          <ProfileMenu user={user} />
        </Toolbar>
      </AppBar>

      <Sidebar />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: '#fafafa',
          minHeight: '100vh',
          ml: `${DRAWER_WIDTH}px`,
          mt: '64px',
          p: 3,
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default DashboardLayout;






