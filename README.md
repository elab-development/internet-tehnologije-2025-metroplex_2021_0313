# Metroplex

Metroplex is a travel planning web application that automatically
generates a structured day-by-day itinerary based on:

-   Destination
-   Number of days
-   Budget (optional)
-   User interests

The system distributes activities across days using a planner service
and stores the generated itinerary in a PostgreSQL database.

------------------------------------------------------------------------

## Tech Stack

### Frontend

-   React
-   TypeScript
-   Vite
-   TailwindCSS
-   Axios

### Backend

-   Node.js
-   Express
-   TypeScript
-   Prisma ORM
-   PostgreSQL
-   JWT Authentication

------------------------------------------------------------------------

## Project Structure

backend/ → Express API + Prisma\
frontend/ → React application

------------------------------------------------------------------------

## Environment Variables

Create local `.env` files (do not commit them).

### backend/.env

DATABASE_URL="postgresql://postgres:password@localhost:5432/metroplex"\
JWT_SECRET="your_secret_key"

### frontend/.env

VITE_API_BASE_URL="http://localhost:3001/api"

------------------------------------------------------------------------

## Running Locally

### 1. Start PostgreSQL

Make sure PostgreSQL is running locally.

### 2. Start Backend

cd backend\
npm install\
npx prisma migrate dev\
npx prisma db seed\
npm run dev

Backend runs at: http://localhost:3001

### 3. Start Frontend

cd frontend\
npm install\
npm run dev

Frontend runs at: http://localhost:5173

------------------------------------------------------------------------

## Core Features

-   User registration & login (JWT)
-   Trip creation
-   Automatic itinerary generation
-   View trip details
-   Regenerate itinerary
-   Role-based activity management (ADMIN / EDITOR)
-   Revoked token support

------------------------------------------------------------------------

## Git Workflow

-   main → stable branch
-   develop → integration branch
-   feature/\* → feature branches

All changes are merged via Pull Request.
