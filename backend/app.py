from flask import Flask, request, jsonify, render_template, session
import markdown2
import os
from dotenv import load_dotenv
import logging
from openai import AzureOpenAI
import json
import uuid
from datetime import datetime
import re
import markdown
import pyodbc
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS



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
center_id = os.getenv("COMMERCIAL_CENTER_ID")
center_name = os.getenv("COMMERCIAL_CENTER_NAME")

# Initialize Azure OpenAI client
client = AzureOpenAI(
    azure_endpoint=endpoint,
    api_key=subscription_key,
    api_version="2024-05-01-preview",
)

# Initialize Flask app
app = Flask(__name__, static_folder='../frontend/static', template_folder='../frontend/templates',static_url_path='/static')
app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(24))
app.config.update(
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='None'  # Allows cookies in cross-site requests
)
CORS(app, supports_credentials=True)

# Azure SQL Database configuration
DB_CONFIG = {
    'server': os.getenv('AZURE_SQL_SERVER'),
    'database': os.getenv('AZURE_SQL_DATABASE'),
    'username': os.getenv('AZURE_SQL_USERNAME'),
    'password': os.getenv('AZURE_SQL_PASSWORD'),
    'driver': '{ODBC Driver 18 for SQL Server}'
}

# Initialize SQLAlchemy
app.config['SQLALCHEMY_DATABASE_URI'] = (
    f"mssql+pyodbc://{DB_CONFIG['username']}:{DB_CONFIG['password']}@"
    f"{DB_CONFIG['server']}/{DB_CONFIG['database']}?driver=ODBC+Driver+18+for+SQL+Server"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

def get_db_connection():
    conn_str = (
        f"Driver={DB_CONFIG['driver']};"
        f"Server=tcp:{DB_CONFIG['server']},1433;"
        f"Database={DB_CONFIG['database']};"
        f"Uid={DB_CONFIG['username']};"
        f"Pwd={DB_CONFIG['password']};"
        "Encrypt=yes;TrustServerCertificate=no;"
        "Connection Timeout=30;"
    )
    return pyodbc.connect(conn_str)

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create commercial_centers table
    cursor.execute('''
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='commercial_centers' AND xtype='U')
    CREATE TABLE commercial_centers (
        id NVARCHAR(50) PRIMARY KEY,
        name NVARCHAR(100) NOT NULL,
        location NVARCHAR(255),
        website_url NVARCHAR(255),
        created_at DATETIME2 DEFAULT GETDATE()
    )
    ''')

    # Create users table with center reference
    cursor.execute('''
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
    CREATE TABLE users (
        id NVARCHAR(50) PRIMARY KEY,
        center_id NVARCHAR(50),
        created_at DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (center_id) REFERENCES commercial_centers(id)
    )
    ''')
    
    # Modified conversations table with center reference
    cursor.execute('''
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='conversations' AND xtype='U')
    CREATE TABLE conversations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id NVARCHAR(50),
        center_id NVARCHAR(50),
        message NVARCHAR(MAX),
        role NVARCHAR(50),
        timestamp DATETIME2,
        message_id NVARCHAR(50) UNIQUE,
        feedback INT DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (center_id) REFERENCES commercial_centers(id)
    )
    ''')

    # Create knowledge_base table for center-specific information
    cursor.execute('''
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='knowledge_base' AND xtype='U')
    CREATE TABLE knowledge_base (
        id INT IDENTITY(1,1) PRIMARY KEY,
        center_id NVARCHAR(50),
        content_type NVARCHAR(50),
        title NVARCHAR(255),
        content NVARCHAR(MAX),
        last_updated DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (center_id) REFERENCES commercial_centers(id)
    )
    ''')
    
    # Ensure the configured commercial center exists
    cursor.execute('''
    IF NOT EXISTS (SELECT 1 FROM commercial_centers WHERE id = ?)
    INSERT INTO commercial_centers (id, name) VALUES (?, ?)
    ''', (center_id, center_id, center_name))
    
    cursor.execute('''
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='conversation_sessions' AND xtype='U')
    CREATE TABLE conversation_sessions (
        id NVARCHAR(50) PRIMARY KEY,
        user_id NVARCHAR(50),
        center_id NVARCHAR(50),
        title NVARCHAR(255),
        created_at DATETIME2 DEFAULT GETDATE(),
        last_updated DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (center_id) REFERENCES commercial_centers(id)
    )
    ''')
    
    # Modify conversations table to include conversation_id
    cursor.execute('''
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
                  WHERE TABLE_NAME = 'conversations' 
                  AND COLUMN_NAME = 'conversation_id')
    ALTER TABLE conversations 
    ADD conversation_id NVARCHAR(50),
    CONSTRAINT FK_ConversationSession 
    FOREIGN KEY (conversation_id) 
    REFERENCES conversation_sessions(id)
    ''')
    
    conn.commit()
    conn.close()

init_db()

# Helper functions for database operations
def get_or_create_user(user_id):
    # Validate user_id
    try:
        uuid.UUID(user_id)
    except (ValueError, TypeError):
        raise ValueError("Invalid user_id. Must be a valid UUID.")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    
    if not user:
        cursor.execute("INSERT INTO users (id, center_id) VALUES (?, ?)", 
                      (user_id, center_id))
        conn.commit()
    
    conn.close()
    return user_id

def save_message(user_id, message, role, message_id=None):
    if not message_id:
        message_id = str(uuid.uuid4())
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    timestamp = datetime.now().isoformat()
    
    cursor.execute(
        "INSERT INTO conversations (user_id, center_id, message, role, timestamp, message_id) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, center_id, message, role, timestamp, message_id)
    )
    
    conn.commit()
    conn.close()
    
    return message_id

def get_conversation_history(user_id, limit=20):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute(
        """SELECT message, role, timestamp, message_id, feedback 
           FROM conversations 
           WHERE user_id = ? AND center_id = ? 
           ORDER BY timestamp ASC 
           OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY""",
        (user_id, center_id, limit)
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
    conn = get_db_connection()
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
        if not user_input or not isinstance(user_input, str) or len(user_input.strip()) == 0:
            return jsonify({"error": "Invalid input. Message must be a non-empty string."}), 400
        
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
                            "deployment_name": "text-embedding-3-small"
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
        feedback_value = data.get('feedback')  # 1 for like, -1 for dislike, 0 for neutral
        
        # Validate message_id
        try:
            uuid.UUID(message_id)
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid message_id. Must be a valid UUID."}), 400
        
        # Validate feedback_value
        if feedback_value not in [1, -1, 0]:
            return jsonify({"error": "Invalid feedback value. Must be 1, -1, or 0."}), 400
            
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
        conn = get_db_connection()
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
        user_id = session.get('user_id') or request.args.get('user_id')
        if not user_id:
            return jsonify({"error": "No active session"}), 400
        
        # Validate user_id
        try:
            uuid.UUID(user_id)
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid user_id. Must be a valid UUID."}), 400
        
        # Validate limit
        limit = request.args.get('limit', 100)
        try:
            limit = int(limit)
            if limit <= 0 or limit > 100:
                raise ValueError
        except ValueError:
            return jsonify({"error": "Invalid limit. Must be an integer between 1 and 100."}), 400
        
        history = get_conversation_history(user_id, limit=limit)
        
        return jsonify({
            "status": "success", 
            "history": history
        })
        
    except Exception as e:
        logging.error(f"Error getting history: {e}")
        return jsonify({"error": "Could not retrieve history"}), 500

# Add these new routes in app.py
@app.route('/conversations', methods=['GET'])
def get_conversations():
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({"error": "No active session"}), 400
            
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, title, created_at, last_updated 
            FROM conversation_sessions 
            WHERE user_id = ? 
            ORDER BY last_updated DESC
        """, (user_id,))
        
        conversations = []
        for conv_id, title, created_at, last_updated in cursor.fetchall():
            conversations.append({
                "id": conv_id,
                "title": title,
                "created_at": created_at,
                "last_updated": last_updated
            })
            
        conn.close()
        return jsonify({"status": "success", "conversations": conversations})
        
    except Exception as e:
        logging.error(f"Error getting conversations: {e}")
        return jsonify({"error": "Could not retrieve conversations"}), 500

@app.route('/conversations', methods=['POST'])
def create_conversation():
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({"error": "No active session"}), 400
            
        conversation_id = str(uuid.uuid4())
        title = "New Conversation"  # You can allow users to set this
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO conversation_sessions (id, user_id, center_id, title) 
            VALUES (?, ?, ?, ?)
        """, (conversation_id, user_id, center_id, title))
        conn.commit()
        conn.close()
        
        return jsonify({
            "status": "success",
            "conversation": {
                "id": conversation_id,
                "title": title,
                "created_at": datetime.now().isoformat()
            }
        })
        
    except Exception as e:
        logging.error(f"Error creating conversation: {e}")
        return jsonify({"error": "Could not create conversation"}), 500

# Run the Flask app
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
    