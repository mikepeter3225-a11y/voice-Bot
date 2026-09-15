import './load-env.js';  // ← MUST be first line



import express from 'express';
import dotenv from 'dotenv';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setupVoiceRoutes } from './src/voiceEngine.js';
import { initTelegramBot } from './src/telegramBot.js';
import { connectDatabase } from './src/database.js';
import { validateEnvironment } from './src/configLoader.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Voice Phishing Telegram Bot'
  });
});

// Initialize application
async function initialize() {
  try {
    console.log('🚀 Starting Voice Phishing Telegram Bot...');
    
    // Validate environment variables
    validateEnvironment();
    console.log('✅ Environment variables validated');
    
    // Connect to MongoDB
    await connectDatabase();
    console.log('✅ Database connected');
    
    // Setup voice routes (Twilio webhooks)
    setupVoiceRoutes(app);
    console.log('✅ Voice routes configured');
    
    // Initialize Telegram bot
    await initTelegramBot();
    console.log('✅ Telegram bot initialized');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`\n✨ Server running on port ${PORT}`);
      console.log(`📞 Twilio webhook URL: ${process.env.BASE_URL}/webhook`);
      console.log(`🤖 Telegram bot is active`);
      console.log('\n═══════════════════════════════════════');
      console.log('  Voice Phishing Bot is Ready!');
      console.log('═══════════════════════════════════════\n');
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    process.exit(1);
  }
}

// Error handlers
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Start the application
initialize();