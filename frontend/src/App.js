import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import LoginPage from './pages/LoginPage';
import DashboardHomePage from './pages/DashboardHomePage';
import MyProfilePage from './pages/MyProfilePage';
import UserManagementPage from './pages/UserManagementPage';
import SettingsPage from './pages/SettingsPage';
import MessengerSettingsPage from './pages/MessengerSettingsPage';
import InboxPage from './pages/InboxPage';
import PlaceholderPage from './pages/PlaceholderPage';
import PrivateRoute from './components/PrivateRoute';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          
          {/* Dashboard */}
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <DashboardHomePage />
              </PrivateRoute>
            }
          />
          
          {/* Messages */}
          <Route
            path="/messages/inbox"
            element={
              <PrivateRoute>
                <InboxPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/messages/whatsapp"
            element={
              <PrivateRoute>
                <PlaceholderPage title="WhatsApp Messages" description="Manage WhatsApp conversations" />
              </PrivateRoute>
            }
          />
          <Route
            path="/messages/telegram"
            element={
              <PrivateRoute>
                <PlaceholderPage title="Telegram Messages" description="Manage Telegram conversations" />
              </PrivateRoute>
            }
          />
          <Route
            path="/messages/instagram"
            element={
              <PrivateRoute>
                <PlaceholderPage title="Instagram Messages" description="Manage Instagram DMs" />
              </PrivateRoute>
            }
          />
          <Route
            path="/messages/facebook"
            element={
              <PrivateRoute>
                <PlaceholderPage title="Facebook Messages" description="Manage Facebook Messenger" />
              </PrivateRoute>
            }
          />
          
          {/* Customers */}
          <Route
            path="/customers/all"
            element={
              <PrivateRoute>
                <PlaceholderPage title="All Customers" description="View and manage all customers" />
              </PrivateRoute>
            }
          />
          <Route
            path="/customers/leads"
            element={
              <PrivateRoute>
                <PlaceholderPage title="Leads" description="Manage your sales leads" />
              </PrivateRoute>
            }
          />
          <Route
            path="/customers/analytics"
            element={
              <PrivateRoute>
                <PlaceholderPage title="Customer Analytics" description="Analyze customer behavior and trends" />
              </PrivateRoute>
            }
          />
          
          {/* Tasks */}
          <Route
            path="/tasks/my"
            element={
              <PrivateRoute>
                <PlaceholderPage title="My Tasks" description="Your assigned tasks" />
              </PrivateRoute>
            }
          />
          <Route
            path="/tasks/team"
            element={
              <PrivateRoute>
                <PlaceholderPage title="Team Tasks" description="All team tasks" />
              </PrivateRoute>
            }
          />
          <Route
            path="/tasks/completed"
            element={
              <PrivateRoute>
                <PlaceholderPage title="Completed Tasks" description="View completed tasks" />
              </PrivateRoute>
            }
          />
          
          {/* Profile & Settings */}
          <Route
            path="/profile"
            element={
              <PrivateRoute>
                <MyProfilePage />
              </PrivateRoute>
            }
          />
          <Route
            path="/users"
            element={
              <PrivateRoute>
                <UserManagementPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/settings/integrations"
            element={
              <PrivateRoute>
                <PlaceholderPage title="Integrations" description="Connect external services" />
              </PrivateRoute>
            }
          />
          <Route
            path="/settings/messengers"
            element={
              <PrivateRoute>
                <MessengerSettingsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <PrivateRoute>
                <SettingsPage />
              </PrivateRoute>
            }
          />
          
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;

