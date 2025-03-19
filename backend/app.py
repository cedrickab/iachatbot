from flask import Flask, request, jsonify, render_template, session
import os
from dotenv import load_dotenv
import logging
from openai import AzureOpenAI
import azure.cognitiveservices.speech as speechsdk
import json
import uuid
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO)

# Load environment variables
load_dotenv()

# Load configuration
endpoint = os.getenv("ENDPOINT_URL")
deployment = os.getenv("DEPLOYMENT_NAME")
search_endpoint = os.getenv("SEARCH_ENDPOINT")
search_key = os.getenv("SEARCH_KEY")
search_index = os.getenv("SEARCH_INDEX_NAME")
subscription_key = os.getenv("AZURE_OPENAI_API_KEY")
speech_api_key = os.getenv("SPEECH_API_KEY")

# Initialize Azure OpenAI client
client = AzureOpenAI(
    azure_endpoint=endpoint,
    api_key=subscription_key,
    api_version="2024-05-01-preview",
)

# Initialize Flask app
app = Flask(__name__, static_folder='../frontend', template_folder='../frontend')
app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(24))  # Pour sécuriser les sessions

# Dictionary to store conversation history for users who aren't using cookies
conversation_store = {}

@app.route('/')
def index():
    # Generate a session ID if one doesn't exist
    if 'user_id' not in session:
        session['user_id'] = str(uuid.uuid4())
        # Initialize an empty conversation history for this user
        if session['user_id'] not in conversation_store:
            conversation_store[session['user_id']] = []
    return render_template('index.html')

@app.route('/process-input', methods=['POST'])
def process_input():
    try:
        # Get user input from the request
        user_input = request.json.get('message')
        if not user_input:
            return jsonify({"error": "No message provided"}), 400
        
        # Get or create user_id
        user_id = session.get('user_id', str(uuid.uuid4()))
        if 'user_id' not in session:
            session['user_id'] = user_id
        
        # Initialize conversation history if it doesn't exist
        if user_id not in conversation_store:
            conversation_store[user_id] = []
        
        # Build chat prompt with conversation history
        system_prompt = {
            "role": "system",
            "content": "You are an AI assistant who helps users find information. "
                       "You cannot include references. If the requested information "
                       "is not available in the retrieved data, direct the user to "
                       "the form hosted at https://www.cap3000.com/faq#contact-section "
                       "so that someone can assist them."
        }
        
        # Create full chat history with system prompt and user conversation history
        chat_prompt = [system_prompt] + conversation_store[user_id] + [{"role": "user", "content": user_input}]
        
        # Generate completion
        completion = client.chat.completions.create(
            model=deployment,
            messages=chat_prompt,
            max_tokens=800,
            temperature=0.7,
            top_p=0.95,
            frequency_penalty=0,
            presence_penalty=0,
            stop=None,
            stream=False,
            extra_body={
                "data_sources": [{
                    "type": "azure_search",
                    "parameters": {
                        "endpoint": search_endpoint,
                        "index_name": search_index,
                        "semantic_configuration": "default",
                        "query_type": "vector_simple_hybrid",
                        "fields_mapping": {},
                        "in_scope": True,
                        "role_information": "You are an AI assistant who helps users find information. You cannot include references. If the requested information is not available in the retrieved data, direct the user to the form hosted at https://www.cap3000.com/faq#contact-section so that someone can assist them.",
                        "filter": None,
                        "strictness": 3,
                        "top_n_documents": 5,
                        "authentication": {
                            "type": "api_key",
                            "key": search_key
                        },
                        "embedding_dependency": {
                            "type": "deployment_name",
                            "deployment_name": "text-embedding-ada-002"
                        }
                    }
                }]
            }
        )

        # Extract the assistant's response
        assistant_response = completion.choices[0].message.content
        
        # Update conversation history
        conversation_store[user_id].append({"role": "user", "content": user_input})
        conversation_store[user_id].append({"role": "assistant", "content": assistant_response})
        
        # Keep conversation history to a reasonable length (e.g., last 10 exchanges)
        if len(conversation_store[user_id]) > 20:  # 10 exchanges (user + assistant)
            conversation_store[user_id] = conversation_store[user_id][-20:]
        
        # Return the response
        return jsonify({
            "response": assistant_response,
            "session_id": user_id
        })

    except Exception as e:
        logging.error(f"Error processing input: {e}")
        return jsonify({"error": "Could not process your request."}), 500

@app.route('/clear-session', methods=['POST'])
def clear_session():
    user_id = session.get('user_id')
    if user_id and user_id in conversation_store:
        conversation_store[user_id] = []
    return jsonify({"status": "success", "message": "Conversation history cleared"})

# Optional: Periodic cleanup of old sessions
@app.before_request
def cleanup_old_sessions():
    # This is a simple example, in production you might want to use a scheduled task
    to_delete = []
    for user_id in list(conversation_store.keys()):
        # If session is over 24 hours old or exceeds certain size, mark for deletion
        # You would need to store timestamps with sessions for this logic
        if len(conversation_store[user_id]) > 100:  # Example condition
            to_delete.append(user_id)
    
    for user_id in to_delete:
        del conversation_store[user_id]

# Run the Flask app
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)