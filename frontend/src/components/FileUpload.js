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

// Расширенный список поддерживаемых типов
const ALLOWED_TYPES = {
  // Изображения
  'image/jpeg': { icon: <ImageIcon />, label: 'Image' },
  'image/jpg': { icon: <ImageIcon />, label: 'Image' },
  'image/png': { icon: <ImageIcon />, label: 'Image' },
  'image/gif': { icon: <ImageIcon />, label: 'Image' },
  'image/webp': { icon: <ImageIcon />, label: 'Image' },
  'image/heic': { icon: <ImageIcon />, label: 'Image' },
  'image/heif': { icon: <ImageIcon />, label: 'Image' },
  'image/bmp': { icon: <ImageIcon />, label: 'Image' },
  'image/svg+xml': { icon: <ImageIcon />, label: 'Image' },
  // Видео
  'video/mp4': { icon: <VideoFileIcon />, label: 'Video' },
  'video/quicktime': { icon: <VideoFileIcon />, label: 'Video' },
  'video/x-msvideo': { icon: <VideoFileIcon />, label: 'Video' },
  'video/webm': { icon: <VideoFileIcon />, label: 'Video' },
  // Аудио
  'audio/mpeg': { icon: <DescriptionIcon />, label: 'Audio' },
  'audio/mp3': { icon: <DescriptionIcon />, label: 'Audio' },
  'audio/wav': { icon: <DescriptionIcon />, label: 'Audio' },
  'audio/ogg': { icon: <DescriptionIcon />, label: 'Audio' },
  'audio/webm': { icon: <DescriptionIcon />, label: 'Audio' },
  // Документы
  'application/pdf': { icon: <DescriptionIcon />, label: 'PDF' },
  'application/msword': { icon: <DescriptionIcon />, label: 'Word' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { icon: <DescriptionIcon />, label: 'Word' },
  'application/vnd.ms-excel': { icon: <DescriptionIcon />, label: 'Excel' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { icon: <DescriptionIcon />, label: 'Excel' },
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

    // Проверка, что threadId существует
    if (!threadId) {
      setError('Пожалуйста, выберите чат для отправки файла');
      return;
    }

    // Проверка типа файла - если file.type пустой, используем расширение
    let fileType = file.type;
    if (!fileType || fileType === '') {
      const extension = file.name.split('.').pop()?.toLowerCase();
      // Попробуем определить тип по расширению
      const extensionMap = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'pdf': 'application/pdf',
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'mp3': 'audio/mpeg',
      };
      fileType = extensionMap[extension] || 'application/octet-stream';
    }

    // Валидация типа - разрешаем все типы, которые начинаются с image/, video/, audio/ или в списке документов
    const isAllowed = 
      ALLOWED_TYPES[fileType] || 
      (fileType && fileType.startsWith('image/')) || 
      (fileType && fileType.startsWith('video/')) || 
      (fileType && fileType.startsWith('audio/'));
    
    if (!isAllowed) {
      setError(`Тип файла не поддерживается: ${fileType || 'unknown'}`);
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
      
      // Убеждаемся, что все поля заполнены
      const requestBody = {
        threadId: threadId,
        filename: file.name || 'file',
        contentType: fileType,
        size: file.size,
      };

      if (!requestBody.threadId || !requestBody.filename || !requestBody.contentType) {
        throw new Error('Missing required fields: threadId, filename, contentType');
      }

      const presignResponse = await fetch(`${API_URL}/api/inbox/uploads/presign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!presignResponse.ok) {
        let errorData;
        try {
          errorData = await presignResponse.json();
        } catch (e) {
          errorData = { message: `Server error: ${presignResponse.status} ${presignResponse.statusText}` };
        }
        const errorMessage = errorData.message || errorData.code || `Failed to get upload URL (${presignResponse.status})`;
        throw new Error(errorMessage);
      }

      const { putUrl, objectKey } = await presignResponse.json();

      // 2. Загружаем файл в S3
      const uploadResponse = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': fileType,
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
        contentType: fileType,
        size: file.size,
      });

      onFileUploaded?.(objectKey, file.name, fileType);
    } catch (err) {
      const errorMessage = err.message || 'Ошибка загрузки файла';
      setError(errorMessage);
      console.error('File upload error:', err);
      // Уведомляем родительский компонент об ошибке
      onFileUploaded?.(null);
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
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
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
            <Typography 
              variant="caption" 
              color="error" 
              sx={{ 
                ml: 1, 
                display: 'block',
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
              title={error}
            >
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

