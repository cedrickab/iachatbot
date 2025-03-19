document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const inputField = document.getElementById('input-field');
    const micBtn = document.getElementById('mic-btn');
    const submitBtn = document.getElementById('submit-btn');

    // Add a message to the chat window
    function addMessage(role, text) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);

        const bubbleDiv = document.createElement('div');
        bubbleDiv.classList.add('message-bubble');
        bubbleDiv.textContent = text;

        const timestamp = document.createElement('div');
        timestamp.classList.add('timestamp');
        timestamp.textContent = new Date().toLocaleTimeString();

        messageDiv.appendChild(bubbleDiv);
        messageDiv.appendChild(timestamp);
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
        addMessage('assistant', 'Processing...');

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
        } catch (error) {
            console.error('Error:', error);
            const processingMessage = chatWindow.lastChild;
            processingMessage.querySelector('.message-bubble').textContent = 'Error: Could not process your request.';
            processingMessage.classList.add('error');
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
        recognition.lang = 'en-US';

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
});