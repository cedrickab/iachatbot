from flask import Flask, request, jsonify, render_template
import os
from dotenv import load_dotenv
import logging
from openai import AzureOpenAI
import azure.cognitiveservices.speech as speechsdk
import json

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

# Route to serve the frontend
@app.route('/')
def index():
    return render_template('index.html')

# API endpoint for backend logic
@app.route('/process-input', methods=['POST'])
def process_input():
    try:
        # Get user input from the request
        user_input = request.json.get('message')
        if not user_input:
            return jsonify({"error": "No message provided"}), 400

        # Prepare chat prompt
        chat_prompt = [
            {
                "role": "system",
                "content": "You are an AI assistant who helps users find information. "
                           "You cannot include references. If the requested information "
                           "is not available in the retrieved data, direct the user to "
                           "the form hosted at https://www.cap3000.com/faq#contact-section "
                           "so that someone can assist them."
            },
            {"role": "user", "content": user_input}
        ]

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

        # Return the response
        return jsonify({"response": assistant_response})

    except Exception as e:
        logging.error(f"Error processing input: {e}")
        return jsonify({"error": "Could not process your request."}), 500

# Run the Flask app
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
    