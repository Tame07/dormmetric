# DormMetric – Student Housing & Analytics

**IT 314 Web Systems and Technologies · Final Project 2026 · Track: Business Analytics (BA)**

DormMetric helps BatStateU Alangilan students find student-friendly dormitories, and lets dorm owners
publish their available rooms. Listings, accounts, inquiries and market analytics are stored in a real
database and served through a Node.js + Express REST API. The look of the website is unchanged from the
original prototype.

## 1. Run it locally

Requirements: **Node.js 22.13 or newer** (https://nodejs.org – choose LTS).

```bash
npm install
npm start
```

Open http://localhost:3000. On the first start the database (`data/dormmetric.db`) is created and filled
with the 12 original sample dorms.

| Account | Email | Password |
|---|---|---|
| Dorm owner (owns 6 dorms) | `owner@dormmetric.test` | `Owner123!` |
| Dorm owner (owns 6 dorms) | `owner2@dormmetric.test` | `Owner123!` |
| Student | `student@dormmetric.test` | `Student123!` |

Anyone can also **Sign up** as a Student or Dormitory owner from the website.

`npm run reset-db` wipes everything and re-adds the demo data (do this before your presentation if you want a clean start).

## 2. What each user can do

**Visitor** – browse, search, filter, sort and compare dorms; view the live market analytics.

**Student** – everything above, plus: save dorms to a shortlist that is kept in the database, send a
"Request owner contact" message, and track the status of requests under **My account**.

**Dorm owner** (Owner dashboard) –
- **Overview:** views, inquiries, and how each listing's rent compares with the market average for the same room type
- **Add / edit listing:** name, location, rent, utilities, room type, spaces, distance, description, amenities, photo upload (or link)
- **My listings:** quick `−` / `+` to update available spaces, hide/publish, edit, delete – changes appear immediately on the public *Find Dorms* page
- **Inquiries:** see the students who contacted you (name, email, phone, message) and mark them New / Contacted / Closed

## 3. Project structure

```
server.js              Express app: security headers, routes, static files, error handling
src/db.js              SQLite connection + table definitions
src/auth.js            Password hashing (scrypt), signed session cookie, role middleware, rate limiter
src/validate.js        Input validation for sign-up, listings, inquiries
src/images.js          Safe photo upload (type + size + file-signature checks)
src/models.js          Dorm queries and market analytics (SQL aggregates)
src/seed.js            Demo data (the original 12 dorms + demo accounts)
src/routes/*.js        auth, public, user (shortlist + inquiries), owner (dashboard API)
public/                Front-end: index.html, styles.css, script.js (calls the API)
data/                  Created automatically – database file and uploaded photos
```

## 4. Database (SQLite)

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Student and owner accounts | name, email (unique), password_hash, role |
| `dorms` | Listings posted by owners | owner_id → users, name, location, price, utilities, room_type, spaces, distance_km, rating, description, image, is_published, views |
| `dorm_amenities` | Amenities per dorm (many-to-many) | dorm_id → dorms, amenity |
| `saved_dorms` | Student shortlists | user_id → users, dorm_id → dorms |
| `inquiries` | "Request owner contact" messages | dorm_id → dorms, student_id → users, message, phone, status |

Relationships: one owner → many dorms · one dorm → many amenities / inquiries · many students ↔ many saved dorms.
Deleting a dorm or user cascades to its related rows.

## 5. REST API

Base path `/api`. Login uses an HTTP-only cookie. Errors are JSON: `{ "error": "...", "details": { field: "..." } }`.

| Method & path | Access | Description |
|---|---|---|
| `GET /health` | public | Health check |
| `GET /dorms` · `GET /dorms/:id` | public | Published listings |
| `POST /dorms/:id/view` | public | Count a "details opened" view |
| `GET /analytics` | public | Avg rent by room type, amenity counts, totals (SQL aggregates) |
| `POST /auth/signup` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` | public | Accounts and session |
| `GET /saved` · `PUT /saved/:id` · `DELETE /saved/:id` | logged in | Shortlist |
| `POST /inquiries` · `GET /me/inquiries` | student | Contact owners / track requests |
| `GET/POST /owner/dorms` · `PUT/PATCH/DELETE /owner/dorms/:id` | owner | Manage own listings only |
| `GET /owner/inquiries` · `PATCH /owner/inquiries/:id` | owner | Inquiries about own dorms |
| `GET /owner/analytics` | owner | Views, inquiries, rent vs market per listing |

## 6. Security built in

- Passwords hashed with scrypt (never stored in plain text); generic "incorrect email or password" message
- Signed, HTTP-only, SameSite cookie sessions; secure flag in production
- Owners can only read/change **their own** listings and inquiries; students cannot call owner routes
- All inputs validated on the server; every database query is parameterised (no SQL injection); output is HTML-escaped in the browser
- Login/sign-up rate limiting, cross-origin write requests blocked, uploads limited to real PNG/JPG/WebP files under 2 MB

## 7. Publishing the website

A Node.js backend needs a Node host (GitHub Pages / Netlify static hosting will **not** work).
Example with **Render.com** (free tier available):

1. Push this folder to a GitHub repository (`node_modules` and `data` are already git-ignored).
2. Render → **New → Web Service** → choose the repo. Build command `npm install`, start command `npm start`.
3. Environment variables: `NODE_ENV=production`, `SESSION_SECRET=<long random text>`, `DATA_DIR=/var/data`.
4. Add a **Disk** mounted at `/var/data` so the database and uploaded photos survive restarts
   (free instances without a disk reset their data on every restart – fine for a demo, not for real use).

Railway, Fly.io or any VPS work the same way: `npm install`, `npm start`, set the variables above.
Set `SEED_DEMO_DATA=false` if you want a clean database without the demo dorms.

## 8. Changes made to the original prototype

- `script.js`: the hard-coded `dorms` array was replaced by API calls; log in / sign up, shortlist, inquiry form and the owner dashboard were added.
- `index.html`: only wording changed where it said "sample / demo" (e.g. "Active listings", "Live market snapshot") plus a favicon.
- `styles.css`: all original rules are untouched; new rules for the dashboard and forms were **appended at the end**.

## 9. Possible future work

Student reviews and ratings (new owner listings currently show "New"), email notifications, an admin
approval step for new owners, a map view, and moving from SQLite to PostgreSQL for large-scale use.

## 10. Team (fill in before submission)

| Member | Role | Responsibilities |
|---|---|---|
| _Name 1_ | Back-end developer | Express API, database, authentication |
| _Name 2_ | Front-end developer | Dashboard UI, API integration, responsiveness |
| _Name 3_ | Designer / analyst | UI, analytics section, documentation, testing |
