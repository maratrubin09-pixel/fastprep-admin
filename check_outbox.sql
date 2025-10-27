SELECT 
  id, 
  message_id,
  LEFT(text, 30) as text_preview,
  status, 
  attempts,
  created_at,
  updated_at
FROM outbox 
ORDER BY created_at DESC 
LIMIT 5;
