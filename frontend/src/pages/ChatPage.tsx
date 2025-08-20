// frontend/src/pages/ChatPage.tsx
import React, { useState, useEffect } from 'react';
import { chatWithAssistant } from '../services/aiService'; // Assuming this service function exists
import { useAuth } from '@/contexts/AuthContext'; // To get user info if needed for context
import { ChatMessage } from '@pediaquiz/types'; // Import ChatMessage type
import { useToast } from '@/components/Toast'; // For user feedback

const ChatPage: React.FC = () => {
  // State for messages and user input
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false); // Loading indicator for AI response
  const { user } = useAuth(); // Get user details if needed
  const { addToast } = useToast(); // For error messages

  // Scroll to bottom when new messages are added
  useEffect(() => {
    const chatContainer = document.getElementById('chat-messages');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [messages]);

  // Handler for sending a message
  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput) return; // Do not send empty messages

    // Add user message to the chat
    const newUserMessage: ChatMessage = {
      id: Date.now().toString(), // Simple unique ID
      text: trimmedInput,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    setInput(''); // Clear input field
    setIsLoading(true); // Show loading indicator

    try {
      // Send message to AI service
      // Pass history to AI for context
      const aiResponse = await chatWithAssistant({ prompt: trimmedInput, history: messages });

      // Add AI response to the chat
      const aiMessage: ChatMessage = {
        id: Date.now().toString() + '_ai', // Another simple unique ID
        text: aiResponse.data.response || "I couldn't generate a response. Please try again.",
        sender: 'assistant',
        timestamp: new Date(),
      };
      setMessages(prevMessages => [...prevMessages, aiMessage]);
    } catch (error: any) {
      console.error('AI chat error:', error);
      addToast(`Failed to get response from AI: ${error.message}`, "error");
      // Optionally add an error message to the chat display
      const errorMessage: ChatMessage = {
        id: Date.now().toString() + '_error',
        text: `Error: ${error.message || 'Failed to get response.'}`,
        sender: 'assistant',
        timestamp: new Date(),
      };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false); // Hide loading indicator
    }
  };

  // Handle Enter key press for sending message
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-120px)] max-h-[80vh]"> {/* Adjust height to account for header/footer */}
      <h1 className="text-2xl font-bold mb-4">AI Assistant Chat</h1>
      {/* Message display area */}
      <div id="chat-messages" className="flex-1 overflow-y-auto p-3 bg-gray-50 dark:bg-slate-800 rounded-lg mb-4 border border-gray-200 dark:border-gray-700" style={{ scrollBehavior: 'smooth' }}>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
            <p>Start chatting with the AI assistant!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`my-3 p-3 rounded-lg max-w-3/4 w-fit ${msg.sender === 'user'
                  ? 'ml-auto bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-200'
                  : 'mr-auto bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                }
                            ${msg.sender === 'user' ? 'shadow-md' : 'shadow-sm'}`}
            >
              {msg.text}
              <span className="block text-xs text-right mt-1 text-gray-500 dark:text-gray-400">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}
      </div>
      {/* Input area */}
      <div className="flex items-center mt-auto">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress} // Handle Enter key
          placeholder="Type your message..."
          className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-slate-700 dark:text-white"
          aria-label="Chat input"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading} // Disable if input is empty or AI is loading
          className={`px-5 py-3 bg-sky-600 text-white rounded-r-lg font-semibold transition-colors duration-200
                      ${!input.trim() || isLoading
              ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
              : 'hover:bg-sky-700 dark:hover:bg-sky-500'
            }`}
          aria-label="Send message"
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default ChatPage;