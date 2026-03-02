# Visualizing the S&P 500: A Geographic Analysis

An interactive, web-based visualization tool designed for beginner investors and students to explore the relationship between geography, industry clusters, and stock market performance.

## 📊 Overview

While traditional financial tools focus on time-series charts (line graphs and candlesticks), this project introduces a **geographic dimension** to S&P 500 data. By mapping the headquarters of the 500 largest US companies, we aim to visualize "Economic Powerhouses" like Silicon Valley (Tech), the Texas Energy Corridor, and New York’s Financial District.

### Research Questions
- **RQ1:** Is market capitalization evenly distributed across the US or dominated by a few specific states?
- **RQ2:** Do regions specialize in specific sectors (e.g., CA for Tech, TX for Energy)?
- **RQ3:** Do companies in certain states systematically outperform others in terms of return and volatility?

## 🛠️ Tech Stack

### Frontend
- **D3.js:** Used for complex geographic projections, spike maps, and interactive data-driven transitions.
- **TypeScript:** Ensuring type-safety across financial data structures.

### Backend
- **Node.js + TypeScript:** Handles API orchestration and data normalization.
- **Axios:** For fetching financial data and geocoding coordinates.
- **Prisma/Drizzle:** Type-safe ORM for database interactions.

### Data & Infrastructure
- **Supabase (PostgreSQL):** Primary database for storing company metadata and location coordinates.
- **Financial Modeling Prep (FMP) API:** Sources company headquarters and profile data.
- **Yahoo Finance API:** Sources "Live" stock performance, Alpha/Beta values, and market cap.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- A Supabase account and project
- API Keys for Financial Modeling Prep (FMP)
- Bun (visit bun.com)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/samimelhem/vizs-p670.git
   cd vizs-p670