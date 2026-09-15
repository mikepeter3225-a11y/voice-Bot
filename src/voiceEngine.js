import twilio from 'twilio';
import { getConfig } from './configLoader.js';
import { processTurn, generateInitialGreeting } from './aiBrain.js';
import { 
  createCallLog, 
  updateCallLog, 
  addTranscript,
  getCallLog 
} from './database.js';
import Telnyx from "telnyx";
const VoiceResponse = twilio.twiml.VoiceResponse;

// Store conversation state in memory (in production, use Redis)
const conversationStore = new Map();

/**
 * Setup voice routes for Twilio webhooks
 */
export function setupVoiceRoutes(app) {
  // Initial webhook when call is received
  app.post('/webhook', handleIncomingCall);
  
  // Gather endpoint for speech input
  app.post('/gather', handleGather);
  
  // Status callback
  app.post('/status', handleStatus);
  
  // Media stream for real-time audio (advanced feature)
  app.post('/media-stream', handleMediaStream);
}

/**
 * Handle incoming call
 */
async function handleIncomingCall(req, res) {
  try {
    const { CallSid, From, To } = req.body;
    const config = getConfig();
    
    console.log(`📞 Incoming call: ${CallSid} from ${From}`);
    
    // Create call log in database
    await createCallLog({
      callSid: CallSid,
      fromNumber: From,
      toNumber: To,
      scenario: config.botName,
      status: 'initiated'
    });
    
    // Initialize conversation state
    conversationStore.set(CallSid, {
      history: [],
      attempts: 0,
      startTime: new Date()
    });
    
    // Generate initial greeting
    const greeting = await generateInitialGreeting();
    
    // Add to transcript
    await addTranscript(CallSid, 'bot', greeting.text);
    
    // Create TwiML response
    const twiml = new VoiceResponse();
    
    if (greeting.audioUrl) {
      twiml.play(greeting.audioUrl);
    } else {
      twiml.say(greeting.text);
    }
    
    // Gather user response
    const gather = twiml.gather({
      input: 'speech',
      action: '/gather',
      method: 'POST',
      speechTimeout: 'auto',
      speechModel: 'phone_call',
      enhanced: true,
      language: 'en-US'
    });
    
    // Update call status
    await updateCallLog(CallSid, { status: 'in-progress' });
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error('❌ Error handling incoming call:', error);
    
    const twiml = new VoiceResponse();
    twiml.say('We are experiencing technical difficulties. Please call back later.');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
}

/**
 * Handle user speech input
 */
async function handleGather(req, res) {
  try {
    const { CallSid, SpeechResult } = req.body;
    const config = getConfig();
    
    console.log(`🎤 User said: "${SpeechResult}" on call ${CallSid}`);
    
    // Get conversation state
    const state = conversationStore.get(CallSid) || {
      history: [],
      attempts: 0
    };
    
    // Add user input to transcript
    await addTranscript(CallSid, 'user', SpeechResult);
    
    // Add to conversation history
    state.history.push({
      role: 'user',
      content: SpeechResult
    });
    
    // Process the conversation turn
    const response = await processTurn(
      SpeechResult,
      state.history,
      state.attempts
    );
    
    // Add bot response to history
    state.history.push({
      role: 'assistant',
      content: response.text
    });
    
    // Add to transcript
    await addTranscript(CallSid, 'bot', response.text);
    
    // Increment attempts
    state.attempts += 1;
    conversationStore.set(CallSid, state);
    
    // Create TwiML response
    const twiml = new VoiceResponse();
    
    if (response.status === 'success') {
      // Success - got the information
      if (response.audioUrl) {
        twiml.play(response.audioUrl);
      } else {
        twiml.say(response.text);
      }
      
      // Extract data from user input (look for digits)
      const extractedData = SpeechResult.match(/\d+/g)?.join('') || SpeechResult;
      
      await updateCallLog(CallSid, {
        status: 'completed',
        completedAt: new Date(),
        extractedData: {
          targetInfo: extractedData,
          verified: true
        }
      });
      
      twiml.hangup();
      
    } else if (response.status === 'hangup') {
      // Max attempts or user refused
      if (response.audioUrl) {
        twiml.play(response.audioUrl);
      } else {
        twiml.say(response.text);
      }
      
      await updateCallLog(CallSid, {
        status: 'hung-up',
        completedAt: new Date()
      });
      
      twiml.hangup();
      
    } else {
      // Continue conversation
      if (response.audioUrl) {
        twiml.play(response.audioUrl);
      } else {
        twiml.say(response.text);
      }
      
      // Gather next input
      const gather = twiml.gather({
        input: 'speech',
        action: '/gather',
        method: 'POST',
        speechTimeout: 'auto',
        speechModel: 'phone_call',
        enhanced: true,
        language: 'en-US'
      });
      
      // If user doesn't respond, prompt again
      twiml.say('Are you still there?');
      twiml.redirect('/gather');
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error('❌ Error handling gather:', error);
    
    const twiml = new VoiceResponse();
    twiml.say('We encountered an error. Goodbye.');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
}

/**
 * Handle call status updates
 */
async function handleStatus(req, res) {
  try {
    const { CallSid, CallStatus, CallDuration } = req.body;
    
    console.log(`📊 Call ${CallSid} status: ${CallStatus}`);
    
    if (CallStatus === 'completed') {
      await updateCallLog(CallSid, {
        status: 'completed',
        duration: parseInt(CallDuration),
        completedAt: new Date()
      });
      
      // Clean up conversation state
      conversationStore.delete(CallSid);
    }
    
    res.sendStatus(200);
    
  } catch (error) {
    console.error('❌ Error handling status:', error);
    res.sendStatus(500);
  }
}

/**
 * Handle media stream (for real-time audio processing)
 */
async function handleMediaStream(req, res) {
  // This is for advanced real-time audio streaming
  // For now, we'll use the simpler gather approach
  res.sendStatus(200);
}


/**
 * Make outbound call using Telnyx
 */
export async function makeOutboundCall(toNumber) {
  try {
    const client = new Telnyx(process.env.TELNYX_API_KEY);
    
    const call = await client.calls.dial({
      to: toNumber,
      from: process.env.TELNYX_PHONE_NUMBER,
      connection_id: process.env.TELNYX_CONNECTION_ID,
      webhook_url: `${process.env.BASE_URL}/webhook`,
      webhook_events: ['call.initiated', 'call.answered', 'call.completed']
    });
    
    console.log(`📞 Outbound call initiated: ${call.data.id} to ${toNumber}`);
    
    return {
      success: true,
      callSid: call.data.id
    };
    
  } catch (error) {
    console.error('❌ Error making outbound call:', error);
    return {
      success: false,
      error: error.message
    };
  }
}