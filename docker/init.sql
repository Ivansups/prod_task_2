-- Database initialization script for Telegram Chat Analytics

-- Create database if it doesn't exist
-- Note: This is handled by POSTGRES_DB environment variable

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id BIGINT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Create a function to get user statistics
CREATE OR REPLACE FUNCTION get_user_stats(user_id_param BIGINT, days_limit INTEGER DEFAULT NULL)
RETURNS TABLE (
    message_count BIGINT,
    first_message TIMESTAMP WITH TIME ZONE,
    last_message TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as message_count,
        MIN(created_at) as first_message,
        MAX(created_at) as last_message
    FROM messages
    WHERE user_id = user_id_param
    AND (days_limit IS NULL OR created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day' * days_limit);
END;
$$ LANGUAGE plpgsql;

-- Insert sample data for testing (optional)
-- This can be removed in production
INSERT INTO users (id, username, first_name, last_name) VALUES
(123456789, 'testuser', 'Test', 'User')
ON CONFLICT (id) DO NOTHING;