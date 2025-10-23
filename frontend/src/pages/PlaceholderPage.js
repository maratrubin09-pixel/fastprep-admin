import React from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { Construction } from '@mui/icons-material';
import DashboardLayout from '../components/DashboardLayout';

const PlaceholderPage = ({ title, description }) => {
  return (
    <DashboardLayout title={title}>
      <Paper
        sx={{
          p: 6,
          textAlign: 'center',
          minHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Construction sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h4" gutterBottom fontWeight="bold">
          {title}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {description || 'This page is under construction'}
        </Typography>
        <Box sx={{ mt: 3 }}>
          <Typography variant="caption" color="text.secondary">
            Coming soon...
          </Typography>
        </Box>
      </Paper>
    </DashboardLayout>
  );
};

export default PlaceholderPage;

