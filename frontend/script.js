document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const inputField = document.getElementById('input-field');
    const micBtn = document.getElementById('mic-btn');
    const submitBtn = document.getElementById('submit-btn');
    
    // Add new button for clearing conversation
    const clearBtn = document.createElement('button');
    clearBtn.id = 'clear-btn';
    clearBtn.textContent = '🗑️';
    clearBtn.title = 'Clear conversation';
    clearBtn.classList.add('clear-btn');
    document.querySelector('.input-container').appendChild(clearBtn);

    // Function to handle feedback clicks
    function handleFeedback(messageId, value) {
        // Send feedback to server
        fetch('/feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message_id: messageId,
                feedback: value
            }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                console.log('Feedback recorded successfully');
            } else {
                console.error('Failed to record feedback:', data.error);
            }
        })
        .catch(error => {
            console.error('Error sending feedback:', error);
        });
    }

    // Load chat history from the server
    function loadChatHistory() {
        fetch('/get-history')
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    chatWindow.innerHTML = ''; // Clear existing messages
                    
                    data.history.forEach(msg => {
                        addMessage(
                            msg.role, 
                            msg.content, 
                            new Date(msg.timestamp).toLocaleTimeString(),
                            false,
                            msg.message_id,
                            msg.feedback
                        );
                    });
                    
                    chatWindow.scrollTop = chatWindow.scrollHeight;
                } else {
                    console.error('Failed to load history:', data.error);
                }
            })
            .catch(error => {
                console.error('Error loading history:', error);
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

        const bubbleDiv = document.createElement('div');
        bubbleDiv.classList.add('message-bubble');
        bubbleDiv.textContent = text;

        const timestampDiv = document.createElement('div');
        timestampDiv.classList.add('timestamp');
        
        // Use provided timestamp or create new one
        const messageTime = timestamp || new Date().toLocaleTimeString();
        timestampDiv.textContent = messageTime;

        messageDiv.appendChild(bubbleDiv);
        messageDiv.appendChild(timestampDiv);
        
        // Add feedback buttons for assistant messages only
        if (role === 'assistant' && messageId) {
            const feedbackDiv = document.createElement('div');
            feedbackDiv.classList.add('feedback-buttons');
            
            const likeBtn = document.createElement('button');
            likeBtn.classList.add('feedback-btn', 'like-btn');
            likeBtn.innerHTML = '👍';
            likeBtn.title = 'Like this response';
            
            const dislikeBtn = document.createElement('button');
            dislikeBtn.classList.add('feedback-btn', 'dislike-btn');
            dislikeBtn.innerHTML = '👎';
            dislikeBtn.title = 'Dislike this response';
            
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
            messageDiv.appendChild(feedbackDiv);
        }
        
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight; // Scroll to the bottom
    }

    // Handle the "Send" button click
    submitBtn.addEventListener('click', async () => {
        const inputText = inputField.value.trim();

        if (!inputText) {
            alert('Please type or speak something.');
            return;
        }

        // Display user's message
        addMessage('user', inputText);
        inputField.value = ''; // Clear the input field

        // Display "Processing..." message
        const processingTimestamp = new Date().toLocaleTimeString();
        const processingId = 'processing-' + Date.now();
        addMessage('assistant', 'Processing...', processingTimestamp, false, processingId);

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
            addMessage('assistant', data.response, processingTimestamp, true, data.assistant_message_id);
            
        } catch (error) {
            console.error('Error:', error);
            
            // Find the processing message
            const processingMessage = document.querySelector(`[data-message-id="${processingId}"]`);
            if (processingMessage) {
                // Update the processing message with error
                const bubbleDiv = processingMessage.querySelector('.message-bubble');
                if (bubbleDiv) {
                    bubbleDiv.textContent = 'Error: Could not process your request.';
                    processingMessage.classList.add('error');
                }
            }
        } finally {
            // Re-enable the submit button
            submitBtn.disabled = false;
        }
    });

    // Handle "Enter" key press in the input field
    inputField.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent form submission
            submitBtn.click(); // Trigger the submit button click
        }
    });

    // Handle mic button click (speech-to-text)
    micBtn.addEventListener('click', async () => {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
            return;
        }

        const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.lang = 'fr-FR'; // Set to French as your app seems to be in French

        // Change icon and add recording class when recognition starts
        recognition.onstart = () => {
            micBtn.classList.add('recording');
            micBtn.textContent = '⏹️'; // Change icon to "stop"
            micBtn.title = 'Click to stop recording'; // Update tooltip
        };

        // Revert icon and remove recording class when recognition ends
        recognition.onend = () => {
            micBtn.classList.remove('recording');
            micBtn.textContent = '🎤'; // Revert to default icon
            micBtn.title = 'Click to start recording'; // Revert tooltip
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            inputField.value = transcript;
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            alert(`Speech recognition failed: ${event.error}. Please try again.`);
            micBtn.classList.remove('recording'); // Ensure recording class is removed on error
            micBtn.textContent = '🎤'; // Revert to default icon
            micBtn.title = 'Click to start recording'; // Revert tooltip
        };

        recognition.start();
    });
    
    // Handle clear button click
    clearBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear this conversation?')) {
            try {
                const response = await fetch('/clear-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });
                
                if (!response.ok) {
                    console.error('Failed to clear server session');
                    alert('Failed to clear conversation history.');
                    return;
                }
                
                // Clear the chat window
                chatWindow.innerHTML = '';
                
            } catch (error) {
                console.error('Error clearing session:', error);
                alert('Failed to clear conversation history.');
            }
        }
    });
});