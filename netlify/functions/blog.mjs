import { getStore } from '@netlify/blobs';
import { createBlogHandler } from '../lib/blog-api.mjs';
import initialPosts from '../../data/blog-posts.js';

export default async (request, context) => {
  const handler = createBlogHandler({
    store: getStore({ name: 'thefifthtable-blog', consistency: 'strong' }),
    setupKey: process.env.BLOG_SETUP_KEY || '',
    initialPosts
  });
  return handler(request, context.ip);
};

export const config = {
  path: '/api/blog',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
