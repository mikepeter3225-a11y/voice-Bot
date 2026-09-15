import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let config = null;

/**
 * Load configuration from config.json
 */
export function loadConfig() {
  if (config) return config;
  
  try {
    const configPath = join(__dirname, '..', 'config.json');
    const configData = readFileSync(configPath, 'utf-8');
    config = JSON.parse(configData);
    return config;
  } catch (error) {
    console.error('❌ Failed to load config.json:', error);
    throw new Error('Configuration file not found or invalid');
  }
}

/**
 * Get current active configuration
 */
export function getConfig() {
  return config || loadConfig();
}

/**
 * Update configuration dynamically
 */
export function updateConfig(newConfig) {
  config = { ...config, ...newConfig };
  return config;
}

/**
 * Load scenario configuration
 */
export function loadScenario(scenarioName) {
  const cfg = getConfig();
  
  if (cfg.scenarios && cfg.scenarios[scenarioName]) {
    const scenario = cfg.scenarios[scenarioName];
    updateConfig({
      botName: scenario.botName,
      initialQuestion: scenario.initialQuestion,
      targetInfo: scenario.targetInfo,
      targetFormat: scenario.targetFormat,
      goal: scenario.goal,
      tone: scenario.tone
    });
    return true;
  }
  
  return false;
}

/**
 * Validate required environment variables
 */
export function validateEnvironment() {
  const required = [
    'TELNYX_API_KEY',
    'TELNYX_PHONE_NUMBER',
    'TELNYX_CONNECTION_ID',
    'ASSEMBLYAI_API_KEY',
    'GROQ_API_KEY',
    'ELEVENLABS_API_KEY',
    
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_ADMIN_ID',
    'MONGODB_URI',
    'BASE_URL'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Get list of available scenarios
 */
export function getScenarios() {
  const cfg = getConfig();
  return Object.keys(cfg.scenarios || {});
}