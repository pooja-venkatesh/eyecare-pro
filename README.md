# EyeCare Pro — Full Stack Setup

## 🗂️ Project Structure
```
eyecare-pro/
├── frontend/          ← Your existing HTML/CSS/JS app + login page
│   ├── login.html     ← NEW: Login/Register page
│   ├── index.html     ← Main app (with auth guard added)
│   ├── style.css      ← Your original styles
│   ├── script-with-ml.js ← Your original ML logic
│   └── api.js         ← NEW: Backend API integration
│
└── backend/
    ├── server.js      ← Express entry point (port 3001)
    ├── .env           ← DB credentials & JWT secret
    ├── config/db.js   ← MySQL connection pool
    ├── middleware/auth.js
    ├── routes/        ← auth, user, sessions, stats
    ├── controllers/   ← business logic
    └── models/schema.sql ← Run this to create the DB tables
```

---

## 🚀 Setup Instructions

### 1. Set up the MySQL database

Open MySQL and run:
```sql
source /path/to/eyecare-pro/backend/models/schema.sql
```
Or paste the contents of `schema.sql` into MySQL Workbench / phpMyAdmin.

### 2. Install backend dependencies
```bash
cd eyecare-pro/backend
npm install
```

### 3. Start the backend server
```bash
npm start
# or for auto-reload:
npm run dev
```
Server runs at **http://localhost:3001**

### 4. Open the frontend
- Open `frontend/login.html` in your browser (or via Live Server)
- Or visit **http://localhost:3001/login.html** (the backend serves the frontend too)

---

## 🔌 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | ✗ | Create account |
| POST | `/api/auth/login`    | ✗ | Login → JWT token |
| GET  | `/api/user`          | ✓ | Get profile |
| PUT  | `/api/user`          | ✓ | Update name/avatar |
| POST | `/api/sessions`      | ✓ | Save eye scan result |
| GET  | `/api/sessions`      | ✓ | Get scan history |
| POST | `/api/stats/screentime` | ✓ | Log daily screen time |
| GET  | `/api/stats/dashboard`  | ✓ | Full dashboard data |
| GET  | `/api/stats/weekly`     | ✓ | Weekly report |
| GET  | `/api/stats/badges`     | ✓ | Get earned badges |
| POST | `/api/stats/badges`     | ✓ | Unlock a badge |
| POST | `/api/stats/alerts`     | ✓ | Save ML alert |

---

## 🔐 Auth Flow

1. User registers/logs in via `login.html`
2. JWT token stored in `localStorage` as `eyecare_token`
3. `api.js` checks for token on every page load — redirects to `login.html` if missing
4. All API calls include `Authorization: Bearer <token>`

---

## 🛢️ Database

- **Host:** localhost  
- **User:** root  
- **Password:** daisy15  
- **Database:** eyecare_pro  

To change these, edit `backend/.env`.
