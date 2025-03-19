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

    // Load chat history from local storage if available
    function loadChatHistory() {
        const savedMessages = localStorage.getItem('chatHistory');
        if (savedMessages) {
            const messages = JSON.parse(savedMessages);
            messages.forEach(msg => {
                addMessage(msg.role, msg.text, msg.timestamp, false);
            });
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }
    }

    // Try to load history when page loads
    loadChatHistory();

    // Add a message to the chat window
    function addMessage(role, text, timestamp = null, save = true) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);

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
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight; // Scroll to the bottom
        
        // Save to local storage if needed
        if (save) {
            saveMessage(role, text, messageTime);
        }
    }
    
    // Save message to local storage
    function saveMessage(role, text, timestamp) {
        let messages = [];
        const savedMessages = localStorage.getItem('chatHistory');
        
        if (savedMessages) {
            messages = JSON.parse(savedMessages);
        }
        
        messages.push({
            role: role,
            text: text,
            timestamp: timestamp
        });
        
        // Limit stored history to prevent localStorage exceeding limits
        if (messages.length > 50) {
            messages = messages.slice(-50);
        }
        
        localStorage.setItem('chatHistory', JSON.stringify(messages));
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
        addMessage('assistant', 'Processing...', processingTimestamp, false);

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

            // Replace "Processing..." with the actual response
            const processingMessage = chatWindow.lastChild;
            processingMessage.querySelector('.message-bubble').textContent = data.response;
            
            // Save the actual message
            saveMessage('assistant', data.response, processingTimestamp);
            
        } catch (error) {
            console.error('Error:', error);
            const processingMessage = chatWindow.lastChild;
            processingMessage.querySelector('.message-bubble').textContent = 'Error: Could not process your request.';
            processingMessage.classList.add('error');
            
            // Save the error message
            saveMessage('assistant', 'Error: Could not process your request.', processingTimestamp);
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
        recognition.lang = 'fr-FR'; // Changed to French since the audio test uses French

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
            // Clear the local storage
            localStorage.removeItem('chatHistory');
            
            // Clear the chat window
            chatWindow.innerHTML = '';
            
            // Send request to clear server-side session
            try {
                const response = await fetch('/clear-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });
                
                if (!response.ok) {
                    console.error('Failed to clear server session');
                }
            } catch (error) {
                console.error('Error clearing session:', error);
            }
        }
    });
});