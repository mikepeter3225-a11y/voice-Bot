import { addTranscript, updateCallLog } from './database.js';
import { notifyAdmin } from './telegramBot.js';

/**
 * Log call event
 */
export async function logCallEvent(callSid, event, data = {}) {
  console.log(`📝 Call ${callSid}: ${event}`, data);
  
  try {
    // Update database
    await updateCallLog(callSid, {
      [`metadata.${event}`]: {
        timestamp: new Date(),
        ...data
      }
    });
    
    // Notify admin for important events
    if (['completed', 'failed'].includes(event)) {
      await notifyAdmin(`
🔔 *Call ${event.toUpperCase()}*

Call SID: \`${callSid}\`
Event: ${event}
${data.extractedData ? `Data: ${data.extractedData}` : ''}
      `);
    }
    
  } catch (error) {
    console.error('❌ Error logging call event:', error);
  }
}

/**
 * Log conversation turn
 */
export async function logConversationTurn(callSid, role, text) {
  try {
    await addTranscript(callSid, role, text);
    console.log(`💬 [${callSid}] ${role}: ${text}`);
  } catch (error) {
    console.error('❌ Error logging conversation turn:', error);
  }
}

/**
 * Log error
 */
export async function logError(callSid, error, context = '') {
  console.error(`❌ [${callSid}] Error in ${context}:`, error);
  
  try {
    await updateCallLog(callSid, {
      'metadata.errors': {
        timestamp: new Date(),
        error: error.message,
        context,
        stack: error.stack
      }
    });
  } catch (err) {
    console.error('❌ Failed to log error to database:', err);
  }
}