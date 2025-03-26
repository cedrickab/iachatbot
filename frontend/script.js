document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatWindow = document.getElementById('chat-window');
    const inputField = document.getElementById('input-field');
    const micBtn = document.getElementById('mic-btn');
    const submitBtn = document.getElementById('submit-btn');
    const clearBtn = document.getElementById('clear-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = document.querySelector('.close-modal');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const speechLanguageSelect = document.getElementById('speech-language');

    // App State
    let selectedLanguage = 'en-US'; // Default language
    const supportedLanguages = [
        { code: 'en-US', name: 'English (US)' },
        { code: 'en-GB', name: 'English (UK)' },
        { code: 'fr-FR', name: 'French' },
        { code: 'es-ES', name: 'Spanish (Spain)' },
        { code: 'de-DE', name: 'German' },
        { code: 'it-IT', name: 'Italian' },
        { code: 'pt-BR', name: 'Portuguese (Brazil)' },
        { code: 'ru-RU', name: 'Russian' },
        { code: 'zh-CN', name: 'Chinese (Simplified)' },
        { code: 'ja-JP', name: 'Japanese' },
        { code: 'ar-SA', name: 'Arabic' },
        { code: 'hi-IN', name: 'Hindi' }
    ];

    // Initialize the app
    function init() {
        loadPreferences();
        setupEventListeners();
        loadChatHistory();
        inputField.focus();
    }

    // Load user preferences from localStorage
    function loadPreferences() {
        const savedDarkMode = localStorage.getItem('darkMode') === 'true';
        const savedLanguage = localStorage.getItem('speechLanguage') || 'en-US';

        if (savedDarkMode) {
            document.body.classList.add('dark-mode');
            darkModeToggle.checked = true;
        }

        speechLanguageSelect.value = savedLanguage;
        selectedLanguage = savedLanguage;
    }

    // Set up all event listeners
    function setupEventListeners() {
        // Dark mode toggle
        darkModeToggle.addEventListener('change', toggleDarkMode);
        
        // Language selection
        speechLanguageSelect.addEventListener('change', handleLanguageChange);
        
        // Settings modal
        settingsBtn.addEventListener('click', openSettingsModal);
        closeModalBtn.addEventListener('click', closeSettingsModal);
        window.addEventListener('click', handleOutsideModalClick);
        
        // Chat functionality
        submitBtn.addEventListener('click', handleSubmit);
        inputField.addEventListener('keypress', handleInputKeyPress);
        micBtn.addEventListener('click', handleMicClick);
        clearBtn.addEventListener('click', handleClearClick);
    }

    // Dark mode toggle handler
    function toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', darkModeToggle.checked);
    }

    // Language change handler
    function handleLanguageChange(e) {
        selectedLanguage = e.target.value;
        localStorage.setItem('speechLanguage', selectedLanguage);
    }

    // Settings modal handlers
    function openSettingsModal() {
        settingsModal.style.display = 'flex';
    }

    function closeSettingsModal() {
        settingsModal.style.display = 'none';
    }

    function handleOutsideModalClick(event) {
        if (event.target === settingsModal) {
            closeSettingsModal();
        }
    }

    // Format timestamp for messages
    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        if (date > oneWeekAgo) {
            return `${date.toLocaleDateString([], { weekday: 'short' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    // Send feedback to server
    function handleFeedback(messageId, value) {
        fetch('/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message_id: messageId, feedback: value }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.status !== 'success') {
                console.error('Failed to record feedback:', data.error);
            }
        })
        .catch(console.error);
    }

    // Create language selector dropdown
    function createLanguageSelector() {
        const selector = document.createElement('select');
        selector.id = 'language-selector';
        selector.classList.add('language-selector');

        supportedLanguages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.code;
            option.textContent = lang.name;
            option.selected = lang.code === selectedLanguage;
            selector.appendChild(option);
        });

        selector.addEventListener('change', (e) => {
            selectedLanguage = e.target.value;
        });

        return selector;
    }

    // Load chat history from server
    function loadChatHistory() {
        chatWindow.innerHTML = '';
        showLoadingIndicator();
        
        fetch('/get-history')
            .then(response => response.json())
            .then(data => {
                chatWindow.innerHTML = '';
                
                if (data.status === 'success') {
                    if (data.history.length === 0) {
                        showWelcomeMessage();
                    } else {
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
                    scrollToBottom();
                } else {
                    showErrorMessage('Failed to load history:', data.error);
                }
            })
            .catch(error => {
                showErrorMessage('Error loading history:', error);
            });
    }

    // Show loading indicator
    function showLoadingIndicator() {
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
    }

    // Show welcome message
    function showWelcomeMessage() {
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
    }

    // Show error message
    function showErrorMessage(error, details = '') {
        console.error(error, details);
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
        scrollToBottom();
    }

    // Scroll chat to bottom
    function scrollToBottom() {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // Add message to chat window
    function addMessage(role, text, timestamp = null, save = true, messageId = null, feedback = 0) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);
        
        if (messageId) messageDiv.dataset.messageId = messageId;

        const bubbleDiv = document.createElement('div');
        bubbleDiv.classList.add('message-bubble');
        bubbleDiv.innerHTML = text;

        const messageInfoDiv = createMessageInfoDiv(timestamp, role, messageId, feedback);
        
        messageDiv.appendChild(bubbleDiv);
        messageDiv.appendChild(messageInfoDiv);
        chatWindow.appendChild(messageDiv);
        scrollToBottom();
    }

    // Create message info div with timestamp and feedback buttons
    function createMessageInfoDiv(timestamp, role, messageId, feedback) {
        const messageInfoDiv = document.createElement('div');
        messageInfoDiv.classList.add('message-info');
        
        const timestampDiv = document.createElement('div');
        timestampDiv.classList.add('timestamp');
        timestampDiv.textContent = timestamp ? formatTimestamp(timestamp) : 'Now';
        messageInfoDiv.appendChild(timestampDiv);
        
        if (role === 'assistant' && messageId && !messageId.startsWith('processing-')) {
            messageInfoDiv.appendChild(createFeedbackButtons(messageId, feedback));
        }
        
        return messageInfoDiv;
    }

    // Create feedback buttons
    function createFeedbackButtons(messageId, feedback) {
        const feedbackDiv = document.createElement('div');
        feedbackDiv.classList.add('feedback-buttons');
        
        const likeBtn = createFeedbackButton('like', 'fa-thumbs-up', 'This was helpful', feedback === 1);
        const dislikeBtn = createFeedbackButton('dislike', 'fa-thumbs-down', 'This was not helpful', feedback === -1);
        
        likeBtn.addEventListener('click', (e) => handleFeedbackClick(e, messageId, likeBtn, dislikeBtn, 1));
        dislikeBtn.addEventListener('click', (e) => handleFeedbackClick(e, messageId, dislikeBtn, likeBtn, -1));
        
        feedbackDiv.appendChild(likeBtn);
        feedbackDiv.appendChild(dislikeBtn);
        
        return feedbackDiv;
    }

    // Create a single feedback button
    function createFeedbackButton(type, icon, title, isActive) {
        const btn = document.createElement('button');
        btn.classList.add('feedback-btn', `${type}-btn`);
        if (isActive) btn.classList.add('active');
        btn.innerHTML = `<i class="fas ${icon}"></i>`;
        btn.title = title;
        return btn;
    }

    // Handle feedback button click
    function handleFeedbackClick(e, messageId, clickedBtn, otherBtn, value) {
        e.preventDefault();
        const isActive = clickedBtn.classList.contains('active');
        const newValue = isActive ? 0 : value;
        
        clickedBtn.classList.toggle('active', newValue !== 0);
        otherBtn.classList.remove('active');
        
        handleFeedback(messageId, newValue);
    }

    // Handle message submission
    async function handleSubmit() {
        const inputText = inputField.value.trim();
        if (!inputText) return;

        // Add user message and clear input
        addMessage('user', inputText);
        inputField.value = '';
        inputField.focus();

        // Show processing indicator
        const processingId = `processing-${Date.now()}`;
        showProcessingIndicator(processingId);

        // Disable submit button during processing
        submitBtn.disabled = true;

        try {
            const response = await processUserInput(inputText);
            removeProcessingMessage(processingId);
            addMessage('assistant', response.response, new Date().toISOString(), true, response.assistant_message_id);
        } catch (error) {
            handleProcessingError(processingId, error);
        } finally {
            submitBtn.disabled = false;
        }
    }

    // Show processing indicator
    function showProcessingIndicator(id) {
        const processingDiv = document.createElement('div');
        processingDiv.classList.add('message', 'assistant');
        processingDiv.dataset.messageId = id;
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
        scrollToBottom();
    }

    // Process user input with server
    async function processUserInput(input) {
        const response = await fetch('/process-input', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: input }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch response from the server');
        }

        return await response.json();
    }

    // Remove processing message
    function removeProcessingMessage(id) {
        const processingMessage = document.querySelector(`[data-message-id="${id}"]`);
        if (processingMessage) processingMessage.remove();
    }

    // Handle processing errors
    function handleProcessingError(processingId, error) {
        console.error('Error:', error);
        removeProcessingMessage(processingId);
        
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
        scrollToBottom();
    }

    // Handle input field key press
    function handleInputKeyPress(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (!submitBtn.disabled) submitBtn.click();
        }
    }

    // Handle microphone button click
    async function handleMicClick() {
        if (!isSpeechRecognitionSupported()) {
            alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
            return;
        }

        const recognition = createSpeechRecognition();
        
        if (micBtn.classList.contains('recording')) {
            recognition.stop();
        } else {
            recognition.start();
        }
    }

    // Check if speech recognition is supported
    function isSpeechRecognitionSupported() {
        return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    }

    // Create speech recognition instance
    function createSpeechRecognition() {
        const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.lang = selectedLanguage;
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
            micBtn.classList.add('recording');
            micBtn.innerHTML = '<i class="fas fa-stop"></i>';
            micBtn.title = 'Stop recording';
            inputField.placeholder = 'Listening...';
            inputField.classList.add('recording');
        };

        recognition.onend = () => {
            resetMicButton();
            inputField.focus();
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            inputField.value = transcript;
            
            if (event.results[0][0].confidence > 0.8) {
                submitBtn.click();
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            
            if (event.error !== 'aborted') {
                showSpeechRecognitionError();
            }
            
            resetMicButton();
            inputField.focus();
        };

        return recognition;
    }

    // Reset mic button to default state
    function resetMicButton() {
        micBtn.classList.remove('recording');
        micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        micBtn.title = 'Speak your message';
        inputField.placeholder = 'Type your message...';
        inputField.classList.remove('recording');
    }

    // Show speech recognition error
    function showSpeechRecognitionError() {
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
        scrollToBottom();
    }

    // Handle clear conversation button click
    function handleClearClick() {
        showClearConfirmationDialog();
    }

    // Show clear confirmation dialog
    function showClearConfirmationDialog() {
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
        
        confirmDialog.querySelector('.cancel-btn').addEventListener('click', () => {
            document.body.removeChild(confirmDialog);
        });
        
        confirmDialog.querySelector('.confirm-btn').addEventListener('click', () => {
            document.body.removeChild(confirmDialog);
            clearConversation();
        });
    }

    // Clear conversation with server
    async function clearConversation() {
        try {
            const response = await fetch('/clear-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) throw new Error('Failed to clear server session');
            
            chatWindow.innerHTML = '';
            showWelcomeMessage();
            inputField.focus();
        } catch (error) {
            console.error('Error clearing session:', error);
            showErrorMessage('Error clearing conversation:', error);
        }
    }

    // Start the application
    init();
});