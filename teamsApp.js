const microsoftTeams = require('@microsoft/teams-js');

microsoftTeams.initialize();

// Function to send a message to the RAG AI agent
function sendMessageToAgent(query, llamacloudData) {
  fetch('/api/rag', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, llamacloudData }),
  })
    .then(response => response.json())
    .then(data => {
      // Display the response in the Teams interface
      microsoftTeams.tasks.submitTask(data.response);
    })
    .catch(error => {
      console.error('Error:', error);
      microsoftTeams.tasks.submitTask('An error occurred while processing your request.');
    });
}

// Example usage
microsoftTeams.tasks.startTask((context) => {
  const query = "What's the weather like today?";
  const llamacloudData = { temperature: 25, condition: "sunny" };
  sendMessageToAgent(query, llamacloudData);
});
