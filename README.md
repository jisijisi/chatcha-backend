# ChatCHA - CDO Assistant

ChatCHA is a full-stack AI assistant application featuring a Node.js backend and a vanilla JavaScript frontend. It integrates with Google Gemini for AI capabilities, supports RAG (Retrieval-Augmented Generation), and includes administrative features.

## Setup & Installation

### 1. Prerequisites
Ensure you have the following installed on your system:
- **Node.js** (v18.0.0 or higher)
  - Verify with: `node -v`
- **MySQL Database**
  - Verify with: `mysql --version`
- **SAP NWRFC SDK** (Optional, for SAP integration)
  - Required for `node-rfc`. See `SAP_INSTALL_GUIDE.md` for details.

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

**Note:** If you encounter errors related to `node-rfc`, ensure you have the SAP SDK installed or remove `node-rfc` from `package.json` if you don't need SAP integration.

#### Main Dependencies:
- **Core**: `express`, `cors`, `dotenv`
- **Database**: `mysql2`, `mssql`, `pg`, `alasql`
- **AI & Integrations**: `@google/generative-ai`, `googleapis`, `node-fetch`, `node-rfc`
- **Utilities**: `ws`, `multer`, `xlsx`

### 4. Configuration
Create a `.env` file in the `backend` directory with the following variables:

```env
# Server
PORT=3000
NODE_ENV=development

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

# Google Email Service (for System Emails)
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

## Project Structure

### Backend (`backend/`)
- `server.js`: Main entry point.
- `routes/`: API route definitions.
- `controllers/`: Request handlers.
- `services/`: Business logic (AI, Chat, RAG, etc.).
- `config/`: Configuration files (DB, CORS).
- `scripts/`: Utility scripts.

### Frontend (`frontend/`)
- `index.html`: Main chat interface.
- `assets/js/app.js`: Main application logic.
- `assets/css/`: Stylesheets.
- `admin.html`: Admin dashboard.

## Features
- **AI Chat**: Powered by Google Gemini.
- **RAG System**: Retrieval-Augmented Generation for context-aware answers.
- **Voice Support**: Text-to-Speech and Speech-to-Text.
- **Admin Dashboard**: User management, analytics, and system settings.
- **Integrations**: Google Sheets and external APIs.
