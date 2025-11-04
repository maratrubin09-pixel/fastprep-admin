-- Migration: email_accounts and email_messages tables for Nylas integration
-- Created: 2025-11-04

-- Email accounts table (stores OAuth tokens)
CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'nylas',
  nylas_grant_id VARCHAR(255),
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(email, user_id)
);

CREATE INDEX idx_email_accounts_user_id ON email_accounts(user_id);
CREATE INDEX idx_email_accounts_email ON email_accounts(email);
CREATE INDEX idx_email_accounts_expires_at ON email_accounts(expires_at);

-- Email messages table (stores parsed emails from Nylas)
CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  nylas_message_id VARCHAR(255) NOT NULL UNIQUE,
  nylas_thread_id VARCHAR(255) NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  from_email VARCHAR(255),
  from_name VARCHAR(255),
  to_emails TEXT[], -- Array of email addresses
  cc_emails TEXT[],
  bcc_emails TEXT[],
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_email_messages_email_account_id ON email_messages(email_account_id);
CREATE INDEX idx_email_messages_nylas_message_id ON email_messages(nylas_message_id);
CREATE INDEX idx_email_messages_nylas_thread_id ON email_messages(nylas_thread_id);
CREATE INDEX idx_email_messages_conversation_id ON email_messages(conversation_id);
CREATE INDEX idx_email_messages_received_at ON email_messages(received_at);

-- Email attachments table (stores attachments from emails)
CREATE TABLE IF NOT EXISTS email_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_message_id UUID NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  nylas_attachment_id VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(255),
  size INTEGER,
  object_key VARCHAR(255), -- S3 object key
  is_inline BOOLEAN DEFAULT FALSE,
  content_id VARCHAR(255), -- For inline images (CID)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_email_attachments_email_message_id ON email_attachments(email_message_id);
CREATE INDEX idx_email_attachments_nylas_attachment_id ON email_attachments(nylas_attachment_id);
CREATE INDEX idx_email_attachments_content_id ON email_attachments(content_id);

