import Groq from 'groq-sdk';
import axios from 'axios';
import { getConfig } from './configLoader.js';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

/**
 * Transcribe audio using AssemblyAI
 */
export async function transcribeAudio(audioUrl) {
  try {
    // Upload audio to AssemblyAI
    const uploadResponse = await axios.post(
      'https://api.assemblyai.com/v2/upload',
      {
        audio_url: audioUrl
      },
      {
        headers: {
          authorization: process.env.ASSEMBLYAI_API_KEY,
          'content-type': 'application/json'
        }
      }
    );

    const uploadUrl = uploadResponse.data.upload_url;

    // Create transcription
    const transcriptResponse = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      {
        audio_url: uploadUrl
      },
      {
        headers: {
          authorization: process.env.ASSEMBLYAI_API_KEY,
          'content-type': 'application/json'
        }
      }
    );

    const transcriptId = transcriptResponse.data.id;

    // Poll for completion
    let transcript;
    while (true) {
      const pollingResponse = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        {
          headers: {
            authorization: process.env.ASSEMBLYAI_API_KEY
          }
        }
      );

      transcript = pollingResponse.data;

      if (transcript.status === 'completed') {
        return transcript.text;
      } else if (transcript.status === 'error') {
        throw new Error('Transcription failed');
      }

      // Wait 1 second before polling again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error('❌ AssemblyAI transcription error:', error);
    throw error;
  }
}

/**
 * Generate AI response using Groq
 */
export async function generateResponse(userInput, conversationHistory = [], attemptCount = 0) {
  try {
    const config = getConfig();
    
    const systemPrompt = `You are a ${config.botName} agent. Goal: ${config.goal}. Tone: ${config.tone}.

Rules:
1. If user answers the initial question, ask for the ${config.targetInfo}.
2. If user provides ${config.targetFormat}, confirm success and say "Thank you, your account is now secure."
3. If user provides wrong format, ask again politely.
4. Keep responses under 20 words.
5. Be conversational and natural.
6. Never break character.
7. Output ONLY the response text, no markdown or formatting.

Current attempt: ${attemptCount + 1}/${config.maxAttempts}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userInput }
    ];

    const completion = await groq.chat.completions.create({
      messages,
      model: config.groqModel,
      temperature: 0.7,
      max_tokens: 100,
      top_p: 1,
      stream: false
    });

    const responseText = completion.choices[0]?.message?.content || '';
    
    // Determine call status
    const status = determineCallStatus(responseText, userInput, config, attemptCount);

    return {
      text: responseText.trim(),
      status
    };
    
  } catch (error) {
    console.error('❌ Groq API error:', error);
    return {
      text: 'I apologize, we are experiencing technical difficulties. Please call back later.',
      status: 'hangup'
    };
  }
}

/**
 * Convert text to speech using ElevenLabs
 */
export async function textToSpeech(text) {
  try {
    const config = getConfig();
    
    // ElevenLabs voice IDs (get from: https://api.elevenlabs.io/v1/voices)
    // Common presets:
    // - 21m00Tcm4TlvDq8ikWAM (Rachel - female)
    // - pNInz6obpgDQGcFmaJgB (Adam - male)
    // - EXAVITQu4vr4xnSDxMaL (Bella - female)
    const voiceId = config.elevenLabsVoiceId || 'pNInz6obpgDQGcFmaJgB';
    
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: text,
        model_id: config.elevenLabsModel || 'eleven_flash_v2_5', // faster & cheaper
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer' // Get audio as binary buffer
      }
    );

    // Convert audio buffer to base64 data URL
    const audioBase64 = Buffer.from(response.data, 'binary').toString('base64');
    const audioUrl = `data:audio/mpeg;base64,${audioBase64}`;
    
    return audioUrl;
    
  } catch (error) {
    console.error('❌ ElevenLabs TTS error:', error.response?.data || error.message);
    throw error;
  }
}



/**
 * Determine call status based on response and user input
 */
function determineCallStatus(botResponse, userInput, config, attemptCount) {
  const lowerResponse = botResponse.toLowerCase();
  const lowerInput = userInput.toLowerCase();
  
  // Check if we got the target information
  if (lowerResponse.includes('thank you') || lowerResponse.includes('secure')) {
    return 'success';
  }
  
  // Check if max attempts reached
  if (attemptCount >= config.maxAttempts - 1) {
    return 'hangup';
  }
  
  // Check if user is refusing or suspicious
  const refusalKeywords = ['no', 'scam', 'fraud', 'police', 'hang up', 'don\'t call'];
  if (refusalKeywords.some(keyword => lowerInput.includes(keyword))) {
    return 'hangup';
  }
  
  // Check if we extracted target format
  const digitPattern = /\d{4,6}/;
  if (digitPattern.test(userInput)) {
    return 'success';
  }
  
  // Continue conversation
  return 'continue';
}

/**
 * Process complete conversation turn
 */
export async function processTurn(userTranscript, conversationHistory, attemptCount) {
  try {
    // Generate AI response
    const aiResponse = await generateResponse(userTranscript, conversationHistory, attemptCount);
    
    // Convert to speech
    const audioUrl = await textToSpeech(aiResponse.text);
    
    return {
      text: aiResponse.text,
      audioUrl,
      status: aiResponse.status
    };
    
  } catch (error) {
    console.error('❌ Error processing turn:', error);
    
    // Fallback response
    return {
      text: 'I apologize for the technical difficulty. Goodbye.',
      audioUrl: null,
      status: 'hangup'
    };
  }
}

/**
 * Generate initial greeting
 */
export async function generateInitialGreeting() {
  try {
    const config = getConfig();
    const audioUrl = await textToSpeech(config.initialQuestion);
    
    return {
      text: config.initialQuestion,
      audioUrl
    };
  } catch (error) {
    console.error('❌ Error generating initial greeting:', error);
    throw error;
  }
}