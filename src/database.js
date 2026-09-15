import mongoose from 'mongoose';

const CallLogSchema = new mongoose.Schema({
  callSid: { type: String, required: true, unique: true },
  fromNumber: { type: String, required: true },
  toNumber: { type: String, required: true },
  scenario: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['initiated', 'in-progress', 'completed', 'failed', 'hung-up'],
    default: 'initiated'
  },
  attempts: { type: Number, default: 0 },
  transcripts: [{
    role: { type: String, enum: ['user', 'bot'] },
    text: String,
    timestamp: { type: Date, default: Date.now }
  }],
  extractedData: {
    targetInfo: String,
    verified: Boolean
  },
  duration: Number,
  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

const CampaignSchema = new mongoose.Schema({
  name: { type: String, required: true },
  scenario: { type: String, required: true },
  targetNumbers: [String],
  status: {
    type: String,
    enum: ['active', 'paused', 'completed'],
    default: 'active'
  },
  stats: {
    totalCalls: { type: Number, default: 0 },
    successfulCalls: { type: Number, default: 0 },
    failedCalls: { type: Number, default: 0 },
    dataExtracted: { type: Number, default: 0 }
  },
  createdBy: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const CallLog = mongoose.model('CallLog', CallLogSchema);
export const Campaign = mongoose.model('Campaign', CampaignSchema);

/**
 * Connect to MongoDB
 */
export async function connectDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Create a new call log
 */
export async function createCallLog(data) {
  try {
    const callLog = new CallLog(data);
    await callLog.save();
    return callLog;
  } catch (error) {
    console.error('❌ Error creating call log:', error);
    throw error;
  }
}

/**
 * Update call log
 */
export async function updateCallLog(callSid, updates) {
  try {
    return await CallLog.findOneAndUpdate(
      { callSid },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
  } catch (error) {
    console.error('❌ Error updating call log:', error);
    throw error;
  }
}

/**
 * Add transcript to call log
 */
export async function addTranscript(callSid, role, text) {
  try {
    return await CallLog.findOneAndUpdate(
      { callSid },
      { 
        $push: { 
          transcripts: { role, text, timestamp: new Date() }
        }
      },
      { new: true }
    );
  } catch (error) {
    console.error('❌ Error adding transcript:', error);
    throw error;
  }
}

/**
 * Get call log by SID
 */
export async function getCallLog(callSid) {
  try {
    return await CallLog.findOne({ callSid });
  } catch (error) {
    console.error('❌ Error fetching call log:', error);
    throw error;
  }
}

/**
 * Get recent call logs
 */
export async function getRecentCallLogs(limit = 10) {
  try {
    return await CallLog.find()
      .sort({ createdAt: -1 })
      .limit(limit);
  } catch (error) {
    console.error('❌ Error fetching recent calls:', error);
    throw error;
  }
}

/**
 * Create campaign
 */
export async function createCampaign(data) {
  try {
    const campaign = new Campaign(data);
    await campaign.save();
    return campaign;
  } catch (error) {
    console.error('❌ Error creating campaign:', error);
    throw error;
  }
}

/**
 * Update campaign stats
 */
export async function updateCampaignStats(campaignId, stats) {
  try {
    return await Campaign.findByIdAndUpdate(
      campaignId,
      { 
        $inc: stats,
        updatedAt: new Date()
      },
      { new: true }
    );
  } catch (error) {
    console.error('❌ Error updating campaign stats:', error);
    throw error;
  }
}

/**
 * Get all campaigns
 */
export async function getAllCampaigns() {
  try {
    return await Campaign.find().sort({ createdAt: -1 });
  } catch (error) {
    console.error('❌ Error fetching campaigns:', error);
    throw error;
  }
}