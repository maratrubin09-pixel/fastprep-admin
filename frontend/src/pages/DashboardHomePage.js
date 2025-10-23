import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Avatar,
} from '@mui/material';
import {
  TrendingUp,
  Message,
  Chat,
  Speed,
  AccessTime,
} from '@mui/icons-material';
import DashboardLayout from '../components/DashboardLayout';

const API_URL = process.env.REACT_APP_API_URL || 'https://fastprep-admin-api.onrender.com';

// Metric Card Component
const MetricCard = ({ title, value, icon, color, trend }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography color="text.secondary" gutterBottom variant="body2">
            {title}
          </Typography>
          <Typography variant="h4" fontWeight="bold">
            {value}
          </Typography>
          {trend && (
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
              <TrendingUp fontSize="small" color="success" />
              <Typography variant="caption" color="success.main" sx={{ ml: 0.5 }}>
                {trend}
              </Typography>
            </Box>
          )}
        </Box>
        <Box
          sx={{
            backgroundColor: `${color}.light`,
            borderRadius: 2,
            p: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {React.cloneElement(icon, { sx: { color: `${color}.main`, fontSize: 32 } })}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const DashboardHomePage = () => {
  const [stats, setStats] = useState({
    totalMessages: 1247,
    activeConversations: 45,
    responseRate: 95,
    avgResponseTime: '2.5h',
  });

  const [recentConversations, setRecentConversations] = useState([
    {
      id: 1,
      customer: 'John Doe',
      channel: 'WhatsApp',
      lastMessage: 'Thank you for your help!',
      time: '5 min ago',
      status: 'active',
    },
    {
      id: 2,
      customer: 'Jane Smith',
      channel: 'Telegram',
      lastMessage: 'When will my order arrive?',
      time: '15 min ago',
      status: 'pending',
    },
    {
      id: 3,
      customer: 'Mike Johnson',
      channel: 'Instagram',
      lastMessage: 'I need more information',
      time: '1 hour ago',
      status: 'active',
    },
    {
      id: 4,
      customer: 'Sarah Williams',
      channel: 'Facebook',
      lastMessage: 'Great service!',
      time: '2 hours ago',
      status: 'closed',
    },
    {
      id: 5,
      customer: 'Tom Brown',
      channel: 'WhatsApp',
      lastMessage: 'Can you send me the details?',
      time: '3 hours ago',
      status: 'pending',
    },
  ]);

  const getChannelColor = (channel) => {
    const colors = {
      WhatsApp: 'success',
      Telegram: 'info',
      Instagram: 'secondary',
      Facebook: 'primary',
    };
    return colors[channel] || 'default';
  };

  const getStatusColor = (status) => {
    const colors = {
      active: 'success',
      pending: 'warning',
      closed: 'default',
    };
    return colors[status] || 'default';
  };

  return (
    <DashboardLayout title="Dashboard">
      {/* Metrics Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Total Messages"
            value={stats.totalMessages.toLocaleString()}
            icon={<Message />}
            color="primary"
            trend="+12% from last week"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Active Conversations"
            value={stats.activeConversations}
            icon={<Chat />}
            color="success"
            trend="+5 new today"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Response Rate"
            value={`${stats.responseRate}%`}
            icon={<Speed />}
            color="info"
            trend="+3% improvement"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Avg Response Time"
            value={stats.avgResponseTime}
            icon={<AccessTime />}
            color="warning"
          />
        </Grid>
      </Grid>

      {/* Charts Section */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              📈 Messages Over Time
            </Typography>
            <Box
              sx={{
                height: 300,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f5f5f5',
                borderRadius: 2,
                mt: 2,
              }}
            >
              <Typography color="text.secondary">
                Chart will be added here (Chart.js or Recharts)
              </Typography>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              📊 By Channel
            </Typography>
            <Box
              sx={{
                height: 300,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f5f5f5',
                borderRadius: 2,
                mt: 2,
              }}
            >
              <Typography color="text.secondary">
                Pie Chart
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Recent Conversations Table */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom fontWeight="bold">
          🔥 Recent Conversations
        </Typography>
        <TableContainer sx={{ mt: 2 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Customer</TableCell>
                <TableCell>Channel</TableCell>
                <TableCell>Last Message</TableCell>
                <TableCell>Time</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recentConversations.map((conv) => (
                <TableRow key={conv.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 32, height: 32 }}>
                        {conv.customer[0]}
                      </Avatar>
                      {conv.customer}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={conv.channel}
                      size="small"
                      color={getChannelColor(conv.channel)}
                    />
                  </TableCell>
                  <TableCell>{conv.lastMessage}</TableCell>
                  <TableCell>{conv.time}</TableCell>
                  <TableCell>
                    <Chip
                      label={conv.status}
                      size="small"
                      color={getStatusColor(conv.status)}
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </DashboardLayout>
  );
};

export default DashboardHomePage;

