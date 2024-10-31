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

const searchClient = new SearchClient(
  process.env.AZURE_SEARCH_ENDPOINT,
  "your-index-name",
  new AzureKeyCredential(process.env.AZURE_SEARCH_KEY)
);

class RAGBot extends ActivityHandler {
  constructor() {
    super();
    this.onMessage(async (context, next) => {
      const userMessage = context.activity.text;
      const llamacloudData = context.activity.value; // Assuming LlamaCloud data is sent in the value field

      try {
        // Search in Azure Cognitive Search
        const searchResults = await this.searchDocuments(userMessage);

        // Generate response using OpenAI
        const response = await this.generateResponse(searchResults, llamacloudData, userMessage);

        await context.sendActivity(MessageFactory.text(response));
      } catch (error) {
        console.error('Error processing message:', error);
        await context.sendActivity(MessageFactory.text('Sorry, I encountered an error while processing your request.'));
      }

      await next();
    });
  }

  async searchDocuments(query) {
    const searchResults = await searchClient.search(query);
    return Array.from(await searchResults.next()).map(result => result.document);
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
      ]
    };

    try {
      const response = await axios.post(openaiEndpoint, data, { headers });
      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      return 'Sorry, I encountered an error while processing your request.';
    }
  }
}

const bot = new RAGBot();

app.post('/api/messages', (req, res) => {
  adapter.processActivity(req, res, async (context) => {
    await bot.run(context);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
