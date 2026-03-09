# ChatCHA - CDO Assistant

ChatCHA (v2.1-optimized) is a full-stack AI assistant application featuring a Node.js backend and a vanilla JavaScript frontend. It integrates with Google Gemini for advanced AI capabilities, supports **High-Performance RAG** (Retrieval-Augmented Generation) using **LanceDB**, offers **Real-time Streaming** responses, full-duplex voice interaction, and includes comprehensive administrative features.

## 🚀 Key Optimization Updates

### Phase 1: Real-Time Streaming
- **Server-Sent Events (SSE)**: Implemented for `/ask-stream` endpoint to deliver AI responses token-by-token.
- **Low Latency**: Drastically reduced Time-to-First-Byte (TTFB) for better user experience.
- **Frontend**: Updated `ChatUI.js` to handle incremental markdown rendering and stream decoding.

### Phase 2: Vector Search Optimization (LanceDB)
- **Vector Database**: Migrated from in-memory cosine similarity arrays to **LanceDB** (via `vectordb`) for scalable, persistent vector storage.
- **Performance**: High-speed nearest neighbor search with efficient filtering.
- **Persistence**: Embeddings are now stored in `.cache/lancedb`, reducing startup time and memory overhead.

---

## Features

- **Advanced AI Chat**: Powered by Google Gemini (supporting latest models).
- **RAG System**: Retrieval-Augmented Generation using **LanceDB** for context-aware answers based on your documents.
- **Real-Time Streaming**: Instant response feedback via SSE.
- **Full-Duplex Voice Interaction**: Real-time, low-latency voice chat using WebSockets (`/ws/full-duplex`).
- **Text-to-Speech (TTS)**: High-quality speech synthesis using Gemini's TTS models with SSML support.
- **Speech-to-Text (STT)**: Accurate voice recognition for hands-free operation.
- **Smart Capabilities**:
  - **Smart Data Analyst**: Analyzes structured data.
  - **Smart Personal Assistant**: Manages schedules and personal tasks.
- **Admin Dashboard**: Comprehensive user management, system settings, knowledge base management, and analytics.
- **Theme Customization**: Dynamic theme switching and persistence.
- **Notification System**: Real-time in-app notifications for users and admins.
- **Integrations**: Google Sheets, external APIs, and email services.
- **Production Ready**: Built-in keep-alive mechanism and health checks.

## Setup & Installation

### 1. Prerequisites
Ensure you have the following installed on your system:
- **Node.js** (v18.0.0 or higher)
  - Verify with: `node -v`
- **MySQL Database**
  - Verify with: `mysql --version`

### 2. Project Setup
1. **Clone the repository** to your local machine.
2. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

### 3. Install Dependencies
This project relies on several Node.js packages. Install them using npm:

```bash
npm install
```

#### Key Dependencies:
- **Core**: `express`, `cors`, `dotenv`, `ws` (WebSockets)
- **Database**: `mysql2`, `alasql`
- **Vector Search**: `vectordb` (LanceDB client), `apache-arrow`
- **AI & Integrations**: `@google/generative-ai`, `googleapis`, `node-fetch`
- **Document Processing**: `mammoth` (DOCX), `adm-zip`, `xlsx`, `xml2js`
- **Security**: `jsonwebtoken` (JWT Auth)

### 4. Configuration
Create a `.env` file in the `backend` directory. You can copy the structure below:

```env
# Server
PORT=3000
NODE_ENV=development
RENDER_EXTERNAL_URL=https://your-app-url.com # Optional: For keep-alive on Render

# Database
DB_HOST=your_db_host
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
DB_PORT=3306

# AI (Gemini)
GEMINI_API_KEY=your_gemini_api_key

# Google OAuth (for User Auth)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Google Email Service (for System Emails & OTP)
GOOGLE_SENDER_EMAIL=your_sender_email
GOOGLE_SENDER_CLIENT_ID=your_sender_client_id
GOOGLE_SENDER_CLIENT_SECRET=your_sender_client_secret
GOOGLE_SENDER_REFRESH_TOKEN=your_refresh_token
GOOGLE_SENDER_NAME=ChatCDO
GOOGLE_REPLY_TO=your_reply_to_email

# Admin
ADMIN_PASSWORD=admin123
COMPANY_EMAIL_DOMAIN=cdo.com.ph
```

### 5. Running the Application

- **Start the server**:
  ```bash
  npm start
  ```
- **Run in development mode**:
  ```bash
  npm run dev
  ```

- **Health Check**: `GET /health`
- **RAG Warmup**: `GET /warmup` (Triggers background RAG initialization)

## Project Structure

### Backend (`backend/`)
- `server.js`: Main entry point, server configuration, and WebSocket upgrade handling.
- `routes/`: API route definitions (Chat, Admin, RAG, Speech, TTS, Theme, etc.).
- `controllers/`: Request handlers for each route.
- `services/`: Business logic (AI, RAG, TTS, Email, Smart Assistants).
- `config/`: Configuration files (DB, CORS).
- `middleware/`: Auth, Error Handling, Maintenance Mode.
- `models/`: Database models/schemas.
- `ws/`: WebSocket logic for full-duplex communication.
- `scripts/`: Utility and maintenance scripts.

### Frontend (`frontend/`)
- `index.html`: Main chat interface.
- `admin.html`: Admin dashboard.
- `login.html`: User login page.
- `assets/js/`:
  - `app.js`: Main application entry.
  - `modules/`: Feature-specific logic (ChatUI, VoiceManager, etc.).
  - `admin/`: Admin panel modules (Dashboard, Users, Knowledge Base).
- `assets/css/`: Modular stylesheets.

## Utility Scripts (`backend/scripts/`)

The `backend/scripts` directory contains helper scripts for database maintenance and setup:
- `create_prompts_table.js`: Sets up the prompts table.
- `create_speech_table.js`: Sets up speech configuration tables.
- `migrate_theme_config.js`: Migrates theme settings.
- `test_email.js`: Verifies email configuration.
- `trigger_otp.js`: Tests OTP generation.

## API Documentation

For detailed API documentation and integration guides, please refer to [API_INTEGRATION.md](API_INTEGRATION.md).
