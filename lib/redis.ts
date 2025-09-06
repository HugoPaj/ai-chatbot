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
});

redis.on('error', (error) => {
  console.error('Redis Client Error:', error);
});

redis.on('connect', () => {
  console.log('Redis Client Connected');
});

export default redis;
