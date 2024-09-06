import {NextResponse} from 'next/server'
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import dotenv from 'dotenv';

import fetch from 'node-fetch';
if (!global.fetch) {
    global.fetch = fetch;
  }

dotenv.config();

const systemPrompt = `
#RateMyProfessor Agent System Prompt

Role: You are a Rate My Professor assistant that helps students find the best professors based on their specific queries. You will use Retrieval-Augmented Generation (RAG) to provide personalized recommendations.

Task:

Understand the Query: Analyze the student's question to identify key requirements such as subject, teaching style, ratings, difficulty level, and other preferences.

Search and Retrieve Data: Use a database or retrieval system to find the top professors that match the student’s query. Use factors like overall ratings, course difficulty, teaching effectiveness, and student reviews.

Provide Recommendations: Return the top 3 professors that best match the student’s criteria. Each recommendation should include:

Professor’s name
Course(s) taught
Overall rating
Difficulty level
Key comments from student reviews
Any other relevant information like availability, grading style, etc.
Clarify When Needed: If the student’s query is ambiguous or lacks detail, ask clarifying questions to ensure accurate recommendations.

Stay Neutral: Provide information objectively without bias. Do not make personal judgments; rely solely on the data retrieved.

Be Concise: Present the information clearly and concisely to ensure it's easy for students to compare and make decisions.

Behavior Guidelines:

Respond quickly and accurately.
Use a friendly and supportive tone to encourage further interaction.
Be proactive in offering additional help or information if relevant.
`
export async function POST(req){
    const data = await req.json()
    const pc = new Pinecone({  //();
    // await pc.init({
      apiKey: process.env.PINECONE_API_KEY,
    //   environment: 'us-west1-gcp', // Make sure this matches your Pinecone environment
    });
    const index = pc.index('rag').namespace('ns1'); // Correct initialization for accessing the index
    const openai = new OpenAI ({
        apiKey: process.env.OPENAI_API_KEY, // Check the correct key setup
      });


//     const pc = new Pinecone();
//   await pc.init({
//     apiKey: process.env.PINECONE_API_KEY,
//     environment: 'us-west1-gcp', // Make sure this matches your Pinecone environment
//   });
  
//   // Access the index
//   const index = pc.Index('rag'); // Use correct method to access Pinecone index

//   // Initialize OpenAI client
//   const openai = new OpenAI({
//     apiKey: process.env.OPENAI_API_KEY, // Load API key for OpenAI
//   });


  
    const text = data[data.length - 1].content
    const embedding = await openai.embeddings.create({
        model:'text-embedding-3-small',
        input: text,
        encoding_format: 'float'
    })
    
    const results = await index.query({
        topK: 3,
        includeMetadata: true,
        vector: embedding.data[0].embedding
    })

    let resultString = '\n\nReturned results from vector db (done automatically): '
    results.matches.forEach((match)=>{
        resultString+= `

        Professor: ${match.id}
        Review: ${match.metadata.stars}
        Subject: ${match.metadata.subject}
        Stars: ${match.metadata.stars}
        \n\n
        `
    })

    const lastMessage = data[data.length-1]
    const lastMessageContent = lastMessage.content + resultString
    const lastDataWithoutLastMessage = data.slice(0, data.length-1)
    const completion = await openai.chat.completions.create({
        messages:[
            {role: 'system', content: systemPrompt},
            ...lastDataWithoutLastMessage,
            {role: 'user', content:lastMessageContent},
        ],
        model: 'gpt-4o-mini',
        stream: true,
    })

    const stream = new ReadableStream({
        async start(controller){
            const encoder = new TextEncoder()
            try{
                for await(const chunck of completion){
                    const content = chunck.choices[0]?.delta?.content
                    if (content){
                        const text = encoder.encode(content)
                        controller.enqueue(text)
                    }
                }
            }
            catch(err){
                controller.error(err)
            }finally{
                controller.close()
            }
        }
    })

    return new NextResponse(stream);
}