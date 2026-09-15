# Configurable Voice Phishing Telegram Bot

A sophisticated voice phishing simulation bot controlled entirely via Telegram. Built with Node.js, Twilio, and advanced AI capabilities.

⚠️ **WARNING: FOR EDUCATIONAL AND AUTHORIZED SECURITY TESTING ONLY**

## Features

- 🤖 AI-powered conversational voice bot
- 📱 Full Telegram control interface
- 🎭 Multiple pre-configured scenarios (Netflix, Bank, Amazon)
- 🗣️ Natural text-to-speech (PlayHT)
- 👂 Speech-to-text recognition (AssemblyAI)
- 🧠 LLM-powered responses (Groq)
- 📊 Real-time statistics and monitoring
- 💾 MongoDB database for call logging
- 📞 Twilio telephony integration

## Tech Stack

- **Runtime:** Node.js v18+ (ES Modules)
- **Framework:** Express
- **Telephony:** Twilio Voice SDK
- **STT:** AssemblyAI REST API
- **LLM:** Groq (llama-3-8b-8192)
- **TTS:** PlayHT REST API
- **Bot:** Telegram Bot API
- **Database:** MongoDB

## Prerequisites

1. Node.js v18 or higher
2. MongoDB instance (local or Atlas)
3. Twilio account with phone number
4. AssemblyAI API key
5. Groq API key
6. PlayHT API key
7. Telegram Bot Token

## Installation

### 1. Clone and Install

```bash
npm install