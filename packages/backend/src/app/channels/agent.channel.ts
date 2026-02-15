import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import type IORedis from 'ioredis';
import { createRedisConnection, closeRedisConnection } from '../../config/redis';
import { enqueueAgentRun } from '../jobs/agent-queue';
import { eventChannel, cancelChannel } from '../jobs/agent-events';
import type { AgentJobEvent } from '../jobs/agent-events';
import jwt from 'jsonwebtoken';
import { config } from '../../config/environment';
import { Conversation } from '../models/conversation.model';
import { AuthService } from '../services/auth.service';
import { Session } from '../models/session.model';
import { logger } from '../../lib/utils/logger';
import type { Message } from '../../types/index';
import { v4 as uuidv4 } from 'uuid';


// Maps jobId → { conversationId, accountId } (for room-based event routing)
const jobMeta = new Map<string, { conversationId: string; accountId: string }>();

// Maps conversationId → jobId (for stop-by-conversation and active-job detection)
const conversationToJob = new Map<string, string>();

// Redis connections for pub/sub
let pubConnection: IORedis | null = null;
let subConnection: IORedis | null = null;
let io: Server | null = null;

/**
 * Handle incoming events from the worker via Redis pub/sub.
 * Routes events to conversation rooms (stream events) and account rooms (list updates).
 */
function handleWorkerEvent(channel: string, message: string): void {
  const jobId = channel.replace('agent:events:', '');
  const meta = jobMeta.get(jobId);

  if (!meta || !io) return;

  let event: AgentJobEvent;
  try {
    event = JSON.parse(message);
  } catch {
    logger.warn({ channel, message }, 'Invalid event JSON from worker');
    return;
  }

  const { conversationId, accountId } = meta;

  switch (event.type) {
    // Stream events → conversation room
    case 'thinking':
      io.to(`conversation:${conversationId}`).emit('agent:thinking');
      break;
    case 'iteration_start':
      io.to(`conversation:${conversationId}`).emit('agent:iteration_start', {
        iteration: event.iteration,
      });
      break;
    case 'reasoning':
      io.to(`conversation:${conversationId}`).emit('agent:reasoning', {
        iteration: event.iteration,
        evaluation: event.evaluation,
      });
      break;
    case 'text_delta':
      io.to(`conversation:${conversationId}`).emit('agent:text_delta', { text: event.text, agentId: event.agentId });
      break;
    case 'tool_use':
      io.to(`conversation:${conversationId}`).emit('agent:tool_use', { toolUse: event.toolUse });
      break;
    case 'sub_agent_start':
      io.to(`conversation:${conversationId}`).emit('agent:sub_agent_start', {
        agentId: event.agentId,
        agentType: event.agentType,
        task: event.task,
      });
      break;
    case 'sub_agent_complete':
      io.to(`conversation:${conversationId}`).emit('agent:sub_agent_complete', {
        agentId: event.agentId,
        findings: event.findings,
      });
      break;
    case 'token_usage':
      io.to(`conversation:${conversationId}`).emit('agent:token_usage', {
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        totalTokens: event.totalTokens,
      });
      break;

    // Completion → conversation room + account room
    case 'response_complete':
      io.to(`conversation:${conversationId}`).emit('agent:response_complete', {
        conversationId: event.conversationId,
        tokenUsage: event.tokenUsage,
      });
      io.to(`account:${accountId}`).emit('conversation:updated', {
        id: conversationId,
        updatedAt: new Date().toISOString(),
      });
      cleanupJob(jobId);
      break;

    // Title → conversation room + account room
    case 'title_generated':
      io.to(`conversation:${conversationId}`).emit('agent:title_generated', {
        conversationId: event.conversationId,
        title: event.title,
      });
      io.to(`account:${accountId}`).emit('conversation:updated', {
        id: conversationId,
        title: event.title,
        updatedAt: new Date().toISOString(),
      });
      cleanupJob(jobId);
      break;

    // Errors → conversation room
    case 'error':
      io.to(`conversation:${conversationId}`).emit('agent:error', { error: event.error });
      cleanupJob(jobId);
      break;
    case 'stopped':
      io.to(`conversation:${conversationId}`).emit('agent:stopped', { message: event.message });
      cleanupJob(jobId);
      break;
  }
}

function cleanupJob(jobId: string): void {
  const meta = jobMeta.get(jobId);
  if (meta) {
    conversationToJob.delete(meta.conversationId);
  }
  jobMeta.delete(jobId);
  subConnection?.unsubscribe(eventChannel(jobId)).catch(() => {});
}

export function initWebSocket(server: HTTPServer) {
  pubConnection = createRedisConnection();
  subConnection = createRedisConnection();

  subConnection.on('message', handleWorkerEvent);

  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  // Socket.IO authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = AuthService.verifyAccessToken(token);

      // Validate the session still exists
      const session = Session.findById(payload.sessionId);
      if (!session) {
        return next(new Error('Session revoked'));
      }

      socket.data.user = {
        userId: payload.sub,
        sessionId: payload.sessionId,
        email: payload.email,
        accountId: payload.accountId,
        role: payload.role,
        name: '',
      };

      // Sliding renewal: send a fresh token so the client stays logged in
      const renewed = jwt.sign(
        {
          sub: payload.sub,
          sessionId: payload.sessionId,
          accountId: payload.accountId,
          email: payload.email,
          role: payload.role,
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn as any },
      );
      socket.emit('auth:renewed', { token: renewed });

      next();
    } catch (err: any) {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user!;
    logger.info({ socketId: socket.id, userId: user.userId, accountId: user.accountId }, 'Client connected');

    // Auto-join account room for account-level updates
    socket.join(`account:${user.accountId}`);

    // Conversation room management
    socket.on('conversation:join', ({ conversationId }: { conversationId: string }) => {
      socket.join(`conversation:${conversationId}`);
      logger.info({ socketId: socket.id, conversationId }, 'Joined conversation room');

      // If there's an active agent job for this conversation, notify the joiner
      const activeJobId = conversationToJob.get(conversationId);
      if (activeJobId) {
        socket.emit('agent:active', { conversationId });
      }
    });

    socket.on('conversation:leave', ({ conversationId }: { conversationId: string }) => {
      socket.leave(`conversation:${conversationId}`);
      logger.info({ socketId: socket.id, conversationId }, 'Left conversation room');
    });

    socket.on('agent:message', async (data: {
      message: string;
      conversationId?: string;
      model?: string;
    }) => {
      try {
        const { message, conversationId, model } = data;
        const accountId = user.accountId;
        const userId = user.userId;

        // Get or create conversation
        let conversation = conversationId
          ? Conversation.find(accountId, conversationId)
          : null;

        if (!conversation) {
          conversation = Conversation.create(accountId, userId);
          socket.emit('agent:conversation_created', {
            conversationId: conversation.id,
          });

          // Notify all account members about the new conversation
          io!.to(`account:${accountId}`).emit('conversation:created', {
            id: conversation.id,
            title: null,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            messageCount: 0,
          });

          // Auto-join the creator to the new conversation room
          socket.join(`conversation:${conversation.id}`);

        }

        // Add user message to conversation
        const userMessage: Message = {
          id: uuidv4(),
          role: 'user',
          content: message,
          timestamp: new Date(),
        };

        Conversation.addMessage(accountId, conversation.id, userMessage);

        // Load persisted investigation context
        const persistedContext = Conversation.loadContext(accountId, conversation.id);

        // Enqueue the agent run
        const jobId = await enqueueAgentRun({
          conversationId: conversation.id,
          accountId,
          userMessage: message,
          model,
          messages: conversation.messages.concat([userMessage]),
          persistedContext,
          hasTitle: !!conversation.title,
        });

        // Track this job for event routing (job → rooms) and stop-by-conversation
        jobMeta.set(jobId, { conversationId: conversation.id, accountId });
        conversationToJob.set(conversation.id, jobId);

        // Subscribe to worker events for this job
        await subConnection!.subscribe(eventChannel(jobId));

        logger.info({ socketId: socket.id, jobId, conversationId: conversation.id }, 'Agent job enqueued');
      } catch (error: any) {
        logger.error({ error }, 'Error enqueuing agent message');
        socket.emit('agent:error', {
          error: error.message || 'An error occurred',
        });
      }
    });

    socket.on('agent:stop', (data?: { conversationId?: string }) => {
      const conversationId = data?.conversationId;
      if (!conversationId) return;

      const jobId = conversationToJob.get(conversationId);
      if (jobId) {
        logger.info({ socketId: socket.id, jobId, conversationId }, 'Agent stop requested');
        pubConnection!.publish(cancelChannel(jobId), 'cancel');
        cleanupJob(jobId);
        io!.to(`conversation:${conversationId}`).emit('agent:stopped', { message: 'Request cancelled' });
      }
    });

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'Client disconnected');
      // Agent jobs continue running — they are not tied to a specific socket.
      // Users can stop them explicitly via agent:stop.
    });
  });

  logger.info('WebSocket server initialized');

  return io;
}

export async function closeWebSocket(): Promise<void> {
  if (subConnection) {
    await closeRedisConnection(subConnection);
    subConnection = null;
  }
  if (pubConnection) {
    await closeRedisConnection(pubConnection);
    pubConnection = null;
  }
  if (io) {
    io.close();
    io = null;
  }
}
