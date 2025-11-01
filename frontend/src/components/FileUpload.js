import React, { useRef, useState } from 'react';
import {
  IconButton,
  Box,
  Typography,
  CircularProgress,
  Paper,
  Chip,
} from '@mui/material';
import {
  AttachFile as AttachFileIcon,
  Close as CloseIcon,
  Image as ImageIcon,
  VideoFile as VideoFileIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';

const API_URL = process.env.REACT_APP_API_URL || 'https://fastprep-admin-api.onrender.com';

const ALLOWED_TYPES = {
  'image/jpeg': { icon: <ImageIcon />, label: 'Image' },
  'image/png': { icon: <ImageIcon />, label: 'Image' },
  'image/gif': { icon: <ImageIcon />, label: 'Image' },
  'video/mp4': { icon: <VideoFileIcon />, label: 'Video' },
  'application/pdf': { icon: <DescriptionIcon />, label: 'PDF' },
};

const FileUpload = ({ threadId, onFileUploaded, disabled, initialObjectKey = null }) => {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [error, setError] = useState(null);

  // Сбрасываем состояние при изменении threadId
  React.useEffect(() => {
    if (threadId) {
      setUploadedFile(null);
      setError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [threadId]);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Валидация типа
    if (!ALLOWED_TYPES[file.type]) {
      setError(`Тип файла не поддерживается: ${file.type}`);
      return;
    }

    // Валидация размера (10 MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Размер файла превышает 10 MB');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // 1. Получаем presigned URL
      const token = localStorage.getItem('token');
      const presignResponse = await fetch(`${API_URL}/api/inbox/uploads/presign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threadId: threadId,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });

      if (!presignResponse.ok) {
        const errorData = await presignResponse.json();
        throw new Error(errorData.message || 'Failed to get upload URL');
      }

      const { putUrl, objectKey } = await presignResponse.json();

      // 2. Загружаем файл в S3
      const uploadResponse = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to S3');
      }

      // 3. Уведомляем родительский компонент
      setUploadedFile({
        objectKey,
        filename: file.name,
        contentType: file.type,
        size: file.size,
      });

      onFileUploaded?.(objectKey, file.name, file.type);
    } catch (err) {
      setError(err.message || 'Ошибка загрузки файла');
      console.error('File upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setUploadedFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onFileUploaded?.(null);
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <Box>
      {!uploadedFile ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,video/mp4,application/pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={disabled || uploading}
          />
          <IconButton
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            color="primary"
            size="small"
          >
            {uploading ? (
              <CircularProgress size={20} />
            ) : (
              <AttachFileIcon />
            )}
          </IconButton>
          {error && (
            <Typography variant="caption" color="error" sx={{ ml: 1 }}>
              {error}
            </Typography>
          )}
        </>
      ) : (
        <Paper
          sx={{
            p: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            backgroundColor: 'primary.light',
            color: 'primary.contrastText',
          }}
        >
          {ALLOWED_TYPES[uploadedFile.contentType]?.icon || <AttachFileIcon />}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" display="block" noWrap>
              {uploadedFile.filename}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              {formatFileSize(uploadedFile.size)}
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={handleRemove}
            sx={{ color: 'inherit' }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Paper>
      )}
    </Box>
  );
};

export default FileUpload;

