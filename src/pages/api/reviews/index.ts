import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import fs from 'fs/promises';
import path from 'path';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getSession({ req });
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = session.user?.email;
    if (!userId) {
      return res.status(400).json({ error: 'User ID not found in session' });
    }

    // Read reviews from the reviews.json file
    const reviewsPath = path.join(process.cwd(), 'src', 'ai-agent', 'data', 'storage', 'json', 'reviews.json');
    
    try {
      const reviewsData = await fs.readFile(reviewsPath, 'utf-8');
      const allReviews = JSON.parse(reviewsData);
      
      // Filter reviews by userId
      const userReviews = Array.isArray(allReviews) 
        ? allReviews.filter(review => review.userId === userId)
        : [];
      
      console.log(`Fetched ${userReviews.length} reviews for user ${userId}`);
      
      return res.status(200).json({
        success: true,
        reviews: userReviews
      });
    } catch (error) {
      console.error('Error reading reviews file:', error);
      // If the file doesn't exist or is empty, return an empty array
      return res.status(200).json({
        success: true,
        reviews: []
      });
    }
  } catch (error) {
    console.error('Error in reviews API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 