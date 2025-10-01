// README.md
# PediaQuiz Application

## 1. Project Overview

PediaQuiz is a full-stack TypeScript application designed as a comprehensive learning and quizzing platform for postgraduate medical students specializing in pediatrics. The application features a rich question bank, flashcards, AI-powered study tools, and a robust content generation pipeline for administrators.

This document serves as a technical guide to the project's architecture, setup, and key operational procedures.

---

## 2. Core Technologies

The application is built on a modern, type-safe stack leveraging the Firebase and Google Cloud ecosystem.

-   **Frontend:**
    -   **Framework:** React 18 with Vite
    -   **Language:** TypeScript
    -   **Styling:** Tailwind CSS
    -   **State Management:** TanStack Query (React Query) for server state & React Context for global state.
-   **Backend:**
    -   **Environment:** Firebase Cloud Functions (Node.js 20)
    -   **Language:** TypeScript
-   **Database:** Cloud Firestore (NoSQL)
-   **File Storage:** Cloud Storage for Firebase
-   **Hosting:** Firebase Hosting (Primary) / Netlify (Alternative)
-   **AI & ML:**
    -   Google Cloud Vertex AI (Gemini Models) for generative tasks.
    -   Google Cloud Vision AI for Optical Character Recognition (OCR).
-   **Authentication:** Firebase Authentication

---

## 3. Project Architecture

PediaQuiz is structured as a **monorepo** using npm workspaces. This approach allows for shared code and types, ensuring consistency across the entire stack.

The three primary workspaces are:

1.  **`frontend/`**: A React Single-Page Application (SPA) that serves as the user interface. It is responsible for all client-side rendering and state management.
2.  **`functions/`**: The serverless backend containing all business logic. This includes user authentication triggers, database interactions, and all integrations with Google's AI services. All core logic is centralized here for security and performance.
3.  **`packages/types/`**: A shared TypeScript library that defines all the core data structures and interfaces (e.g., `MCQ`, `Topic`, `User`). This package is a dependency for both the `frontend` and `functions` workspaces, guaranteeing a consistent data contract between them.

---

## 4. Local Development Setup

### Prerequisites

-   Node.js v20.x
-   npm (comes with Node.js)
-   [Firebase CLI](https://firebase.google.com/docs/cli#install-cli-mac-linux) (`npm install -g firebase-tools`)

### Step-by-Step Instructions

1.  **Install Dependencies:**
    From the project root, run:
    ```bash
    npm install
    ```

2.  **Frontend Environment Variables:**
    The frontend requires Firebase configuration keys to connect to the correct project.
    ```bash
    cd frontend
    cp .env.example .env
    ```
    Now, open `frontend/.env` and fill in your project's Firebase configuration values.

3.  **Initial Project Build:**
    To ensure all packages are linked and compiled correctly, run a full build from the root directory. This is essential after a fresh install.
    ```bash
    npm run build
    ```

4.  **Run the Firebase Emulator Suite:**
    The project is fully configured for local development using the Firebase Emulator Suite. This allows you to run the entire backend (Functions, Firestore, Auth, Storage) on your local machine. From the root directory, run:
    ```bash
    firebase emulators:start
    ```
    This will start the emulators and provide you with the URL for the Emulator UI.

5.  **Run the Frontend Development Server:**
    In a **new terminal window**, navigate to the project root and run the frontend dev script:
    ```bash
    npm run dev
    ```
    This will start the Vite development server, typically at `http://localhost:5173`. The frontend is configured to automatically connect to the running Firebase Emulators.

---

## 5. Key Scripts

All primary scripts should be run from the **project root**.

-   `npm run dev`: Starts the frontend development server.
-   `npm run build`: Compiles all workspaces (`types`, `functions`, `frontend`).
-   `npm run deploy:functions:batched`: **(Recommended)** Builds and deploys all Cloud Functions to Firebase in resilient batches.
-   `npm run deploy:hosting`: Builds the frontend and deploys it to Firebase Hosting.

---

## 6. Architectural Notes & Patterns

-   **Centralized Data Fetching:** A previous version of this app suffered from bugs related to complex client-side data fetching. This has been resolved by implementing a single, powerful backend Cloud Function: `getAppData`. This function is now the primary source of truth for loading all core content (topics, MCQs, flashcards). The frontend fetches this data once via `DataContext` and uses `TanStack Query` for caching, ensuring high performance and data consistency.
-   **Service Layer Consolidation:** The frontend service layer has been refactored. All communication with the backend now originates from `frontend/src/services/apiService.ts` (for standard API calls) and `frontend/src/services/aiService.ts` (for generative AI calls). This simplifies maintenance and eliminates redundant or conflicting service files.
-   **Backend-Driven Logic:** To improve security and reliability, nearly all direct client-to-Firestore reads have been removed. The frontend now uses dedicated Cloud Functions for actions like fetching tags or searching content, ensuring that all data access is governed by secure, server-side logic.

---

## 7. Summary of Recent Changes (Comprehensive Audit & Fix)

This codebase recently underwent a comprehensive audit and refactoring to address bugs, performance issues, and security vulnerabilities. Key changes include:

#### Critical Bug Fixes
-   **Data Serialization:** Fixed a critical bug where Firestore `Timestamp` objects were not being correctly serialized to the client, causing crashes. All data from the backend is now client-safe.
-   **Admin Page Queries:** Rewrote Firestore queries on admin pages that were using an unsupported combination of filters (`not-in` with `orderBy`), preventing them from failing in production.
-   **Cram Sheet Feature:** Fixed a bug where the UI was displaying a document ID instead of the generated content.
-   **Unapproved Content Access:** The backend now prevents users from submitting attempts for content that is not in an 'approved' state.

#### Performance Optimizations
-   **Backend Database Queries:** The main `getAppData` function now filters content by status on the server, drastically reducing the number of document reads and memory usage.
-   **Frontend Data Fetching:** Removed a redundant network call in the `useTopics` hook, preventing the app from fetching all data twice on load.
-   **Deployment Builds:** Optimized the `netlify.toml` and created a `deploy:hosting` script to ensure only frontend-related code is built during frontend deployments, saving build time.

#### Code Refactoring & Best Practices
-   **Service Layer Refactoring:** Consolidated a disorganized service layer into a clear `apiService.ts` and `aiService.ts`.
-   **Backend-Centric Data Access:** Migrated all significant data reads from the client to secure backend callable functions.
-   **Type Safety:** Updated the shared `packages/types` to resolve multiple build errors and accurately reflect the data models used across the application.
-   **Code Cleanup:** Removed numerous unused variables and imports across the frontend and backend.