import { GoogleGenerativeAI } from '@google/generative-ai';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// This key must be configured in your Vercel project's environment variables.
const API_KEY = process.env.GEMINI_API_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!API_KEY) {
        console.error('Gemini API key is not set in environment variables.');
        return res.status(500).json({ error: 'Server configuration error: API key missing.' });
    }

    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Request body is missing the "query" field.' });
        }

        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            You are an expert SQL analyst. Explain the following SQL query step-by-step for a beginner.
            Do not use markdown for the final output. Use bold for headings, and standard paragraphs.

            Query:
            \`\`\`sql
            ${query}
            \`\`\`

            Explanation:
        `;

        const result = await model.generateContent(prompt);
        const explanation = result.response.text();

        res.status(200).json({ explanation });

    } catch (error) {
        console.error('Error during API call:', error);
        res.status(500).json({ error: 'Failed to generate explanation. Check server logs.' });
    }
}
