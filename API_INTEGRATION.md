# API Integration Guide

This guide explains how to integrate external applications with the ChatCHA Admin Backend.

## 1. Authentication

The API uses a Bearer Token for authentication. You must include this token in the `Authorization` header of every request to protected endpoints.

**Header Format:**
```http
Authorization: Bearer admin_token_[TIMESTAMP]_[ADMIN_ID]
```

### How to get a Token?
Ask the project owner to run the following script to generate a token for you:
```bash
node scripts/generate_integration_token.js
```

## 2. Base URL

- **Local Development**: `http://localhost:5000` (or whatever port the backend is running on)
- **Production**: `https://your-backend-url.com`

## 3. Endpoints

### A. Knowledge Base

**Get All Documents**
- **Method**: `GET`
- **Endpoint**: `/api/admin/documents`
- **Query Params**:
  - `page` (default: 1)
  - `limit` (default: 10)
  - `search` (optional)

**Create Document**
- **Method**: `POST`
- **Endpoint**: `/api/admin/documents`
- **Body**:
  ```json
  {
    "title": "Document Title",
    "subcategory_id": 1,
    "content": "Full content of the document...",
    "status": "published" 
  }
  ```
  *(Status can be: 'draft', 'published', 'archived')*

### B. Users (Employees)

**Get All Users**
- **Method**: `GET`
- **Endpoint**: `/api/admin/users`

**Create User**
- **Method**: `POST`
- **Endpoint**: `/api/admin/users`
- **Body**:
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "department": "IT",
    "position": "Developer"
  }
  ```

### C. Permissions

**Get User Permissions**
- **Method**: `GET`
- **Endpoint**: `/api/admin/permissions/:userId`

**Update User Permissions**
- **Method**: `POST`
- **Endpoint**: `/api/admin/permissions/:userId`
- **Body**:
  ```json
  {
    "category_id": 1,
    "access_level": "write" 
  }
  ```

## 4. CORS (Cross-Origin Resource Sharing)

If you are calling this API from a browser (frontend application), your domain must be whitelisted in the backend.

Currently whitelisted origins:
- `http://localhost:5501`
- `http://localhost:3000`
- `http://localhost:5173`
- `*.netlify.app`
- `*.vercel.app`

If you see a CORS error, please ask the backend developer to add your domain to `backend/config/cors.js`.
