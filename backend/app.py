from flask import Flask, request, jsonify, render_template, session
import markdown2
import os
from dotenv import load_dotenv
import logging
from openai import AzureOpenAI
import azure.cognitiveservices.speech as speechsdk
import json
import uuid
from datetime import datetime
import sqlite3
import time
import re
import markdown


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
app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(24))

# Database setup
DB_PATH = "conversations.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create users table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # Create conversations tabl
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        message TEXT,
        role TEXT,
        timestamp TIMESTAMP,
        message_id TEXT UNIQUE,
        feedback INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    ''')
    
    conn.commit()
    conn.close()

init_db()

# Helper functions for database operations
def get_or_create_user(user_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    
    if not user:
        cursor.execute("INSERT INTO users (id) VALUES (?)", (user_id,))
        conn.commit()
    
    conn.close()
    return user_id

def save_message(user_id, message, role, message_id=None):
    if not message_id:
        message_id = str(uuid.uuid4())
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    timestamp = datetime.now().isoformat()
    
    cursor.execute(
        "INSERT INTO conversations (user_id, message, role, timestamp, message_id) VALUES (?, ?, ?, ?, ?)",
        (user_id, message, role, timestamp, message_id)
    )
    
    conn.commit()
    conn.close()
    
    return message_id

def get_conversation_history(user_id, limit=20):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT message, role, timestamp, message_id, feedback FROM conversations WHERE user_id = ? ORDER BY timestamp ASC LIMIT ?",
        (user_id, limit)
    )
    
    history = []
    for msg, role, timestamp, message_id, feedback in cursor.fetchall():
        history.append({
            "role": role,
            "content": msg,
            "timestamp": timestamp,
            "message_id": message_id,
            "feedback": feedback
        })
    
    conn.close()
    return history

def update_feedback(message_id, feedback):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute(
        "UPDATE conversations SET feedback = ? WHERE message_id = ?",
        (feedback, message_id)
    )
    
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    
    return updated

@app.route('/')
def index():
    # Generate a session ID if one doesn't exist
    if 'user_id' not in session:
        session['user_id'] = str(uuid.uuid4())
        get_or_create_user(session['user_id'])
    else:
        get_or_create_user(session['user_id'])
        
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
            get_or_create_user(user_id)
        
        # Save user message to database
        user_message_id = save_message(user_id, user_input, "user")
        
        # Get conversation history from database
        history = get_conversation_history(user_id)
        
        # Build chat messages for API
        chat_messages = [msg for msg in history if msg["role"] in ["user", "assistant"]]
        
        # Prepare system message
        system_prompt = {
            "role": "system",
            "content": "You are an AI assistant who helps users find information. "
                       "You cannot include references. If the requested information "
                       "is not available in the retrieved data, direct the user to "
                       "the form hosted at https://www.cap3000.com/faq#contact-section "
                       "so that someone can assist them."
        }
        
        # Create API message format
        api_messages = [system_prompt] + [
            {"role": msg["role"], "content": msg["content"]} 
            for msg in chat_messages
        ] + [{"role": "user", "content": user_input}]
        
        # Generate completion
        completion = client.chat.completions.create(
            model=deployment,
            messages=api_messages,
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

        # Step 1: Remove any trailing [doc*] pattern
        assistant_response = re.sub(r'\[doc\d+\]', '', assistant_response)  # Remove any [doc*] pattern

        assistant_response = markdown.markdown(assistant_response)

        
        # Save assistant message to database
        assistant_message_id = save_message(user_id, assistant_response, "assistant")
        
        # Return the response with message IDs for feedbacK
        return jsonify({
            "response": assistant_response,
            "user_message_id": user_message_id,
            "assistant_message_id": assistant_message_id
        })

    except Exception as e:
        logging.error(f"Error processing input: {e}")
        return jsonify({"error": "Could not process your request."}), 500

@app.route('/feedback', methods=['POST'])
def feedback():
    try:
        data = request.json
        message_id = data.get('message_id')
        feedback_value = data.get('feedback')  # 1 for like, -1 for dislike
        
        if not message_id or feedback_value not in [1, -1, 0]:
            return jsonify({"error": "Invalid feedback data"}), 400
            
        updated = update_feedback(message_id, feedback_value)
        
        if updated:
            return jsonify({"status": "success", "message": "Feedback recorded"})
        else:
            return jsonify({"error": "Message not found"}), 404
            
    except Exception as e:
        logging.error(f"Error processing feedback: {e}")
        return jsonify({"error": "Could not process feedback"}), 500

@app.route('/clear-session', methods=['POST'])
def clear_session():
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({"error": "No active session"}), 400
            
        # Delete all messages for this user
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM conversations WHERE user_id = ?", (user_id,))
        conn.commit()
        conn.close()
        
        return jsonify({"status": "success", "message": "Conversation history cleared"})
        
    except Exception as e:
        logging.error(f"Error clearing session: {e}")
        return jsonify({"error": "Could not clear session"}), 500

@app.route('/get-history', methods=['GET'])
def get_history():
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({"error": "No active session"}), 400
            
        history = get_conversation_history(user_id, limit=100)
        
        return jsonify({
            "status": "success", 
            "history": history
        })
        
    except Exception as e:
        logging.error(f"Error getting history: {e}")
        return jsonify({"error": "Could not retrieve history"}), 500

# Run the Flask app
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)