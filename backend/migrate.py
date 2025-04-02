import sqlite3
import pyodbc
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Azure SQL Database configuration
DB_CONFIG = {
    'server': os.getenv('AZURE_SQL_SERVER'),
    'database': os.getenv('AZURE_SQL_DATABASE'),
    'username': os.getenv('AZURE_SQL_USERNAME'),
    'password': os.getenv('AZURE_SQL_PASSWORD'),
    'driver': '{ODBC Driver 18 for SQL Server}'
}

def get_azure_sql_connection():
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

def migrate_data():
    # Connect to SQLite database
    sqlite_conn = sqlite3.connect('conversations.db')
    sqlite_cursor = sqlite_conn.cursor()

    # Connect to Azure SQL Database
    azure_conn = get_azure_sql_connection()
    azure_cursor = azure_conn.cursor()

    # Ensure Azure SQL tables exist
    azure_cursor.execute('''
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
    CREATE TABLE users (
        id NVARCHAR(50) PRIMARY KEY,
        created_at DATETIME2 DEFAULT GETDATE()
    )
    ''')
    azure_cursor.execute('''
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='conversations' AND xtype='U')
    CREATE TABLE conversations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id NVARCHAR(50),
        message NVARCHAR(MAX),
        role NVARCHAR(50),
        timestamp DATETIME2,
        message_id NVARCHAR(50) UNIQUE,
        feedback INT DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    ''')
    azure_conn.commit()

    # Migrate users table
    sqlite_cursor.execute("SELECT id, created_at FROM users")
    users = sqlite_cursor.fetchall()
    for user in users:
        azure_cursor.execute(
            "IF NOT EXISTS (SELECT 1 FROM users WHERE id = ?) "
            "INSERT INTO users (id, created_at) VALUES (?, ?)",
            (user[0], user[0], user[1])
        )
    azure_conn.commit()

    # Migrate conversations table
    sqlite_cursor.execute("SELECT user_id, message, role, timestamp, message_id, feedback FROM conversations")
    conversations = sqlite_cursor.fetchall()
    for conversation in conversations:
        azure_cursor.execute(
            "IF NOT EXISTS (SELECT 1 FROM conversations WHERE message_id = ?) "
            "INSERT INTO conversations (user_id, message, role, timestamp, message_id, feedback) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (conversation[4], conversation[0], conversation[1], conversation[2], conversation[3], conversation[4], conversation[5])
        )
    azure_conn.commit()

    # Close connections
    sqlite_conn.close()
    azure_conn.close()
    print("Data migration completed successfully.")

if __name__ == "__main__":
    migrate_data()