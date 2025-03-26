document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const inputField = document.getElementById('input-field');
    const micBtn = document.getElementById('mic-btn');
    const submitBtn = document.getElementById('submit-btn');
    const clearBtn = document.getElementById('clear-btn');
    
    // Focus input field on load
    inputField.focus();
    
    // Function to format a date timestamp nicely
    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        
        // If it's today, just show the time
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        // If it's in the last 7 days, show the day name and time
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        if (date > oneWeekAgo) {
            return date.toLocaleDateString([], { weekday: 'short' }) + ' ' + 
                   date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        // Otherwise show the full date
        return date.toLocaleDateString() + ' ' + 
               date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Function to handle feedback clicks
    function handleFeedback(messageId, value) {
        fetch('/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message_id: messageId,
                feedback: value
            }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.status !== 'success') {
                console.error('Failed to record feedback:', data.error);
            }
        })
        .catch(error => {
            console.error('Error sending feedback:', error);
        });
    }

    // Function to safely convert markdown-style code blocks to HTML
// Function to safely escape HTML special characters
function escapeHtml(text) {
    const element = document.createElement('div');
    if (text) {
        element.innerText = text;
        element.textContent = text;
    }
    return element.innerHTML;
}

    // Function to format markdown content to HTML safely
    function formatMessageText(text) {
       
        return text;
    }


    // Load chat history from the server
    function loadChatHistory() {
        chatWindow.innerHTML = ''; // Clear existing messages
        
        // Show loading indicator
        const loadingMessage = document.createElement('div');
        loadingMessage.classList.add('message', 'assistant');
        loadingMessage.innerHTML = `
            <div class="message-bubble">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        chatWindow.appendChild(loadingMessage);
        
        fetch('/get-history')
            .then(response => response.json())
            .then(data => {
                chatWindow.innerHTML = ''; // Clear loading indicator
                
                if (data.status === 'success') {
                    if (data.history.length === 0) {
                        // Show welcome message if no history
                        const welcomeMessage = document.createElement('div');
                        welcomeMessage.classList.add('message', 'assistant');
                        welcomeMessage.innerHTML = `
                            <div class="message-bubble">
                                Hello! How can I assist you today? Ask me anything.
                            </div>
                            <div class="message-info">
                                <div class="timestamp">Now</div>
                            </div>
                        `;
                        chatWindow.appendChild(welcomeMessage);
                    } else {
                        // Add each message from history
                        data.history.forEach(msg => {
                            addMessage(
                                msg.role, 
                                msg.content, 
                                msg.timestamp,
                                false,
                                msg.message_id,
                                msg.feedback
                            );
                        });
                    }
                    
                    chatWindow.scrollTop = chatWindow.scrollHeight;
                } else {
                    console.error('Failed to load history:', data.error);
                    // Show error message
                    const errorMessage = document.createElement('div');
                    errorMessage.classList.add('message', 'assistant', 'error');
                    errorMessage.innerHTML = `
                        <div class="message-bubble">
                            Sorry, I couldn't load the conversation history. Please refresh the page or try again later.
                        </div>
                        <div class="message-info">
                            <div class="timestamp">Now</div>
                        </div>
                    `;
                    chatWindow.appendChild(errorMessage);
                }
            })
            .catch(error => {
                console.error('Error loading history:', error);
                chatWindow.innerHTML = ''; // Clear loading indicator
                
                // Show error message
                const errorMessage = document.createElement('div');
                errorMessage.classList.add('message', 'assistant', 'error');
                errorMessage.innerHTML = `
                    <div class="message-bubble">
                        Sorry, I couldn't load the conversation history. Please refresh the page or try again later.
                    </div>
                    <div class="message-info">
                        <div class="timestamp">Now</div>
                    </div>
                `;
                chatWindow.appendChild(errorMessage);
            });
    }

    // Try to load history when page loads
    loadChatHistory();

    // Add a message to the chat window
    function addMessage(role, text, timestamp = null, save = true, messageId = null, feedback = 0) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);
        
        if (messageId) {
            messageDiv.dataset.messageId = messageId;
        }

        const formattedText = (role === 'processing') ? text : formatMessageText(text);
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.classList.add('message-bubble');
        bubbleDiv.innerHTML = formattedText;

        const messageInfoDiv = document.createElement('div');
        messageInfoDiv.classList.add('message-info');
        
        const timestampDiv = document.createElement('div');
        timestampDiv.classList.add('timestamp');
        
        // Use provided timestamp or create new one
        const messageTime = timestamp ? formatTimestamp(timestamp) : 'Now';
        timestampDiv.textContent = messageTime;
        
        messageInfoDiv.appendChild(timestampDiv);
        
        // Add feedback buttons for assistant messages only (not processing messages)
        if (role === 'assistant' && messageId && !messageId.startsWith('processing-')) {
            const feedbackDiv = document.createElement('div');
            feedbackDiv.classList.add('feedback-buttons');
            
            const likeBtn = document.createElement('button');
            likeBtn.classList.add('feedback-btn', 'like-btn');
            likeBtn.innerHTML = '<i class="fas fa-thumbs-up"></i>';
            likeBtn.title = 'This was helpful';
            
            const dislikeBtn = document.createElement('button');
            dislikeBtn.classList.add('feedback-btn', 'dislike-btn');
            dislikeBtn.innerHTML = '<i class="fas fa-thumbs-down"></i>';
            dislikeBtn.title = 'This was not helpful';
            
            // Set active state based on existing feedback
            if (feedback === 1) {
                likeBtn.classList.add('active');
            } else if (feedback === -1) {
                dislikeBtn.classList.add('active');
            }
            
            // Add event listeners
            likeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Toggle active state
                const isActive = likeBtn.classList.contains('active');
                const newValue = isActive ? 0 : 1;
                
                // Reset both buttons
                likeBtn.classList.remove('active');
                dislikeBtn.classList.remove('active');
                
                // Set new state if not removing
                if (newValue !== 0) {
                    likeBtn.classList.add('active');
                }
                
                handleFeedback(messageId, newValue);
            });
            
            dislikeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Toggle active state
                const isActive = dislikeBtn.classList.contains('active');
                const newValue = isActive ? 0 : -1;
                
                // Reset both buttons
                likeBtn.classList.remove('active');
                dislikeBtn.classList.remove('active');
                
                // Set new state if not removing
                if (newValue !== 0) {
                    dislikeBtn.classList.add('active');
                }
                
                handleFeedback(messageId, newValue);
            });
            
            feedbackDiv.appendChild(likeBtn);
            feedbackDiv.appendChild(dislikeBtn);
            messageInfoDiv.appendChild(feedbackDiv);
        }
        
        messageDiv.appendChild(bubbleDiv);
        messageDiv.appendChild(messageInfoDiv);
        
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight; // Scroll to the bottom
    }

    // Handle the "Send" button click
    submitBtn.addEventListener('click', async () => {
        const inputText = inputField.value.trim();

        if (!inputText) {
            inputField.focus();
            return;
        }

        // Display user's message
        addMessage('user', inputText);
        inputField.value = ''; // Clear the input field
        inputField.focus();

        // Display "Processing..." message with typing indicator
        const processingId = 'processing-' + Date.now();
        const processingDiv = document.createElement('div');
        processingDiv.classList.add('message', 'assistant');
        processingDiv.dataset.messageId = processingId;
        processingDiv.innerHTML = `
            <div class="message-bubble">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
            <div class="message-info">
                <div class="timestamp">Now</div>
            </div>
        `;
        chatWindow.appendChild(processingDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        // Disable the submit button
        submitBtn.disabled = true;

        try {
            const response = await fetch('/process-input', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: inputText }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch response from the server');
            }

            const data = await response.json();

            // Find the processing message and remove it
            const processingMessage = document.querySelector(`[data-message-id="${processingId}"]`);
            if (processingMessage) {
                processingMessage.remove();
            }
            
            // Add the actual response with message ID for feedback
            addMessage('assistant', data.response, new Date().toISOString(), true, data.assistant_message_id);
            
        } catch (error) {
            console.error('Error:', error);
            
            // Find the processing message
            const processingMessage = document.querySelector(`[data-message-id="${processingId}"]`);
            if (processingMessage) {
                processingMessage.remove();
                
                // Add error message
                const errorDiv = document.createElement('div');
                errorDiv.classList.add('message', 'assistant', 'error');
                errorDiv.innerHTML = `
                    <div class="message-bubble">
                        Sorry, I couldn't process your request. Please try again later.
                    </div>
                    <div class="message-info">
                        <div class="timestamp">Now</div>
                    </div>
                `;
                chatWindow.appendChild(errorDiv);
                chatWindow.scrollTop = chatWindow.scrollHeight;
            }
        } finally {
            // Re-enable the submit button
            submitBtn.disabled = false;
        }
    });

    // Handle "Enter" key press in the input field
    inputField.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); // Prevent form submission
            if (!submitBtn.disabled) {
                submitBtn.click(); // Trigger the submit button click
            }
        }
    });

    // Handle mic button click (speech-to-text)
    micBtn.addEventListener('click', async () => {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
            return;
        }

        const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.lang = 'fr-FR'; // Set to French
        recognition.continuous = false;
        recognition.interimResults = false;

        // Change icon and add recording class when recognition starts
        recognition.onstart = () => {
            micBtn.classList.add('recording');
            micBtn.innerHTML = '<i class="fas fa-stop"></i>'; // Change icon to "stop"
            micBtn.title = 'Stop recording'; // Update tooltip
            
            // Show recording indicator in input
            inputField.placeholder = 'Listening...';
            inputField.classList.add('recording');
        };

        // Revert icon and remove recording class when recognition ends
        recognition.onend = () => {
            micBtn.classList.remove('recording');
            micBtn.innerHTML = '<i class="fas fa-microphone"></i>'; // Revert to default icon
            micBtn.title = 'Speak your message'; // Revert tooltip
            
            // Restore input
            inputField.placeholder = 'Type your message...';
            inputField.classList.remove('recording');
            inputField.focus();
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            inputField.value = transcript;
            
            // If the transcript is confident (> 0.8), automatically send
            if (event.results[0][0].confidence > 0.8) {
                submitBtn.click();
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            
            if (event.error !== 'aborted') {
                // Display non-aborted errors to the user
                const errorMessage = document.createElement('div');
                errorMessage.classList.add('message', 'assistant', 'error');
                errorMessage.innerHTML = `
                    <div class="message-bubble">
                        I couldn't understand that. Please try speaking again or type your message.
                    </div>
                    <div class="message-info">
                        <div class="timestamp">Now</div>
                    </div>
                `;
                chatWindow.appendChild(errorMessage);
                chatWindow.scrollTop = chatWindow.scrollHeight;
            }
            
            micBtn.classList.remove('recording');
            micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            micBtn.title = 'Speak your message';
            
            // Restore input
            inputField.placeholder = 'Type your message...';
            inputField.classList.remove('recording');
            inputField.focus();
        };

        // Toggle recording
        if (micBtn.classList.contains('recording')) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });
    
    // Handle clear button click
    clearBtn.addEventListener('click', async () => {
        // Create a confirmation dialog
        const confirmDialog = document.createElement('div');
        confirmDialog.classList.add('confirm-dialog');
        confirmDialog.innerHTML = `
            <div class="confirm-dialog-content">
                <h3>Clear conversation</h3>
                <p>Are you sure you want to clear this conversation? This action cannot be undone.</p>
                <div class="confirm-dialog-buttons">
                    <button class="cancel-btn">Cancel</button>
                    <button class="confirm-btn">Clear</button>
                </div>
            </div>
        `;
        document.body.appendChild(confirmDialog);
        
        // Add event listeners to dialog buttons
        confirmDialog.querySelector('.cancel-btn').addEventListener('click', () => {
            document.body.removeChild(confirmDialog);
        });
        
        confirmDialog.querySelector('.confirm-btn').addEventListener('click', async () => {
            document.body.removeChild(confirmDialog);
            
            try {
                const response = await fetch('/clear-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });
                
                if (!response.ok) {
                    throw new Error('Failed to clear server session');
                }
                
                // Clear the chat window and show welcome message
                chatWindow.innerHTML = '';
                const welcomeMessage = document.createElement('div');
                welcomeMessage.classList.add('message', 'assistant');
                welcomeMessage.innerHTML = `
                    <div class="message-bubble">
                        Conversation cleared. How can I help you now?
                    </div>
                    <div class="message-info">
                        <div class="timestamp">Now</div>
                    </div>
                `;
                chatWindow.appendChild(welcomeMessage);
                
                // Focus the input field
                inputField.focus();
                
            } catch (error) {
                console.error('Error clearing session:', error);
                
                // Show error message
                const errorMessage = document.createElement('div');
                errorMessage.classList.add('message', 'assistant', 'error');
                errorMessage.innerHTML = `
                    <div class="message-bubble">
                        Sorry, I couldn't clear the conversation. Please try again later.
                    </div>
                    <div class="message-info">
                        <div class="timestamp">Now</div>
                    </div>
                `;
                chatWindow.appendChild(errorMessage);
                chatWindow.scrollTop = chatWindow.scrollHeight;
            }
        });
    });

    // Add styles for confirmation dialog
    const style = document.createElement('style');
    style.textContent = `
        .confirm-dialog {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }
        
        .confirm-dialog-content {
            background: white;
            padding: 20px;
            border-radius: 12px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
        }
        
        .confirm-dialog h3 {
            margin-top: 0;
            color: #333;
        }
        
        .confirm-dialog-buttons {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 20px;
        }
        
        .cancel-btn, .confirm-btn {
            padding: 8px 16px;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            font-weight: 500;
        }
        
        .cancel-btn {
            background: #f0f0f0;
            color: #333;
        }
        
        .confirm-btn {
            background: #e53935;
            color: white;
        }
        
        .recording-indicator {
            display: inline-block;
            margin-left: 8px;
            width: 10px;
            height: 10px;
            background: #e53935;
            border-radius: 50%;
            animation: blink 1s infinite;
        }
    `;
    document.head.appendChild(style);
});