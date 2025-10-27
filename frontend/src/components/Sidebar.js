import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Box,
  Collapse,
} from '@mui/material';
import {
  Dashboard,
  Inbox,
  WhatsApp,
  Telegram,
  Instagram,
  Facebook,
  People,
  PersonAdd,
  BarChart,
  Assignment,
  CheckCircle,
  Settings,
  IntegrationInstructions,
  Message,
  ExpandLess,
  ExpandMore,
} from '@mui/icons-material';

const DRAWER_WIDTH = 260;

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [openMessages, setOpenMessages] = React.useState(true);
  const [openCustomers, setOpenCustomers] = React.useState(false);
  const [openTasks, setOpenTasks] = React.useState(false);
  const [openSettings, setOpenSettings] = React.useState(false);

  const isActive = (path) => location.pathname === path;

  const menuItems = [
    {
      title: 'Dashboard',
      icon: <Dashboard />,
      path: '/dashboard',
      single: true,
    },
    {
      title: 'MESSAGES',
      icon: <Message />,
      open: openMessages,
      setOpen: setOpenMessages,
      items: [
        { title: 'Inbox (Unified)', icon: <Inbox />, path: '/messages/inbox' },
        { title: 'WhatsApp', icon: <WhatsApp />, path: '/messages/whatsapp' },
        { title: 'Telegram', icon: <Telegram />, path: '/messages/telegram' },
        { title: 'Instagram', icon: <Instagram />, path: '/messages/instagram' },
        { title: 'Facebook', icon: <Facebook />, path: '/messages/facebook' },
      ],
    },
    {
      title: 'CUSTOMERS',
      icon: <People />,
      open: openCustomers,
      setOpen: setOpenCustomers,
      items: [
        { title: 'All Customers', icon: <People />, path: '/customers/all' },
        { title: 'Leads', icon: <PersonAdd />, path: '/customers/leads' },
        { title: 'Analytics', icon: <BarChart />, path: '/customers/analytics' },
      ],
    },
    {
      title: 'TASKS',
      icon: <Assignment />,
      open: openTasks,
      setOpen: setOpenTasks,
      items: [
        { title: 'My Tasks', icon: <Assignment />, path: '/tasks/my' },
        { title: 'Team Tasks', icon: <People />, path: '/tasks/team' },
        { title: 'Completed', icon: <CheckCircle />, path: '/tasks/completed' },
      ],
    },
    {
      title: 'SETTINGS',
      icon: <Settings />,
      open: openSettings,
      setOpen: setOpenSettings,
      items: [
        { title: 'Users', icon: <People />, path: '/users' },
        { title: 'Integrations', icon: <IntegrationInstructions />, path: '/settings/integrations' },
        { title: 'Messengers', icon: <Message />, path: '/settings/messengers' },
        { title: 'General', icon: <Settings />, path: '/settings' },
      ],
    },
  ];

  const handleNavigate = (path) => {
    navigate(path);
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          backgroundColor: '#f5f5f5',
          borderRight: '1px solid #e0e0e0',
        },
      }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Dashboard color="primary" />
        <Typography variant="h6" fontWeight="bold" color="primary">
          FastPrep Admin
        </Typography>
      </Box>
      <Divider />

      <List sx={{ pt: 2 }}>
        {menuItems.map((section, index) => (
          <React.Fragment key={section.title}>
            {section.single ? (
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => handleNavigate(section.path)}
                  selected={isActive(section.path)}
                  sx={{
                    mx: 1,
                    borderRadius: 1,
                    '&.Mui-selected': {
                      backgroundColor: 'primary.main',
                      color: 'white',
                      '&:hover': {
                        backgroundColor: 'primary.dark',
                      },
                      '& .MuiListItemIcon-root': {
                        color: 'white',
                      },
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color: isActive(section.path) ? 'white' : 'inherit',
                      minWidth: 40,
                    }}
                  >
                    {section.icon}
                  </ListItemIcon>
                  <ListItemText primary={section.title} />
                </ListItemButton>
              </ListItem>
            ) : (
              <>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => section.setOpen(!section.open)}
                    sx={{ mx: 1, borderRadius: 1 }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      {section.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={section.title}
                      primaryTypographyProps={{
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        color: 'text.secondary',
                      }}
                    />
                    {section.open ? <ExpandLess /> : <ExpandMore />}
                  </ListItemButton>
                </ListItem>
                <Collapse in={section.open} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding>
                    {section.items.map((item) => (
                      <ListItem key={item.path} disablePadding>
                        <ListItemButton
                          onClick={() => handleNavigate(item.path)}
                          selected={isActive(item.path)}
                          sx={{
                            pl: 4,
                            mx: 1,
                            borderRadius: 1,
                            '&.Mui-selected': {
                              backgroundColor: 'primary.light',
                              color: 'primary.main',
                              '&:hover': {
                                backgroundColor: 'primary.light',
                              },
                            },
                          }}
                        >
                          <ListItemIcon
                            sx={{
                              color: isActive(item.path) ? 'primary.main' : 'inherit',
                              minWidth: 40,
                            }}
                          >
                            {item.icon}
                          </ListItemIcon>
                          <ListItemText
                            primary={item.title}
                            primaryTypographyProps={{ fontSize: '0.875rem' }}
                          />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Collapse>
              </>
            )}
            {index < menuItems.length - 1 && <Divider sx={{ my: 1 }} />}
          </React.Fragment>
        ))}
      </List>
    </Drawer>
  );
};

export default Sidebar;
export { DRAWER_WIDTH };






