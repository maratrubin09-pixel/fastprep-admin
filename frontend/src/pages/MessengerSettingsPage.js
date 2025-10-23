import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import {
  WhatsApp,
  Telegram,
  Instagram,
  Facebook,
  CheckCircle,
  Cancel,
  QrCode2,
} from '@mui/icons-material';
import DashboardLayout from '../components/DashboardLayout';

const API_URL = process.env.REACT_APP_API_URL || 'https://fastprep-admin-api.onrender.com';

const MessengerCard = ({ 
  name, 
  icon, 
  color, 
  isConnected, 
  description,
  onConnect,
  onDisconnect,
  connectionDetails 
}) => {
  return (
    <Card sx={{ height: '100%', position: 'relative' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
              {React.cloneElement(icon, { sx: { color: `${color}.main`, fontSize: 40 } })}
            </Box>
            <Box>
              <Typography variant="h6" fontWeight="bold">
                {name}
              </Typography>
              <Chip
                icon={isConnected ? <CheckCircle /> : <Cancel />}
                label={isConnected ? 'Connected' : 'Not Connected'}
                color={isConnected ? 'success' : 'default'}
                size="small"
                sx={{ mt: 0.5 }}
              />
            </Box>
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40 }}>
          {description}
        </Typography>

        {isConnected && connectionDetails && (
          <Box sx={{ mb: 2, p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Connected Account:
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {connectionDetails}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 1 }}>
          {isConnected ? (
            <Button
              variant="outlined"
              color="error"
              fullWidth
              onClick={onDisconnect}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              variant="contained"
              fullWidth
              sx={{ backgroundColor: `${color}.main`, '&:hover': { backgroundColor: `${color}.dark` } }}
              onClick={onConnect}
            >
              Connect
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

const MessengerSettingsPage = () => {
  const [messengers, setMessengers] = useState([
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: <WhatsApp />,
      color: 'success',
      isConnected: false,
      description: 'Connect WhatsApp Business to manage customer conversations',
      connectionDetails: null,
    },
    {
      id: 'telegram',
      name: 'Telegram',
      icon: <Telegram />,
      color: 'info',
      isConnected: false,
      description: 'Connect your Telegram account as an additional device (not bot)',
      connectionDetails: null,
    },
    {
      id: 'instagram',
      name: 'Instagram',
      icon: <Instagram />,
      color: 'secondary',
      isConnected: false,
      description: 'Connect Instagram Direct Messages to respond to customers',
      connectionDetails: null,
    },
    {
      id: 'facebook',
      name: 'Facebook Messenger',
      icon: <Facebook />,
      color: 'primary',
      isConnected: false,
      description: 'Connect Facebook Messenger to manage conversations',
      connectionDetails: null,
    },
  ]);

  const [qrDialog, setQrDialog] = useState(false);
  const [selectedMessenger, setSelectedMessenger] = useState(null);
  const [qrCode, setQrCode] = useState('');

  const handleConnect = async (messengerId) => {
    const messenger = messengers.find(m => m.id === messengerId);
    setSelectedMessenger(messenger);
    
    // For now, show a dialog with instructions
    // Later will implement actual QR code generation
    setQrDialog(true);
    
    // Simulate QR code (placeholder)
    setQrCode(`data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='200' height='200' fill='%23f0f0f0'/><text x='50%' y='50%' font-size='14' text-anchor='middle' dy='.3em'>QR Code for ${messenger.name}</text></svg>`);
  };

  const handleDisconnect = async (messengerId) => {
    if (window.confirm('Are you sure you want to disconnect this messenger?')) {
      setMessengers(messengers.map(m => 
        m.id === messengerId 
          ? { ...m, isConnected: false, connectionDetails: null }
          : m
      ));
    }
  };

  const handleCloseQrDialog = () => {
    setQrDialog(false);
    setSelectedMessenger(null);
    setQrCode('');
  };

  const handleConfirmConnection = () => {
    // Simulate successful connection
    setMessengers(messengers.map(m => 
      m.id === selectedMessenger.id 
        ? { 
            ...m, 
            isConnected: true, 
            connectionDetails: `${m.name} Account (Demo)` 
          }
        : m
    ));
    handleCloseQrDialog();
  };

  return (
    <DashboardLayout title="Messenger Settings">
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom fontWeight="bold">
          Connect Messengers
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Integrate your messaging platforms to manage all conversations in one place
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>Note:</strong> For WhatsApp, Instagram, and Facebook, you'll scan a QR code to connect as an additional device. 
          For Telegram, we'll use TDLib to connect your main account (not a bot).
        </Typography>
      </Alert>

      <Grid container spacing={3}>
        {messengers.map((messenger) => (
          <Grid item xs={12} sm={6} md={6} key={messenger.id}>
            <MessengerCard
              {...messenger}
              onConnect={() => handleConnect(messenger.id)}
              onDisconnect={() => handleDisconnect(messenger.id)}
            />
          </Grid>
        ))}
      </Grid>

      {/* Connection Dialog */}
      <Dialog open={qrDialog} onClose={handleCloseQrDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Connect {selectedMessenger?.name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <QrCode2 sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Scan QR Code
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Open {selectedMessenger?.name} on your phone and scan this QR code to connect
            </Typography>
            
            {/* Placeholder for QR code */}
            <Box
              sx={{
                width: 200,
                height: 200,
                mx: 'auto',
                backgroundColor: 'grey.100',
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2,
              }}
            >
              <Typography color="text.secondary">
                QR Code will appear here
              </Typography>
            </Box>

            <Alert severity="warning" sx={{ textAlign: 'left' }}>
              <Typography variant="caption">
                <strong>For demo purposes:</strong> Click "Confirm Connection" below to simulate a successful connection. 
                Real QR code integration will be implemented in the backend.
              </Typography>
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseQrDialog}>Cancel</Button>
          <Button onClick={handleConfirmConnection} variant="contained" color="primary">
            Confirm Connection (Demo)
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
};

export default MessengerSettingsPage;

