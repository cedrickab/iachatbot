import os
from dotenv import load_dotenv
import base64
import logging
from openai import AzureOpenAI
import azure.cognitiveservices.speech as speechsdk
import json

# Set up logging
logging.basicConfig(level=logging.INFO)

# loading variables from .env file
load_dotenv()

# Load environment variables
endpoint = os.getenv("ENDPOINT_URL")
deployment = os.getenv("DEPLOYMENT_NAME")
search_endpoint = os.getenv("SEARCH_ENDPOINT")
search_key = os.getenv("SEARCH_KEY")
search_index = os.getenv("SEARCH_INDEX_NAME")
subscription_key = os.getenv("AZURE_OPENAI_API_KEY")
speech_api_key = os.getenv("SPEECH_API_KEY")

# Setup speech configuration
speech_config = speechsdk.SpeechConfig(
    subscription=speech_api_key,
    region="francecentral"
)

# Get the text from the microphone
audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)
speech_config.speech_recognition_language = "fr-FR"
speech_recognizer = speechsdk.SpeechRecognizer(speech_config, audio_config)

logging.info("Say something...")
try:
    speech_result = speech_recognizer.recognize_once_async().get()
    if speech_result.text:
        logging.info(f"Recognized text: {speech_result.text}")
    else:
        logging.warning("No speech recognized.")
except Exception as e:
    logging.error(f"Speech recognition failed: {e}")
    speech_result = None

# Initialize Azure OpenAI client
client = AzureOpenAI(
    azure_endpoint=endpoint,
    api_key=subscription_key,
    api_version="2024-05-01-preview",
)

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
    {"role": "user", "content": "je veux du piment"},
    {"role": "assistant", "content": "La demande d'informations sur le piment n'est pas disponible dans les données récupérées. Veuillez essayer une autre question ou un autre sujet."},
    {"role": "user", "content": "wc gratuits?"},
    {"role": "assistant", "content": "Les informations sur les toilettes gratuites ne sont pas disponibles dans les données récupérées. Je vous recommande de consulter le formulaire à l'adresse https://www.cap3000.com/faq#contact-section pour obtenir de l'aide à ce sujet."},
    {"role": "user", "content": "MERCI"},
    {"role": "assistant", "content": "De rien ! Si vous avez d'autres questions ou besoin d'assistance, n'hésitez pas à demander."}
]

# Include the recognized text if available
if speech_result and speech_result.text:
    messages = chat_prompt + [{"role": "user", "content": speech_result.text}]
else:
    messages = chat_prompt

completion = None

# Generate completion
try:
    completion = client.chat.completions.create(
        model=deployment,
        messages=messages,
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

    logging.info(json.dumps(completion.model_dump(), indent=2, ensure_ascii=False))

except Exception as e:
    logging.error(f"Completion generation failed: {e}")

# Play the result on the computer's speaker
if completion and completion.choices[0].message.content:
    speech_config.speech_synthesis_voice_name = "fr-FR-JosephineNeural"
    speech_synthesizer = speechsdk.SpeechSynthesizer(speech_config)
    speech_synthesizer.speak_text(completion.choices[0].message.content)
else:
    logging.warning("No content to synthesize.")