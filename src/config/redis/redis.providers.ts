import { REDIS_CONNECTION } from '../constants';
import { createClient } from 'redis';
import 'dotenv/config';

const REDIS_URL = `redis://${process.env.REDIS_HOST}:${parseInt(process.env.REDIS_PORT)}`;
const REDIS_USERNAME = process.env.REDIS_USERNAME
const REDIS_PASS = process.env.REDIS_PASS

const createRedisClient = async () => {
  let client = null

  if (REDIS_USERNAME && REDIS_PASS) {
    client = createClient({ 
      url: REDIS_URL, 
      password: REDIS_PASS,
      username: REDIS_USERNAME
    })

    console.log(`Redis crd : `, {REDIS_USERNAME, REDIS_PASS})
  }
  else {
    client = createClient({ 
      url: REDIS_URL
    })
  }

  console.log(`Redis url : `, REDIS_URL) 

  const connectClient = async () => {
    try {
      await client.connect();
      console.info('Redis Client connected successfully.');
    } catch (err) {
      console.error('Initial Redis Client connection failed', err);
      await reconnectClient();
    }
  };

  const isClientConnected = async () => {
    try {
      await client.ping();
      return true;
    } catch (err) {
      return false;
    }
  };

  const reconnectClient = async () => {
    console.info('Attempting to reconnect to Redis...');
    if (client.isOpen) {
      try {
        await client.quit();
      } catch (err) {
        console.error('Error while closing Redis client during reconnect', err);
      }
    }

    const attemptReconnect = async () => {
      console.info('Reconnecting to Redis...');
      try {
        if (REDIS_USERNAME && REDIS_PASS) {
          client = createClient({ 
            url: REDIS_URL, 
            password: REDIS_PASS,
            username: REDIS_USERNAME
          })
      
          console.log(`Redis crd : `, {REDIS_USERNAME, REDIS_PASS})
        }
        else {
          client = createClient({ 
            url: REDIS_URL
          })
        }

        await client.connect();
        console.info('Reconnected to Redis successfully.');
      } catch (reconnectErr) {
        console.error('Reconnection to Redis failed', reconnectErr);
        setTimeout(attemptReconnect, 5000); // Retry after 5 seconds
      }
    };

    setTimeout(attemptReconnect, 5000); // Initial retry after 5 seconds
  };

  client.on('error', async (err) => {
    console.error('Redis Client Error', err);
    if (!(await isClientConnected())) {
      await reconnectClient();
    }
  });

  client.on('connect', () => console.info('Redis Client connected successfully'));
  client.on('idle', () => console.error('Redis queue is idle. Shutting down...'));
  client.on('end', () => console.error('Redis is shutting down.'));
  client.on('ready', () => console.info('Redis up! Now connecting the worker queue client...'));

  await connectClient();

  const performOperationWithReconnect = async (operation) => {
    try {
      return await operation();
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'NR_CLOSED') {
        console.error('Redis Client connection closed during operation, reconnecting...', err);
        await reconnectClient();
        return await operation();
      } else {
        throw err;
      }
    }
  };

  return {
    getClient: () => client,
    get: async (key) => await performOperationWithReconnect(() => client.get(key)),
    set: async (key, value) => await performOperationWithReconnect(() => client.set(key, value)),
    setEx: async (key, time, value) => await performOperationWithReconnect(() => client.setEx(key, time, value)),
    del: async (key) => await performOperationWithReconnect(() => client.del(key)),
    delByPattern: async (pattern) => await performOperationWithReconnect(async () => {
      let cursor = '0';
      let deleted = 0;
      do {
        const result = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = result.cursor;
        if (result.keys.length) {
          deleted += await client.del(result.keys);
        }
      } while (cursor !== '0');
      return deleted;
    }),
    // Add other Redis operations as needed
  };
};

export const redisProviders = [
  {
    name: REDIS_CONNECTION,
    provide: REDIS_CONNECTION,
    useFactory: createRedisClient,
  },
];
