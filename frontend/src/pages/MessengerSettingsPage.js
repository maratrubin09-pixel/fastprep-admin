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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyInterval, setVerifyInterval] = useState(null);

  // Load messenger status on mount
  useEffect(() => {
    loadMessengerStatus();
  }, []);

  // Cleanup verification interval on unmount
  useEffect(() => {
    return () => {
      if (verifyInterval) {
        clearInterval(verifyInterval);
      }
    };
  }, [verifyInterval]);

  const loadMessengerStatus = async () => {
    setLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/messengers/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load messenger status');
      }

      const data = await response.json();
      
      // Update messengers with backend data
      setMessengers(messengers.map(m => {
        const backendData = data.messengers?.[m.id]; // Access by key instead of find
        return {
          ...m,
          isConnected: backendData?.connected || false,
          connectionDetails: backendData?.accountName || null,
        };
      }));
    } catch (err) {
      console.error('Failed to load messenger status:', err);
      setError('Failed to load messenger status');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (messengerId) => {
    const messenger = messengers.find(m => m.id === messengerId);
    setSelectedMessenger(messenger);
    setError('');
    setLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      
      // Step 1: Initiate connection
      const connectResponse = await fetch(`${API_URL}/api/messengers/${messengerId}/connect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!connectResponse.ok) {
        throw new Error('Failed to initiate connection');
      }

      const connectData = await connectResponse.json();
      console.log('Connection initiated:', connectData);
      
      // Open dialog immediately
      setQrDialog(true);
      
      // Step 2: Start polling for QR code
      startQrPolling(messengerId, token);
      
      // Step 3: Start verification polling
      startVerificationPolling(messengerId);
    } catch (err) {
      setError(err.message || 'Failed to connect');
      console.error('Connection error:', err);
      setLoading(false);
    }
  };

  const startQrPolling = async (messengerId, token) => {
    let attempts = 0;
    const maxAttempts = 20; // 20 attempts * 1 second = 20 seconds max wait
    
    const pollQr = async () => {
      attempts++;
      
      try {
        const qrResponse = await fetch(`${API_URL}/api/messengers/${messengerId}/qr`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (qrResponse.ok) {
          const qrData = await qrResponse.json();
          if (qrData.qrCode) {
            console.log('QR code received');
            setQrCode(qrData.qrCode);
            setLoading(false);
            return; // Stop polling, we got the QR code
          }
        }
      } catch (err) {
        console.error('QR polling error:', err);
      }

      // Continue polling if we haven't reached max attempts
      if (attempts < maxAttempts) {
        setTimeout(pollQr, 1000); // Poll every 1 second
      } else {
        setError('Timeout waiting for QR code');
        setLoading(false);
      }
    };

    pollQr();
  };

  const startVerificationPolling = (messengerId) => {
    setVerifying(true);
    
    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/messengers/${messengerId}/verify`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Verification failed');
        }

        const data = await response.json();
        
        if (data.connected) {
          // Connection successful!
          clearInterval(interval);
          setVerifying(false);
          setQrDialog(false);
          
          // Update messenger status
          setMessengers(messengers.map(m => 
            m.id === messengerId 
              ? { 
                  ...m, 
                  isConnected: true, 
                  connectionDetails: data.accountInfo?.accountName || `${m.name} Account`
                }
              : m
          ));
          
          // Reload full status
          loadMessengerStatus();
        }
      } catch (err) {
        console.error('Verification error:', err);
      }
    }, 3000); // Check every 3 seconds

    setVerifyInterval(interval);

    // Auto-stop after 2 minutes
    setTimeout(() => {
      if (interval) {
        clearInterval(interval);
        setVerifying(false);
      }
    }, 120000);
  };

  const handleDisconnect = async (messengerId) => {
    if (!window.confirm('Are you sure you want to disconnect this messenger?')) {
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/messengers/${messengerId}/disconnect`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      // Update local state
      setMessengers(messengers.map(m => 
        m.id === messengerId 
          ? { ...m, isConnected: false, connectionDetails: null }
          : m
      ));
      
      // Reload full status
      loadMessengerStatus();
    } catch (err) {
      setError(err.message || 'Failed to disconnect');
      console.error('Disconnect error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseQrDialog = () => {
    // Stop verification polling
    if (verifyInterval) {
      clearInterval(verifyInterval);
      setVerifyInterval(null);
    }
    
    setQrDialog(false);
    setSelectedMessenger(null);
    setQrCode('');
    setVerifying(false);
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

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

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
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <QrCode2 sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Scan QR Code
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Open {selectedMessenger?.name} on your phone and scan this QR code to connect
            </Typography>
            
            {/* QR Code */}
            {qrCode ? (
              <Box
                sx={{
                  width: 200,
                  height: 200,
                  mx: 'auto',
                  backgroundColor: 'white',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 2,
                  border: '1px solid #e0e0e0',
                }}
              >
                <img 
                  src={qrCode} 
                  alt="QR Code" 
                  style={{ width: '100%', height: '100%' }}
                />
              </Box>
            ) : (
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
                  {loading ? 'Loading QR Code...' : 'QR Code'}
                </Typography>
              </Box>
            )}

            {verifying && (
              <Alert severity="info" sx={{ textAlign: 'left' }}>
                <Typography variant="body2">
                  <strong>Waiting for connection...</strong> 
                  <br />
                  The page will automatically update when you scan the QR code.
                </Typography>
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseQrDialog} disabled={loading}>
            {verifying ? 'Stop Waiting' : 'Cancel'}
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
};

export default MessengerSettingsPage;







