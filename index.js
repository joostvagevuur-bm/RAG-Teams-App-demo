require('dotenv').config();
const express = require('express');
const { BotFrameworkAdapter, ActivityHandler, MessageFactory } = require('botbuilder');
const { SearchClient, AzureKeyCredential } = require("@azure/search-documents");
const axios = require('axios');

const app = express();

const adapter = new BotFrameworkAdapter({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});

adapter.onTurnError = async (context, error) => {
  console.error(`\n [onTurnError] unhandled error: ${error}`);
  await context.sendActivity('The bot encountered an error or bug.');
};

const searchClient = new SearchClient(
  process.env.AZURE_SEARCH_ENDPOINT,
  "your-index-name",
  new AzureKeyCredential(process.env.AZURE_SEARCH_KEY)
);

class RAGBot extends ActivityHandler {
  constructor() {
    super();
    this.onMessage(async (context, next) => {
      console.log('Received a message');
      const userMessage = context.activity.text;
      const llamacloudData = context.activity.value || {};

      console.log(`User message: ${userMessage}`);
      console.log(`LlamaCloud data: ${JSON.stringify(llamacloudData)}`);

      try {
        // Send a typing indicator
        await context.sendActivities([{ type: 'typing' }]);

        // Set a timeout for the entire operation
        const timeout = 30000; // 30 seconds
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Operation timed out')), timeout)
        );

        const operationPromise = this.performOperations(userMessage, llamacloudData);

        const response = await Promise.race([operationPromise, timeoutPromise]);

        await context.sendActivity(MessageFactory.text(response));
      } catch (error) {
        console.error('Error processing message:', error);
        await context.sendActivity(MessageFactory.text('Sorry, I encountered an error while processing your request. Please try again.'));
      }

      await next();
    });
  }

  async performOperations(userMessage, llamacloudData) {
    console.log('Searching documents...');
    const searchStartTime = Date.now();
    const searchResults = await this.searchDocuments(userMessage);
    console.log(`Search completed in ${Date.now() - searchStartTime}ms`);
    console.log(`Search results: ${JSON.stringify(searchResults)}`);

    console.log('Generating response...');
    const generateStartTime = Date.now();
    const response = await this.generateResponse(searchResults, llamacloudData, userMessage);
    console.log(`Response generated in ${Date.now() - generateStartTime}ms`);
    console.log(`Generated response: ${response}`);

    return response;
  }

  async searchDocuments(query) {
    try {
      const searchResults = await searchClient.search(query, { top: 5 });
      return Array.from(await searchResults.next()).map(result => result.document);
    } catch (error) {
      console.error('Error searching documents:', error);
      return [];
    }
  }

  async generateResponse(searchResults, llamacloudData, query) {
    const openaiEndpoint = 'https://api.openai.com/v1/chat/completions';
    const headers = {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    };

    const context = `Search Results: ${JSON.stringify(searchResults)}\n\nLlamaCloud Data: ${JSON.stringify(llamacloudData)}`;

    const data = {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: `Context: ${context}\n\nQuery: ${query}` }
      ],
      max_tokens: 150  // Limit the response length
    };

    try {
      const response = await axios.post(openaiEndpoint, data, { headers });
      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      return 'I apologize, but I\'m having trouble generating a response right now. Please try again later.';
    }
  }
}

const bot = new RAGBot();

app.post('/api/messages', (req, res) => {
  console.log('Received a request to /api/messages');
  adapter.processActivity(req, res, async (context) => {
    console.log('Processing activity');
    await bot.run(context);
    console.log('Finished processing activity');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
