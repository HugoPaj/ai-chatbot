import { Redis } from 'ioredis';

// Initialize Redis client with retry strategy
const redis = new Redis(process.env.REDIS_URL || '', {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
  lazyConnect: true, // Don't connect immediately
});

// Handle all Redis errors to prevent uncaught exceptions
redis.on('error', (error) => {
  console.error('Redis Client Error:', error);
  // Don't throw - just log the error
});

redis.on('connect', () => {
  console.log('Redis Client Connected');
});

redis.on('close', () => {
  console.log('Redis Client Disconnected');
});

// Add a health check method
export async function isRedisHealthy(): Promise<boolean> {
  try {
    if (redis.status !== 'ready') {
      await redis.connect();
    }
    await redis.ping();
    return true;
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
}

export default redis;
